'use strict';

// Screddy fork: the compact title mark is the SR logo and opens shawn-reddy.com.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('src/electron/renderer/index.html');
const app = read('src/electron/renderer/app.js');
const main = read('src/electron/main.js');

test('the compact title mark is the SR logo instead of Σ', () => {
  const mark = html.match(/<span class="app-title-mark"[^>]*>([\s\S]*?)<\/span>/);
  assert.ok(mark, 'the title mark is still present');
  // No title attribute: Token Monitor forbids native tooltips on Electron surfaces.
  assert.match(mark[1], /<img src="\.\/icons\/sr-logo\.png" alt="">/);
  assert.doesNotMatch(mark[1], /Σ/);
  assert.ok(fs.existsSync(path.join(root, 'src/electron/renderer/icons/sr-logo.png')));
});

test('clicking the SR logo opens shawn-reddy.com; the hold and the toggle stay on the live dot', () => {
  assert.match(app, /const SHAWN_REDDY_URL = 'https:\/\/shawn-reddy\.com\/';/);
  assert.match(
    app,
    /els\.appTitleMark\?\.addEventListener\('click', \(\) => window\.tokenMonitor\.openExternal\?\.\(SHAWN_REDDY_URL\)\);/
  );
  for (const handler of ['startTokenRateBoost', 'toggleTokenRateMode', 'suppressTokenRateClickAfterHold']) {
    assert.doesNotMatch(app, new RegExp(`els\\.appTitleMark\\?\\.addEventListener\\('[a-z]+', ${handler}\\)`), handler);
    assert.match(app, new RegExp(`els\\.liveDot\\?\\.addEventListener\\('[a-z]+', ${handler}\\)`), handler);
  }
});

test('external links admit shawn-reddy.com over https only', () => {
  const declarations = main.slice(main.indexOf('const STATUS_PAGE_HOSTS'), main.indexOf('const diagnosticJournal'));
  const start = main.indexOf('function isAllowedExternalUrl(');
  const allowed = vm.runInNewContext(`${declarations}\n${main.slice(start, main.indexOf('\nfunction revealWindow(', start))}\nisAllowedExternalUrl`, {
    URL, SERVICE_STATUS_PROVIDERS: [], settings: {}, process: { env: {} },
    isAllowedVerificationUrl: () => false, isAllowedCodexLoginUrl: () => false, limitProviderUrlAllowed: () => false
  });
  assert.equal(allowed('https://shawn-reddy.com/'), true);
  assert.equal(allowed('https://www.shawn-reddy.com/'), true);
  for (const url of ['http://shawn-reddy.com/', 'https://shawn-reddy.com.evil.test/', 'https://evil.test/?u=shawn-reddy.com']) {
    assert.equal(allowed(url), false, url);
  }
});
