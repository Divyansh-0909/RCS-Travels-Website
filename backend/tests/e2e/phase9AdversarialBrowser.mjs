import assert from 'node:assert/strict';
import { mkdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHmac, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
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
import { sealUiReproduction } from '../../../tools/phase9-cross/ui-reproduction.mjs';
import { phase9UiSourceHashes } from '../helpers/phase9UiSources.js';

const run = 'browser-' + new Date().toISOString().replace(/[^0-9]/g, '') + '-' + randomUUID();
const output = join(process.env.PHASE9_UI_OUTPUT, run);
const temporary = await mkdtemp(join(tmpdir(), 'rcs-phase9-customer-'));
await mkdir(output, { recursive: true });
console.log('Adversarial customer scenario: ' + run);
const places = installPhase9PlacesProvider(), harness = await createBrowserHarness({ formBooking: true });
const { phase9FinancialSnapshot } = await import('../helpers/phase9Lifecycle.js');
Object.assign(process.env, { VITE_API_BASE_URL: '/fixture-backend', VITE_CLERK_PUBLISHABLE_KEY: browserPublishableKey,
  PHASE9_BROWSER_API: harness.apiUrl });
const vite = await createServer({ root: fileURLToPath(new URL('../../../frontend/', import.meta.url)),
  configFile: fileURLToPath(new URL('../../../frontend/tests/e2e/vite.config.mjs', import.meta.url)) });
const actions = [], contexts = [], controlled = [];
let browser, sources, initial;
const capture = () => phase9UiSourceHashes(['backend/tests/e2e/phase9AdversarialBrowser.mjs',
  'backend/tests/e2e/phase9BrowserActor.mjs', 'backend/tests/helpers/phase9BrowserAuth.js',
  'backend/tests/helpers/phase9UiSources.js', 'backend/tests/run-phase9-cross.js', 'tools/phase9-cross/ui-reproduction.mjs']);
try {
  sources = await capture();
  const coupon = await harness.db.coupon.create({ data: { userId: harness.actors.customer.id, amount: 50, earnedFor: '2026-09' } });
  initial = { clock: harness.lifecycle.clock.now(), bookings: await harness.db.booking.findMany(),
    coupons: await harness.db.coupon.findMany(), provider: harness.lifecycle.provider.snapshot(), financials: await phase9FinancialSnapshot(harness.db) };
  await vite.listen(); browser = await chromium.launch();
  const url = 'http://127.0.0.1:' + vite.httpServer.address().port;
  const { page, context } = await createBrowserActor({ browser, url, actor: 'customer', contexts, viewport: { width: 390, height: 844 } });
  await page.goto(url + '/book');
  await page.locator('#pickup-location').fill('Synthetic Delhi pickup');
  await page.getByText('Synthetic Delhi pickup', { exact: true }).last().click();
  await page.locator('#drop-location').fill('Synthetic Delhi drop');
  await page.getByText('Synthetic Delhi drop', { exact: true }).last().click();
  await page.getByRole('button', { name: 'Later', exact: true }).click();
  await page.getByText('Ride now', { exact: true }).last().click();
  await page.getByRole('button', { name: 'Now', exact: true }).click();
  await page.getByText('Later', { exact: true }).last().click();
  await page.getByRole('button', { name: 'Set date & time', exact: true }).click();
  await page.getByRole('listbox').first().focus(); await page.getByRole('listbox').first().press('ArrowDown');
  await page.getByRole('button', { name: 'See prices', exact: true }).click();
  await expect(page.getByText('Sedan', { exact: true }).first()).toBeVisible();
  const vehicleUrl = page.url();
  const restoreVehicle = async () => {
    await page.goto(vehicleUrl); await page.reload();
    await expect(page.getByRole('heading', { name: 'Set date and time' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Book ride', exact: true })).toHaveCount(0);
    const day = page.getByRole('listbox').first(); await day.focus(); await day.press('ArrowDown');
    await page.getByRole('button', { name: 'See prices', exact: true }).click();
    await page.getByText('Sedan', { exact: true }).first().click();
  };
  const couponEstimate = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/api/fare/estimate') && response.request().method() === 'POST');
  await page.getByRole('button', { name: '₹50 coupon', exact: true }).click();
  const selectedQuote = await (await couponEstimate).json();
  const couponPayload = JSON.parse(Buffer.from(selectedQuote.quote.split('.')[0], 'base64url'));
  controlled.push({ id: 'coupon-selection', displayedCouponId: coupon.id, signedCoupon: couponPayload.coupon });
  assert.equal(couponPayload.coupon?.id, coupon.id, 'A selected coupon must price the quote actually shown to the customer');
  actions.push({ actor: 'mobile customer UI', action: 'Selected coupon is bound into the signed authoritative quote', status: 'PASS' });
  const variants = [
    { id: 'expired-session-confirmation', status: 401, auth: 'expired' },
    { id: 'ambiguous-invalid-session', status: 401, auth: 'invalid' },
    { id: 'client-fare-mismatch', status: 422, patch: body => ({ ...body, fare: 1 }) },
    { id: 'stale-route-address', status: 422, patch: body => ({ ...body, pickupAddress: 'Different synthetic Delhi pickup' }) },
    { id: 'stale-route-coordinate', status: 422, patch: body => ({ ...body, pickupLat: body.pickupLat + 0.01 }) },
    { id: 'changed-vehicle-price', status: 422, patch: body => ({ ...body, vehicleClass: 'hatchback' }) },
    { id: 'missing-location', status: 400, patch: body => ({ ...body, dropAddress: '' }) },
    { id: 'missing-coordinate', status: 400, patch: body => ({ ...body, dropLat: null }) },
    { id: 'invalid-scheduled-date', status: 400, patch: body => ({ ...body, scheduledAt: 'not-a-date' }) },
    { id: 'past-due-schedule', status: 422, patch: body => ({ ...body, scheduledAt: new Date(Date.now() - 60000).toISOString() }) },
    { id: 'beyond-approved-schedule', status: 422, patch: body => ({ ...body, scheduledAt: new Date(Date.now() + 8 * 86400000).toISOString() }) },
    { id: 'expired-signed-quote', status: 422, patch: body => {
      const payload = { ...JSON.parse(Buffer.from(body.fareQuote.split('.')[0], 'base64url')), exp: Date.now() - 1 };
      const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
      // This is the runner's explicit synthetic signing key, never a production key.
      return { ...body, fareQuote: encoded + '.' + createHmac('sha256', process.env.FARE_QUOTE_SECRET).update(encoded).digest('base64url') };
    } },
    { id: 'tampered-quote', status: 400, patch: body => ({ ...body, fareQuote: 'tampered.synthetic' }) },
  ];
  for (const variant of variants) {
    await restoreVehicle();
    await page.route('**/api/bookings', async route => {
      if (route.request().method() !== 'POST') return route.continue();
      const body = route.request().postDataJSON();
      const headers = { ...route.request().headers() };
      if (variant.auth) headers.authorization = 'Bearer ' + (variant.auth === 'expired'
        ? harness.auth.token(harness.actors.customer, { exp: Math.floor(Date.now() / 1000) - 120 }) : 'ambiguous-invalid-synthetic-token');
      const changed = variant.patch ? variant.patch(body) : body;
      controlled.push({ id: variant.id, at: new Date().toISOString(), original: body, submitted: changed,
        authorization: variant.auth ?? 'actual signed synthetic SDK session' });
      await route.continue({ headers, postData: JSON.stringify(changed) });
    });
    await page.getByRole('button', { name: 'Book ride', exact: true }).click();
    const pending = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/api/bookings') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Confirm pickup', exact: true }).click();
    const response = await pending;
    const body = await response.json();
    assert.equal(response.status(), variant.status, variant.id + ': ' + JSON.stringify(body));
    assert.equal(await harness.db.booking.count(), 0);
    assert.equal(await harness.db.payment.count(), 0);
    assert.equal(harness.lifecycle.provider.snapshot().orders.length, 0);
    actions.push({ actor: 'mobile customer UI + labelled request mutation', action: variant.id,
      status: 'PASS', httpStatus: response.status(), response: body });
    await page.unroute('**/api/bookings');
  }
  await restoreVehicle();
  const couponApplied = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/api/fare/estimate')
    && response.request().postDataJSON().couponId === coupon.id);
  await page.getByRole('button', { name: '₹50 coupon', exact: true }).click();
  await couponApplied;
  harness.lifecycle.provider.planNext('order', 'error', Object.assign(new Error('Synthetic definitive rejection'), {
    response: { status: 400, data: { error: { code: 'BAD_REQUEST_ERROR', description: 'Synthetic definitive rejection' } } },
  }));
  await page.getByRole('button', { name: 'Book ride', exact: true }).click();
  const creation = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/api/bookings') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Confirm pickup', exact: true }).click();
  assert.equal((await creation).status(), 200);
  await expect(page.getByRole('button', { name: 'Retry payment', exact: true })).toBeVisible();
  const booking = await harness.db.booking.findFirstOrThrow();
  assert.equal(booking.fare, 280); assert.equal(booking.couponAmount, 50);
  assert.equal(booking.scheduledAdvanceAmount, 2300);
  const paymentBefore = await harness.db.payment.findMany();
  await page.route('**/scheduled-advance/order', route => route.continue({ headers: {
    ...route.request().headers(), authorization: 'Bearer ' + harness.auth.token(harness.actors.customer,
      { exp: Math.floor(Date.now() / 1000) - 120 }),
  } }));
  const recovery = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/scheduled-advance/order'));
  await page.getByRole('button', { name: 'Retry payment', exact: true }).click();
  assert.equal((await recovery).status(), 401);
  assert.deepEqual(await harness.db.payment.findMany(), paymentBefore);
  assert.equal(harness.lifecycle.provider.snapshot().orders.length, 0);
  actions.push({ actor: 'customer browser + labelled expired token at protected handler', action: 'Authoritative coupon creates ₹230 customer funding; expiry during recovery cannot create a provider order or change payment state', status: 'PASS' });
  await page.unroute('**/scheduled-advance/order');
  // Real SDK restoration adopts the replacement customer identity, rather than
  // trusting an old tab's request body or cached customer information.
  await context.addCookies([{ name: 'fixture_actor', value: 'foreign', url, httpOnly: true }]);
  await page.reload();
  await expect.poll(() => page.evaluate(() => window.Clerk?.user?.id)).toBe(harness.actors.foreign.clerkId);
  const denied = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/api/bookings/' + booking.id + '/status'));
  await page.goto(url + '/booking/' + booking.id);
  assert.equal((await denied).status(), 403);
  await expect(page.getByRole('heading', { name: "Couldn't load your ride", exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry payment', exact: true })).toHaveCount(0);
  assert.equal((await harness.db.booking.findUniqueOrThrow({ where: { id: booking.id } })).userId, harness.actors.customer.id);
  actions.push({ actor: 'customer browser', action: 'Actual SDK user changes after fixture session replacement; browser-owned status request rejects foreign booking and exposes no recovery payment action', status: 'PASS' });
  const financials = await phase9FinancialSnapshot(harness.db);
  for (const field of ['finality', 'liabilities', 'strikes', 'blocks', 'executions', 'payouts']) assert.equal(financials[field], 0);
  await page.screenshot({ path: join(output, 'customer-adversarial-final.png'), fullPage: true });
  assert.deepEqual(await capture(), sources);
  const receipt = { schema: 'phase9c-adversarial-customer-v1', run, status: 'PASS', frozenV5: V5_HASH,
    sources, initial, actions, controlled, financials, requests: harness.requests, provider: harness.lifecycle.provider.snapshot(),
    boundary: 'Booking buttons are actual mobile browser actions; explicitly labelled request mutations exercise the real protected price/session handlers. Expiry/invalid signature and synthetic SDK identity replacement are local witnesses, not live Clerk revocation latency measurement.' };
  await writeFile(join(output, 'receipt.json'), JSON.stringify({ ...receipt, integrity: browserReceiptHash(receipt) }, null, 2));
  console.log('Adversarial customer safety PASS: ' + run);
} catch (error) {
  await writeFile(join(output, 'reproduction.json'), JSON.stringify(sealUiReproduction('customer-safety', {
    initial, sources, actions, controlled, error: error.message,
  }), null, 2));
  await writeFile(join(output, 'failure.json'), JSON.stringify({ run, error: error.message, sources, initial, actions, controlled,
    requests: harness.requests, financials: await phase9FinancialSnapshot(harness.db) }, null, 2));
  for (let i = 0; i < contexts.length; i++) for (const page of contexts[i].pages()) {
    await page.screenshot({ path: join(output, 'failure-' + i + '.png'), fullPage: true }).catch(() => {});
  }
  throw error;
} finally {
  try {
    for (let i = 0; i < contexts.length; i++) await saveSanitizedTrace(contexts[i], temporary, output, 'trace-' + i);
  } finally {
    await browser?.close(); await vite.close(); await harness.close(); places.restore();
    await rm(temporary, { recursive: true, force: true });
  }
}
