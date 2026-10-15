import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { createNativeGateway } from '../helpers/phase9NativeGateway.js';
import { nativePublishableKey } from '../helpers/phase9NativeClerkEnvironment.js';
import { physicalDevice, installTestApk } from '../../../tools/phase9-native/device.mjs';
import { TEST_PACKAGE, hash, stagedSourceHashes, stageNativeApp } from '../../../tools/phase9-native/stage.mjs';
import { setUsbAwake, createFileStore } from '../../../tools/phase9-native/phone-awake-core.mjs';
import { nativeRuntimeDestination } from '../../../tools/phase9-native/path.mjs';
import { REQUIRED_DRIVER_OWNED_DOCUMENTS, REQUIRED_VEHICLE_OWNED_DOCUMENTS } from '../../constants/driverDocuments.js';
import { createPhase9DeviceProvider } from '../helpers/phase9DeviceProvider.js';
import { stageSyntheticLocation } from '../../../tools/phase9-native/synthetic-location-stage.mjs';
import { stageNavigationFixture } from '../../../tools/phase9-native/navigation-fixture.mjs';

export async function createNativeSession(harness, output, { acceptanceFault = false, restoreAwake = true, syntheticLocation = null, beforeRequest } = {}) {
  const repository = fileURLToPath(new URL('../../../', import.meta.url));
  const evidence = join(repository, 'output/phase9-native-device-2026-10-10');
  const build = JSON.parse(await readFile(join(evidence, 'latest-build.json'), 'utf8'));
  assert.equal(build.package, TEST_PACKAGE);
  assert.equal(hash(await readFile(build.apk)), build.apkSha256);
  const device = await physicalDevice();
  const awakeStore = createFileStore(join(evidence, 'phone-awake-state.json'));
  await setUsbAwake(device, awakeStore, 'enable');
  let gateway;
  let deviceProvider;
  let metro;
  const forwards = [];
  let runtimeApp;
  let installation;
  let stagedSources;
async function untilState(probe, description, timeout = 180000) {
  const deadline = performance.now() + timeout;
  while (performance.now() < deadline) {
    if (metro && metro.exitCode !== null) throw new Error('Metro exited before native state was ready; inspect its saved log');
    try { if (await probe()) return; } catch { /* not ready yet */ }
    await new Promise(done => setTimeout(done,250));
  }
  throw new Error(`Native state timeout: ${description}`);
}
async function availablePort() {
  const server = net.createServer();
  await new Promise(done => server.listen(0,'127.0.0.1',done));
  const port = server.address().port;
  await new Promise(done => server.close(done));
  return port;
}
async function maestro(name, yaml, startupRetry = false) {
  const foreground = await device.adb('shell',"dumpsys activity activities | grep -E 'mResumedActivity|topResumedActivity'");
  assert.ok(foreground.includes(TEST_PACKAGE),'Test app must be foreground before native capture');
  const file = join(output,name + '.yaml');
  await writeFile(file,`appId: ${TEST_PACKAGE}\n---\n` + yaml);
  const log = createWriteStream(join(output,name + '.log'));
  let failure;
  try {
    await new Promise((done,fail) => {
      // Invoke the official Windows launcher entry directly, as for Gradle.
      // Argument arrays preserve paths and avoid the wrapper's nested CMD quoting.
      const child = spawn('C:/Program Files/Java/jdk-17.0.2/bin/java.exe',
        ['--enable-native-access=ALL-UNNAMED','-classpath','C:/maestro/lib/*','maestro.cli.AppKt',
          '--device',device.serial,'test','--debug-output',output,'--test-output-dir',join(output,'maestro-artifacts'),file],
        { env: process.env, windowsHide: true });
      child.stdout.pipe(log,{ end: false }); child.stderr.pipe(log,{ end: false });
      const deadline=setTimeout(() => {
        if (child.pid) spawn('C:/Windows/System32/taskkill.exe',['/pid',String(child.pid),'/t','/f'],{ windowsHide:true,stdio:'ignore' });
      },240000);
      child.once('error',error => { clearTimeout(deadline); fail(error); });
      child.once('close',code => { clearTimeout(deadline); code === 0 ? done() : fail(new Error(`${name} Maestro exit ${code}`)); });
    });
  } catch (error) { failure = error; } finally {
    await new Promise(done => log.end(done));
    const text = await readFile(join(output,name + '.log'),'utf8');
    await writeFile(join(output,name + '.log'),text.replaceAll(device.serial,'[device-serial-redacted]'));
  }
  if (failure) {
    const { isMaestroStartupFailure } = await import('../../../tools/phase9-native/maestro-startup.mjs');
    const saved = await readFile(join(output, name + '.log'), 'utf8');
    if (!startupRetry && isMaestroStartupFailure(saved)) {
      for (const packageName of ['dev.mobile.maestro', 'dev.mobile.maestro.test']) {
        await device.adb('shell', 'am', 'force-stop', '--user', '0', packageName);
      }
      return maestro(name + '-startup-retry', yaml, true);
    }
    throw failure;
  }
}
  async function close() {
    await device.adb('shell', 'am', 'force-stop', '--user', '0', TEST_PACKAGE).catch(() => {});
    for (const port of forwards) await device.adb('reverse', '--remove', 'tcp:' + port).catch(() => {});
    if (metro && metro.exitCode === null) await new Promise(done => {
      const stop = spawn('C:/Windows/System32/taskkill.exe', ['/pid', String(metro.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
      stop.once('error', done); stop.once('close', done);
    });
    await deviceProvider?.close();
    await gateway?.close();
    if (restoreAwake) await setUsbAwake(device, awakeStore, 'restore');
  }
  try {
  const { ownerIdFor } = await import('../../services/driverDocuments.js');
  for (const actor of ['captain', 'replacement']) {
    const captain = await harness.db.driver.findUniqueOrThrow({ where: { id: harness.actors[actor].id } });
    assert.equal(captain.verificationStatus, 'approved');
    assert.ok(captain.activeVehicleId);
    const documents = [...REQUIRED_DRIVER_OWNED_DOCUMENTS.map(type => ({ type, vehicleId: null })),
      ...REQUIRED_VEHICLE_OWNED_DOCUMENTS.map(type => ({ type, vehicleId: captain.activeVehicleId }))];
    await harness.db.driverDocument.createMany({ data: documents.map(document => ({ ...document,
      driverId: captain.id, ownerId: ownerIdFor({ driverId: captain.id, vehicleId: document.vehicleId }),
      fileUrl: 'phase9-synthetic/' + captain.id + '/' + document.type, status: 'approved', scanStatus: 'clean',
      expiresAt: new Date('2030-01-01T00:00:00.000Z'), reviewedAt: new Date(), scannedAt: new Date(),
    })) });
  }
    installation = await installTestApk(device, build.apk, undefined, build.apkSha256, build.previousApkSha256);
    gateway = await createNativeGateway(harness, { acceptanceFault, beforeRequest });
     if (syntheticLocation) deviceProvider = await createPhase9DeviceProvider(gateway, syntheticLocation);
    runtimeApp = await stageNativeApp(repository, nativeRuntimeDestination(repository, randomUUID()));
     if (syntheticLocation) {
       await stageSyntheticLocation(runtimeApp, repository);
       await stageNavigationFixture(runtimeApp, repository);
     }
    stagedSources = await stagedSourceHashes(runtimeApp);
    await writeFile(join(output, 'native-source-identities.json'), JSON.stringify({ apkSha256: build.apkSha256,
      runtimeApp, stagedSources, executorSha256: hash(await readFile(fileURLToPath(import.meta.url))) }, null, 2));
  const apiUrl = deviceProvider?.url ?? gateway.url;
  const apiPort = new URL(apiUrl).port;
  const metroPort = await availablePort();
  for (const port of [apiPort,String(metroPort)]) { await device.adb('reverse','--no-rebind',`tcp:${port}`,`tcp:${port}`); forwards.push(port); }
  const metroEnv = { ...process.env, NODE_ENV: 'development', EXPO_NO_DOTENV: '1', EXPO_OFFLINE: '1', EXPO_NO_TELEMETRY: '1', CI: '1',
    PHASE9_METRO_ISOLATED: '1',
    EXPO_PUBLIC_API_BASE_URL: apiUrl,
    EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: nativePublishableKey,
  };
  const metroLog = createWriteStream(join(output,'metro.log'));
  metro = spawn(process.execPath,['--require',join(repository,'tools/phase9-native/metro-loopback.cjs'),
    join(runtimeApp,'node_modules/expo/bin/cli'),'start','--dev-client','--localhost','--max-workers','2','--port',String(metroPort)],
    { cwd: runtimeApp, env: metroEnv, windowsHide: true });
  metro.stdout.pipe(metroLog); metro.stderr.pipe(metroLog);
  await untilState(async () => (await fetch(`http://127.0.0.1:${metroPort}/status`)).ok,'Metro ready');
  const bundle=await fetch(`http://127.0.0.1:${metroPort}/index.bundle?platform=android&dev=true&minify=false`,{ signal:AbortSignal.timeout(600000) });
  const bundled=await bundle.text();
  await writeFile(join(output,'bundle-preflight.json'),JSON.stringify({ status:bundle.status,bytes:Buffer.byteLength(bundled),sha256:hash(bundled) },null,2));
  if (!bundle.ok) throw new Error('Native bundle preflight failed: ' + bundled.slice(0,350));
  await untilState(async () => !/^\s*showing=true\s*$/m.test(await device.adb('shell','dumpsys','window','policy')),
    'owner unlocks the prepared phone',300000);
  const launchUrl = `rcsphase9://expo-development-client/?url=${encodeURIComponent(`http://127.0.0.1:${metroPort}`)}`;
  await device.adb('shell','am','start','--user','0','-n',`${TEST_PACKAGE}/com.rcstravels.driver.MainActivity`,'-a','android.intent.action.VIEW','-d',launchUrl);
  await untilState(() => gateway.requests.some(r => r.path === '/api/driver/me' && r.status === 200),'native signed session and protected profile');

    async function reopen(actor = 'captain') {
      gateway.selectActor(actor);
      const start = gateway.requests.length;
      await device.adb('shell', 'am', 'force-stop', '--user', '0', TEST_PACKAGE);
      await device.adb('shell', 'am', 'start', '--user', '0', '-n', TEST_PACKAGE + '/com.rcstravels.driver.MainActivity',
        '-a', 'android.intent.action.VIEW', '-d', launchUrl);
      await untilState(() => gateway.requests.slice(start).some(r => r.path === '/api/driver/me' && r.status === 200
        && r.actorId === harness.actors[actor].id), 'correct signed native actor after process restart');
      await maestro('reopen-permission-boundary-' + actor,
        '- tapOn:\n    text: "Not now"\n    optional: true\n- tapOn:\n    text: "Not now"\n    optional: true\n');
    }
    return { device, gateway, deviceProvider, maestro, untilState, reopen, close, build, installation, stagedSources, launchUrl };
  } catch (error) {
    await writeFile(join(output, 'native-setup-failure.json'), JSON.stringify({
      error: error.message.replaceAll(device.serial, '[device-serial-redacted]'),
      build: { apkSha256: build.apkSha256, package: build.package }, stagedSources,
      requests: gateway?.requests, faults: gateway?.faults,
    }, null, 2));
    await close();
    throw error;
  }
}
