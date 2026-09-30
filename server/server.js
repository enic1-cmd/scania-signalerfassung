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

function remoteUser(req) {
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
  return {
    language,
    anonymous,
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
    const child = spawn('/usr/bin/openssl', ['passwd', '-6', '-stdin'], {
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
    if (createOnly && index >= 0) throw new Error('Dieser Benutzer existiert bereits.');
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
    if (filtered.length === lines.length) throw new Error('Dieser Benutzer wurde nicht gefunden.');
    writePasswordLines(filtered);
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
  const accountNames = parseUsers();
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
  }).map((user) => ({ ...user, lastSeen: lastSeenByUser.get(user.username) || null }));
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
      pendingRequests: accessRequests.filter((entry) => entry.status === 'pending').length,
      ...currentTotals
    },
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

function pruneAccessRequests() {
  if (!fs.existsSync(ACCESS_REQUEST_FILE)) return;
  const cutoff = Date.now() - ACCESS_REQUEST_RETENTION_DAYS * 86400000;
  const requests = readAccessRequests().filter((entry) => entry.status === 'pending' || Date.parse(entry.updatedAt) >= cutoff);
  writeAccessRequests(requests);
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
      await mailer.sendFeedback(feedback);
      sendJson(res, 202, { ok: true });
      return;
    }
    if (!url.pathname.startsWith('/admin/api/')) {
      sendJson(res, 404, { error: 'Nicht gefunden.' });
      return;
    }
    const admin = requireAdmin(req, res);
    if (!admin) return;
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
      await upsertUser(username, password, true);
      sendJson(res, 201, { ok: true, username });
      return;
    }
    const passwordMatch = url.pathname.match(/^\/admin\/api\/users\/([^/]+)\/password$/);
    if (req.method === 'PUT' && passwordMatch) {
      if (!verifyMutation(req, res)) return;
      const username = validateUsername(decodeURIComponent(passwordMatch[1]));
      const body = await readBody(req);
      const password = validatePassword(body.password);
      await upsertUser(username, password, false);
      sendJson(res, 200, { ok: true, username });
      return;
    }
    const deleteMatch = url.pathname.match(/^\/admin\/api\/users\/([^/]+)$/);
    if (req.method === 'DELETE' && deleteMatch) {
      if (!verifyMutation(req, res)) return;
      const username = validateUsername(decodeURIComponent(deleteMatch[1]));
      await removeUser(username);
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
setInterval(pruneUsage, 24 * 60 * 60 * 1000).unref();
setInterval(pruneAccessRequests, 24 * 60 * 60 * 1000).unref();
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Signalerfassung admin service listening on 127.0.0.1:${PORT}`);
});
