const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const recordingsDir = process.argv[2];

if (!recordingsDir || !fs.statSync(recordingsDir).isDirectory()) {
  throw new Error('Usage: node tools/test-real-recordings.cjs <recordings-directory>');
}

const files = fs.readdirSync(recordingsDir)
  .filter(name => /\.txt$/i.test(name))
  .sort((a, b) => a.localeCompare(b, 'de'))
  .map(name => path.join(recordingsDir, name));

assert(files.length > 0, 'No TXT recordings found');

function expectedShape(file) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  const ids = lines[0].split('\t').map(value => value.trim());
  const isSdp3 = lines[2].split('\t')[0].trim() === 'TimeStamp'
    && lines[3].split('\t')[0].trim() === 'Time';
  const start = isSdp3 ? 4 : 2;
  const markerIndex = ids.findIndex(id => /^Marker$/i.test(id));
  const markerEvents = [];
  let previous = null;
  if (markerIndex > 0) {
    lines.slice(start).filter(line => /^\d{2}:\d{2}/.test(line.trim())).forEach(line => {
      const value = Number(String(line.split('	')[markerIndex] || '').trim().replace(',', '.'));
      if (String(line.split('	')[markerIndex] || '').trim() === '' || !Number.isFinite(value)) return;
      if (value >= 1 && value !== previous) markerEvents.push(value);
      previous = value;
    });
  }
  return {
    name: path.basename(file),
    bytes: Buffer.byteLength(text),
    format: isSdp3 ? 'SDP3' : 'SWS',
    signals: ids.slice(1).filter(id => id && id !== 'TimeOffset').length,
    rows: lines.slice(start).filter(line => /^\d{2}:\d{2}/.test(line.trim())).length,
    markerEvents,
  };
}

const expected = files.map(expectedShape);

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
    const pageErrors = [];
    const consoleErrors = [];
    const dialogs = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('dialog', async dialog => {
      dialogs.push(dialog.message());
      await dialog.dismiss();
    });
    await page.addInitScript(() => {
      const browserFetch = window.fetch.bind(window);
      window.fetch = (input, init) => {
        const target = typeof input === 'string' ? input : input.url;
        if (String(target).includes('/api/usage')) return Promise.resolve(new Response(null, { status: 204 }));
        return browserFetch(input, init);
      };
    });
    await page.route(/^https?:/, route => route.abort());
    await page.goto(pathToFileURL(path.join(root, 'signalerfassung-analyse-tool.html')).href);

    await page.locator('#file-input').setInputFiles(files);
    await page.waitForFunction(count => S.files.length === count, files.length, { timeout: 30000 });
    await page.waitForFunction(count => document.querySelectorAll('#tabs-bar .tab').length === count, files.length, { timeout: 30000 });
    assert.equal(await page.locator('#tabs-bar .tab').count(), files.length, 'One tab per recording');

    const results = [];
    for (let index = 0; index < files.length; index++) {
      const shape = expected[index];
      await page.evaluate(activeIndex => {
        S.activeIdx = activeIndex;
        buildUI();
      }, index);

      const parsed = await page.evaluate(() => {
        const file = active();
        const elapsed = file.rawRows.map(row => row.elapsedSec);
        const numericSignals = file.signals.filter(signal => signal.chartNumeric).length;
        const maxParts = Math.max(...file.rawRows.map(row => row.parts.length));
        return {
          filename: file.filename,
          format: file.sourceFormat,
          rows: file.rawRows.length,
          filtered: file.filtered.length,
          signals: file.signals.length,
          numericSignals,
          first: file.rawRows[0].ts,
          last: file.rawRows[file.rawRows.length - 1].ts,
          duration: recordingDuration(file),
          monotonic: elapsed.every((value, row) => row === 0 || value >= elapsed[row - 1]),
          finiteElapsed: elapsed.every(Number.isFinite),
          validIndexes: file.signals.every(signal => signal.index > 0 && signal.index < maxParts),
        };
      });

      assert.equal(parsed.filename, shape.name);
      assert.equal(parsed.format, shape.format);
      assert.equal(parsed.rows, shape.rows);
      assert.equal(parsed.filtered, shape.rows);
      assert.equal(parsed.signals, shape.signals);
      assert(parsed.numericSignals > 0, shape.name + ': no numeric signals detected');
      assert(parsed.duration > 0, shape.name + ': no recording duration');
      assert(parsed.monotonic, shape.name + ': elapsed time is not monotonic');
      assert(parsed.finiteElapsed, shape.name + ': invalid elapsed time');
      assert(parsed.validIndexes, shape.name + ': signal index outside row data');

      assert.equal(
        await page.locator('#thead th').count(),
        shape.signals + 1,
        shape.name + ': table columns do not match signals'
      );
      assert(await page.locator('#tbody .data-row').count() > 0, shape.name + ': table did not render rows');

      await page.locator('#view-chart-btn').click();
      await page.waitForTimeout(120);
      const chart = await page.locator('#signal-chart').evaluate(canvas => {
        const context = canvas.getContext('2d');
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let nonTransparent = 0;
        let nonWhite = 0;
        let redPixels = 0;
        let sampled = 0;
        for (let offset = 0; offset < pixels.length; offset += 16) {
          sampled++;
          if (pixels[offset + 3]) nonTransparent++;
          if (pixels[offset] < 245 || pixels[offset + 1] < 245 || pixels[offset + 2] < 245) nonWhite++;
          if (pixels[offset] > 205 && pixels[offset + 1] < 175 && pixels[offset + 2] < 175) redPixels++;
        }
        return {
          width: canvas.width,
          height: canvas.height,
          nonTransparent,
          nonWhite,
          redCoverage: redPixels / sampled,
          curves: chartSignals(active(), active().filtered).length,
        };
      });
      assert(chart.width > 500 && chart.height > 200, shape.name + ': invalid chart dimensions');
      assert(chart.curves > 0, shape.name + ': no chart curves selected');
      assert(chart.nonTransparent > 100 && chart.nonWhite > 100, shape.name + ': chart canvas appears blank');
      assert(chart.redCoverage < 0.08, shape.name + ': raw marker values cover the chart in red (' + chart.redCoverage + ')');

      // Capture markers are a separate layer: they are detected from the counter and never mark rows.
      const capture = await page.evaluate(() => {
        const file = active(), events = markerEvents(file);
        const before = file.rawRows.filter(row => row.marked).length;
        const button = document.getElementById('mark-timestamps');
        const shown = { pressed: button.getAttribute('aria-pressed'), disabled: button.disabled, count: button.querySelector('.tool-count').textContent };
        markMarkerTimestamps();
        const hidden = { visible: captureMarkersShown(file), pressed: button.getAttribute('aria-pressed') };
        markMarkerTimestamps();
        setAnalysisView('table', true);
        const badges = events.map(event => { renderTable(file.rawRows.slice(event.row.rowId, event.row.rowId + 1)); return document.querySelector('.time-marker-event')?.textContent || ''; });
        return { values: events.map(event => event.value), before, after: file.rawRows.filter(row => row.marked).length, shown, hidden, visibleAgain: captureMarkersShown(file), badges };
      });
      assert.deepEqual(capture.values, shape.markerEvents, shape.name + ': capture marker presses were not detected correctly');
      assert.equal(capture.before, 0, shape.name + ': rows must not be marked on import');
      assert.equal(capture.after, 0, shape.name + ': toggling capture markers must not mark rows');
      assert.equal(capture.shown.count, String(shape.markerEvents.length), shape.name + ': toolbox count');
      if (shape.markerEvents.length) {
        assert.equal(capture.shown.pressed, 'true', shape.name + ': capture markers are shown by default');
        assert.equal(capture.hidden.visible, false, shape.name + ': capture markers can be hidden');
        assert.equal(capture.visibleAgain, true, shape.name + ': capture markers can be shown again');
        assert.deepEqual(capture.badges, shape.markerEvents.map(String), shape.name + ': numbered marker badges are missing in the table');
      } else {
        assert.equal(capture.shown.disabled, true, shape.name + ': toggle disabled without markers');
      }
      await page.evaluate(() => renderTable(active().filtered));

      const exports = await page.evaluate(async () => {
        const file = active();
        const rows = file.filtered;
        const allRows = file.rawRows;
        const signals = visibleSignals(file);
        const from = allRows[0].ts.substring(0, 8);
        const to = allRows[allRows.length - 1].ts.substring(0, 8);
        const xlsx = await exportStyledXLSX(file, allRows, rows, signals, from, to, { download: false });
        const pdf = exportPDF({ download: false, file });
        const png = await createChartPng(file);
        async function head(blob) {
          return Array.from(new Uint8Array(await blob.slice(0, 4).arrayBuffer()));
        }
        return {
          xlsx: { size: xlsx.size, head: await head(xlsx) },
          pdf: { size: pdf.size, head: await head(pdf) },
          png: png ? { size: png.size, head: await head(png) } : null,
        };
      });
      assert(exports.xlsx.size > 5000 && exports.pdf.size > 5000 && exports.png.size > 1000, shape.name + ': export is unexpectedly small');
      assert.deepEqual(exports.xlsx.head, [80, 75, 3, 4], shape.name + ': invalid XLSX signature');
      assert.deepEqual(exports.pdf.head, [37, 80, 68, 70], shape.name + ': invalid PDF signature');
      assert.deepEqual(exports.png.head, [137, 80, 78, 71], shape.name + ': invalid PNG signature');

      results.push({ ...shape, ...parsed, chartCurves: chart.curves, redCoverage: chart.redCoverage, exports: {
        xlsx: exports.xlsx.size,
        pdf: exports.pdf.size,
        png: exports.png.size,
      } });
      await page.locator('#view-table-btn').click();
    }

    await page.locator('[data-lang-set="en"]').click();
    const english = await page.evaluate(() => ({
      lang: currentLang(),
      summary: supportSummary(active()),
      title: document.title,
    }));
    assert.equal(english.lang, 'en');
    assert.match(english.summary, /^SIGNAL CAPTURE - SUPPORT PACKAGE/);
    assert.match(english.summary, /Measurement rows total:/);
    assert.doesNotMatch(english.summary, /Messzeilen gesamt:/);

    const snapshot = await page.evaluate(() => {
      S.files.forEach(file => { file.dirty = false; });
      const value = projectSnapshot();
      return { text: JSON.stringify(value), files: value.files.length };
    });
    assert.equal(snapshot.files, files.length);
    await page.evaluate(text => {
      const project = new File([text], 'real-recordings.signalprojekt', { type: 'application/json' });
      loadProjectFile(project);
    }, snapshot.text);
    await page.waitForFunction(count => S.files.length === count, files.length, { timeout: 30000 });
    const restored = await page.evaluate(() => S.files.map(file => ({
      name: file.filename,
      rows: file.rawRows.length,
      signals: file.signals.length,
    })));
    assert.deepEqual(restored, expected.map(item => ({ name: item.name, rows: item.rows, signals: item.signals })));

    assert.deepEqual(dialogs, [], 'Unexpected dialogs: ' + dialogs.join(' | '));
    assert.deepEqual(pageErrors, [], 'Page errors: ' + pageErrors.join(' | '));
    assert.deepEqual(consoleErrors, [], 'Console errors: ' + consoleErrors.join(' | '));
    console.log(JSON.stringify({
      result: 'PASS',
      files: results,
      multiFileUpload: 'PASS',
      language: 'DE/EN PASS',
      projectRoundTrip: 'PASS',
      pageErrors,
    }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
