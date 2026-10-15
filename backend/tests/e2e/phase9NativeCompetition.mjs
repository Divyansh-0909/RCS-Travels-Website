import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createBrowserHarness } from '../helpers/phase9BrowserHarness.js';
import { createNativeSession } from './phase9NativeSession.mjs';
import { phase9UiSourceHashes } from '../helpers/phase9UiSources.js';
import { browserReceiptHash } from '../helpers/phase9BrowserReceipt.js';
import { V5_HASH } from '../helpers/phase9ReplayContract.js';
import { sealUiReproduction } from '../../../tools/phase9-cross/ui-reproduction.mjs';

const kind = process.env.PHASE9_RACE_KIND;
assert.ok(['competing', 'replacement'].includes(kind));
const run = kind + '-' + new Date().toISOString().replace(/\D/g, '') + '-' + randomUUID();
const output = join(process.env.PHASE9_UI_OUTPUT, run);
await mkdir(output, { recursive: true }); console.log('Native race scenario: ' + run);
const harness = await createBrowserHarness();
const { phase9FinancialSnapshot } = await import('../helpers/phase9Lifecycle.js');
let native, flow, sources, initial, release, entered;
const barrier = new Promise(done => { release = done; });
const arrival = new Promise(done => { entered = done; });
const actions = [], events = [];
const capture = () => phase9UiSourceHashes(['backend/tests/e2e/phase9NativeCompetition.mjs',
  'backend/tests/e2e/phase9NativeSession.mjs', 'backend/tests/helpers/phase9NativeGateway.js',
  'backend/tests/helpers/phase9UiSources.js', 'backend/tests/run-phase9-cross.js', 'tools/phase9-cross/ui-reproduction.mjs']);
try {
  sources = await capture();
  initial = { clock: harness.lifecycle.clock.now(), booking: await harness.lifecycle.booking(), financials: await phase9FinancialSnapshot(harness.db),
    actors: Object.fromEntries(Object.entries(harness.actors).map(([key, actor]) => [key, { id: actor.id, clerkId: actor.clerkId }])) };
  assert.equal((await harness.lifecycle.deliver()).status, 200);
  if (kind === 'competing') await harness.db.driver.update({ where: { id: harness.actors.replacement.id }, data: { group: 'rcs' } });
  const booking = await harness.lifecycle.booking();
  const dispatch = new Date(booking.scheduledAt.getTime() - 30 * 60000).toISOString();
  await harness.lifecycle.offer({ at: dispatch });
  if (kind === 'replacement') {
    await harness.lifecycle.accept(); await harness.lifecycle.cancel(await harness.lifecycle.booking());
    await harness.lifecycle.offer({ at: dispatch });
    assert.equal(await harness.db.walletEntry.count({ where: { bookingId: booking.id, type: 'deposit_hold' } }), 1);
    events.push({ actor: 'actual-service fixture', action: 'Original acceptance and cancellation retain original-owner reservation', booking: await harness.lifecycle.booking() });
  } else {
    assert.equal(await harness.db.rideOffer.count({ where: { bookingId: booking.id, status: 'pending' } }), 2);
    events.push({ actor: 'owned fixture', action: 'Two eligible RCS captains receive actual worker offers' });
  }
  native = await createNativeSession(harness, output, { restoreAwake: false,
    syntheticLocation: () => ({ schema: 'phase9-synthetic-location-v1', source: 'synthetic-delhi', unavailable: true,
      fix: { timestamp: Date.now(), coords: { latitude: 28.6129, longitude: 77.2295, accuracy: 8 } } }),
    async beforeRequest(request) {
      if (request.method !== 'PATCH' || !request.path.endsWith('/accept')) return;
      events.push({ actor: 'physical captain', action: 'Acceptance held before backend delivery', request }); entered();
      await Promise.race([barrier, new Promise((_, fail) => { const timer = setTimeout(() => fail(new Error('Race barrier expired')), 90000); timer.unref(); })]);
    } });
  await native.reopen(kind === 'replacement' ? 'replacement' : 'captain');
  await native.maestro('open-stale-offer', '- tapOn: "Notifications"\n- extendedWaitUntil:\n    visible: "Accept"\n    timeout: 90000\n');
  flow = native.maestro('stale-native-accept', '- tapOn: "Accept"\n- extendedWaitUntil:\n    visible: "No notifications"\n    timeout: 90000\n- assertNotVisible: "Accept"\n- takeScreenshot: rejected-stale-offer\n');
  flow.catch(() => {});
  await Promise.race([arrival, flow.then(() => { throw new Error('Flow ended before barrier'); })]);
  let response;
  if (kind === 'competing') {
    const offer = await harness.db.rideOffer.findFirstOrThrow({ where: { bookingId: booking.id, driverId: harness.actors.replacement.id, status: 'pending' } });
    response = await fetch(harness.apiUrl + '/api/driver/offers/' + offer.id + '/accept', { method: 'PATCH',
      headers: { authorization: 'Bearer ' + harness.auth.token(harness.actors.replacement) } });
    assert.equal(response.status, 200); assert.equal((await harness.lifecycle.booking()).driverId, harness.actors.replacement.id);
    assert.equal(await harness.db.walletEntry.count({ where: { bookingId: booking.id, type: 'deposit_hold' } }), 1);
  } else {
    response = await fetch(harness.apiUrl + '/api/bookings/cancel', { method: 'POST',
      headers: { authorization: 'Bearer ' + harness.auth.token(harness.actors.customer), 'content-type': 'application/json' },
      body: JSON.stringify({ bookingId: booking.id, expectedCancellationCharge: 0, cancellationReason: null }) });
    assert.equal(response.status, 200); assert.equal((await harness.lifecycle.booking()).status, 'cancelled');
    assert.equal(await harness.db.walletEntry.count({ where: { bookingId: booking.id, type: 'deposit_hold' } }), 1);
    assert.equal(await harness.db.walletEntry.count({ where: { bookingId: booking.id, type: 'deposit_refund', driverId: harness.actors.captain.id } }), 1);
  }
  events.push({ actor: 'labelled protected competing HTTP event', status: response.status, body: await response.json() });
  release(); await flow;
  const accepts = native.gateway.requests.filter(row => row.method === 'PATCH' && row.path.endsWith('/accept'));
  assert.equal(accepts.length, 1); assert.equal(accepts[0].status, 409);
  assert.equal(await harness.db.walletEntry.count({ where: { bookingId: booking.id, driverId: kind === 'replacement' ? harness.actors.replacement.id : harness.actors.captain.id } }), 0);
  actions.push({ actor: 'physical captain + protected competing actor', action: kind + ': stale native action rejects without loser reservation', status: 'PASS' });
  const financials = await phase9FinancialSnapshot(harness.db);
  for (const key of ['finality', 'liabilities', 'strikes', 'blocks', 'executions', 'payouts']) assert.equal(financials[key], 0);
  assert.deepEqual(await capture(), sources);
  const receipt = { schema: 'phase9c-native-competition-v1', run, kind, status: 'PASS', frozenV5: V5_HASH,
    sources, initial, actions, events, financials, booking: await harness.lifecycle.booking(),
    native: { build: native.build, stagedSources: native.stagedSources, requests: native.gateway.requests },
    boundary: 'One physical UI actor; the competing acceptance or terminal cancellation is protected HTTP. Races use a before-delivery request barrier, not exhaustive scheduler exploration.' };
  await writeFile(join(output, 'receipt.json'), JSON.stringify({ ...receipt, integrity: browserReceiptHash(receipt) }, null, 2));
  console.log('Native race PASS: ' + run);
} catch (error) {
  await writeFile(join(output, 'reproduction.json'), JSON.stringify(sealUiReproduction('native-' + kind, {
    initial, sources, actions, events, error: error.message, runtime: native && { build: native.build, stagedSources: native.stagedSources },
  }), null, 2));
  await writeFile(join(output, 'failure.json'), JSON.stringify({ run, kind, error: error.message, sources, initial, actions, events,
    booking: await harness.lifecycle.booking(), financials: await phase9FinancialSnapshot(harness.db), requests: native?.gateway.requests }, null, 2));
  throw error;
} finally { release(); await flow?.catch(() => {}); await native?.close(); await harness.close(); }
