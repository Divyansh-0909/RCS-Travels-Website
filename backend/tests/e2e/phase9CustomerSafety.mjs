import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { chromium } from '../../../frontend/node_modules/playwright/index.mjs';
import { createServer } from '../../../frontend/node_modules/vite/dist/node/index.js';
import { expect } from '../../../frontend/node_modules/@playwright/test/index.mjs';
import { createBrowserHarness } from '../helpers/phase9BrowserHarness.js';
import { installPhase9PlacesProvider } from '../helpers/phase9PlacesProvider.js';
import { browserPublishableKey } from '../helpers/phase9BrowserAuth.js';
import { browserApplicationSources, sourceIdentities, saveSanitizedTrace } from '../helpers/phase9BrowserArtifacts.js';
import { browserReceiptHash } from '../helpers/phase9BrowserReceipt.js';
import { replaySourceHashes, V5_HASH } from '../helpers/phase9ReplayContract.js';
import { createBrowserActor } from './phase9BrowserActor.mjs';

const run = 'customer-' + new Date().toISOString().replace(/[^0-9]/g, '') + '-' + randomUUID();
const output = join(process.env.PHASE9_UI_OUTPUT, run);
await mkdir(output, { recursive: true });
console.log('Customer mobile safety scenario: ' + run);
const places = installPhase9PlacesProvider(), harness = await createBrowserHarness({ formBooking: true });
Object.assign(process.env, { VITE_API_BASE_URL: '/fixture-backend', VITE_CLERK_PUBLISHABLE_KEY: browserPublishableKey,
  PHASE9_BROWSER_API: harness.apiUrl });
const vite = await createServer({ root: fileURLToPath(new URL('../../../frontend/', import.meta.url)),
  configFile: fileURLToPath(new URL('../../../frontend/tests/e2e/vite.config.mjs', import.meta.url)) });
const contexts = [], actions = [];
const unknownOrder = process.env.PHASE9_CUSTOMER_UNKNOWN_ORDER === '1';
let browser, releaseBooking;
const captureSources = async () => ({ ...await replaySourceHashes(), ...await browserApplicationSources(),
  ...await sourceIdentities(['backend/tests/e2e/phase9CustomerSafety.mjs', 'backend/tests/helpers/phase9BrowserHarness.js',
    'backend/tests/helpers/phase9BrowserProviders.js', 'backend/tests/e2e/phase9BrowserActor.mjs']) });
try {
  const sources = await captureSources();
  const initial = { bookings: await harness.db.booking.findMany(), wallets: await harness.db.walletEntry.findMany() };
  assert.equal(initial.bookings.length, 0);
  await vite.listen(); browser = await chromium.launch();
  const url = 'http://127.0.0.1:' + vite.httpServer.address().port;
  const { page } = await createBrowserActor({ browser, url, actor: 'customer', contexts, viewport: { width: 390, height: 844 } });
  await page.goto(url + '/book');
  await expect(page.getByRole('heading', { name: 'Find a ride', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^(See prices|Set date & time)$/ })).toBeDisabled();
  await page.locator('#pickup-location').fill('Synthetic Delhi pickup');
  await page.getByText('Synthetic Delhi pickup', { exact: true }).last().click();
  await expect(page.getByRole('button', { name: /^(See prices|Set date & time)$/ })).toBeDisabled();
  assert.equal(await harness.db.booking.count(), 0);
  actions.push({ action: 'Mobile blank/missing-drop form cannot submit', status: 'PASS' });
  await page.locator('#drop-location').fill('Synthetic Delhi drop');
  await page.getByText('Synthetic Delhi drop', { exact: true }).last().click();
  await page.getByRole('button', { name: 'Later', exact: true }).click();
  await page.getByText('Ride now', { exact: true }).last().click();
  await page.getByRole('button', { name: 'Now', exact: true }).click();
  await page.getByText('Later', { exact: true }).last().click();
  await page.getByRole('button', { name: 'Set date & time', exact: true }).click();
  const days = page.getByRole('listbox').first(); await days.focus(); await days.press('ArrowDown');
  await page.screenshot({ path: join(output, 'customer-schedule-phone.png'), fullPage: true });
  await page.getByRole('button', { name: 'See prices', exact: true }).click();
  await expect(page.getByText('Sedan', { exact: true }).first()).toBeVisible();
  await page.goBack(); await expect(page.getByRole('heading', { name: 'Set date and time' })).toBeVisible();
  await page.goForward(); await expect(page.getByText('Sedan', { exact: true }).first()).toBeVisible();
  await page.getByText('Sedan', { exact: true }).first().click();
  await page.screenshot({ path: join(output, 'customer-vehicle-phone.png'), fullPage: true });
  actions.push({ action: 'Actual mobile location/date/vehicle forms survive browser back/forward', status: 'PASS' });
  const rejectedOrder = Object.assign(new Error('Synthetic definitive provider rejection'), {
    response: { status: 400, data: { error: { code: 'BAD_REQUEST_ERROR', description: 'Synthetic definitive order rejection' } } },
  });
  harness.lifecycle.provider.planNext('order', 'error', unknownOrder ? null : rejectedOrder);
  const observedBooking = page.waitForRequest(request => new URL(request.url()).pathname.endsWith('/api/bookings') && request.method() === 'POST');
  const bookingGate = new Promise(done => { releaseBooking = done; });
  await page.route('**/api/bookings', async route => {
    if (route.request().method() === 'POST') await bookingGate;
    await route.continue();
  });
  await page.getByRole('button', { name: 'Book ride', exact: true }).click();
  const creation = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/api/bookings') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Confirm pickup', exact: true }).click({ clickCount: 2 });
  await observedBooking;
  await expect(page.getByRole('button', { name: 'Booking...', exact: true })).toBeDisabled();
  assert.equal(await harness.db.booking.count(), 0);
  releaseBooking(); releaseBooking = null;
  const response = await creation; assert.equal(response.status(), 200);
  const created = await response.json(); assert.ok(created.paymentError); assert.equal(created.payment, null);
  await expect(page.getByRole('button', { name: 'Retry payment', exact: true })).toBeVisible();
  assert.equal(await harness.db.booking.count(), 1);
  const booking = await harness.db.booking.findFirstOrThrow();
  assert.equal(booking.userId, harness.actors.customer.id); assert.equal(booking.status, 'payment_pending');
  assert.equal(harness.lifecycle.provider.snapshot().orders.length, 0);
  actions.push({ action: 'Double click submits once; loading disables confirmation; provider order failure leaves one unpaid booking', status: 'PASS' });
  await page.screenshot({ path: join(output, 'customer-order-failure-phone.png'), fullPage: true });
  // Deliver the real protected order response only after preparing its explicit
  // fake provider payment. Checkout and authorization still execute through UI.
  await page.route('**/scheduled-advance/order', async route => {
    const actual = await route.fetch();
    if (actual.status() === 200) await harness.lifecycle.adoptBooking(booking.id);
    await route.fulfill({ response: actual });
  });
  const retry = page.waitForResponse(r => new URL(r.url()).pathname.endsWith('/scheduled-advance/order'));
  await page.getByRole('button', { name: 'Retry payment', exact: true }).click();
  assert.equal((await retry).status(), unknownOrder ? 503 : 200);
  if (unknownOrder) {
    await expect(page.getByRole('button', { name: 'Retry payment', exact: true })).toBeVisible();
    const pending = await harness.db.payment.findFirstOrThrow({ where: { bookingId: booking.id } });
    assert.equal(pending.status, 'order_creating'); assert.equal(pending.failureCode, 'ORDER_OUTCOME_UNKNOWN');
    assert.equal(harness.lifecycle.provider.snapshot().orders.length, 0);
    actions.push({ action: 'Unknown provider outcome remains unpaid and blocks creating another order; retry stays unresolved', status: 'PASS' });
    await page.screenshot({ path: join(output, 'customer-unknown-order-phone.png'), fullPage: true });
  } else {
  await page.getByRole('button', { name: 'Complete synthetic payment', exact: true }).click();
  await expect.poll(async () => (await harness.db.payment.findFirstOrThrow({ where: { bookingId: booking.id } })).status).toBe('authorized');
  await page.goto(url + '/booking/' + booking.id); await page.reload();
  assert.equal((await harness.lifecycle.booking()).status, 'payment_pending');
  assert.equal((await harness.lifecycle.booking()).scheduledAdvancePaidAmount, 0);
  actions.push({ action: 'Retry uses the same booking; refresh and checkout authorization cannot fabricate capture or confirmation', status: 'PASS' });
  harness.lifecycle.captureAdvance();
  assert.equal((await harness.lifecycle.deliver()).status, 200); assert.equal((await harness.lifecycle.deliver()).status, 200);
  await page.reload();
  await expect.poll(async () => (await harness.lifecycle.booking()).status).toBe('confirmed');
  await expect(page.getByText('Advance paid', { exact: true })).toBeVisible();
  await page.screenshot({ path: join(output, 'customer-late-capture-confirmed-phone.png'), fullPage: true });
  }
  const { page: foreign } = await createBrowserActor({ browser, url, actor: 'foreign', contexts, viewport: { width: 390, height: 844 } });
  const denied = foreign.waitForResponse(r => new URL(r.url()).pathname.endsWith('/api/bookings/' + booking.id + '/status'));
  await foreign.goto(url + '/booking/' + booking.id);
  assert.ok([403, 404].includes((await denied).status()));
  assert.equal(await harness.db.booking.count(), 1);
  const { phase9FinancialSnapshot } = await import('../helpers/phase9Lifecycle.js');
  const financials = await phase9FinancialSnapshot(harness.db);
  const finalBooking = await harness.db.booking.findUniqueOrThrow({ where: { id: booking.id } });
  const captured = financials.payments.filter(row => row.bookingId === booking.id && row.status === 'captured');
  assert.equal(captured.length, unknownOrder ? 0 : 1);
  assert.equal(finalBooking.scheduledAdvancePaidAmount, unknownOrder ? 0 : 2800);
  assert.equal(finalBooking.scheduledAdvanceAmount + finalBooking.scheduledRemainingAmount, 28000);
  if (!unknownOrder) assert.equal(captured[0].amount, 2800);
  for (const driver of financials.drivers) assert.equal(Math.round(driver.walletBalance * 100),
    Math.round(financials.wallets.filter(row => row.driverId === driver.id).reduce((sum, row) => sum + row.amount, 0) * 100));
  for (const field of ['liabilities', 'compensation', 'finality', 'strikes', 'blocks', 'appeals', 'executions', 'payouts']) assert.equal(financials[field], 0);
  assert.equal(financials.wallets.filter(row => row.bookingId === booking.id).length, 0);
  actions.push({ action: 'Foreign customer UI access is denied; single-booking funding and wallet invariants hold without consequences', status: 'PASS' });
  assert.deepEqual(await captureSources(), sources);
  const receipt = { schema: 'phase9-customer-safety-v1', run, status: 'PASS', frozenV5: V5_HASH, sources, initial, actions,
    unknownOrder, requests: harness.requests, booking: finalBooking, financials, provider: harness.lifecycle.provider.snapshot(),
    providerHistory: harness.lifecycle.provider.history, providerInputs: places.observations,
    boundary: 'Actual mobile forms and protected services; controlled request release and fake payment-provider order failure; no physical captain action in this scenario.' };
  await writeFile(join(output, 'receipt.json'), JSON.stringify({ ...receipt, integrity: browserReceiptHash(receipt) }, null, 2));
  console.log('Customer mobile safety PASS: ' + run);
} catch (error) {
  await writeFile(join(output, 'failure.json'), JSON.stringify({ run, error: error.message, actions, requests: harness.requests,
    bookings: await harness.db.booking.findMany(), payments: await harness.db.payment.findMany(), provider: harness.lifecycle.provider.snapshot() }, null, 2));
  if (browser) for (const [index, context] of contexts.entries()) for (const page of context.pages()) {
    await page.screenshot({ path: join(output, 'failure-' + index + '.png'), fullPage: true }).catch(() => {});
    await writeFile(join(output, 'failure-' + index + '-text.txt'), await page.locator('body').innerText()).catch(() => {});
  }
  throw error;
} finally {
  releaseBooking?.();
  for (const [index, context] of contexts.entries()) await saveSanitizedTrace(context, process.env.PHASE9_EMPTY_ENV_DIR, output, 'trace-' + index);
  await browser?.close(); await vite.close(); await harness.close(); places.restore();
}
