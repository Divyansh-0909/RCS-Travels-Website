import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { chromium } from '../../../frontend/node_modules/playwright/index.mjs';
import { createServer } from '../../../frontend/node_modules/vite/dist/node/index.js';
import { expect } from '../../../frontend/node_modules/@playwright/test/index.mjs';
import { createBrowserHarness } from '../helpers/phase9BrowserHarness.js';
import { createNativeSession } from './phase9NativeSession.mjs';
import { createBrowserActor } from './phase9BrowserActor.mjs';
import { browserPublishableKey } from '../helpers/phase9BrowserAuth.js';
import { browserApplicationSources, sourceIdentities, saveSanitizedTrace } from '../helpers/phase9BrowserArtifacts.js';
import { replaySourceHashes, V5_HASH } from '../helpers/phase9ReplayContract.js';
import { browserReceiptHash } from '../helpers/phase9BrowserReceipt.js';
import { installPhase9PlacesProvider } from '../helpers/phase9PlacesProvider.js';

const run = 'device-' + new Date().toISOString().replace(/[^0-9]/g, '') + '-' + randomUUID();
const output = join(process.env.PHASE9_UI_OUTPUT, run);
await mkdir(output, { recursive: true });
console.log('Native device scenario: ' + run);
const places = installPhase9PlacesProvider();
const harness = await createBrowserHarness();
await harness.db.user.update({ where: { id: harness.actors.customer.id }, data: { bookingCode: '4321' } });
await harness.db.driver.update({ where: { id: harness.actors.captain.id }, data: { isOnline: false } });
let mode = 'unavailable';
const location = () => ({ schema: 'phase9-synthetic-location-v1', source: 'synthetic-delhi', unavailable: mode === 'unavailable',
  fix: { timestamp: Date.now() - (mode === 'stale' ? 60000 : 0), mocked: false,
    coords: { latitude: mode === 'drop' ? 28.6315 : 28.6129, longitude: mode === 'drop' ? 77.2167 : 77.2295,
      accuracy: mode === 'poor' ? 201 : 8 } } });
const actions = [], contexts = [];
let native, browser, vite, originalPermissions;
const wait = text => '- extendedWaitUntil:\n    visible: "' + text + '"\n    timeout: 90000\n';
const tap = text => '- tapOn: "' + text + '"\n';
const slide = '- swipe:\n    start: "15%,93%"\n    end: "86%,93%"\n    duration: 600\n';
const permissions = async () => {
  const data = await native.device.adb('shell', 'dumpsys', 'package', 'com.rcstravels.driver.phase9');
  const user = data.match(/User 0:([\s\S]*?)(?=\n\s*User \d+:|$)/)?.[1];
  if (!user) throw new Error('Owned Android user permission state missing');
  return Object.fromEntries(['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'ACCESS_BACKGROUND_LOCATION'].map(name => {
    const result = user.match(new RegExp('android\\.permission\\.' + name + ': granted=(true|false)'));
    if (!result) throw new Error('Owned Android permission state missing: ' + name);
    return [name, result[1] === 'true'];
  }));
};
const captureSources = async () => ({ ...await replaySourceHashes(), ...await browserApplicationSources(),
  ...await sourceIdentities(['backend/tests/e2e/phase9NativeDevice.mjs', 'backend/tests/e2e/phase9NativeSession.mjs',
    'backend/tests/helpers/phase9DeviceProvider.js', 'backend/tests/helpers/phase9PlacesProvider.js',
    'tools/phase9-native/maestro-startup.mjs', 'driver-app/src/lib/activeRideAddress.ts', 'driver-app/src/pages/ActiveRide.tsx',
    'tools/phase9-native/synthetic-location-core.mjs',
    'tools/phase9-native/synthetic-location-stage.mjs', 'tools/phase9-native/navigation-fixture.mjs']) });
const checkpoint = async action => {
  actions.push({ actor: 'physical native captain', action, status: 'PASS', gpsMode: mode });
  await writeFile(join(output, 'progress.json'), JSON.stringify({ run, actions,
    booking: await harness.lifecycle.booking(), requests: native.gateway.requests,
    observations: native.deviceProvider.observations }, null, 2));
};
try {
  const sources = await captureSources();
  native = await createNativeSession(harness, output, { syntheticLocation: location,
    restoreAwake: process.env.PHASE9_KEEP_AWAKE !== '1' });
  originalPermissions = await permissions();
  assert.equal(originalPermissions.ACCESS_FINE_LOCATION, false);
  await native.maestro('dismiss-owned-notification-disclosure', '- tapOn:\n    text: "Not now"\n    optional: true\n- tapOn:\n    text: "Not now"\n    optional: true\n' + wait('Go online'));
  const sdkPreferences = await native.device.adb('shell', 'run-as', 'com.rcstravels.driver.phase9',
    'cat', 'shared_prefs/expo.modules.devmenu.sharedpreferences.xml');
  const toolsButtonWasVisible = sdkPreferences.match(/name="showFab" value="(true|false)"/)?.[1] !== 'false';
  if (toolsButtonWasVisible) {
    await native.device.adb('shell', 'input', 'keyevent', '82');
    await native.maestro('disable-owned-sdk-tools-button', wait('Open React Native dev menu')
      + '- scrollUntilVisible:\n    element: "Tools button"\n    direction: DOWN\n'
      + tap('Tools button') + '- back\n');
    const changed = await native.device.adb('shell', 'run-as', 'com.rcstravels.driver.phase9',
      'cat', 'shared_prefs/expo.modules.devmenu.sharedpreferences.xml');
    assert.match(changed, /name="showFab" value="false"/);
  }
  await native.maestro('foreground-permission', '- tapOn:\n    text: "Not now"\n    optional: true\n- tapOn:\n    text: "Not now"\n    optional: true\n'
    + '- runFlow:\n    when:\n      visible: "Open React Native dev menu"\n    commands:\n      - back\n'
    + wait('Go online') + tap('Go online')
    + '- runFlow:\n    when:\n      visible: "Open React Native dev menu"\n    commands:\n      - back\n      - tapOn: "Go online"\n'
    + wait('Share your location') + tap('Continue')
    + '- tapOn:\n    text: "Precise"\n    optional: true\n' + wait('While using the app') + tap('While using the app')
    + '- tapOn:\n    text: "Not now"\n    optional: true\n');
  assert.equal((await permissions()).ACCESS_FINE_LOCATION, true);
  await checkpoint('actual foreground permission granted; every position method remains synthetic and background collection is disabled');
  // Explicit actor setup: this scenario excludes the native background-permission
  // online journey. Real protected assignment/acceptance/ride handlers stay active.
  await harness.db.driver.update({ where: { id: harness.actors.captain.id }, data: { isOnline: true } });
  assert.equal((await harness.lifecycle.deliver()).status, 200);
  const booking = await harness.lifecycle.booking();
  await harness.lifecycle.offer({ at: new Date(booking.scheduledAt.getTime() - 30 * 60 * 1000).toISOString() });
  await native.reopen();
  await native.maestro('device-accept-and-depart', tap('Notifications') + wait('Accept') + tap('Accept')
    + wait('Contact the rider') + tap('Close') + '- back\n' + wait('Slide to go to pickup') + slide);
  await native.untilState(async () => (await harness.lifecycle.booking()).status === 'en_route', 'native departure');
  await native.maestro('gps-unavailable', wait('Finding your location.*') + '- takeScreenshot: gps-unavailable\n');
  await checkpoint('native acceptance and swipe departure; unavailable synthetic GPS disables arrival');
  mode = 'poor';
  await native.untilState(() => native.deviceProvider.observations.some(x => x.value?.fix?.coords.accuracy === 201), 'poor synthetic fix observed');
  await native.maestro('gps-poor-accuracy', wait('Finding your location.*') + '- takeScreenshot: gps-poor-accuracy\n');
  mode = 'stale';
  await native.reopen();
  await native.maestro('gps-stale-after-restart', wait('Updating your location.*') + '- takeScreenshot: gps-stale-after-restart\n');
  assert.equal((await harness.lifecycle.booking()).status, 'en_route');
  assert.equal(await harness.db.responsibilityCase.count(), 0);
  assert.equal(await harness.db.responsibilityLiability.count(), 0);
  await checkpoint('poor accuracy and stale observed time preserve en-route state after process restart; no misconduct case or authority created');
  mode = 'pickup';
  await native.maestro('device-arrival', wait('Slide when you arrive') + slide + wait('Enter OTP') + '- takeScreenshot: native-arrival-otp\n');
  assert.equal((await harness.lifecycle.booking()).status, 'reached');
  let otp = '';
  for (const [index, digit] of [...'4321'].entries()) otp += tap('Enter OTP ' + (index + 1)) + '- inputText: "' + digit + '"\n';
  await native.maestro('device-start-with-otp', otp + '- hideKeyboard\n' + tap('Start ride'));
  await native.untilState(async () => (await harness.lifecycle.booking()).status === 'started', 'native OTP start');
  await native.maestro('device-drop-address', wait('Synthetic Delhi drop') + '- takeScreenshot: native-drop-address\n');
  await checkpoint('actual swipe arrival and four labeled native OTP fields start the ride through the protected handler');
  mode = 'drop';
  await native.maestro('device-completion', wait('Slide to finish the ride') + slide + '- takeScreenshot: native-completed\n');
  await native.untilState(async () => (await harness.lifecycle.booking()).status === 'completed', 'native completion');
  const statusPath = '/api/driver/rides/' + booking.id + '/status';
  const completed = native.gateway.requests.find(x => x.path === statusPath && x.response?.status === 'completed');
  assert.ok(completed, 'Actual protected completion response must be retained');
  await checkpoint('actual native swipe completion at the synthetic drop; reservation released once');
  Object.assign(process.env, { VITE_API_BASE_URL: '/fixture-backend', VITE_CLERK_PUBLISHABLE_KEY: browserPublishableKey, PHASE9_BROWSER_API: harness.apiUrl });
  vite = await createServer({ root: fileURLToPath(new URL('../../../frontend/', import.meta.url)),
    configFile: fileURLToPath(new URL('../../../frontend/tests/e2e/vite.config.mjs', import.meta.url)) });
  await vite.listen(); browser = await chromium.launch();
  const url = 'http://127.0.0.1:' + vite.httpServer.address().port;
  const { page } = await createBrowserActor({ browser, url, actor: 'customer', contexts, viewport: { width: 390, height: 844 } });
  await page.goto(url + '/booking/' + booking.id);
  await page.getByRole('button', { name: 'Pay cash', exact: true }).click({ clickCount: 2 });
  const paidStatus = page.getByRole('status').getByText('Paid in cash', { exact: true });
  await expect(paidStatus).toBeVisible();
  await page.reload(); await expect(paidStatus).toBeVisible();
  await page.screenshot({ path: join(output, 'customer-native-completion-cash-phone.png'), fullPage: true });
  const { assertPhase9FinancialInvariants } = await import('../helpers/phase9Lifecycle.js');
  const financials = await assertPhase9FinancialInvariants(harness.db, booking.id);
  assert.deepEqual(await captureSources(), sources);
  const receipt = { schema: 'rcs-phase9-device-v1', run, status: 'PASS', sources, frozenV5: V5_HASH, actions,
    build: native.build, stagedSources: native.stagedSources, originalPermissions, finalPermissions: await permissions(),
    observations: native.deviceProvider.observations, routingObservations: places.observations, requests: native.gateway.requests,
    apiRequests: harness.requests, financials,
    gpsBoundary: 'Real foreground permission; synthetic position values only. Native background collection and external navigation are disabled.',
    setupBoundary: 'Synthetic confirmed booking and online intent are setup; acceptance, ride transitions and customer final cash acknowledgement use actual interfaces.',
    replayBoundary: 'Fresh-database recipe repeat; not exact saved-input UI replay' };
  await writeFile(join(output, 'receipt.json'), JSON.stringify({ ...receipt, integrity: browserReceiptHash(receipt) }, null, 2));
  console.log('Native device GPS and completion PASS: ' + run);
} catch (error) {
  await writeFile(join(output, 'failure.json'), JSON.stringify({ run, error: error.message, actions,
    booking: await harness.lifecycle.booking(), wallets: await harness.db.walletEntry.findMany(),
    requests: native?.gateway.requests, observations: native?.deviceProvider.observations }, null, 2));
  throw error;
} finally {
  for (const [index, context] of contexts.entries()) await saveSanitizedTrace(context, process.env.PHASE9_EMPTY_ENV_DIR, output, 'trace-' + index);
  await browser?.close(); await vite?.close(); await native?.close();
  if (native && originalPermissions) for (const [permission, granted] of Object.entries(originalPermissions)) {
    if (!granted && (await permissions())[permission]) await native.device.adb('shell', 'pm', 'revoke', '--user', '0', 'com.rcstravels.driver.phase9', 'android.permission.' + permission);
  }
  if (native && originalPermissions) {
    const restored = await permissions(); assert.deepEqual(restored, originalPermissions);
    await writeFile(join(output, 'permission-restoration.json'), JSON.stringify({ package: 'com.rcstravels.driver.phase9', restored }, null, 2));
  }
  await harness.close();
  places.restore();
}
