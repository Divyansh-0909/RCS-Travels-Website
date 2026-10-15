import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { stageNativeApp, stagedSourceHashes, TEST_PACKAGE, hash } from './stage.mjs';
import { nativeBuildDestination } from './path.mjs';
import assert from 'node:assert/strict';
import { nativePublishableKey } from '../../backend/tests/helpers/phase9NativeClerkEnvironment.js';
import { configureNativeMaps } from './maps-test.mjs';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const evidence = resolve(repository, 'output/phase9-native-device-2026-10-10');
const run = randomUUID();
// Windows Ninja cannot create some generated Clerk/Solana paths near MAX_PATH.
// Keep the disposable app root short without changing its native dependencies.
const destination = nativeBuildDestination(run);
const javaHome = 'C:/Program Files/Java/jdk-17.0.2';
const env = Object.fromEntries(['SystemRoot','WINDIR','ComSpec','PATH','USERPROFILE','TEMP','TMP','LOCALAPPDATA','APPDATA']
  .filter(key => process.env[key]).map(key => [key, process.env[key]]));
Object.assign(env, { JAVA_HOME: javaHome, ANDROID_HOME: 'C:/Android', ANDROID_SDK_ROOT: 'C:/Android', GRADLE_USER_HOME: 'C:/rcs-phase9-native/gradle',
  EXPO_NO_DOTENV: '1', EXPO_OFFLINE: '1', CI: '1',
  EXPO_PUBLIC_API_BASE_URL: 'http://127.0.0.1:1',
  EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: nativePublishableKey,
});
await mkdir(evidence, { recursive: true });
const app = await stageNativeApp(repository, destination);
const mapsKeyFile = process.argv.find(value => value.startsWith('--maps-key-file='))?.slice(16);
const mapsTest = mapsKeyFile ? await configureNativeMaps(app, mapsKeyFile, repository) : { mode: 'offline-invalid-key' };
await writeFile(join(app, 'android/local.properties'), 'sdk.dir=C:/Android\n');

async function execute(command, args, cwd, logName) {
  const log = createWriteStream(join(evidence, logName));
  try {
    await new Promise((done, fail) => {
      const child = spawn(command, args, { cwd, env, windowsHide: true });
      child.stdout.pipe(log, { end: false }); child.stderr.pipe(log, { end: false });
      child.once('error', fail); child.once('close', code => code === 0 ? done() : fail(new Error(`${logName}: exit ${code}`)));
    });
  } finally { await new Promise(done => log.end(done)); }
}
let previous;
try { previous=JSON.parse(await readFile(join(evidence,'latest-build.json'),'utf8')); }
catch (error) { if(error.code !== 'ENOENT') throw error; }
if(previous) {
  assert.equal(previous.package,TEST_PACKAGE);
  assert.match(previous.app,/^C:[\\/]r9[\\/][a-f0-9]{8}[\\/]driver-app[\\/]?$/);
  assert.equal(resolve(previous.apk),resolve(previous.app,'android/app/build/outputs/apk/debug/app-debug.apk'));
  assert.equal(hash(await readFile(previous.apk)),previous.apkSha256);
  await copyFile(join(previous.app,'android/app/debug.keystore'),join(app,'android/app/debug.keystore'));
} else {
  await execute(join(javaHome, 'bin/keytool.exe'), ['-genkeypair','-alias','androiddebugkey','-keyalg','RSA','-validity','365',
    '-keystore','debug.keystore','-storepass','android','-keypass','android','-dname','CN=RCS Phase9 Disposable'], join(app,'android/app'), `keytool-${run}.log`);
}
await execute(join(javaHome, 'bin/keytool.exe'), ['-exportcert','-alias','androiddebugkey','-keystore','debug.keystore','-storepass','android',
  '-file','src/main/res/raw/phase9_ca.cer'], join(app,'android/app'), `certificate-${run}.log`);
await writeFile(join(evidence, `build-${run}.json`), JSON.stringify({ run, app, package: TEST_PACKAGE, sourceHashes: await stagedSourceHashes(app),
  cloudUpload: false, mapsTest, environment: 'allowlisted; no dotenv or production keys', apkStatus: 'BUILDING' }, null, 2));
await execute(join(javaHome, 'bin/java.exe'), ['-Xmx64m','-Xms64m','-Dorg.gradle.appname=gradlew','-jar','gradle/wrapper/gradle-wrapper.jar',
  ':app:assembleDebug','-PreactNativeArchitectures=arm64-v8a','-Pkotlin.compiler.execution.strategy=in-process',
  '--max-workers=2','--no-daemon','--console=plain'],
  join(app,'android'), `gradle-${run}.log`);
const apk = join(app, 'android/app/build/outputs/apk/debug/app-debug.apk');
const bytes = await readFile(apk);
const identity = { run, app, package: TEST_PACKAGE, apk, apkSha256: hash(bytes), bytes: bytes.length,
  sourceHashes: await stagedSourceHashes(app), cloudUpload: false, mapsTest, status: 'BUILT',
  previousApkSha256:previous?.apkSha256 ?? null };
await writeFile(join(evidence, `build-${run}.json`), JSON.stringify(identity, null, 2));
await writeFile(join(evidence, 'latest-build.json'), JSON.stringify(identity, null, 2));
console.log(JSON.stringify({ run, package: TEST_PACKAGE, apk, apkSha256: identity.apkSha256, status: identity.status }));
