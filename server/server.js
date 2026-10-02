'use strict';

const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const mailer = require('./mailer');

const PORT = Number(process.env.PORT || 3407);
const HTPASSWD_FILE = process.env.HTPASSWD_FILE || '/var/www/signalerfassung.com/shared/.htpasswd';
const USAGE_FILE = process.env.USAGE_FILE || '/var/www/signalerfassung.com/shared/usage.ndjson';
const ACCESS_REQUEST_FILE = process.env.ACCESS_REQUEST_FILE || '/var/www/signalerfassung.com/shared/access-requests.json';
const ADMIN_USERS = new Set((process.env.ADMIN_USERS || 'david').split(',').map((v) => v.trim()).filter(Boolean));
const MAX_BODY = 16 * 1024;
const FEEDBACK_MAX_BODY = 18 * 1024 * 1024;
const FEEDBACK_MAX_ATTACHMENTS = 20;
const FEEDBACK_MAX_ATTACHMENT_BYTES = 12 * 1024 * 1024;
const RETENTION_DAYS = 180;
const ACCESS_REQUEST_RETENTION_DAYS = 365;
const ALLOWED_EVENTS = new Set(['page_view', 'app_open', 'file_upload', 'excel_export', 'pdf_export']);
const publicRequestTimes = [];
const feedbackRequestTimes = [];

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(body);
}

// nginx proves with a secret header that a request came through it (where Basic Auth checked the
// user). Without it X-Remote-User is ignored – otherwise any local process could claim to be admin.
const ADMIN_PROXY_SECRET = process.env.ADMIN_PROXY_SECRET || '';
// Projekt-Master reads aggregate numbers with its own token (GET /internal/kpis, local only).
const PM_KPI_TOKEN = process.env.PM_KPI_TOKEN || '';
const FEEDBACK_STATS_FILE = process.env.FEEDBACK_STATS_FILE || '/var/www/signalerfassung.com/shared/feedback-stats.ndjson';
const SHARED_DIR = path.dirname(HTPASSWD_FILE);
// Account details (name, e-mail, expiry, block state) live next to .htpasswd; nginx only ever sees active accounts.
const ACCOUNTS_FILE = process.env.ACCOUNTS_FILE || path.join(SHARED_DIR, 'accounts.json');
const FEEDBACK_FILE = process.env.FEEDBACK_FILE || path.join(SHARED_DIR, 'feedback.json');
const MESSAGES_FILE = process.env.MESSAGES_FILE || path.join(SHARED_DIR, 'messages.ndjson');
const ADMIN_LOG_FILE = process.env.ADMIN_LOG_FILE || path.join(SHARED_DIR, 'admin-log.ndjson');
const FEEDBACK_RETENTION_DAYS = 365;
const ADMIN_LOG_RETENTION_DAYS = 365;

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function fromProxy(req) {
  return Boolean(ADMIN_PROXY_SECRET) && safeEqual(req.headers['x-admin-proxy'] || '', ADMIN_PROXY_SECRET);
}

function remoteUser(req) {
  if (!fromProxy(req)) return '';
  return String(req.headers['x-remote-user'] || '').trim();
}

function requireAdmin(req, res) {
  const user = remoteUser(req);
  if (!user || !ADMIN_USERS.has(user)) {
    sendJson(res, 403, { error: 'Dieser Bereich ist nur für Administratoren freigegeben.' });
    return null;
  }
  return user;
}

function verifyMutation(req, res) {
  if (req.headers['x-requested-with'] !== 'signalerfassung-admin') {
    sendJson(res, 403, { error: 'Ungültige Anfrage.' });
    return false;
  }
  return true;
}

function verifyPublicMutation(req, res) {
  if (req.headers['x-requested-with'] !== 'signalerfassung-access-request') {
    sendJson(res, 403, { error: 'Ungültige Anfrage.' });
    return false;
  }
  const now = Date.now();
  while (publicRequestTimes.length && publicRequestTimes[0] < now - 60000) publicRequestTimes.shift();
  if (publicRequestTimes.length >= 20) {
    sendJson(res, 429, { error: 'Zu viele Anfragen. Bitte versuche es in einer Minute erneut.' });
    return false;
  }
  publicRequestTimes.push(now);
  return true;
}

function verifyFeedbackMutation(req, res) {
  if (req.headers['x-requested-with'] !== 'signalerfassung-feedback') {
    sendJson(res, 403, { error: 'Ungültige Anfrage.' });
    return false;
  }
  const now = Date.now();
  while (feedbackRequestTimes.length && feedbackRequestTimes[0] < now - 60000) feedbackRequestTimes.shift();
  if (feedbackRequestTimes.length >= 10) {
    sendJson(res, 429, { error: 'Zu viele Anfragen. Bitte versuche es in einer Minute erneut.' });
    return false;
  }
  feedbackRequestTimes.push(now);
  return true;
}

function readBody(req, maxBytes = MAX_BODY) {
  return new Promise((resolve, reject) => {
    let body = '';
    let tooLarge = false;
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      if (tooLarge) return;
      body += chunk;
      if (body.length > maxBytes) {
        tooLarge = true;
        body = '';
        reject(new Error('Anfrage zu groß.'));
      }
    });
    req.on('end', () => {
      if (tooLarge) return;
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Ungültige JSON-Daten.'));
      }
    });
    req.on('error', reject);
  });
}

function validateFeedback(body) {
  const language = body.language === 'en' ? 'en' : 'de';
  const report = String(body.report || '').trim();
  if (!report || report.length > 120000 || /\0/.test(report)) throw new Error('Der Feedbackbericht ist ungültig oder zu lang.');
  const attachments = Array.isArray(body.attachments) ? body.attachments : [];
  if (attachments.length > FEEDBACK_MAX_ATTACHMENTS) throw new Error('Es wurden zu viele Anhänge ausgewählt.');
  let totalBytes = 0;
  const allowedTypes = new Set(['text/plain', 'image/png', 'image/jpeg']);
  const cleanAttachments = attachments.map((attachment) => {
    const filename = path.basename(String(attachment.filename || '')).replace(/[^a-zA-Z0-9äöüÄÖÜß._ -]/g, '_').slice(0, 160);
    const contentType = String(attachment.contentType || '').toLowerCase().split(';')[0].trim();
    const encoded = String(attachment.data || '');
    if (!filename || !allowedTypes.has(contentType) || !/^[a-zA-Z0-9+/]*={0,2}$/.test(encoded)) throw new Error('Ein Anhang hat ein ungültiges Dateiformat.');
    const content = Buffer.from(encoded, 'base64');
    if (!content.length) throw new Error('Ein Anhang ist leer.');
    if (contentType === 'image/png' && !content.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('Eine PNG-Datei ist ungültig.');
    if (contentType === 'image/jpeg' && !(content[0] === 0xff && content[1] === 0xd8 && content.at(-2) === 0xff && content.at(-1) === 0xd9)) throw new Error('Eine JPG-Datei ist ungültig.');
    totalBytes += content.length;
    return { filename, contentType, content };
  });
  if (totalBytes > FEEDBACK_MAX_ATTACHMENT_BYTES) throw new Error('Die Anhänge sind insgesamt größer als 12 MB.');
  const anonymous = Boolean(body.anonymous);
  const rawEmail = anonymous ? '' : String(body.email || '').trim();
  return {
    language,
    anonymous,
    email: rawEmail ? validateEmail(rawEmail) : '',
    role: anonymous ? '' : String(body.role || '').replace(/[<>\r\n\0]/g, '').trim().slice(0, 180),
    name: anonymous ? '' : String(body.name || '').replace(/[<>\r\n\0]/g, '').trim().slice(0, 100),
    workshop: anonymous ? '' : String(body.workshop || '').replace(/[<>\r\n\0]/g, '').trim().slice(0, 120),
    testDate: /^\d{4}-\d{2}-\d{2}$/.test(String(body.testDate || '')) ? body.testDate : '',
    report,
    attachments: cleanAttachments
  };
}

function parseUsers() {
  if (!fs.existsSync(HTPASSWD_FILE)) return [];
  return fs.readFileSync(HTPASSWD_FILE, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.slice(0, line.indexOf(':')))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'de'));
}

function readPasswordLines() {
  if (!fs.existsSync(HTPASSWD_FILE)) return [];
  return fs.readFileSync(HTPASSWD_FILE, 'utf8').split(/\r?\n/).filter(Boolean);
}

function writePasswordLines(lines) {
  const directory = path.dirname(HTPASSWD_FILE);
  const temporary = path.join(directory, `.htpasswd.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(temporary, `${lines.join('\n')}\n`, { mode: 0o640 });
  fs.renameSync(temporary, HTPASSWD_FILE);
  fs.chmodSync(HTPASSWD_FILE, 0o640);
}

function validateUsername(value) {
  const username = String(value || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)) {
    throw new Error('Der Benutzername muss 3 bis 32 Zeichen lang sein und darf nur Buchstaben, Zahlen, Punkt, Unterstrich oder Bindestrich enthalten.');
  }
  return username;
}

function validatePassword(value) {
  const password = String(value || '');
  if (password.length < 10 || password.length > 128) {
    throw new Error('Das Passwort muss zwischen 10 und 128 Zeichen lang sein.');
  }
  if(/[\r\n\0]/.test(password)) {
    throw new Error('Das Passwort darf keine Zeilenumbrüche oder Nullzeichen enthalten.');
  }
  return password;
}

function validateRequestName(value) {
  const name = String(value || '').replace(/\s+/g, ' ').trim();
  if (name.length < 2 || name.length > 100 || /[<>\r\n\0]/.test(name)) {
    throw new Error('Bitte einen gültigen Namen mit 2 bis 100 Zeichen eingeben.');
  }
  return name;
}

function validateEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) || /[\r\n\0]/.test(email)) {
    throw new Error('Bitte eine gültige E-Mail-Adresse eingeben.');
  }
  return email;
}

function readAccessRequests() {
  if (!fs.existsSync(ACCESS_REQUEST_FILE)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(ACCESS_REQUEST_FILE, 'utf8') || '[]');
    return Array.isArray(data) ? data : [];
  } catch {
    throw new Error('Die Zugangsanfragen konnten nicht gelesen werden.');
  }
}

function writeAccessRequests(requests) {
  const directory = path.dirname(ACCESS_REQUEST_FILE);
  fs.mkdirSync(directory, { recursive: true });
  const temporary = path.join(directory, `.access-requests.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(temporary, `${JSON.stringify(requests, null, 2)}\n`, { mode: 0o640 });
  fs.renameSync(temporary, ACCESS_REQUEST_FILE);
  fs.chmodSync(ACCESS_REQUEST_FILE, 0o640);
}

let requestMutation = Promise.resolve();

function serializeRequestMutation(operation) {
  const result = requestMutation.then(operation, operation);
  requestMutation = result.catch(() => {});
  return result;
}

function publicRequest(request) {
  return {
    id: request.id,
    name: request.name,
    email: request.email,
    language: request.language === 'en' ? 'en' : 'de',
    status: request.status,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    username: request.username || null,
    mailStatus: request.mailStatus || 'pending',
    adminMailStatus: request.adminMailStatus || request.mailStatus || 'pending',
    confirmationMailStatus: request.confirmationMailStatus || 'pending',
    lastError: request.lastError || null
  };
}

function updateAccessRequest(id, update) {
  return serializeRequestMutation(() => {
    const requests = readAccessRequests();
    const index = requests.findIndex((entry) => entry.id === id);
    if (index < 0) throw new Error('Diese Zugangsanfrage wurde nicht gefunden.');
    requests[index] = { ...requests[index], ...update, updatedAt: new Date().toISOString() };
    writeAccessRequests(requests);
    return requests[index];
  });
}

function transitionAccessRequest(id, expectedStatus, update) {
  return serializeRequestMutation(() => {
    const requests = readAccessRequests();
    const index = requests.findIndex((entry) => entry.id === id);
    if (index < 0) throw new Error('Diese Zugangsanfrage wurde nicht gefunden.');
    if (requests[index].status !== expectedStatus) throw new Error('Diese Anfrage ist nicht mehr offen.');
    requests[index] = { ...requests[index], ...update, updatedAt: new Date().toISOString() };
    writeAccessRequests(requests);
    return requests[index];
  });
}

function createAccessRequest(name, email, language) {
  return serializeRequestMutation(() => {
    const requests = readAccessRequests();
    const existing = requests.find((entry) => entry.email === email && entry.status === 'pending');
    if (existing) return { request: existing, duplicate: true };
    const now = new Date().toISOString();
    const request = {
      id: crypto.randomUUID(), name, email, language: language === 'en' ? 'en' : 'de', status: 'pending', createdAt: now, updatedAt: now,
      mailStatus: 'pending', adminMailStatus: 'pending', confirmationMailStatus: 'pending', lastError: null
    };
    requests.unshift(request);
    writeAccessRequests(requests);
    return { request, duplicate: false };
  });
}

function hashPassword(password) {
  return new Promise((resolve, reject) => {
    // OPENSSL_BIN only exists for the local admin demo on Windows; production uses the system binary.
    const child = spawn(process.env.OPENSSL_BIN || '/usr/bin/openssl', ['passwd', '-6', '-stdin'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    let output = '';
    let error = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { error += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      const hash = output.trim();
      if (code !== 0 || !hash.startsWith('$6$')) {
        reject(new Error(error.trim() || 'Passwort konnte nicht sicher gespeichert werden.'));
        return;
      }
      resolve(hash);
    });
    child.stdin.end(`${password}\n`);
  });
}

let passwordMutation = Promise.resolve();

function serializePasswordMutation(operation) {
  const result = passwordMutation.then(operation, operation);
  passwordMutation = result.catch(() => {});
  return result;
}

async function upsertUser(username, password, createOnly) {
  const hash = await hashPassword(password);
  return serializePasswordMutation(() => {
    const lines = readPasswordLines();
    const index = lines.findIndex((line) => line.startsWith(`${username}:`));
    const accounts = readAccounts();
    const disabled = accounts[username] && accounts[username].disabledHash;
    if (createOnly && (index >= 0 || disabled)) throw new Error('Dieser Benutzer existiert bereits.');
    if (!createOnly && index < 0 && disabled) {
      // Blocked or expired: keep it disabled, the new password applies when the account is enabled again.
      accounts[username] = { ...accounts[username], disabledHash: hash };
      writeJsonFile(ACCOUNTS_FILE, accounts);
      return;
    }
    if (!createOnly && index < 0) throw new Error('Dieser Benutzer wurde nicht gefunden.');
    const entry = `${username}:${hash}`;
    if (index >= 0) lines[index] = entry;
    else lines.push(entry);
    writePasswordLines(lines);
  });
}

function removeUser(username) {
  return serializePasswordMutation(() => {
    if (ADMIN_USERS.has(username)) throw new Error('Ein Administratorkonto kann hier nicht gelöscht werden.');
    const lines = readPasswordLines();
    const filtered = lines.filter((line) => !line.startsWith(`${username}:`));
    const accounts = readAccounts();
    const disabled = accounts[username] && accounts[username].disabledHash;
    if (filtered.length === lines.length && !disabled) throw new Error('Dieser Benutzer wurde nicht gefunden.');
    if (filtered.length !== lines.length) writePasswordLines(filtered);
    if (accounts[username]) {
      delete accounts[username];
      writeJsonFile(ACCOUNTS_FILE, accounts);
    }
  });
}

/* ---------- Accounts: details, expiry and blocking ---------- */
function readJsonFile(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try { return JSON.parse(fs.readFileSync(file, 'utf8') || 'null') || fallback; } catch { return fallback; }
}

function writeJsonFile(file, data) {
  const directory = path.dirname(file);
  fs.mkdirSync(directory, { recursive: true });
  const temporary = path.join(directory, `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(temporary, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o640 });
  fs.renameSync(temporary, file);
  fs.chmodSync(file, 0o640);
}

function readAccounts() {
  const data = readJsonFile(ACCOUNTS_FILE, {});
  return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
}

function appendLine(file, record) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `${JSON.stringify(record)}\n`, { mode: 0o640 });
  } catch (error) {
    console.error(`Could not write ${path.basename(file)}:`, error.message);
  }
}

function readLines(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

// The release check (deploy/verify-release.sh) creates and deletes this account on every deployment.
const RELEASE_CHECK_USER = 'codex-release-check';

function auditLog(admin, action, target, detail) {
  if (target === RELEASE_CHECK_USER) return;
  appendLine(ADMIN_LOG_FILE, { at: new Date().toISOString(), admin, action, target: cleanEventValue(target, 120), detail: cleanEventValue(detail || '', 240) });
}

function validateLanguage(value) {
  return value === 'en' ? 'en' : 'de';
}

/** End of the chosen day in German time, independent of the server time zone. */
function berlinEndOfDay(text) {
  const guess = Date.parse(`${text}T23:59:59Z`);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Berlin', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(new Date(guess)).map((part) => [part.type, part.value]));
  const shownAsUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return new Date(guess - (shownAsUtc - guess));
}

function validateExpiry(value, { future = false } = {}) {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value).trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const check = match && new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  // Round trip rejects impossible days such as 2026-02-31 instead of rolling them over.
  if (!check || check.toISOString().slice(0, 10) !== text) throw new Error('Bitte ein gültiges Ablaufdatum wählen.');
  const date = berlinEndOfDay(text);
  if (future && date.getTime() <= Date.now()) throw new Error('Das Ablaufdatum muss in der Zukunft liegen.');
  return date.toISOString();
}

function validateOptionalName(value) {
  const name = String(value || '').replace(/\s+/g, ' ').trim();
  if (!name) return '';
  return validateRequestName(name);
}

function validateOptionalEmail(value) {
  const email = String(value || '').trim();
  return email ? validateEmail(email) : '';
}

/** One list for the hub: active accounts from .htpasswd plus blocked or expired ones from accounts.json. */
function accountList() {
  const accounts = readAccounts();
  const active = new Set(parseUsers());
  const requests = readAccessRequests().filter((entry) => entry.status === 'approved' && entry.username);
  const names = new Set([...active, ...Object.keys(accounts).filter((username) => accounts[username].disabledHash)]);
  return Array.from(names).sort((a, b) => a.localeCompare(b, 'de')).map((username) => {
    const meta = accounts[username] || {};
    const request = requests.find((entry) => entry.username === username);
    const status = active.has(username) ? 'active' : (meta.status === 'expired' ? 'expired' : 'blocked');
    return {
      username,
      name: meta.name || (request && request.name) || '',
      email: meta.email || (request && request.email) || '',
      language: meta.language || (request && request.language) || 'de',
      status,
      isAdmin: ADMIN_USERS.has(username),
      expiresAt: meta.expiresAt || null,
      createdAt: meta.createdAt || (request && (request.approvedAt || request.updatedAt)) || null,
      source: meta.source || (request ? 'request' : 'manual'),
      requestId: meta.requestId || (request && request.id) || null,
      blockedAt: status === 'blocked' ? meta.blockedAt || null : null,
      blockReason: status === 'blocked' ? meta.blockReason || '' : ''
    };
  });
}

function findAccount(username) {
  const account = accountList().find((entry) => entry.username === username);
  if (!account) throw new Error('Dieser Benutzer wurde nicht gefunden.');
  return account;
}

/* Moves the htpasswd line into accounts.json (status blocked/expired) or back again. Runs in the password queue. */
function disableAccountUnsafe(username, status, admin, reason) {
  if (ADMIN_USERS.has(username)) throw new Error('Ein Administratorkonto kann nicht gesperrt werden.');
  const lines = readPasswordLines();
  const index = lines.findIndex((line) => line.startsWith(`${username}:`));
  const accounts = readAccounts();
  const meta = accounts[username] || {};
  if (index < 0) {
    if (!meta.disabledHash) throw new Error('Dieser Benutzer wurde nicht gefunden.');
    accounts[username] = { ...meta, status, blockedAt: status === 'blocked' ? new Date().toISOString() : meta.blockedAt, blockedBy: status === 'blocked' ? admin : meta.blockedBy, blockReason: status === 'blocked' ? reason || '' : meta.blockReason };
    writeJsonFile(ACCOUNTS_FILE, accounts);
    return;
  }
  const hash = lines[index].slice(username.length + 1);
  accounts[username] = { ...meta, status, disabledHash: hash, blockedAt: new Date().toISOString(), blockedBy: admin, blockReason: reason || '' };
  writeJsonFile(ACCOUNTS_FILE, accounts);
  lines.splice(index, 1);
  writePasswordLines(lines);
}

function enableAccountUnsafe(username) {
  const accounts = readAccounts();
  const meta = accounts[username];
  if (!meta || !meta.disabledHash) return;
  if (meta.expiresAt && Date.parse(meta.expiresAt) <= Date.now()) throw new Error('Der Zugang ist abgelaufen. Bitte zuerst die Befristung verlängern oder aufheben.');
  const lines = readPasswordLines().filter((line) => !line.startsWith(`${username}:`));
  lines.push(`${username}:${meta.disabledHash}`);
  writePasswordLines(lines);
  accounts[username] = { ...meta, status: 'active', disabledHash: undefined, blockedAt: undefined, blockedBy: undefined, blockReason: undefined };
  writeJsonFile(ACCOUNTS_FILE, accounts);
}

function setAccountBlocked(username, blocked, admin, reason) {
  return serializePasswordMutation(() => {
    if (blocked) disableAccountUnsafe(username, 'blocked', admin, cleanEventValue(reason, 200));
    else enableAccountUnsafe(username);
  });
}

function updateAccount(username, changes, admin) {
  return serializePasswordMutation(() => {
    const exists = parseUsers().includes(username) || Boolean((readAccounts()[username] || {}).disabledHash);
    if (!exists) throw new Error('Dieser Benutzer wurde nicht gefunden.');
    const accounts = readAccounts();
    const meta = { ...(accounts[username] || {}) };
    if ('name' in changes) meta.name = validateOptionalName(changes.name);
    if ('email' in changes) meta.email = validateOptionalEmail(changes.email);
    if ('language' in changes) meta.language = validateLanguage(changes.language);
    if ('expiresAt' in changes) {
      if (ADMIN_USERS.has(username) && changes.expiresAt) throw new Error('Ein Administratorkonto kann nicht befristet werden.');
      meta.expiresAt = validateExpiry(changes.expiresAt);
    }
    accounts[username] = meta;
    writeJsonFile(ACCOUNTS_FILE, accounts);
    // A new expiry in the future revives an expired account; a past date disables it right away.
    if ('expiresAt' in changes) {
      if (meta.status === 'expired' && (!meta.expiresAt || Date.parse(meta.expiresAt) > Date.now())) enableAccountUnsafe(username);
      else if (meta.expiresAt && Date.parse(meta.expiresAt) <= Date.now() && parseUsers().includes(username)) disableAccountUnsafe(username, 'expired', admin, '');
    }
  });
}

function saveAccountDetails(username, details) {
  const accounts = readAccounts();
  accounts[username] = { ...(accounts[username] || {}), ...details };
  writeJsonFile(ACCOUNTS_FILE, accounts);
}

/** Disables accounts whose expiry date has passed (checked every minute and before every admin read). */
function sweepExpiredAccounts() {
  return serializePasswordMutation(() => {
    const accounts = readAccounts();
    const active = new Set(parseUsers());
    Object.keys(accounts).forEach((username) => {
      const meta = accounts[username];
      if (meta.expiresAt && Date.parse(meta.expiresAt) <= Date.now() && active.has(username) && !ADMIN_USERS.has(username)) {
        disableAccountUnsafe(username, 'expired', 'system', '');
        auditLog('system', 'account_expired', username, meta.expiresAt);
      }
    });
  }).catch((error) => console.error('Expiry check failed:', error.message));
}

/* ---------- Feedback forms (stored for the hub; attachments stay in the e-mail only) ---------- */
function readFeedbackEntries() {
  const data = readJsonFile(FEEDBACK_FILE, []);
  return Array.isArray(data) ? data : [];
}

let feedbackMutation = Promise.resolve();
function serializeFeedbackMutation(operation) {
  const result = feedbackMutation.then(operation, operation);
  feedbackMutation = result.catch(() => {});
  return result;
}

function storeFeedback(feedback, mailOk) {
  return serializeFeedbackMutation(() => {
    const entries = readFeedbackEntries();
    entries.unshift({
      id: crypto.randomUUID(), receivedAt: new Date().toISOString(), language: feedback.language, anonymous: feedback.anonymous,
      name: feedback.name, email: feedback.email, workshop: feedback.workshop, role: feedback.role, testDate: feedback.testDate,
      report: feedback.report, attachments: feedback.attachments.map((item) => ({ filename: item.filename, size: item.content.length })),
      mailOk, status: 'new', replies: []
    });
    writeJsonFile(FEEDBACK_FILE, entries);
  }).catch((error) => console.error('Feedback not stored:', error.message));
}

/** A feedback form that only arrived by e-mail (e.g. before the hub stored feedback), entered by an admin. */
function validateImportedFeedback(body) {
  const report = String(body.report || '').replace(/\0/g, '').replace(/\r\n/g, '\n').trim();
  if (report.length < 10 || report.length > 120000) throw new Error('Bitte den Feedbackbericht einfügen oder hochladen.');
  const received = body.receivedAt ? Date.parse(body.receivedAt) : Date.now();
  if (!Number.isFinite(received) || received > Date.now() + 60000) throw new Error('Bitte ein gültiges Eingangsdatum wählen.');
  const line = (value, max) => String(value || '').replace(/[<>\r\n\0]/g, '').trim().slice(0, max);
  const attachments = (Array.isArray(body.attachments) ? body.attachments : []).slice(0, FEEDBACK_MAX_ATTACHMENTS)
    .map((item) => ({ filename: path.basename(line(item.filename, 160)), size: Math.max(0, Math.min(Number(item.size) || 0, FEEDBACK_MAX_ATTACHMENT_BYTES)) }))
    .filter((item) => item.filename);
  return {
    language: validateLanguage(body.language), anonymous: false, email: validateEmail(body.email), name: line(body.name, 100),
    workshop: line(body.workshop, 120), role: line(body.role, 180),
    testDate: /^\d{4}-\d{2}-\d{2}$/.test(String(body.testDate || '')) ? body.testDate : '',
    receivedAt: new Date(received).toISOString(), report, attachments
  };
}

function importFeedback(feedback, admin) {
  return serializeFeedbackMutation(() => {
    const entries = readFeedbackEntries();
    const entry = { id: crypto.randomUUID(), ...feedback, mailOk: true, status: 'read', replies: [], importedBy: admin, importedAt: new Date().toISOString() };
    entries.push(entry);
    entries.sort((a, b) => String(b.receivedAt).localeCompare(String(a.receivedAt)));
    writeJsonFile(FEEDBACK_FILE, entries);
    return entry;
  });
}

function updateFeedback(id, update) {
  return serializeFeedbackMutation(() => {
    const entries = readFeedbackEntries();
    const index = entries.findIndex((entry) => entry.id === id);
    if (index < 0) throw new Error('Dieser Feedbackbogen wurde nicht gefunden.');
    entries[index] = typeof update === 'function' ? update(entries[index]) : { ...entries[index], ...update };
    writeJsonFile(FEEDBACK_FILE, entries);
    return entries[index];
  });
}

function deleteFeedback(id) {
  return serializeFeedbackMutation(() => {
    const entries = readFeedbackEntries();
    const kept = entries.filter((entry) => entry.id !== id);
    if (kept.length === entries.length) throw new Error('Dieser Feedbackbogen wurde nicht gefunden.');
    writeJsonFile(FEEDBACK_FILE, kept);
  });
}

function pruneAdminData() {
  const feedbackCutoff = Date.now() - FEEDBACK_RETENTION_DAYS * 86400000;
  serializeFeedbackMutation(() => {
    const entries = readFeedbackEntries();
    const kept = entries.filter((entry) => Date.parse(entry.receivedAt) >= feedbackCutoff);
    if (kept.length !== entries.length) writeJsonFile(FEEDBACK_FILE, kept);
  }).catch(() => {});
  const logCutoff = Date.now() - ADMIN_LOG_RETENTION_DAYS * 86400000;
  [ADMIN_LOG_FILE, MESSAGES_FILE].forEach((file) => {
    if (!fs.existsSync(file)) return;
    const kept = readLines(file).filter((entry) => Date.parse(entry.at) >= logCutoff);
    const temporary = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, kept.map((entry) => JSON.stringify(entry)).join('\n') + (kept.length ? '\n' : ''), { mode: 0o640 });
    fs.renameSync(temporary, file);
  });
}

function cleanEventValue(value, maxLength) {
  return String(value || '').replace(/[\r\n\t]/g, ' ').trim().slice(0, maxLength);
}

function appendUsage(req, event, page) {
  const user = remoteUser(req);
  if (!user || !ALLOWED_EVENTS.has(event)) return;
  const record = {
    at: new Date().toISOString(),
    user: cleanEventValue(user, 32),
    event,
    page: cleanEventValue(page, 120)
  };
  fs.appendFileSync(USAGE_FILE, `${JSON.stringify(record)}\n`, { mode: 0o640 });
}

function readUsageRecords() {
  if (!fs.existsSync(USAGE_FILE)) return [];
  return fs.readFileSync(USAGE_FILE, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter((entry) => entry && Number.isFinite(Date.parse(entry.at)));
}

function statsFor(days) {
  const now = Date.now();
  const periodMs = days * 86400000;
  const accounts = accountList();
  const accountNames = accounts.map((account) => account.username);
  const accountSet = new Set(accountNames);
  const allEvents = readUsageRecords().filter((entry) => accountSet.has(entry.user));
  const events = allEvents.filter((entry) => Date.parse(entry.at) >= now - periodMs);
  const previousEvents = allEvents.filter((entry) => {
    const time = Date.parse(entry.at);
    return time >= now - periodMs * 2 && time < now - periodMs;
  });
  const byUser = new Map();
  const daily = new Map();
  for (const entry of events) {
    if (!byUser.has(entry.user)) {
      byUser.set(entry.user, {
        username: entry.user,
        pageViews: 0,
        appOpens: 0,
        uploads: 0,
        exports: 0,
        totalActions: 0,
        lastSeen: null
      });
    }
    const summary = byUser.get(entry.user);
    if (entry.event === 'page_view') summary.pageViews += 1;
    if (entry.event === 'app_open') summary.appOpens += 1;
    if (entry.event === 'file_upload') summary.uploads += 1;
    if (entry.event === 'excel_export' || entry.event === 'pdf_export') summary.exports += 1;
    summary.totalActions += 1;
    if (!summary.lastSeen || entry.at > summary.lastSeen) summary.lastSeen = entry.at;
    const day = entry.at.slice(0, 10);
    if (!daily.has(day)) daily.set(day, { date: day, total: 0, pageViews: 0, appOpens: 0, uploads: 0, exports: 0 });
    const daySummary = daily.get(day);
    daySummary.total += 1;
    if (entry.event === 'page_view') daySummary.pageViews += 1;
    if (entry.event === 'app_open') daySummary.appOpens += 1;
    if (entry.event === 'file_upload') daySummary.uploads += 1;
    if (entry.event === 'excel_export' || entry.event === 'pdf_export') daySummary.exports += 1;
  }
  const lastSeenByUser = new Map();
  for (const entry of allEvents) {
    if (!lastSeenByUser.has(entry.user) || entry.at > lastSeenByUser.get(entry.user)) lastSeenByUser.set(entry.user, entry.at);
  }
  const users = accountNames.map((username) => byUser.get(username) || {
    username,
    pageViews: 0,
    appOpens: 0,
    uploads: 0,
    exports: 0,
    totalActions: 0,
    lastSeen: null
  }).map((user) => ({ ...user, ...accounts.find((account) => account.username === user.username), lastSeen: lastSeenByUser.get(user.username) || null }));
  // Weekday x hour usage (Monday first) and the analysis funnel for the evaluation charts.
  const heatmap = Array.from({ length: 7 }, () => new Array(24).fill(0));
  for (const entry of events) {
    const date = new Date(entry.at);
    heatmap[(date.getDay() + 6) % 7][date.getHours()] += 1;
  }
  const exportsByType = { pdf: events.filter((entry) => entry.event === 'pdf_export').length, excel: events.filter((entry) => entry.event === 'excel_export').length };
  const feedbackEntries = readFeedbackEntries();
  const soon = now + 14 * 86400000;
  function eventTotals(source) {
    const active = new Set();
    const totals = { pageViews: 0, appOpens: 0, uploads: 0, exports: 0, totalActions: 0, activeUsers: 0 };
    for (const entry of source) {
      active.add(entry.user);
      if (entry.event === 'page_view') totals.pageViews += 1;
      if (entry.event === 'app_open') totals.appOpens += 1;
      if (entry.event === 'file_upload') totals.uploads += 1;
      if (entry.event === 'excel_export' || entry.event === 'pdf_export') totals.exports += 1;
      totals.totalActions += 1;
    }
    totals.activeUsers = active.size;
    return totals;
  }
  const currentTotals = eventTotals(events);
  const previousTotals = eventTotals(previousEvents);
  const accessRequests = readAccessRequests();
  return {
    days,
    totals: {
      users: users.length,
      activeAccounts: accounts.filter((account) => account.status === 'active').length,
      blockedAccounts: accounts.filter((account) => account.status !== 'active').length,
      expiringSoon: accounts.filter((account) => account.status === 'active' && account.expiresAt && Date.parse(account.expiresAt) <= soon).length,
      pendingRequests: accessRequests.filter((entry) => entry.status === 'pending').length,
      feedback: feedbackEntries.filter((entry) => Date.parse(entry.receivedAt) >= now - periodMs).length,
      newFeedback: feedbackEntries.filter((entry) => entry.status === 'new').length,
      ...currentTotals
    },
    heatmap,
    exportsByType,
    previous: previousTotals,
    users,
    daily: Array.from(daily.values()).sort((a, b) => a.date.localeCompare(b.date)),
    recent: events.slice().sort((a, b) => b.at.localeCompare(a.at)).slice(0, 16),
    system: {
      generatedAt: new Date(now).toISOString(),
      retentionDays: RETENTION_DAYS,
      storedEvents: allEvents.length,
      storageBytes: fs.existsSync(USAGE_FILE) ? fs.statSync(USAGE_FILE).size : 0,
      mail: mailer.status()
    }
  };
}

function pruneUsage() {
  if (!fs.existsSync(USAGE_FILE)) return;
  const cutoff = Date.now() - RETENTION_DAYS * 86400000;
  const kept = fs.readFileSync(USAGE_FILE, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((line) => {
      try { return Date.parse(JSON.parse(line).at) >= cutoff; } catch { return false; }
    });
  const temporary = `${USAGE_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, kept.length ? `${kept.join('\n')}\n` : '', { mode: 0o640 });
  fs.renameSync(temporary, USAGE_FILE);
}

/** Counts a feedback form – only time, language, anonymity, number of attachments and mail result. */
function recordFeedback(feedback, mailOk) {
  const line = JSON.stringify({ at: new Date().toISOString(), language: feedback.language, anonymous: feedback.anonymous, attachments: feedback.attachments.length, mailOk });
  try {
    fs.appendFileSync(FEEDBACK_STATS_FILE, `${line}\n`, { mode: 0o640 });
  } catch (error) {
    console.error('Feedback counter not written:', error.message);
  }
}

function readFeedbackStats() {
  if (!fs.existsSync(FEEDBACK_STATS_FILE)) return [];
  return fs.readFileSync(FEEDBACK_STATS_FILE, 'utf8').split(/\r?\n/).filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

/** Aggregate numbers for Projekt-Master – no user names, e-mail addresses or feedback contents. */
function projektMasterKpis(now = Date.now()) {
  const last24h = statsFor(1);
  const last7 = statsFor(7);
  const last30 = statsFor(30);
  const days = Array.from({ length: 30 }, (_, i) => new Date(now - (29 - i) * 86400000).toISOString().slice(0, 10));
  const byDay = new Map(last30.daily.map((day) => [day.date, day]));
  const lastActivityAt = last30.users.map((user) => user.lastSeen).filter(Boolean).sort().at(-1) || null;
  const feedback = readFeedbackStats();
  const feedback30 = feedback.filter((entry) => Date.parse(entry.at) >= now - 30 * 86400000);
  const mail = mailer.status();
  const pending = last30.totals.pendingRequests;
  const alerts = [];
  if (pending > 0) {
    alerts.push({
      key: 'access-requests',
      severity: 'warning',
      title: `${pending} ${pending === 1 ? 'Zugangsanfrage wartet' : 'Zugangsanfragen warten'} auf Freigabe`,
      detail: 'Im Admin-Bereich unter „Zugangsanfragen“ freigeben oder ablehnen.'
    });
  }
  if (!mail.configured) {
    alerts.push({ key: 'mail', severity: 'warning', title: 'E-Mail-Versand ist nicht eingerichtet', detail: 'Zugangsanfragen und Feedbackbögen können nicht verschickt werden.' });
  }
  if (feedback30.some((entry) => entry.mailOk === false)) {
    alerts.push({ key: 'feedback-mail', severity: 'warning', title: 'Ein Feedbackbogen konnte nicht verschickt werden', detail: 'Der Mailversand ist mindestens einmal in den letzten 30 Tagen fehlgeschlagen.' });
  }
  return {
    version: 1,
    app: 'signalerfassung',
    generatedAt: new Date(now).toISOString(),
    lastActivityAt,
    quietAfterHours: null,
    metrics: [
      { key: 'analyses_24h', label: 'Datei-Auswertungen (24 Std.)', value: last24h.totals.uploads, headline: true, emoji: '📈' },
      { key: 'active_24h', label: 'Aktive Nutzer (24 Std.)', value: last24h.totals.activeUsers },
      { key: 'active_7d', label: 'Aktive Nutzer (7 Tage)', value: last7.totals.activeUsers },
      { key: 'analyses_30d', label: 'Datei-Auswertungen (30 Tage)', value: last30.totals.uploads },
      { key: 'exports_30d', label: 'Exporte (30 Tage)', value: last30.totals.exports },
      { key: 'accounts', label: 'Benutzerkonten', value: last30.totals.users },
      { key: 'pending_requests', label: 'Offene Zugangsanfragen', value: pending, tone: pending ? 'warning' : 'good' },
      { key: 'feedback_30d', label: 'Feedbackbögen (30 Tage)', value: feedback30.length }
    ],
    series: { label: 'Aktionen pro Tag', points: days.map((date) => ({ date, value: byDay.get(date)?.total || 0 })) },
    alerts
  };
}

function pruneAccessRequests() {
  if (!fs.existsSync(ACCESS_REQUEST_FILE)) return;
  const cutoff = Date.now() - ACCESS_REQUEST_RETENTION_DAYS * 86400000;
  const stale = Date.now() - 10 * 60000;
  const requests = readAccessRequests()
    .map((entry) => (entry.status === 'processing' && !(Date.parse(entry.updatedAt) >= stale)
      ? { ...entry, status: 'pending', lastError: 'Freigabe wurde unterbrochen, bitte erneut freigeben.' } : entry))
    .filter((entry) => entry.status === 'pending' || Date.parse(entry.updatedAt) >= cutoff);
  writeAccessRequests(requests);
}

/** Reply to a feedback form: recipient, name and default language always come from the stored feedback. */
function validateFeedbackReply(body, entry) {
  const subject = String(body.subject || '').replace(/[\r\n\0]/g, ' ').trim();
  const message = String(body.message || '').replace(/\0/g, '').replace(/\r\n/g, '\n').trim();
  if (subject.length < 2 || subject.length > 160) throw new Error('Bitte einen Betreff mit 2 bis 160 Zeichen eingeben.');
  if (message.length < 2 || message.length > 8000) throw new Error('Bitte eine Nachricht mit 2 bis 8000 Zeichen eingeben.');
  return { email: entry.email, name: entry.name || '', language: validateLanguage(body.language || entry.language), subject, message };
}

/** Everything the hub shows about one account: details, activity over the retention period, mails and feedback. */
function userDetail(username) {
  const account = findAccount(username);
  const now = Date.now();
  const events = readUsageRecords().filter((entry) => entry.user === username).sort((a, b) => b.at.localeCompare(a.at));
  const totals = { pageViews: 0, appOpens: 0, uploads: 0, exports: 0, totalActions: events.length };
  const daily = new Map();
  for (const entry of events) {
    if (entry.event === 'page_view') totals.pageViews += 1;
    if (entry.event === 'app_open') totals.appOpens += 1;
    if (entry.event === 'file_upload') totals.uploads += 1;
    if (entry.event === 'excel_export' || entry.event === 'pdf_export') totals.exports += 1;
    const day = entry.at.slice(0, 10);
    daily.set(day, (daily.get(day) || 0) + 1);
  }
  const request = account.requestId ? readAccessRequests().find((entry) => entry.id === account.requestId) : null;
  const email = account.email;
  return {
    account,
    totals,
    firstSeen: events.length ? events[events.length - 1].at : null,
    lastSeen: events.length ? events[0].at : null,
    activeDays: daily.size,
    daily: Array.from(daily, ([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date)),
    recent: events.slice(0, 40),
    request: request ? publicRequest(request) : null,
    messages: email ? readLines(MESSAGES_FILE).filter((entry) => entry.to === email).sort((a, b) => b.at.localeCompare(a.at)) : [],
    feedback: email ? readFeedbackEntries().filter((entry) => entry.email === email).map((entry) => ({ id: entry.id, receivedAt: entry.receivedAt, status: entry.status })) : [],
    audit: readLines(ADMIN_LOG_FILE).filter((entry) => entry.target === username || (email && entry.target === email)).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 30),
    retentionDays: RETENTION_DAYS,
    generatedAt: new Date(now).toISOString()
  };
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/health') {
      sendJson(res, 200, { ok: true });
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/usage') {
      const body = await readBody(req);
      appendUsage(req, cleanEventValue(body.event, 32), cleanEventValue(body.page, 120));
      res.writeHead(204, { 'Cache-Control': 'no-store' });
      res.end();
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/access-requests') {
      if (!verifyPublicMutation(req, res)) return;
      const body = await readBody(req);
      if (String(body.website || '').trim()) {
        sendJson(res, 202, { ok: true });
        return;
      }
      const name = validateRequestName(body.name);
      const email = validateEmail(body.email);
      const language = body.language === 'en' ? 'en' : 'de';
      const result = await createAccessRequest(name, email, language);
      if (!result.duplicate) {
        const [confirmation, notification] = await Promise.allSettled([
          mailer.sendAccessRequestConfirmation(result.request),
          mailer.sendAccessRequestNotification(result.request)
        ]);
        const errors = [];
        if (confirmation.status === 'rejected') errors.push(`Bestätigung: ${confirmation.reason.message}`);
        if (notification.status === 'rejected') errors.push(`Admin-Info: ${notification.reason.message}`);
        if (errors.length) console.error('Access request mail failed:', errors.join(' | '));
        await updateAccessRequest(result.request.id, {
          confirmationMailStatus: confirmation.status === 'fulfilled' ? 'sent' : 'failed',
          adminMailStatus: notification.status === 'fulfilled' ? 'sent' : 'failed',
          mailStatus: errors.length ? 'failed' : 'sent',
          lastError: errors.length ? cleanEventValue(errors.join(' | '), 240) : null
        });
      }
      sendJson(res, 202, { ok: true });
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/feedback') {
      if (!verifyFeedbackMutation(req, res)) return;
      const body = await readBody(req, FEEDBACK_MAX_BODY);
      const feedback = validateFeedback(body);
      try {
        await mailer.sendFeedback(feedback);
      } catch (error) {
        recordFeedback(feedback, false);
        await storeFeedback(feedback, false);
        throw error;
      }
      recordFeedback(feedback, true);
      await storeFeedback(feedback, true);
      sendJson(res, 202, { ok: true });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/internal/kpis') {
      // Local callers only: nginx never forwards /internal, and a proxied request carries its headers.
      if (!PM_KPI_TOKEN || req.headers['x-forwarded-proto'] || req.headers['x-remote-user']) {
        sendJson(res, 404, { error: 'Nicht gefunden.' });
        return;
      }
      if (!safeEqual(req.headers.authorization || '', `Bearer ${PM_KPI_TOKEN}`)) {
        sendJson(res, 401, { error: 'Nicht berechtigt.' });
        return;
      }
      sendJson(res, 200, projektMasterKpis());
      return;
    }
    if (!url.pathname.startsWith('/admin/api/')) {
      sendJson(res, 404, { error: 'Nicht gefunden.' });
      return;
    }
    const admin = requireAdmin(req, res);
    if (!admin) return;
    await sweepExpiredAccounts();
    if (req.method === 'GET' && url.pathname === '/admin/api/session') {
      sendJson(res, 200, { username: admin });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/admin/api/stats') {
      const days = Math.min(180, Math.max(1, Number(url.searchParams.get('days')) || 30));
      sendJson(res, 200, statsFor(days));
      return;
    }
    if (req.method === 'GET' && url.pathname === '/admin/api/access-requests') {
      sendJson(res, 200, { requests: readAccessRequests().map(publicRequest), mail: mailer.status() });
      return;
    }
    const approveMatch = url.pathname.match(/^\/admin\/api\/access-requests\/([^/]+)\/approve$/);
    if (req.method === 'POST' && approveMatch) {
      if (!verifyMutation(req, res)) return;
      if (!mailer.configured()) throw new Error('Der E-Mail-Versand ist noch nicht konfiguriert. Das Konto wurde nicht angelegt.');
      const id = decodeURIComponent(approveMatch[1]);
      const body = await readBody(req);
      const username = validateUsername(body.username);
      const password = validatePassword(body.password);
      const expiresAt = validateExpiry(body.expiresAt, { future: true });
      const request = await transitionAccessRequest(id, 'pending', { status: 'processing', lastError: null });
      let userCreated = false;
      try {
        await upsertUser(username, password, true);
        userCreated = true;
        await mailer.sendWelcomeEmail({ name: request.name, email: request.email, username, password, language: request.language });
      } catch (error) {
        try {
          if (userCreated) await removeUser(username);
        } catch (rollbackError) {
          console.error('User rollback failed:', rollbackError.message);
        }
        await updateAccessRequest(id, { status: 'pending', mailStatus: 'failed', lastError: cleanEventValue(error.message, 240) });
        throw new Error(error.message.includes('existiert bereits') ? error.message : 'Die Zugangsmail konnte nicht versendet werden. Das Konto wurde deshalb nicht angelegt.');
      }
      const approved = await updateAccessRequest(id, {
        status: 'approved', approvedAt: new Date().toISOString(), approvedBy: admin,
        username, mailStatus: 'sent', lastError: null
      });
      await serializePasswordMutation(() => saveAccountDetails(username, {
        name: request.name, email: request.email, language: request.language, createdAt: new Date().toISOString(), createdBy: admin,
        source: 'request', requestId: id, expiresAt
      }));
      auditLog(admin, 'request_approved', username, `${request.name} <${request.email}>${expiresAt ? `, befristet bis ${expiresAt.slice(0, 10)}` : ''}`);
      sendJson(res, 201, { ok: true, request: publicRequest(approved), username });
      return;
    }
    const rejectMatch = url.pathname.match(/^\/admin\/api\/access-requests\/([^/]+)\/reject$/);
    if (req.method === 'POST' && rejectMatch) {
      if (!verifyMutation(req, res)) return;
      const id = decodeURIComponent(rejectMatch[1]);
      const rejected = await transitionAccessRequest(id, 'pending', {
        status: 'rejected', rejectedAt: new Date().toISOString(), rejectedBy: admin, lastError: null
      });
      auditLog(admin, 'request_rejected', rejected.email, rejected.name);
      sendJson(res, 200, { ok: true, request: publicRequest(rejected) });
      return;
    }
    const notifyMatch = url.pathname.match(/^\/admin\/api\/access-requests\/([^/]+)\/notify$/);
    if (req.method === 'POST' && notifyMatch) {
      if (!verifyMutation(req, res)) return;
      const id = decodeURIComponent(notifyMatch[1]);
      const request = readAccessRequests().find((entry) => entry.id === id);
      if (!request) throw new Error('Diese Zugangsanfrage wurde nicht gefunden.');
      const body = await readBody(req);
      const target = body.target === 'requester' ? 'requester' : 'admin';
      if (target === 'requester') await mailer.sendAccessRequestConfirmation(request);
      else await mailer.sendAccessRequestNotification(request);
      const adminMailStatus = target === 'admin' ? 'sent' : (request.adminMailStatus || request.mailStatus || 'pending');
      const confirmationMailStatus = target === 'requester' ? 'sent' : (request.confirmationMailStatus || 'pending');
      const allSent = adminMailStatus === 'sent' && confirmationMailStatus === 'sent';
      const notified = await updateAccessRequest(id, {
        adminMailStatus,
        confirmationMailStatus,
        mailStatus: allSent ? 'sent' : 'failed',
        lastError: allSent ? null : request.lastError
      });
      sendJson(res, 200, { ok: true, request: publicRequest(notified) });
      return;
    }
    if (req.method === 'POST' && url.pathname === '/admin/api/users') {
      if (!verifyMutation(req, res)) return;
      const body = await readBody(req);
      const username = validateUsername(body.username);
      const password = validatePassword(body.password);
      const details = { name: validateOptionalName(body.name), email: validateOptionalEmail(body.email), language: validateLanguage(body.language), expiresAt: validateExpiry(body.expiresAt, { future: true }) };
      if (body.sendMail && !details.email) throw new Error('Für die Zugangsmail wird eine E-Mail-Adresse benötigt.');
      if (body.sendMail && !mailer.configured()) throw new Error('Der E-Mail-Versand ist noch nicht konfiguriert. Das Konto wurde nicht angelegt.');
      await upsertUser(username, password, true);
      await serializePasswordMutation(() => saveAccountDetails(username, { ...details, createdAt: new Date().toISOString(), createdBy: admin, source: 'manual' }));
      if (body.sendMail) {
        try {
          await mailer.sendWelcomeEmail({ name: details.name || username, email: details.email, username, password, language: details.language });
        } catch (error) {
          await removeUser(username).catch(() => {});
          throw new Error('Die Zugangsmail konnte nicht versendet werden. Das Konto wurde deshalb nicht angelegt.');
        }
      }
      auditLog(admin, 'user_created', username, details.email + (body.sendMail ? ', Zugangsmail gesendet' : ''));
      sendJson(res, 201, { ok: true, username, mailed: Boolean(body.sendMail) });
      return;
    }
    const passwordMatch = url.pathname.match(/^\/admin\/api\/users\/([^/]+)\/password$/);
    if (req.method === 'PUT' && passwordMatch) {
      if (!verifyMutation(req, res)) return;
      const username = validateUsername(decodeURIComponent(passwordMatch[1]));
      const body = await readBody(req);
      const password = validatePassword(body.password);
      const account = findAccount(username);
      if (body.sendMail && !account.email) throw new Error('Für diesen Benutzer ist keine E-Mail-Adresse hinterlegt.');
      await upsertUser(username, password, false);
      let mailError = '';
      if (body.sendMail) {
        try {
          await mailer.sendPasswordEmail({ name: account.name || username, email: account.email, username, password, language: account.language });
        } catch (error) {
          mailError = cleanEventValue(error.message, 240);
          console.error('Password mail failed:', mailError);
        }
      }
      auditLog(admin, 'password_changed', username, body.sendMail ? (mailError ? 'E-Mail fehlgeschlagen' : 'per E-Mail gesendet') : '');
      sendJson(res, 200, { ok: true, username, mailed: Boolean(body.sendMail) && !mailError, mailError });
      return;
    }
    const userMatch = url.pathname.match(/^\/admin\/api\/users\/([^/]+)$/);
    if (req.method === 'GET' && userMatch) {
      const username = validateUsername(decodeURIComponent(userMatch[1]));
      sendJson(res, 200, userDetail(username));
      return;
    }
    if (req.method === 'PATCH' && userMatch) {
      if (!verifyMutation(req, res)) return;
      const username = validateUsername(decodeURIComponent(userMatch[1]));
      const body = await readBody(req);
      const changes = {};
      ['name', 'email', 'language', 'expiresAt'].forEach((key) => { if (key in body) changes[key] = body[key]; });
      await updateAccount(username, changes, admin);
      auditLog(admin, 'user_updated', username, Object.keys(changes).map((key) => `${key}=${changes[key] || '-'}`).join(', '));
      sendJson(res, 200, { ok: true, account: findAccount(username) });
      return;
    }
    const blockMatch = url.pathname.match(/^\/admin\/api\/users\/([^/]+)\/(block|unblock)$/);
    if (req.method === 'POST' && blockMatch) {
      if (!verifyMutation(req, res)) return;
      const username = validateUsername(decodeURIComponent(blockMatch[1]));
      const body = await readBody(req);
      await setAccountBlocked(username, blockMatch[2] === 'block', admin, body.reason);
      auditLog(admin, blockMatch[2] === 'block' ? 'user_blocked' : 'user_unblocked', username, body.reason || '');
      sendJson(res, 200, { ok: true, account: findAccount(username) });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/admin/api/feedback') {
      sendJson(res, 200, { feedback: readFeedbackEntries() });
      return;
    }
    if (req.method === 'POST' && url.pathname === '/admin/api/feedback') {
      if (!verifyMutation(req, res)) return;
      const entry = await importFeedback(validateImportedFeedback(await readBody(req, 256 * 1024)), admin);
      auditLog(admin, 'feedback_imported', entry.email, entry.name || '');
      sendJson(res, 201, { ok: true, feedback: entry });
      return;
    }
    const feedbackMatch = url.pathname.match(/^\/admin\/api\/feedback\/([^/]+)$/);
    if (req.method === 'PATCH' && feedbackMatch) {
      if (!verifyMutation(req, res)) return;
      const body = await readBody(req);
      const status = ['new', 'read', 'done'].includes(body.status) ? body.status : 'read';
      const entry = await updateFeedback(decodeURIComponent(feedbackMatch[1]), { status });
      sendJson(res, 200, { ok: true, feedback: entry });
      return;
    }
    if (req.method === 'DELETE' && feedbackMatch) {
      if (!verifyMutation(req, res)) return;
      await deleteFeedback(decodeURIComponent(feedbackMatch[1]));
      auditLog(admin, 'feedback_deleted', decodeURIComponent(feedbackMatch[1]), '');
      sendJson(res, 200, { ok: true });
      return;
    }
    const replyMatch = url.pathname.match(/^\/admin\/api\/feedback\/([^/]+)\/(reply|reply-preview)$/);
    if (req.method === 'POST' && replyMatch) {
      if (!verifyMutation(req, res)) return;
      const id = decodeURIComponent(replyMatch[1]);
      const entry = readFeedbackEntries().find((item) => item.id === id);
      if (!entry) throw new Error('Dieser Feedbackbogen wurde nicht gefunden.');
      if (!entry.email) throw new Error('Zu diesem Feedback wurde keine E-Mail-Adresse angegeben.');
      const body = await readBody(req, 64 * 1024);
      const message = validateFeedbackReply(body, entry);
      if (replyMatch[2] === 'reply-preview') {
        sendJson(res, 200, { html: mailer.previewHtml(mailer.buildAdminMessage(message).html) });
        return;
      }
      if (!mailer.configured()) throw new Error('Der E-Mail-Versand ist noch nicht konfiguriert.');
      await mailer.sendAdminMessage(message);
      const record = { id: crypto.randomUUID(), at: new Date().toISOString(), by: admin, to: entry.email, name: entry.name, subject: message.subject, context: { type: 'feedback', id } };
      appendLine(MESSAGES_FILE, record);
      auditLog(admin, 'feedback_reply', entry.email, message.subject);
      const updated = await updateFeedback(id, (item) => ({ ...item, status: 'done', replies: [...(item.replies || []), { at: record.at, subject: message.subject, by: admin, language: message.language, message: message.message, copyTo: mailer.status().copyTo || '' }] }));
      sendJson(res, 201, { ok: true, feedback: updated });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/admin/api/audit') {
      const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit')) || 150));
      sendJson(res, 200, { entries: readLines(ADMIN_LOG_FILE).sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit), messages: readLines(MESSAGES_FILE).sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit) });
      return;
    }
    const deleteMatch = url.pathname.match(/^\/admin\/api\/users\/([^/]+)$/);
    if (req.method === 'DELETE' && deleteMatch) {
      if (!verifyMutation(req, res)) return;
      const username = validateUsername(decodeURIComponent(deleteMatch[1]));
      await removeUser(username);
      auditLog(admin, 'user_deleted', username, '');
      sendJson(res, 200, { ok: true, username });
      return;
    }
    sendJson(res, 404, { error: 'Nicht gefunden.' });
  } catch (error) {
    console.error(error);
    sendJson(res, 400, { error: error.message || 'Die Anfrage konnte nicht verarbeitet werden.' });
  }
});

pruneUsage();
pruneAccessRequests();
pruneAdminData();
sweepExpiredAccounts();
setInterval(pruneUsage, 24 * 60 * 60 * 1000).unref();
setInterval(pruneAccessRequests, 24 * 60 * 60 * 1000).unref();
setInterval(pruneAdminData, 24 * 60 * 60 * 1000).unref();
setInterval(sweepExpiredAccounts, 60 * 1000).unref();
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Signalerfassung admin service listening on 127.0.0.1:${PORT}`);
});
