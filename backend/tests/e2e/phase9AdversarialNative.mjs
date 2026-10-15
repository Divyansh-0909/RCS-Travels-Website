import assert from 'node:assert/strict';
import { mkdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { chromium } from '../../../frontend/node_modules/playwright/index.mjs';
import { createServer } from '../../../frontend/node_modules/vite/dist/node/index.js';
import { expect } from '../../../frontend/node_modules/@playwright/test/index.mjs';
import { createBrowserHarness } from '../helpers/phase9BrowserHarness.js';
import { browserPublishableKey } from '../helpers/phase9BrowserAuth.js';
import { installPhase9PlacesProvider } from '../helpers/phase9PlacesProvider.js';
import { saveSanitizedTrace } from '../helpers/phase9BrowserArtifacts.js';
import { phase9UiSourceHashes } from '../helpers/phase9UiSources.js';
import { V5_HASH } from '../helpers/phase9ReplayContract.js';
import { browserReceiptHash } from '../helpers/phase9BrowserReceipt.js';
import { createBrowserActor } from './phase9BrowserActor.mjs';
import { createNativeSession } from './phase9NativeSession.mjs';
import { sealUiReproduction } from '../../../tools/phase9-cross/ui-reproduction.mjs';

const run = 'race-' + new Date().toISOString().replace(/[^0-9]/g, '') + '-' + randomUUID();
const output = join(process.env.PHASE9_UI_OUTPUT, run);
const temporary = await mkdtemp(join(tmpdir(), 'rcs-phase9-race-'));
await mkdir(output, { recursive: true });
console.log('Adversarial native scenario: ' + run);
const places = installPhase9PlacesProvider(), harness = await createBrowserHarness();
const { phase9FinancialSnapshot } = await import('../helpers/phase9Lifecycle.js');
assert.equal((await import('../../db/prisma.js')).prisma, harness.db);
process.env.VITE_API_BASE_URL = '/fixture-backend';
process.env.VITE_CLERK_PUBLISHABLE_KEY = browserPublishableKey;
process.env.PHASE9_BROWSER_API = harness.apiUrl;
const vite = await createServer({ root: fileURLToPath(new URL('../../../frontend/', import.meta.url)),
  configFile: fileURLToPath(new URL('../../../frontend/tests/e2e/vite.config.mjs', import.meta.url)) });
const actions = [], events = [], contexts = [];
let browser, native, pendingFlow;
let entered;
const arrived = new Promise(done => { entered = done; });
let release;
const gate = new Promise(done => { release = done; });
let acceptanceRequests = 0;
const captureSources = () => phase9UiSourceHashes([
    'backend/tests/e2e/phase9AdversarialNative.mjs', 'backend/tests/e2e/phase9NativeSession.mjs',
    'backend/tests/helpers/phase9NativeGateway.js', 'backend/tests/helpers/phase9UiSources.js',
    'tools/phase9-cross/ui-reproduction.mjs', 'backend/tests/run-phase9-cross.js']);
let initial, sources;
try {
  sources = await captureSources();
  initial = { clock: harness.lifecycle.clock.now(), booking: await harness.lifecycle.booking(),
    actors: Object.fromEntries(Object.entries(harness.actors).map(([key, actor]) => [key, { id: actor.id, role: actor.role ?? key }])),
    provider: harness.lifecycle.provider.snapshot(), financials: await phase9FinancialSnapshot(harness.db) };
  assert.equal((await harness.lifecycle.deliver()).status, 200);
  const booking = await harness.lifecycle.booking();
  await harness.lifecycle.offer({ at: new Date(booking.scheduledAt.getTime() - 30 * 60000).toISOString() });
  await vite.listen(); browser = await chromium.launch();
  const url = 'http://127.0.0.1:' + vite.httpServer.address().port;
  const customer = await createBrowserActor({ browser, url, actor: 'customer', contexts, viewport: { width: 390, height: 844 } });
  await customer.page.goto(url + '/booking/' + booking.id);
  await expect(customer.page.getByText('Advance paid', { exact: true })).toBeVisible();
  native = await createNativeSession(harness, output, {
    restoreAwake: process.env.PHASE9_KEEP_AWAKE !== '1',
    syntheticLocation: () => ({ schema: 'phase9-synthetic-location-v1', source: 'synthetic-delhi', unavailable: true,
      fix: { timestamp: Date.now(), coords: { latitude: 28.6129, longitude: 77.2295, accuracy: 8 } } }),
    async beforeRequest(request) {
      if (request.method !== 'PATCH' || !request.path.endsWith('/accept')) return;
      acceptanceRequests++;
      events.push({ kind: 'native-acceptance-held-before-delivery', request, at: new Date().toISOString() });
      entered();
      await Promise.race([gate, new Promise((_, fail) => {
        const timer = setTimeout(() => fail(new Error('Acceptance race barrier timed out')), 90000); timer.unref();
      })]);
    },
  });
  await native.reopen();
  await native.maestro('race-open-offer', '- tapOn: "Notifications"\n- extendedWaitUntil:\n    visible: "Accept"\n    timeout: 90000\n- takeScreenshot: race-open-offer\n');
  pendingFlow = native.maestro('race-accept-pending', '- tapOn:\n    text: "Accept"\n    repeat: 2\n    delay: 50\n- extendedWaitUntil:\n    visible: "No notifications"\n    timeout: 90000\n- takeScreenshot: race-native-terminal\n');
  // Attach a handler immediately; the original rejection is rethrown when awaited.
  pendingFlow.catch(() => {});
  await Promise.race([arrived, pendingFlow.then(() => { throw new Error('Native flow finished before acceptance reached the barrier'); })]);
  assert.equal((await harness.lifecycle.booking()).driverId, null);
  assert.equal(await harness.db.walletEntry.count({ where: { bookingId: booking.id } }), 0);
  actions.push({ actor: 'physical captain', action: 'Native double tap reaches a held real acceptance request before server delivery', status: 'PASS' });
  await customer.page.getByText('Ride details', { exact: true }).click();
  await customer.page.getByRole('button', { name: 'Cancel ride', exact: true }).click();
  await customer.page.getByRole('button', { name: 'Other / none of these', exact: true }).click();
  await customer.page.getByRole('button', { name: 'Yes, cancel ride', exact: true }).click();
  await customer.page.goto(url + '/booking/' + booking.id);
  await expect(customer.page.getByTestId('cancelled-booking')).toBeVisible();
  events.push({ kind: 'browser-cancellation-committed', booking: await harness.lifecycle.booking(), at: new Date().toISOString() });
  release(); await pendingFlow;
  assert.equal(acceptanceRequests, 1, 'Pending native button must prevent a second acceptance request');
  const accepted = native.gateway.requests.filter(request => request.method === 'PATCH' && request.path.endsWith('/accept'));
  assert.equal(accepted.length, 1); assert.equal(accepted[0].status, 409);
  assert.equal((await harness.lifecycle.booking()).status, 'cancelled');
  assert.equal((await harness.lifecycle.booking()).driverId, null);
  assert.equal(await harness.db.walletEntry.count({ where: { bookingId: booking.id } }), 0);
  actions.push({ actor: 'customer browser + physical captain', action: 'Browser cancellation commits before native acceptance; native stale action is rejected with no assignment or hold', status: 'PASS' });
  const refund = harness.lifecycle.provider.snapshot().refunds[0];
  assert.equal(refund.amount, 10000);
  harness.lifecycle.provider.setRefundState(refund.id, 'processed');
  const event = harness.lifecycle.provider.queueRefundEvent('refund.processed', refund.id);
  // Hold the actual customer refresh while the external signed refund commits.
  let delivered = false;
  await customer.page.route('**/api/bookings/' + booking.id + '/status', async route => {
    if (!delivered) { delivered = true; await harness.lifecycle.deliverEvent(event); await harness.lifecycle.deliverEvent(event); }
    await route.continue();
  });
  await customer.page.getByRole('button', { name: 'Refresh payment status', exact: true }).click();
  await expect(customer.page.getByRole('heading', { name: 'Advance refunded', exact: true })).toBeVisible();
  await expect(customer.page.getByRole('button', { name: 'Cancel ride', exact: true })).toHaveCount(0);
  await customer.page.screenshot({ path: join(output, 'race-customer-refunded.png'), fullPage: true });
  assert.equal(harness.lifecycle.provider.snapshot().refunds.length, 1);
  actions.push({ actor: 'customer browser + signed synthetic provider', action: 'Refresh races processed refund callbacks and renders authoritative terminal state without active controls or duplicate refund', status: 'PASS' });
  await native.reopen();
  await native.maestro('race-restart-stale-notifications', '- tapOn: "Notifications"\n- extendedWaitUntil:\n    visible: "No notifications"\n    timeout: 90000\n- assertNotVisible: "Accept"\n- takeScreenshot: race-restart-no-offer\n');
  actions.push({ actor: 'physical captain', action: 'Process restart reconciles withdrawn offer; no stale acceptance control remains', status: 'PASS' });
  const financials = await phase9FinancialSnapshot(harness.db);
  for (const key of ['finality', 'liabilities', 'strikes', 'blocks', 'executions', 'payouts']) assert.equal(financials[key], 0);
  for (const driver of financials.drivers) assert.equal(driver.walletBalance, 1000);
  assert.deepEqual(await captureSources(), sources);
  if (process.argv.includes('--capture-ui-failure')) {
    throw new Error('CONTROLLED_CAPTURE_WITNESS: intentional diagnostic failure after the real native/browser cancellation race and verified financial invariants');
  }
  const receipt = { schema: 'phase9c-adversarial-race-v1', run, status: 'PASS', frozenV5: V5_HASH,
    sources, initial, actions, events, financials, booking: await harness.lifecycle.booking(),
    provider: harness.lifecycle.provider.snapshot(), requests: harness.requests,
    native: { build: native.build, stagedSources: native.stagedSources, requests: native.gateway.requests },
    boundary: 'Native pending acceptance and browser cancellation/refresh are actual UI actions. Capture/refund callbacks and database checks are controlled external fixtures. No actual hardware GPS or exact UI scheduling replay.' };
  await writeFile(join(output, 'receipt.json'), JSON.stringify({ ...receipt, integrity: browserReceiptHash(receipt) }, null, 2));
  console.log('Adversarial native/browser race PASS: ' + run);
} catch (error) {
  await writeFile(join(output, 'reproduction.json'), JSON.stringify(sealUiReproduction('native-race', {
    initial, sources, actions, events, error: error.message,
    runtime: native && { build: native.build, stagedSources: native.stagedSources },
  }), null, 2));
  await writeFile(join(output, 'failure.json'), JSON.stringify({ schema: 'phase9c-adversarial-failure-v1', run,
    error: error.message, sources, initial, actions, events, requests: harness.requests,
    native: native && { build: native.build, stagedSources: native.stagedSources, requests: native.gateway.requests },
    booking: await harness.lifecycle.booking(), financials: await phase9FinancialSnapshot(harness.db) }, null, 2));
  throw error;
} finally {
  release(); await pendingFlow?.catch(() => {});
  try {
    for (let i = 0; i < contexts.length; i++) await saveSanitizedTrace(contexts[i], temporary, output, 'trace-' + i);
  } finally {
    await native?.close(); await browser?.close(); await vite.close(); await harness.close(); places.restore();
    await rm(temporary, { recursive: true, force: true });
  }
}
