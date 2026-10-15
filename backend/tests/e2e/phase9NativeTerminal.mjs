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

const run = 'terminal-' + new Date().toISOString().replace(/\D/g, '') + '-' + randomUUID();
const output = join(process.env.PHASE9_UI_OUTPUT, run);
await mkdir(output, { recursive: true }); console.log('Native terminal race scenario: ' + run);
const harness = await createBrowserHarness();
const { phase9FinancialSnapshot } = await import('../helpers/phase9Lifecycle.js');
const capture = () => phase9UiSourceHashes(['backend/tests/e2e/phase9NativeTerminal.mjs',
  'backend/tests/e2e/phase9NativeSession.mjs', 'backend/tests/helpers/phase9NativeGateway.js',
  'backend/tests/helpers/phase9UiSources.js', 'backend/tests/run-phase9-cross.js', 'tools/phase9-cross/ui-reproduction.mjs']);
const wait = text => '- extendedWaitUntil:\n    visible: "' + text + '"\n    timeout: 90000\n';
let native, sources, initial, release, entered, flow;
const barrier = new Promise(done => { release = done; });
const arrival = new Promise(done => { entered = done; });
const actions = [], events = [];
try {
  sources = await capture(); initial = { booking: await harness.lifecycle.booking(), financials: await phase9FinancialSnapshot(harness.db) };
  await harness.db.user.update({ where: { id: harness.actors.customer.id }, data: { bookingCode: '4321' } });
  assert.equal((await harness.lifecycle.deliver()).status, 200);
  const booking = await harness.lifecycle.booking();
  await harness.lifecycle.offer({ at: new Date(booking.scheduledAt.getTime() - 30 * 60000).toISOString() });
  await harness.lifecycle.accept();
  native = await createNativeSession(harness, output, { restoreAwake: false,
    syntheticLocation: () => ({ schema: 'phase9-synthetic-location-v1', source: 'synthetic-delhi', unavailable: true,
      fix: { timestamp: Date.now(), coords: { latitude: 28.6129, longitude: 77.2295, accuracy: 8 } } }),
    async beforeRequest(request) {
      if (request.method !== 'PATCH' || !request.path.endsWith('/cancel')) return;
      events.push({ actor: 'physical captain', action: 'Cancellation request held before backend delivery', request }); entered();
      await Promise.race([barrier, new Promise((_, fail) => { const timer = setTimeout(() => fail(new Error('Terminal race barrier expired')), 90000); timer.unref(); })]);
    } });
  await native.reopen();
  await native.maestro('open-assigned-cancellation', wait('Ride details') + '- tapOn: "Ride details"\n'
    + '- scrollUntilVisible:\n    element: "Cancel ride"\n    direction: DOWN\n- tapOn: "Cancel ride"\n- tapOn: "Rider cannot be contacted"\n');
  flow = native.maestro('stale-cancellation-after-completion', '- tapOn: "Cancel ride"\n' + wait('Cannot cancel a completed ride')
    + '- assertNotVisible: "Cancel ride"\n- takeScreenshot: completed-cancellation-rejected\n');
  flow.catch(() => {});
  await Promise.race([arrival, flow.then(() => { throw new Error('Flow ended before cancellation barrier'); })]);
  for (const to of ['en_route', 'reached', 'started', 'completed']) {
    const where = { lat: to === 'completed' ? 28.6315 : 28.6129, lng: to === 'completed' ? 77.2167 : 77.2295,
      accuracy: 8, capturedAt: Date.now(), mocked: false };
    const response = await fetch(harness.apiUrl + '/api/driver/rides/' + booking.id + '/status', { method: 'PATCH',
      headers: { authorization: 'Bearer ' + harness.auth.token(harness.actors.captain), 'content-type': 'application/json' },
      body: JSON.stringify({ to, ...where, ...(to === 'started' ? { otp: '4321' } : {}) }) });
    const body = await response.json(); assert.equal(response.status, 200, JSON.stringify(body));
    events.push({ actor: 'labelled protected competing lifecycle action', to, status: response.status, body });
  }
  assert.equal((await harness.lifecycle.booking()).status, 'completed'); release(); await flow;
  const cancellations = native.gateway.requests.filter(row => row.method === 'PATCH' && row.path.endsWith('/cancel'));
  assert.equal(cancellations.length, 1); assert.equal(cancellations[0].status, 409);
  assert.equal(await harness.db.driverCancellation.count(), 0); assert.equal(await harness.db.responsibilityCase.count(), 0);
  assert.equal(await harness.db.walletEntry.count({ where: { bookingId: booking.id, type: 'deposit_refund', driverId: harness.actors.captain.id } }), 1);
  const financials = await phase9FinancialSnapshot(harness.db);
  for (const key of ['finality', 'liabilities', 'strikes', 'blocks', 'executions', 'payouts']) assert.equal(financials[key], 0);
  actions.push({ actor: 'physical cancellation + protected competing completion', action: 'Completion wins; stale cancellation rejected and terminal UI cannot cancel again', status: 'PASS' });
  assert.deepEqual(await capture(), sources);
  const receipt = { schema: 'phase9c-native-terminal-v1', run, status: 'PASS', frozenV5: V5_HASH, sources, initial,
    actions, events, financials, booking: await harness.lifecycle.booking(),
    native: { build: native.build, stagedSources: native.stagedSources, requests: native.gateway.requests },
    boundary: 'Native cancellation is real; competing legal ride progression/completion uses protected HTTP with synthetic observations/OTP. No hardware GPS or exhaustive scheduler claim.' };
  await writeFile(join(output, 'receipt.json'), JSON.stringify({ ...receipt, integrity: browserReceiptHash(receipt) }, null, 2)); console.log('Native terminal race PASS: ' + run);
} catch (error) {
  await writeFile(join(output, 'reproduction.json'), JSON.stringify(sealUiReproduction('native-terminal', {
    initial, sources, actions, events, error: error.message, runtime: native && { build: native.build, stagedSources: native.stagedSources },
  }), null, 2));
  await writeFile(join(output, 'failure.json'), JSON.stringify({ run, error: error.message, sources, initial, actions, events,
    booking: await harness.lifecycle.booking(), financials: await phase9FinancialSnapshot(harness.db), requests: native?.gateway.requests }, null, 2)); throw error;
} finally { release(); await flow?.catch(() => {}); await native?.close(); await harness.close(); }
