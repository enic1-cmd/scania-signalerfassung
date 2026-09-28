const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    const unexpectedRequests = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      const pathname = new URL(request.url()).pathname;
      if (pathname.startsWith('/api/')) unexpectedRequests.push(pathname);
    });
    await page.route('https://signalerfassung.test/**', async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      const file = pathname === '/impressum.html' ? 'impressum.html' : pathname === '/datenschutz.html' ? 'datenschutz.html' : null;
      if (file) return route.fulfill({ status: 200, contentType: 'text/html', body: fs.readFileSync(path.join(root, file)) });
      return route.abort();
    });

    await page.goto('https://signalerfassung.test/impressum.html');
    assert.equal(await page.locator('h1').textContent(), 'Impressum');
    await page.goto('https://signalerfassung.test/datenschutz.html');
    assert.equal(await page.locator('h1').textContent(), 'Datenschutzerklärung');
    const privacyText = await page.locator('main').innerText();
    assert(!/Google|Gmail|Interne Nutzungsstatistik/i.test(privacyText));
    assert.equal(unexpectedRequests.length, 0);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ result: 'PASS', publicLegalPages: 2, apiRequests: 0, pageErrors: errors }, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
