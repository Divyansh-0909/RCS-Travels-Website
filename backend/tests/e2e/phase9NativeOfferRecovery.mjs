import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createBrowserHarness } from '../helpers/phase9BrowserHarness.js';
import { createNativeSession } from './phase9NativeSession.mjs';
import { phase9UiSourceHashes } from '../helpers/phase9UiSources.js';
import { browserReceiptHash } from '../helpers/phase9BrowserReceipt.js';
import { V5_HASH } from '../helpers/phase9ReplayContract.js';
import { sealUiReproduction } from '../../../tools/phase9-cross/ui-reproduction.mjs';

const run = 'recovery-' + new Date().toISOString().replace(/\D/g, '') + '-' + randomUUID();
const output = join(process.env.PHASE9_UI_OUTPUT, run);
await mkdir(output, { recursive: true }); console.log('Native offer recovery scenario: ' + run);
const harness = await createBrowserHarness();
const { phase9FinancialSnapshot } = await import('../helpers/phase9Lifecycle.js');
const capture = () => phase9UiSourceHashes(['backend/tests/e2e/phase9NativeOfferRecovery.mjs',
  'backend/tests/e2e/phase9NativeSession.mjs', 'backend/tests/helpers/phase9NativeGateway.js',
  'backend/tests/helpers/phase9UiSources.js', 'backend/tests/run-phase9-cross.js', 'tools/phase9-cross/ui-reproduction.mjs']);
const wait = text => '- extendedWaitUntil:\n    visible: "' + text + '"\n    timeout: 90000\n';
const tap = text => '- tapOn: "' + text + '"\n';
let native, sources, initial, flow;
const actions = [], events = [];
try {
  sources = await capture(); initial = { clock: harness.lifecycle.clock.now(), booking: await harness.lifecycle.booking(), financials: await phase9FinancialSnapshot(harness.db) };
  native = await createNativeSession(harness, output, { restoreAwake: false, acceptanceFault: 'after',
    syntheticLocation: () => ({ schema: 'phase9-synthetic-location-v1', source: 'synthetic-delhi', unavailable: true,
      fix: { timestamp: Date.now(), coords: { latitude: 28.6129, longitude: 77.2295, accuracy: 8 } } }) });
  await native.reopen();
  assert.equal((await harness.lifecycle.deliver()).status, 200);
  const booking = await harness.lifecycle.booking();
  flow = native.maestro('swipe-new-floating-offer', wait('Swipe away to hide, it stays in Notifications')
    + '- swipe:\n    from:\n      text: "Synthetic Delhi pickup"\n    direction: LEFT\n    duration: 400\n    waitToSettleTimeoutMs: 500\n'
    + '- extendedWaitUntil:\n    notVisible: "Swipe away to hide, it stays in Notifications"\n    timeout: 10000\n'
    + '- takeScreenshot: floating-offer-swiped\n' + tap('Notifications') + wait('Accept'));
  flow.catch(() => {});
  await native.untilState(async () => (await readFile(join(output, 'swipe-new-floating-offer.log'), 'utf8').catch(() => '')).includes('> Flow'), 'Maestro waiting before offer creation');
  await harness.lifecycle.offer({ at: new Date(booking.scheduledAt.getTime() - 30 * 60000).toISOString() });
  const offer = await harness.db.rideOffer.findFirstOrThrow({ where: { bookingId: booking.id, driverId: harness.actors.captain.id } });
  await flow;
  assert.equal((await harness.db.rideOffer.findUniqueOrThrow({ where: { id: offer.id } })).status, 'pending');
  assert.equal(await harness.db.walletEntry.count({ where: { bookingId: booking.id } }), 0);
  actions.push({ action: 'Physical swipe hides the floating panel; persistent Notifications retains the unanswered worker offer', status: 'PASS' });
  await native.device.adb('shell', 'input', 'keyevent', 'KEYCODE_HOME');
  const untilExpired = offer.createdAt.getTime() + 30001 - Date.now();
  if (untilExpired > 0) await new Promise(done => setTimeout(done, untilExpired));
  await native.device.adb('shell', 'am', 'start', '--user', '0', '-n', 'com.rcstravels.driver.phase9/com.rcstravels.driver.MainActivity');
  await native.maestro('reopened-expired-panel', '- assertNotVisible: "Swipe away to hide, it stays in Notifications"\n' + wait('Accept'));
  events.push({ actor: 'owned physical app background/foreground', observedAt: new Date().toISOString(), offerCreatedAt: offer.createdAt,
    boundary: 'The existing 30-second floating panel expires; the unanswered database offer does not expire.' });
  await harness.db.driver.update({ where: { id: harness.actors.captain.id }, data: { isOnline: false } });
  await native.reopen();
  await native.maestro('offline-offer-reconciliation', tap('Notifications') + wait('Go online to accept any of these.')
    + '- tapOn:\n    text: "Go online"\n    below: "Synthetic Delhi drop"\n'
    + wait('Go online to accept this ride') + '- takeScreenshot: offline-offer-denied\n');
  assert.equal(await harness.db.walletEntry.count({ where: { bookingId: booking.id } }), 0);
  assert.equal((await harness.lifecycle.booking()).driverId, null);
  assert.ok(native.gateway.requests.some(row => row.path.endsWith('/accept') && row.status === 409));
  actions.push({ action: 'Actual offline UI preserves the record but rejects new assignment without a reservation', status: 'PASS' });
  await harness.db.driver.update({ where: { id: harness.actors.captain.id }, data: { isOnline: true } });
  // A real later sweep retains a pending RCS offer instead of escalating around it.
  await harness.lifecycle.offer({ at: new Date(booking.scheduledAt.getTime() - 10 * 60000).toISOString() });
  assert.equal(await harness.db.rideOffer.count({ where: { bookingId: booking.id, driverId: harness.actors.replacement.id } }), 0);
  await native.reopen();
  await native.maestro('online-accept-lost-acknowledgement', tap('Notifications') + wait('Accept') + tap('Accept'));
  await native.untilState(() => native.gateway.faults.length === 1, 'Committed acceptance with lost acknowledgement');
  assert.equal((await harness.lifecycle.booking()).driverId, harness.actors.captain.id);
  assert.equal(native.gateway.faults.length, 1);
  await native.reopen();
  await native.maestro('restart-after-committed-lost-ack', wait('Ride details') + '- takeScreenshot: restarted-authoritative-assignment\n');
  assert.equal(await harness.db.walletEntry.count({ where: { bookingId: booking.id, type: 'deposit_hold', driverId: harness.actors.captain.id } }), 1);
  const financials = await phase9FinancialSnapshot(harness.db);
  for (const key of ['finality', 'liabilities', 'strikes', 'blocks', 'executions', 'payouts']) assert.equal(financials[key], 0);
  actions.push({ action: 'Later priority sweep preserves pending RCS grant; protected acceptance commits with lost response and process restart reconciles one owner/hold', status: 'PASS' });
  assert.deepEqual(await capture(), sources);
  const receipt = { schema: 'phase9c-native-offer-recovery-v1', run, status: 'PASS', sources, initial, actions, events, financials, frozenV5: V5_HASH,
    native: { build: native.build, stagedSources: native.stagedSources, requests: native.gateway.requests, faults: native.gateway.faults },
    boundary: 'Physical gesture/background/restart/actions; controlled offline intent and worker times are explicit fixtures. Popup lifetime does not expire authoritative offers. No owner GPS or actual background location collection.' };
  await writeFile(join(output, 'receipt.json'), JSON.stringify({ ...receipt, integrity: browserReceiptHash(receipt) }, null, 2)); console.log('Native offer recovery PASS: ' + run);
} catch (error) {
  await writeFile(join(output, 'reproduction.json'), JSON.stringify(sealUiReproduction('native-recovery', {
    initial, sources, actions, events, error: error.message, runtime: native && { build: native.build, stagedSources: native.stagedSources },
  }), null, 2));
  await writeFile(join(output, 'failure.json'), JSON.stringify({ run, error: error.message, sources, initial, actions, events,
    booking: await harness.lifecycle.booking(), financials: await phase9FinancialSnapshot(harness.db), requests: native?.gateway.requests }, null, 2)); throw error;
} finally { await flow?.catch(() => {}); await native?.close(); await harness.close(); }
