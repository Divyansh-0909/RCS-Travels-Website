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
import { installPhase9PlacesProvider } from '../helpers/phase9PlacesProvider.js';

const run = 'permissions-' + new Date().toISOString().replace(/\D/g, '') + '-' + randomUUID();
const output = join(process.env.PHASE9_UI_OUTPUT, run);
await mkdir(output, { recursive: true }); console.log('Native permission scenario: ' + run);
const places = installPhase9PlacesProvider(), harness = await createBrowserHarness();
const { phase9FinancialSnapshot } = await import('../helpers/phase9Lifecycle.js');
const pkg = 'com.rcstravels.driver.phase9';
let native, sources, original, mode = 'unavailable';
const actions = [], events = [];
const tap = text => '- tapOn: "' + text + '"\n';
const wait = text => '- extendedWaitUntil:\n    visible: "' + text + '"\n    timeout: 90000\n';
const slide = '- swipe:\n    start: "15%,93%"\n    end: "86%,93%"\n    duration: 600\n';
const permissions = async () => {
  const text = await native.device.adb('shell', 'dumpsys', 'package', pkg);
  const user = text.match(/User 0:([\s\S]*?)(?=\n\s*User \d+:|$)/)?.[1];
  assert.ok(user);
  return Object.fromEntries(['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'ACCESS_BACKGROUND_LOCATION'].map(key => {
    const value = user.match(new RegExp('android\\.permission\\.' + key + ': granted=(true|false)'));
    assert.ok(value); return [key, value[1] === 'true'];
  }));
};
const capture = () => phase9UiSourceHashes(['backend/tests/e2e/phase9NativePermissions.mjs',
  'backend/tests/e2e/phase9NativeSession.mjs', 'backend/tests/helpers/phase9UiSources.js', 'backend/tests/run-phase9-cross.js', 'tools/phase9-cross/ui-reproduction.mjs']);
try {
  sources = await capture();
  await harness.db.driver.update({ where: { id: harness.actors.captain.id }, data: { isOnline: false } });
  native = await createNativeSession(harness, output, { restoreAwake: false,
    syntheticLocation: () => ({ schema: 'phase9-synthetic-location-v1', source: 'synthetic-delhi', unavailable: mode === 'unavailable',
      fix: { timestamp: Date.now() - (mode === 'stale' ? 60000 : 0), mocked: false,
        coords: { latitude: 28.6129, longitude: 77.2295, accuracy: mode === 'poor' ? 201 : 8 } } }),
    async beforeRequest(request) {
      if (!request.path.endsWith('/status') || request.method !== 'PATCH') return;
      if ((await harness.lifecycle.booking()).status !== 'en_route') return;
      const booking = await harness.lifecycle.booking();
      const response = await fetch(harness.apiUrl + '/api/driver/rides/' + booking.id + '/status', { method: 'PATCH',
        headers: { authorization: 'Bearer ' + harness.auth.token(harness.actors.captain), 'content-type': 'application/json' },
        body: JSON.stringify({ to: 'reached', lat: 28.6129, lng: 77.2295, accuracy: 8, capturedAt: Date.now() - 60000, mocked: false }) });
      const body = await response.json();
      events.push({ actor: 'labelled protected stale location action preceding native arrival delivery', status: response.status, body });
      assert.equal(response.status, 422); assert.equal(body.code, 'LOCATION_REQUIRED');
      assert.equal((await harness.lifecycle.booking()).status, 'en_route');
    } });
  original = await permissions(); assert.equal(original.ACCESS_FINE_LOCATION, false);
  await native.maestro('grant-real-foreground', '- tapOn:\n    text: "Not now"\n    optional: true\n- tapOn:\n    text: "Not now"\n    optional: true\n'
    + wait('Go online') + tap('Go online') + wait('Share your location') + tap('Continue')
    + '- tapOn:\n    text: "Precise"\n    optional: true\n' + wait('While using the app') + tap('While using the app')
    + '- tapOn:\n    text: "Not now"\n    optional: true\n');
  assert.equal((await permissions()).ACCESS_FINE_LOCATION, true);
  actions.push({ action: 'Actual Android foreground grant; all position APIs synthetic and background denied', status: 'PASS' });
  await harness.db.driver.update({ where: { id: harness.actors.captain.id }, data: { isOnline: true } });
  assert.equal((await harness.lifecycle.deliver()).status, 200);
  const booking = await harness.lifecycle.booking();
  await harness.lifecycle.offer({ at: new Date(booking.scheduledAt.getTime() - 30 * 60000).toISOString() });
  await native.reopen();
  await native.maestro('accept-and-depart', tap('Notifications') + wait('Accept') + tap('Accept') + wait('Contact the rider')
    + tap('Close') + '- back\n' + wait('Slide to go to pickup') + slide + wait('Finding your location.*'));
  assert.equal((await harness.lifecycle.booking()).status, 'en_route');
  for (const key of ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION']) await native.device.adb('shell', 'pm', 'revoke', '--user', '0', pkg, 'android.permission.' + key);
  await native.reopen();
  await native.maestro('revoked-after-restart', wait('Enable location to continue') + '- assertNotVisible: "Slide when you arrive"\n- takeScreenshot: revoked-location\n');
  assert.equal((await permissions()).ACCESS_FINE_LOCATION, false); assert.equal((await harness.lifecycle.booking()).status, 'en_route');
  actions.push({ action: 'Owned-package foreground revoke and process restart disable arrival without misconduct or monetary action', status: 'PASS' });
  for (const key of ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION']) await native.device.adb('shell', 'pm', 'grant', '--user', '0', pkg, 'android.permission.' + key);
  mode = 'stale'; await native.reopen();
  await native.maestro('stale-reconnect', wait('Updating your location.*'));
  const pid = await native.device.adb('shell', 'pidof', pkg);
  await native.device.adb('shell', 'input', 'keyevent', 'KEYCODE_HOME'); mode = 'poor';
  await native.device.adb('shell', 'am', 'start', '--user', '0', '-n', pkg + '/com.rcstravels.driver.MainActivity');
  await native.maestro('foreground-poor-fix', wait('Finding your location.*') + '- assertNotVisible: "Slide when you arrive"\n');
  assert.equal((await native.device.adb('shell', 'pidof', pkg)).trim(), pid.trim());
  actions.push({ action: 'Explicit owned-package regrant; stale restart and same-process background/foreground with poor synthetic fixes keep arrival disabled', status: 'PASS' });
  mode = 'pickup';
  await native.maestro('valid-arrival-racing-stale-action', wait('Slide when you arrive') + slide + wait('Enter OTP') + '- takeScreenshot: valid-observed-arrival\n');
  assert.equal((await harness.lifecycle.booking()).status, 'reached'); assert.equal(events.length, 1);
  const financials = await phase9FinancialSnapshot(harness.db);
  assert.equal(await harness.db.responsibilityCase.count(), 0);
  for (const field of ['finality', 'liabilities', 'strikes', 'blocks', 'executions', 'payouts']) assert.equal(financials[field], 0);
  assert.equal(await harness.db.walletEntry.count({ where: { bookingId: booking.id, type: 'deposit_hold' } }), 1);
  actions.push({ action: 'Protected stale fix is rejected before valid physical swipe arrival; original hold retained and no Responsibility authority', status: 'PASS' });
  assert.deepEqual(await capture(), sources);
  const receipt = { schema: 'phase9c-native-permission-v1', run, status: 'PASS', frozenV5: V5_HASH, sources, actions, events,
    financials, originalPermissions: original, observations: native.deviceProvider.observations,
    native: { build: native.build, stagedSources: native.stagedSources, requests: native.gateway.requests },
    boundary: 'Real Android grant/revoke/restart and same-process foreground transition; position values synthetic only. Regrant uses owned-package ADB fixture. No hardware GPS, background location service or external navigation claim.' };
  await writeFile(join(output, 'receipt.json'), JSON.stringify({ ...receipt, integrity: browserReceiptHash(receipt) }, null, 2));
  console.log('Native permission transitions PASS: ' + run);
} catch (error) {
  await writeFile(join(output, 'reproduction.json'), JSON.stringify(sealUiReproduction('native-permissions', {
    sources, actions, events, error: error.message, runtime: native && { build: native.build, stagedSources: native.stagedSources },
  }), null, 2));
  await writeFile(join(output, 'failure.json'), JSON.stringify({ run, error: error.message, sources, actions, events,
    booking: await harness.lifecycle.booking(), requests: native?.gateway.requests, observations: native?.deviceProvider.observations }, null, 2)); throw error;
} finally {
  if (native && original) for (const [key, granted] of Object.entries(original)) {
    if (!granted && (await permissions())[key]) await native.device.adb('shell', 'pm', 'revoke', '--user', '0', pkg, 'android.permission.' + key);
  }
  if (native && original) { assert.deepEqual(await permissions(), original); await writeFile(join(output, 'permission-restoration.json'), JSON.stringify({ package: pkg, restored: original }, null, 2)); }
  await native?.close(); await harness.close(); places.restore();
}
