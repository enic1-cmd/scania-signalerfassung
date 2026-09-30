'use strict';

// Starts the admin service with temporary files and checks the two security boundaries:
// the admin API trusts X-Remote-User only with nginx's secret, and /internal/kpis needs its
// token, refuses proxied requests and returns numbers without personal data.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

test('admin API needs the proxy secret; KPIs need the token and contain no personal data', async (context) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'signalerfassung-test-'));
  context.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, '.htpasswd'), 'david:$6$x$y\nmonteur1:$6$x$y\n');
  const now = new Date().toISOString();
  fs.writeFileSync(path.join(dir, 'usage.ndjson'), `${JSON.stringify({ at: now, user: 'monteur1', event: 'file_upload', page: '/app' })}\n`);
  fs.writeFileSync(path.join(dir, 'access-requests.json'), JSON.stringify([{ id: 'r1', name: 'Max Muster', email: 'max@example.com', status: 'pending', createdAt: now, updatedAt: now }]));
  const port = 34000 + Math.floor(Math.random() * 1000);
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: {
      ...process.env,
      PORT: String(port),
      HTPASSWD_FILE: path.join(dir, '.htpasswd'),
      USAGE_FILE: path.join(dir, 'usage.ndjson'),
      ACCESS_REQUEST_FILE: path.join(dir, 'access-requests.json'),
      FEEDBACK_STATS_FILE: path.join(dir, 'feedback-stats.ndjson'),
      ADMIN_PROXY_SECRET: 'proxy-secret-for-tests',
      PM_KPI_TOKEN: 'kpi-token-for-tests',
      ADMIN_USERS: 'david',
    },
    stdio: 'ignore',
  });
  context.after(() => child.kill());
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 50; i += 1) {
    try {
      if ((await fetch(`${base}/health`)).ok) break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  // A local process claiming to be david is refused; nginx (with the secret) is let through.
  assert.equal((await fetch(`${base}/admin/api/session`, { headers: { 'X-Remote-User': 'david' } })).status, 403);
  assert.equal((await fetch(`${base}/admin/api/session`, { headers: { 'X-Remote-User': 'david', 'X-Admin-Proxy': 'wrong' } })).status, 403);
  const session = await fetch(`${base}/admin/api/session`, { headers: { 'X-Remote-User': 'david', 'X-Admin-Proxy': 'proxy-secret-for-tests' } });
  assert.equal(session.status, 200);
  assert.deepEqual(await session.json(), { username: 'david' });

  const kpis = `${base}/internal/kpis`;
  assert.equal((await fetch(kpis)).status, 401);
  assert.equal((await fetch(kpis, { headers: { Authorization: 'Bearer wrong' } })).status, 401);
  assert.equal((await fetch(kpis, { headers: { Authorization: 'Bearer kpi-token-for-tests', 'X-Forwarded-Proto': 'https' } })).status, 404);
  const response = await fetch(kpis, { headers: { Authorization: 'Bearer kpi-token-for-tests' } });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.app, 'signalerfassung');
  assert.equal(body.series.points.length, 30);
  assert.equal(body.metrics.find((m) => m.key === 'pending_requests').value, 1);
  assert.equal(body.metrics.find((m) => m.key === 'accounts').value, 2);
  assert.equal(body.metrics.find((m) => m.key === 'analyses_24h').value, 1);
  assert.equal(body.alerts.some((a) => a.key === 'access-requests'), true);
  const text = JSON.stringify(body);
  for (const personal of ['monteur1', 'david', 'Max Muster', 'max@example.com', '@']) {
    assert.equal(text.includes(personal), false, `KPIs must not contain ${personal}`);
  }
});
