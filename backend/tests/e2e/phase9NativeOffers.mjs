import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createBrowserHarness } from '../helpers/phase9BrowserHarness.js';
import { installPhase9PlacesProvider } from '../helpers/phase9PlacesProvider.js';
import { sourceIdentities } from '../helpers/phase9BrowserArtifacts.js';
import { browserReceiptHash } from '../helpers/phase9BrowserReceipt.js';
import { replaySourceHashes, V5_HASH } from '../helpers/phase9ReplayContract.js';
import { createNativeSession } from './phase9NativeSession.mjs';

const run = 'offers-' + new Date().toISOString().replace(/[^0-9]/g, '') + '-' + randomUUID();
const output = join(process.env.PHASE9_UI_OUTPUT, run);
await mkdir(output, { recursive: true });
console.log('Native offer scenario: ' + run);
const places = installPhase9PlacesProvider(), harness = await createBrowserHarness();
const { phase9FinancialSnapshot } = await import('../helpers/phase9Lifecycle.js');
let native;
const actions = [], external = [];
const wait = text => '- extendedWaitUntil:\n    visible: "' + text + '"\n    timeout: 90000\n';
const tap = text => '- tapOn: "' + text + '"\n';
const captureSources = async () => ({ ...await replaySourceHashes(), ...await sourceIdentities([
  'backend/tests/e2e/phase9NativeOffers.mjs', 'backend/tests/e2e/phase9NativeSession.mjs',
  'backend/tests/helpers/phase9NativeGateway.js', 'backend/tests/helpers/phase9DeviceProvider.js',
  'backend/tests/helpers/phase9BrowserHarness.js', 'tools/phase9-native/synthetic-location-stage.mjs',
  'tools/phase9-native/synthetic-location-core.mjs', 'tools/phase9-native/navigation-fixture.mjs']) });
const call = async (actor, path, options = {}) => {
  const response = await fetch(harness.apiUrl + path, { ...options, signal: AbortSignal.timeout(10000),
    headers: { authorization: 'Bearer ' + harness.auth.token(harness.actors[actor]), 'content-type': 'application/json' } });
  const body = await response.json(); external.push({ actor, path, method: options.method ?? 'GET', status: response.status, body });
  return { status: response.status, body };
};
try {
  assert.equal((await import('../../db/prisma.js')).prisma, harness.db,
    'Production route modules must bind the owned fixture database before native startup');
  const sources = await captureSources();
  const initial = { booking: await harness.lifecycle.booking(), wallets: await harness.db.walletEntry.findMany() };
  assert.equal((await harness.lifecycle.deliver()).status, 200);
  native = await createNativeSession(harness, output, { restoreAwake: process.env.PHASE9_KEEP_AWAKE !== '1',
    syntheticLocation: () => ({ schema: 'phase9-synthetic-location-v1', source: 'synthetic-delhi', unavailable: true,
      fix: { timestamp: Date.now(), coords: { latitude: 28.6129, longitude: 77.2295, accuracy: 8 } } }) });
  const booking = await harness.lifecycle.booking(), dispatchAt = new Date(booking.scheduledAt.getTime() - 30 * 60 * 1000).toISOString();
  await harness.lifecycle.offer({ at: dispatchAt });
  const original = await harness.db.rideOffer.findFirstOrThrow({ where: { bookingId: booking.id, driverId: harness.actors.captain.id, status: 'pending' } });
  assert.equal(await harness.db.rideOffer.count({ where: { bookingId: booking.id, driverId: harness.actors.replacement.id, status: 'pending' } }), 0);
  await native.reopen();
  await native.maestro('native-offer-reject', tap('Notifications') + wait('Reject') + tap('Reject')
    + wait('No notifications') + '- takeScreenshot: native-rejected-offer\n');
  assert.equal((await harness.db.rideOffer.findUniqueOrThrow({ where: { id: original.id } })).status, 'rejected');
  assert.equal((await harness.lifecycle.booking()).driverId, null);
  assert.equal(await harness.db.walletEntry.count({ where: { bookingId: booking.id } }), 0);
  actions.push({ actor: 'physical original captain', action: 'Persistent Notifications rejects the actual RCS offer without assignment or reservation', status: 'PASS' });
  const duplicate = await call('captain', '/api/driver/offers/' + original.id + '/reject', { method: 'PATCH' });
  assert.equal(duplicate.status, 409);
  await harness.lifecycle.offer({ at: dispatchAt });
  assert.equal(await harness.db.rideOffer.count({ where: { bookingId: booking.id, driverId: harness.actors.captain.id, status: 'pending' } }), 0);
  const partner = await harness.db.rideOffer.findFirstOrThrow({ where: { bookingId: booking.id, driverId: harness.actors.replacement.id, status: 'pending' } });
  actions.push({ actor: 'actual worker + protected synthetic HTTP actor', action: 'Rejected RCS offer cannot be answered again or reoffered; existing priority policy opens the partner group', status: 'PASS' });
  await native.reopen('replacement');
  await native.maestro('native-partner-after-rejection', tap('Notifications') + wait('Accept') + tap('Accept')
    + wait('Contact the rider') + '- takeScreenshot: native-partner-after-rejection\n');
  assert.equal((await harness.lifecycle.booking()).driverId, harness.actors.replacement.id);
  assert.equal((await harness.db.rideOffer.findUniqueOrThrow({ where: { id: partner.id } })).status, 'accepted');
  const holds = await harness.db.walletEntry.findMany({ where: { bookingId: booking.id, type: 'deposit_hold' } });
  assert.equal(holds.length, 1); assert.equal(holds[0].driverId, harness.actors.replacement.id); assert.equal(holds[0].amount, -100);
  actions.push({ actor: 'physical partner captain in a separate signed session', action: 'Native acceptance after legitimate priority escalation reserves only the accepting owner funds', status: 'PASS' });
  const foreign = await call('captain', '/api/driver/rides/' + booking.id);
  assert.ok([403, 404].includes(foreign.status));
  const cancelled = await call('customer', '/api/bookings/cancel', { method: 'POST', body: JSON.stringify({ bookingId: booking.id, expectedCancellationCharge: 0 }) });
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.body.advanceDisposition, 'refund_pending');
  const refunds = harness.lifecycle.provider.snapshot().refunds;
  assert.equal(refunds.length, 1); assert.equal(refunds[0].amount, 10000);
  harness.lifecycle.provider.setRefundState(refunds[0].id, 'processed');
  const refundEvent = harness.lifecycle.provider.queueRefundEvent('refund.processed', refunds[0].id);
  assert.equal((await harness.lifecycle.deliverEvent(refundEvent)).status, 200);
  assert.equal((await harness.lifecycle.deliverEvent(refundEvent)).status, 200);
  assert.equal((await call('customer', '/api/bookings/cancel', { method: 'POST', body: JSON.stringify({ bookingId: booking.id, expectedCancellationCharge: 0 }) })).status, 200);
  assert.equal(harness.lifecycle.provider.snapshot().refunds.length, 1);
  const finalBooking = await harness.lifecycle.booking(), financials = await phase9FinancialSnapshot(harness.db);
  assert.equal(finalBooking.status, 'cancelled'); assert.equal(finalBooking.scheduledAdvanceDisposition, 'refunded');
  const returns = financials.wallets.filter(row => row.bookingId === booking.id && row.type === 'deposit_refund');
  assert.equal(returns.length, 1); assert.equal(returns[0].driverId, holds[0].driverId); assert.equal(returns[0].amount, 100);
  for (const driver of financials.drivers) assert.equal(driver.walletBalance, 1000);
  for (const field of ['liabilities', 'compensation', 'finality', 'strikes', 'blocks', 'appeals', 'executions', 'payouts']) assert.equal(financials[field], 0);
  actions.push({ actor: 'protected synthetic HTTP customer + database assertions', action: 'Foreign captain cannot inspect assignment; terminal cancellation refunds advance and returns only the accepting owner hold', status: 'PASS' });
  assert.deepEqual(await captureSources(), sources);
  const receipt = { schema: 'phase9-native-offers-v1', run, status: 'PASS', frozenV5: V5_HASH, sources, initial, actions, external,
    native: { build: native.build, stagedSources: native.stagedSources, requests: native.gateway.requests },
    booking: finalBooking, financials, provider: harness.lifecycle.provider.snapshot(),
    boundary: 'Original rejection and partner acceptance use the physical app in separate signed sessions. Duplicate rejection, foreign access and customer termination use protected synthetic HTTP setup; they are not additional native journeys. All GPS values are synthetic/unavailable.' };
  await writeFile(join(output, 'receipt.json'), JSON.stringify({ ...receipt, integrity: browserReceiptHash(receipt) }, null, 2));
  console.log('Native offer rejection and escalation PASS: ' + run);
} catch (error) {
  await writeFile(join(output, 'failure.json'), JSON.stringify({ run, error: error.message, actions, external,
    booking: await harness.lifecycle.booking(), wallets: await harness.db.walletEntry.findMany(), requests: native?.gateway.requests }, null, 2));
  throw error;
} finally {
  await native?.close(); await harness.close(); places.restore();
}
