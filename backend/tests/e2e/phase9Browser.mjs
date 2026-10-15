import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { chromium } from '../../../frontend/node_modules/playwright/index.mjs';
import { createServer } from '../../../frontend/node_modules/vite/dist/node/index.js';
import { createBrowserHarness } from '../helpers/phase9BrowserHarness.js';
import { browserPublishableKey } from '../helpers/phase9BrowserAuth.js';
import { runBrowserJourneys } from './phase9BrowserJourneys.mjs';
import { saveSanitizedTrace, sourceIdentities, browserApplicationSources } from '../helpers/phase9BrowserArtifacts.js';
import { replaySourceHashes, V5_HASH } from '../helpers/phase9ReplayContract.js';
import { browserFinalInvariants, browserReceiptHash, loadBrowserReplay } from '../helpers/phase9BrowserReceipt.js';

const sourceFiles = [
  'frontend/src/main.jsx', 'frontend/src/pages/ResponsibilityCase.jsx', 'frontend/src/pages/TrackingPage.jsx',
  'frontend/src/components/CancelledBookingPanel.jsx', 'frontend/src/lib/responsibilityCaseLoad.js',
  'frontend/src/lib/cancelledAdvanceSummary.js', 'frontend/src/components/ProtectedRoute.jsx',
  'frontend/src/lib/responsibilityInspection.js',
  'frontend/src/api/api.js', 'frontend/src/hooks/useApi.js', 'frontend/package.json', 'frontend/package-lock.json',
  'frontend/tests/e2e/vite.config.mjs', 'backend/tests/e2e/phase9Browser.mjs',
  'backend/tests/e2e/phase9BrowserJourneys.mjs', 'backend/tests/helpers/phase9BrowserAuth.js',
  'backend/tests/helpers/phase9BrowserProviders.js', 'backend/tests/helpers/phase9BrowserHarness.js',
  'backend/tests/helpers/phase9BrowserArtifacts.js', 'backend/tests/helpers/phase9BrowserReceipt.js',
  'backend/tests/helpers/phase9TraceRedaction.js', 'backend/tests/run-phase9-ui.js',
];
const captureSources = async () => ({ ...Object.fromEntries(Object.entries(await replaySourceHashes()).map(([file, hash]) => [`backend/${file}`, hash])),
  ...await browserApplicationSources(),
  ...await sourceIdentities(sourceFiles) });
const sources = await captureSources();
const expectedReplay = await loadBrowserReplay(sources, process.env.PHASE9_UI_OUTPUT);

const run = `${new Date().toISOString().replace(/[^0-9]/g, '')}-${randomUUID()}`;
const output = join(process.env.PHASE9_UI_OUTPUT, run);
await mkdir(output, { recursive: true });
const harness = await createBrowserHarness();
const initial = { clock: harness.lifecycle.clock.now().toISOString(), booking: await harness.lifecycle.booking(),
  payments: await harness.db.payment.findMany(), wallets: await harness.db.walletEntry.findMany(),
  provider: harness.lifecycle.provider.snapshot() };
process.env.VITE_API_BASE_URL = '/fixture-backend';
process.env.VITE_CLERK_PUBLISHABLE_KEY = browserPublishableKey;
process.env.PHASE9_BROWSER_API = harness.apiUrl;
const vite = await createServer({ root: fileURLToPath(new URL('../../../frontend/', import.meta.url)),
  configFile: fileURLToPath(new URL('../../../frontend/tests/e2e/vite.config.mjs', import.meta.url)) });
let browser;
const contexts = [];
const actions = [];
try {
  await vite.listen();
  await vite.warmupRequest('/src/main.jsx');
  await vite.warmupRequest('/src/pages/TrackingPage.jsx');
  const url = `http://127.0.0.1:${vite.httpServer.address().port}`;
  browser = await chromium.launch();
  const result = await runBrowserJourneys({ browser, harness, url, output, contexts, actions });
  await writeFile(join(output, 'requests.json'), JSON.stringify(harness.requests, null, 2));
  assert.deepEqual(await captureSources(), sources, 'Source changed during browser execution');
  const invariants = await browserFinalInvariants(harness);
  if (expectedReplay) {
    assert.deepEqual(actions, expectedReplay.actions, 'UI replay action outcomes differ');
    assert.deepEqual(invariants, expectedReplay.invariants, 'UI replay financial/ownership outcomes differ');
  }
  const receipt = { schema: 'rcs-phase9-ui-v1', run, status: 'PASS', frozenV5: V5_HASH, initial,
    invariants, replayOf: expectedReplay?.run ?? null,
    scope: 'Customer payment/cancellation/refund and admin inspection; captain protected API supplementary only',
    actions, requests: harness.requests, sources, case: result.incident, shadow: result.stored,
    booking: await harness.lifecycle.booking(), provider: harness.lifecycle.provider.snapshot(),
    wallets: await harness.db.walletEntry.findMany({ orderBy: { eventKey: 'asc' } }),
    nativeCaptain: 'NOT RUN: Android SDK/emulator/adb unavailable',
    limitations: ['Booking creation is a real-service fixture, not a customer UI action',
      'Synthetic session restoration, not OTP provider delivery', 'UI wall clock and generated identities are not bit-exact replay',
      'No native maps, location, background, notification or device proof', 'No human review action journey'],
  };
  await writeFile(join(output, 'receipt.json'), JSON.stringify({ ...receipt, integrity: browserReceiptHash(receipt) }, null, 2));
  await writeFile(join(process.env.PHASE9_UI_OUTPUT, 'latest-success.json'), JSON.stringify({ run }, null, 2));
} catch (error) {
  console.error(error.message);
  await writeFile(join(output, 'failure-actions.json'), JSON.stringify({ run, actions, requests: harness.requests, error: error.message }, null, 2));
  if (browser) {
    for (const context of browser.contexts()) for (const page of context.pages()) {
      const index = browser.contexts().indexOf(context);
      await page.screenshot({ path: join(output, `failure-${index}.png`), fullPage: true }).catch(() => {});
      await writeFile(join(output, `failure-${index}-text.txt`), await page.locator('body').innerText()).catch(() => {});
    }
  }
  throw error;
} finally {
  const traces = [];
  for (const [index, context] of contexts.entries()) {
    traces.push(await saveSanitizedTrace(context, process.env.PHASE9_EMPTY_ENV_DIR, output, `trace-${index}`));
  }
  await writeFile(join(output, 'traces.json'), JSON.stringify(traces, null, 2));
  await browser?.close();
  await vite.close();
  await harness.close();
}
