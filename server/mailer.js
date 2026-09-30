'use strict';

const fs = require('node:fs');
const path = require('node:path');
const nodemailer = require('nodemailer');

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_SECURE = String(process.env.SMTP_SECURE || 'true').toLowerCase() !== 'false';
const SMTP_USER = String(process.env.SMTP_USER || '').trim();
const SMTP_PASS = String(process.env.SMTP_PASS || '');
const MAIL_TRANSPORT = String(process.env.MAIL_TRANSPORT || '').trim().toLowerCase();
const REQUEST_NOTIFY_TO = String(process.env.REQUEST_NOTIFY_TO || 'david.breuer@breuer-trucks.de').trim();
const FEEDBACK_NOTIFY_TO = String(process.env.FEEDBACK_NOTIFY_TO || 'contact.breuer.apps@gmail.com').trim();
const PUBLIC_URL = String(process.env.PUBLIC_URL || 'https://signalerfassung.com').replace(/\/$/, '');
const FEEDBACK_URL = String(process.env.FEEDBACK_URL || 'https://feedback.signalerfassung.com').replace(/\/$/, '');
const LOGO_FILE = path.join(__dirname, '..', 'assets', 'signalerfassung-wordmark.png');

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function languageOf(value) {
  return value && (value.language === 'en' || value.lang === 'en') ? 'en' : 'de';
}

function configured() {
  return MAIL_TRANSPORT === 'json' || Boolean(SMTP_USER && SMTP_PASS);
}

function createTransport() {
  if (MAIL_TRANSPORT === 'json') return nodemailer.createTransport({ jsonTransport: true });
  if (!configured()) throw new Error('Der E-Mail-Versand ist noch nicht konfiguriert.');
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    disableUrlAccess: true,
    tls: { minVersion: 'TLSv1.2' }
  });
}

function logoAttachment() {
  if (!fs.existsSync(LOGO_FILE)) return [];
  return [{
    filename: 'signalerfassung.png',
    content: fs.readFileSync(LOGO_FILE),
    cid: 'signalerfassung-logo',
    contentType: 'image/png'
  }];
}

function layout(title, intro, content, action, language = 'de') {
  const actionHtml = action ? `<p style="margin:30px 0 8px"><a href="${escapeHtml(action.href)}" style="display:inline-block;padding:14px 22px;border-radius:12px;background:#ffb400;color:#061b34;text-decoration:none;font-weight:800">${escapeHtml(action.label)}</a></p>` : '';
  const footer = language === 'en'
    ? 'Signal Capture Analysis Tool &middot; David Breuer Apps<br>This message was sent automatically.'
    : 'Signalerfassung Analyse-Tool &middot; David Breuer Apps<br>Diese Nachricht wurde automatisch versendet.';
  return `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head><body style="margin:0;background:#edf4f9;color:#10243f;font-family:Arial,sans-serif"><div style="max-width:680px;margin:0 auto;padding:30px 14px"><div style="overflow:hidden;border-radius:18px;background:#fff;box-shadow:0 12px 36px rgba(4,48,88,.12)"><div style="padding:24px 30px;background:linear-gradient(120deg,#073d70,#0867ad)"><img src="cid:signalerfassung-logo" alt="Signalerfassung" style="display:block;max-width:310px;width:78%;height:auto"></div><div style="padding:32px 30px"><div style="width:42px;height:4px;margin-bottom:20px;border-radius:4px;background:#ffb400"></div><h1 style="margin:0 0 12px;font-size:28px;line-height:1.2;color:#071d38">${escapeHtml(title)}</h1><p style="margin:0 0 22px;color:#5b7089;font-size:16px;line-height:1.6">${escapeHtml(intro)}</p>${content}${actionHtml}</div><div style="padding:18px 30px;background:#f3f7fa;color:#708197;font-size:12px;line-height:1.55">${footer}</div></div></div></body></html>`;
}

async function sendMail(message) {
  const transport = createTransport();
  const attachments = [...logoAttachment(), ...(message.attachments || [])];
  return transport.sendMail({
    from: `"Signalerfassung Analyse-Tool" <${SMTP_USER || 'contact.breuer.apps@gmail.com'}>`,
    ...message,
    attachments
  });
}

function buildAccessRequestNotification(request) {
  const language = languageOf(request);
  const content = `<table role="presentation" style="width:100%;border-collapse:collapse;font-size:15px"><tr><td style="padding:11px 0;color:#6b7d91;border-bottom:1px solid #e4ebf1">Name</td><td style="padding:11px 0;text-align:right;font-weight:700;border-bottom:1px solid #e4ebf1">${escapeHtml(request.name)}</td></tr><tr><td style="padding:11px 0;color:#6b7d91;border-bottom:1px solid #e4ebf1">E-Mail</td><td style="padding:11px 0;text-align:right;font-weight:700;border-bottom:1px solid #e4ebf1">${escapeHtml(request.email)}</td></tr><tr><td style="padding:11px 0;color:#6b7d91;border-bottom:1px solid #e4ebf1">Sprache</td><td style="padding:11px 0;text-align:right;font-weight:700;border-bottom:1px solid #e4ebf1">${language.toUpperCase()}</td></tr><tr><td style="padding:11px 0;color:#6b7d91">Eingang</td><td style="padding:11px 0;text-align:right;font-weight:700">${escapeHtml(new Date(request.createdAt).toLocaleString('de-DE'))}</td></tr></table>`;
  return {
    to: REQUEST_NOTIFY_TO,
    replyTo: request.email,
    subject: `Neue Zugangsanfrage von ${request.name}`,
    headers: { 'Content-Language': 'de' },
    text: `Neue Zugangsanfrage\n\nName: ${request.name}\nE-Mail: ${request.email}\nSprache: ${language.toUpperCase()}\n\nIm Admin Hub prüfen: ${PUBLIC_URL}/admin/`,
    html: layout(
      'Neue Zugangsanfrage',
      'Eine neue Anfrage für den Zugang zur Analyse-App ist eingegangen.',
      content,
      { href: `${PUBLIC_URL}/admin/`, label: 'Im Admin Hub prüfen' },
      'de'
    )
  };
}

async function sendAccessRequestNotification(request) {
  return sendMail(buildAccessRequestNotification(request));
}

function buildAccessRequestConfirmation(request) {
  const language = languageOf(request);
  const english = language === 'en';
  const content = english
    ? `<p style="margin:0 0 18px;font-size:15px;line-height:1.65">Hello ${escapeHtml(request.name)},</p><p style="margin:0 0 18px;font-size:15px;line-height:1.65">Thank you for requesting access to the Signal Capture Analysis Tool. We have received your details.</p><div style="padding:18px 20px;border:1px solid #d6e4ef;border-radius:14px;background:#f5f9fc"><strong style="display:block;margin-bottom:7px;color:#075ba7">What happens next</strong><span style="color:#536b84;font-size:14px;line-height:1.6">Your request will be reviewed personally. Once approved, you will receive a separate email containing your username, a temporary password and a direct link to the tool.</span></div><p style="margin:20px 0 0;color:#60748b;font-size:13px;line-height:1.55">You do not need to take any further action while your request is being reviewed.</p>`
    : `<p style="margin:0 0 18px;font-size:15px;line-height:1.65">Guten Tag ${escapeHtml(request.name)},</p><p style="margin:0 0 18px;font-size:15px;line-height:1.65">vielen Dank für Ihre Anfrage zum Signalerfassung Analyse-Tool. Wir haben Ihre Angaben erhalten.</p><div style="padding:18px 20px;border:1px solid #d6e4ef;border-radius:14px;background:#f5f9fc"><strong style="display:block;margin-bottom:7px;color:#075ba7">So geht es weiter</strong><span style="color:#536b84;font-size:14px;line-height:1.6">Ihre Anfrage wird persönlich geprüft. Nach erfolgreicher Freigabe erhalten Sie in einer separaten E-Mail Ihren Benutzernamen, ein Startpasswort und den direkten Link zum Tool.</span></div><p style="margin:20px 0 0;color:#60748b;font-size:13px;line-height:1.55">Bis zur Freigabe müssen Sie nichts weiter tun.</p>`;
  return {
    to: request.email,
    subject: english ? 'Your access request has been received' : 'Ihre Zugangsanfrage ist eingegangen',
    headers: { 'Content-Language': language },
    text: english
      ? `Hello ${request.name},\n\nThank you for requesting access to the Signal Capture Analysis Tool. We have received your details.\n\nYour request will be reviewed personally. Once approved, you will receive a separate email containing your credentials and a direct link to the tool.\n\nYou do not need to take any further action while your request is being reviewed.`
      : `Guten Tag ${request.name},\n\nvielen Dank für Ihre Anfrage zum Signalerfassung Analyse-Tool. Wir haben Ihre Angaben erhalten.\n\nIhre Anfrage wird persönlich geprüft. Nach erfolgreicher Freigabe erhalten Sie in einer separaten E-Mail Ihre Zugangsdaten und den direkten Link zum Tool.\n\nBis dahin müssen Sie nichts weiter tun.`,
    html: layout(
      english ? 'Thank you for your request' : 'Vielen Dank für Ihre Anfrage',
      english ? 'We have received your access request.' : 'Ihre Zugangsanfrage ist bei uns eingegangen.',
      content,
      null,
      language
    )
  };
}

async function sendAccessRequestConfirmation(request) {
  return sendMail(buildAccessRequestConfirmation(request));
}

function buildWelcomeEmail({ name, email, username, password, language: requestedLanguage, lang }) {
  const language = languageOf({ language: requestedLanguage, lang });
  const english = language === 'en';
  const feedbackLink = `${FEEDBACK_URL}/?lang=${language}`;
  const content = english
    ? `<p style="margin:0 0 18px;font-size:15px;line-height:1.65">Hello ${escapeHtml(name)},</p><p style="margin:0 0 20px;font-size:15px;line-height:1.65">Your access to the Signal Capture Analysis App has been approved. When you open the app, your browser will ask for these credentials:</p><div style="padding:20px;border:1px solid #d6e4ef;border-radius:14px;background:#f5f9fc"><div style="margin-bottom:10px;color:#687c93;font-size:12px;text-transform:uppercase;letter-spacing:.08em">Username</div><div style="margin-bottom:18px;font-family:Consolas,monospace;font-size:18px;font-weight:800;color:#075ba7">${escapeHtml(username)}</div><div style="margin-bottom:10px;color:#687c93;font-size:12px;text-transform:uppercase;letter-spacing:.08em">Temporary password</div><div style="font-family:Consolas,monospace;font-size:18px;font-weight:800;color:#075ba7;word-break:break-all">${escapeHtml(password)}</div></div><p style="margin:20px 0 0;color:#60748b;font-size:13px;line-height:1.55">Please keep these credentials secure and do not forward this email.</p><div style="margin-top:22px;padding:17px 18px;border-left:4px solid #14824f;background:#edf8f2;font-size:14px;line-height:1.6">After testing, please share your experience in our <a href="${escapeHtml(feedbackLink)}" style="color:#075ba7;font-weight:800">English feedback form</a>. Your practical feedback helps us improve the tool.</div>`
    : `<p style="margin:0 0 18px;font-size:15px;line-height:1.65">Hallo ${escapeHtml(name)},</p><p style="margin:0 0 20px;font-size:15px;line-height:1.65">dein Zugang zur Signalerfassung Analyse-App wurde freigeschaltet. Beim Öffnen der App fragt dein Browser nach diesen Zugangsdaten:</p><div style="padding:20px;border:1px solid #d6e4ef;border-radius:14px;background:#f5f9fc"><div style="margin-bottom:10px;color:#687c93;font-size:12px;text-transform:uppercase;letter-spacing:.08em">Benutzername</div><div style="margin-bottom:18px;font-family:Consolas,monospace;font-size:18px;font-weight:800;color:#075ba7">${escapeHtml(username)}</div><div style="margin-bottom:10px;color:#687c93;font-size:12px;text-transform:uppercase;letter-spacing:.08em">Startpasswort</div><div style="font-family:Consolas,monospace;font-size:18px;font-weight:800;color:#075ba7;word-break:break-all">${escapeHtml(password)}</div></div><p style="margin:20px 0 0;color:#60748b;font-size:13px;line-height:1.55">Bitte bewahre die Zugangsdaten sicher auf und leite diese E-Mail nicht weiter.</p><div style="margin-top:22px;padding:17px 18px;border-left:4px solid #14824f;background:#edf8f2;font-size:14px;line-height:1.6">Bitte teile uns nach deinem Test deine Erfahrung im <a href="${escapeHtml(feedbackLink)}" style="color:#075ba7;font-weight:800">Feedbackbogen für Monteure</a> mit. Dein Praxisfeedback hilft uns, das Tool gezielt zu verbessern.</div>`;
  return {
    to: email,
    subject: english ? 'Your access to the Signal Capture Analysis Tool' : 'Dein Zugang zum Signalerfassung Analyse-Tool',
    headers: { 'Content-Language': language },
    text: english
      ? `Hello ${name},\n\nYour access has been approved.\n\nUsername: ${username}\nTemporary password: ${password}\nApp: ${PUBLIC_URL}/signalerfassung-analyse-tool.html\n\nPlease keep these credentials secure. After testing, please share your experience: ${feedbackLink}`
      : `Hallo ${name},\n\ndein Zugang wurde freigeschaltet.\n\nBenutzername: ${username}\nStartpasswort: ${password}\nApp: ${PUBLIC_URL}/signalerfassung-analyse-tool.html\n\nBitte bewahre die Zugangsdaten sicher auf. Nach dem Test freuen wir uns über dein Feedback: ${feedbackLink}`,
    html: layout(
      english ? 'Your access is ready' : 'Dein Zugang ist bereit',
      english ? 'The Signal Capture Analysis App has been approved for you.' : 'Die Signalerfassung Analyse-App wurde für dich freigeschaltet.',
      content,
      { href: `${PUBLIC_URL}/signalerfassung-analyse-tool.html`, label: english ? 'Open analysis app' : 'Analyse-App öffnen' },
      language
    )
  };
}

async function sendWelcomeEmail(credentials) {
  return sendMail(buildWelcomeEmail(credentials));
}

function buildFeedbackEmail(feedback) {
  const english = feedback.language === 'en';
  const sender = feedback.anonymous ? (english ? 'Anonymous' : 'Anonym') : feedback.name;
  const details = [
    `${english ? 'Sender' : 'Absender'}: ${sender || (english ? 'Not specified' : 'Nicht angegeben')}`,
    `${english ? 'Workshop' : 'Werkstatt'}: ${feedback.workshop || (english ? 'Not specified' : 'Nicht angegeben')}`,
    `${english ? 'Test date' : 'Testdatum'}: ${feedback.testDate || (english ? 'Not specified' : 'Nicht angegeben')}`
  ].join('\n');
  const attachments = (feedback.attachments || []).map((attachment) => ({
    filename: attachment.filename,
    content: attachment.content,
    contentType: attachment.contentType
  }));
  attachments.unshift({
    filename: `Feedbackbericht-${feedback.testDate || new Date().toISOString().slice(0, 10)}.txt`,
    content: Buffer.from(feedback.report, 'utf8'),
    contentType: 'text/plain; charset=utf-8'
  });
  return {
    to: FEEDBACK_NOTIFY_TO,
    subject: `Signalerfassung Feedback: ${sender || 'Anonym'}${feedback.testDate ? ` (${feedback.testDate})` : ''}`,
    headers: { 'Content-Language': feedback.language },
    text: `${details}\n\n${feedback.report}`,
    html: layout(
      english ? 'New technician feedback' : 'Neues Monteur-Feedback',
      english ? 'A completed feedback form has been submitted.' : 'Ein ausgefüllter Feedbackbogen wurde übermittelt.',
      `<div style="padding:18px 20px;border:1px solid #d6e4ef;border-radius:14px;background:#f5f9fc;white-space:pre-line;font-size:14px;line-height:1.6">${escapeHtml(details)}</div><p style="margin:20px 0 0;color:#60748b;font-size:13px;line-height:1.55">${english ? 'The full report and all files are attached.' : 'Der vollständige Bericht und alle Dateien befinden sich im Anhang.'}</p>`,
      null,
      feedback.language
    ),
    attachments
  };
}

async function sendFeedback(feedback) {
  return sendMail(buildFeedbackEmail(feedback));
}

module.exports = {
  configured,
  buildAccessRequestNotification,
  buildAccessRequestConfirmation,
  buildWelcomeEmail,
  buildFeedbackEmail,
  sendAccessRequestNotification,
  sendAccessRequestConfirmation,
  sendWelcomeEmail,
  sendFeedback,
  status: () => ({ configured: configured(), sender: SMTP_USER || null, notifyTo: REQUEST_NOTIFY_TO, feedbackTo: FEEDBACK_NOTIFY_TO })
};
