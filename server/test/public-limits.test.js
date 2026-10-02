'use strict';

// Spam protection of the public forms: limits per client IP (X-Real-IP from nginx), the daily cap for automatic
// mails (requests and feedback are still stored), no SMTP details for the public and removal of old open requests.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

test('public forms are limited per IP, mails respect the daily cap, old open requests are removed', async (context) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'signalerfassung-limits-'));
  context.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = (name) => path.join(dir, name);
  fs.writeFileSync(file('.htpasswd'), 'david:$6$x$y\n');
  const old = new Date(Date.now() - 200 * 86400000).toISOString(), recent = new Date(Date.now() - 5 * 86400000).toISOString();
  fs.writeFileSync(file('access-requests.json'), JSON.stringify([
    { id: 'old', name: 'Alt', email: 'alt@example.com', status: 'pending', createdAt: old, updatedAt: old },
    { id: 'recent', name: 'Neu', email: 'neu@example.com', status: 'pending', createdAt: recent, updatedAt: recent }
  ]));
  const port = 35000 + Math.floor(Math.random() * 1000);
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: {
      ...process.env, PORT: String(port), MAIL_TRANSPORT: 'json',
      HTPASSWD_FILE: file('.htpasswd'), USAGE_FILE: file('usage.ndjson'), ACCESS_REQUEST_FILE: file('access-requests.json'),
      FEEDBACK_STATS_FILE: file('feedback-stats.ndjson'), FEEDBACK_FILE: file('feedback.json'),
      ADMIN_PROXY_SECRET: 'secret', ADMIN_USERS: 'david',
      REQUEST_LIMIT_15MIN: '3', FEEDBACK_LIMIT_15MIN: '2', PUBLIC_MAIL_DAILY_CAP: '5'
    },
    stdio: 'ignore'
  });
  context.after(() => child.kill());
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 50; i += 1) {
    try { if ((await fetch(`${base}/health`)).ok) break; } catch { await new Promise((resolve) => setTimeout(resolve, 100)); }
  }
  const requests = () => JSON.parse(fs.readFileSync(file('access-requests.json'), 'utf8'));
  assert.deepEqual(requests().map((r) => r.id), ['recent'], 'Open requests older than 120 days are removed on start');

  const request = (ip, n) => fetch(`${base}/api/access-requests`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'signalerfassung-access-request', 'X-Real-IP': ip },
    body: JSON.stringify({ name: 'Person ' + n, email: `p${n}@example.com`, language: 'de' })
  });
  // IP A: three requests pass, the fourth is refused; another IP (same company network elsewhere) still works.
  for (let n = 1; n <= 3; n += 1) assert.equal((await request('203.0.113.1', n)).status, 202);
  const refused = await request('203.0.113.1', 4);
  assert.equal(refused.status, 429);
  assert.match((await refused.json()).error, /Too many requests/);
  // Mail cap 5: requests 1 and 2 used 4 mails; request 3 (needs 2) was stored without mails.
  const byEmail = Object.fromEntries(requests().map((r) => [r.email, r]));
  assert.equal(byEmail['p1@example.com'].mailStatus, 'sent');
  assert.equal(byEmail['p2@example.com'].mailStatus, 'sent');
  assert.equal(byEmail['p3@example.com'].mailStatus, 'skipped', 'Above the daily cap requests are stored without mails');
  assert.equal((await request('198.51.100.7', 5)).status, 202, 'Another IP is not affected by the limit of IP A');

  const feedback = (ip, text) => fetch(`${base}/api/feedback`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'signalerfassung-feedback', 'X-Real-IP': ip },
    body: JSON.stringify({ language: 'de', name: 'Monteur', report: text, attachments: [] })
  });
  // One mail left in the cap: the first feedback is mailed, the second only stored, the third is over the IP limit.
  assert.equal((await feedback('203.0.113.9', 'Bericht eins')).status, 202);
  const second = await feedback('203.0.113.9', 'Bericht zwei');
  assert.equal(second.status, 202);
  assert.equal((await second.json()).mailed, false, 'Feedback above the mail cap is stored without mail');
  assert.equal((await feedback('203.0.113.9', 'Bericht drei')).status, 429);
  const stored = JSON.parse(fs.readFileSync(file('feedback.json'), 'utf8'));
  assert.deepEqual(stored.map((f) => f.report), ['Bericht zwei', 'Bericht eins']);
  assert.deepEqual(stored.map((f) => f.mailOk), [false, true]);
});
