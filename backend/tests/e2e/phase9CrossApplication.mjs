import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { chromium } from '../../../frontend/node_modules/playwright/index.mjs';
import { createServer } from '../../../frontend/node_modules/vite/dist/node/index.js';
import { expect } from '../../../frontend/node_modules/@playwright/test/index.mjs';
import { createBrowserHarness } from '../helpers/phase9BrowserHarness.js';
import { browserPublishableKey } from '../helpers/phase9BrowserAuth.js';
import { installPhase9PlacesProvider } from '../helpers/phase9PlacesProvider.js';
import { browserApplicationSources, sourceIdentities, saveSanitizedTrace } from '../helpers/phase9BrowserArtifacts.js';
import { replaySourceHashes, V5_HASH } from '../helpers/phase9ReplayContract.js';
import { browserReceiptHash } from '../helpers/phase9BrowserReceipt.js';
import { createBrowserActor } from './phase9BrowserActor.mjs';
import { createNativeSession } from './phase9NativeSession.mjs';
import { runCaptainJourney } from './phase9CaptainJourney.mjs';
import { runCrossClosure } from './phase9CrossClosure.mjs';

const run = new Date().toISOString().replace(/[^0-9]/g, '') + '-' + randomUUID();
const output = join(process.env.PHASE9_UI_OUTPUT, run);
await mkdir(output, { recursive: true });
console.log('Cross application setup: ' + run);
const places = installPhase9PlacesProvider();
const harness = await createBrowserHarness({ formBooking: true });
process.env.VITE_API_BASE_URL = '/fixture-backend';
process.env.VITE_CLERK_PUBLISHABLE_KEY = browserPublishableKey;
process.env.PHASE9_BROWSER_API = harness.apiUrl;
const vite = await createServer({ root: fileURLToPath(new URL('../../../frontend/', import.meta.url)),
  configFile: fileURLToPath(new URL('../../../frontend/tests/e2e/vite.config.mjs', import.meta.url)) });
const actions = [];
const contexts = [];
let browser;
let native;
const sourceFiles = ['backend/tests/e2e/phase9CrossApplication.mjs', 'backend/tests/e2e/phase9CrossClosure.mjs',
  'backend/tests/e2e/phase9CaptainJourney.mjs', 'backend/tests/e2e/phase9NativeSession.mjs',
  'backend/tests/e2e/phase9BrowserActor.mjs', 'backend/tests/helpers/phase9PlacesProvider.js',
  'backend/tests/helpers/phase9BrowserHarness.js', 'backend/tests/helpers/phase9NativeGateway.js',
  'backend/tests/run-phase9-cross.js', 'tools/phase9-native/maps-test.mjs'];
const captureSources = async () => ({ ...Object.fromEntries(Object.entries(await replaySourceHashes()).map(([file, sha]) => ['backend/' + file, sha])),
  ...await browserApplicationSources(), ...await sourceIdentities(sourceFiles) });
try {
  const sources = await captureSources();
  const initial = { clock: harness.lifecycle.clock.now(), bookings: await harness.db.booking.findMany(),
    wallets: await harness.db.walletEntry.findMany(), provider: harness.lifecycle.provider.snapshot() };
  assert.equal(initial.bookings.length, 0);
  await vite.listen();
  const url = 'http://127.0.0.1:' + vite.httpServer.address().port;
  browser = await chromium.launch();
  const { page } = await createBrowserActor({ browser, url, actor: 'customer', contexts });
  await page.goto(url + '/book');
  await expect(page.getByRole('heading', { name: 'Find a ride', exact: true })).toBeVisible();
  await page.locator('#pickup-location').fill('Synthetic Delhi pickup');
  await page.getByText('Synthetic Delhi pickup', { exact: true }).last().click();
  await page.locator('#drop-location').fill('Synthetic Delhi drop');
  await page.getByText('Synthetic Delhi drop', { exact: true }).last().click();
  await page.getByRole('button', { name: 'Later', exact: true }).click();
  await page.getByText('Ride now', { exact: true }).last().click();
  await page.getByRole('button', { name: 'Now', exact: true }).click();
  await page.getByText('Later', { exact: true }).last().click();
  await page.getByRole('button', { name: 'Set date & time', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Set date and time' })).toBeVisible();
  await page.screenshot({ path: join(output, 'customer-schedule-baseline.png'), fullPage: true });
  // Select tomorrow through the actual date wheel, retaining the supported time.
  const days = page.getByRole('listbox').first();
  await days.focus();
  await days.press('ArrowDown');
  await page.getByRole('button', { name: 'See prices', exact: true }).click();
  await expect(page.getByText('Sedan', { exact: true }).first()).toBeVisible();
  await page.getByText('Sedan', { exact: true }).first().click();
  await page.screenshot({ path: join(output, 'customer-vehicle-review.png'), fullPage: true });
  await page.getByRole('button', { name: 'Book ride', exact: true }).click();
  const creationResponse = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/api/bookings')
    && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Confirm pickup', exact: true }).click();
  const completedCreation = await creationResponse;
  assert.equal(completedCreation.status(), 200);
  const createdBody = await completedCreation.json();
  assert.ok(createdBody.payment?.orderId, 'Booking HTTP completion must include the asynchronously created checkout order');
  await expect(page.getByRole('button', { name: /^Pay/ })).toBeVisible();
  await expect.poll(async () => harness.db.booking.count()).toBe(1);
  const booking = await harness.db.booking.findFirstOrThrow();
  assert.equal(booking.userId, harness.actors.customer.id);
  assert.equal(booking.pickupAddress, 'Synthetic Delhi pickup');
  assert.equal(booking.dropAddress, 'Synthetic Delhi drop');
  assert.equal(booking.vehicleClass, 'sedan');
  assert.ok(booking.scheduledAt);
  assert.equal(booking.status, 'payment_pending');
  const payment = await harness.lifecycle.adoptBooking(booking.id);
  actions.push({ actor: 'customer browser', action: 'actual location/date/vehicle/review forms create one protected booking', status: 'PASS' });
  await page.screenshot({ path: join(output, 'customer-advance-request.png'), fullPage: true });
  await page.getByRole('button', { name: /^Pay/ }).click();
  await page.getByRole('button', { name: 'Complete synthetic payment', exact: true }).click();
  await expect.poll(async () => (await harness.db.payment.findFirstOrThrow({ where: { bookingId: booking.id } })).status).toBe('authorized');
  assert.equal((await harness.lifecycle.booking()).scheduledAdvancePaidAmount, 0);
  harness.lifecycle.captureAdvance();
  assert.equal((await harness.lifecycle.deliver()).status, 200);
  assert.equal((await harness.lifecycle.deliver()).status, 200);
  await page.reload();
  await expect.poll(async () => (await harness.lifecycle.booking()).status).toBe('confirmed');
  actions.push({ actor: 'customer browser + signed synthetic provider', action: 'checkout authorization then duplicate signed capture confirms one advance', status: 'PASS' });
  let captainJourney = null;
  let closure = null;
  if (process.env.PHASE9_CROSS_MODE === 'combined') {
    native = await createNativeSession(harness, output, { acceptanceFault: 'after', restoreAwake: process.env.PHASE9_KEEP_AWAKE !== '1' });
    await native.maestro('permission-boundary', '- tapOn:\n    text: "Not now"\n    optional: true\n- tapOn:\n    text: "Not now"\n    optional: true\n');
    captainJourney = await runCaptainJourney({ harness, native, actions });
    closure = await runCrossClosure({ browser, harness, url, output, contexts, actions, customer: page, incident: captainJourney.incident });
  }
  assert.deepEqual(await captureSources(), sources, 'Loaded application and executor sources must remain unchanged during the selected run');
  const receipt = { schema: 'rcs-phase9-cross-v1', run, status: 'PASS', frozenV5: V5_HASH, sources, initial,
    actions, requests: harness.requests, providerInputs: places.observations, payment,
    captainJourney, closure, native: native ? { build: native.build, stagedSources: native.stagedSources,
      requests: native.gateway.requests, faults: native.gateway.faults } : null,
    booking: await harness.lifecycle.booking(), wallets: await harness.db.walletEntry.findMany(),
    provider: harness.lifecycle.provider.snapshot(), mode: process.env.PHASE9_CROSS_MODE,
    replayBoundary: 'Fresh-database recipe execution; not exact saved-input UI replay', productionShadow: 'OFF', productionConsequences: 'OFF' };
  await writeFile(join(output, 'receipt.json'), JSON.stringify({ ...receipt, integrity: browserReceiptHash(receipt) }, null, 2));
  console.log('Customer form PASS: ' + run);
} catch (error) {
  await writeFile(join(output, 'failure.json'), JSON.stringify({ run, actions, error: error.message, requests: harness.requests,
    native: native ? { build: native.build, stagedSources: native.stagedSources, requests: native.gateway.requests, faults: native.gateway.faults } : null,
    bookings: await harness.db.booking.findMany(), payments: await harness.db.payment.findMany(),
    wallets: await harness.db.walletEntry.findMany(), cases: await harness.db.responsibilityCase.findMany(),
    shadowResults: await harness.db.responsibilityShadowResult.findMany(), provider: harness.lifecycle.provider.snapshot() }, null, 2));
  if (browser) for (const [index, context] of browser.contexts().entries()) for (const page of context.pages()) {
    await page.screenshot({ path: join(output, 'failure-' + index + '.png'), fullPage: true }).catch(() => {});
    await writeFile(join(output, 'failure-' + index + '-text.txt'), await page.locator('body').innerText()).catch(() => {});
  }
  throw error;
} finally {
  for (const [index, context] of contexts.entries()) await saveSanitizedTrace(context, process.env.PHASE9_EMPTY_ENV_DIR, output, 'trace-' + index);
  await browser?.close();
  await native?.close();
  await vite.close();
  await harness.close();
  places.restore();
}
