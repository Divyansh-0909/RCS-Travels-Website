import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, rm, symlink, access, realpath } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createNativeFetch } from '../../tools/phase9-native/transport.mjs';
import { stageNativeApp, stagedSourceHashes, hash, syncNativeMetro } from '../../tools/phase9-native/stage.mjs';
import watchNativeDependencies from '../../tools/phase9-native/metro-dependencies.cjs';
import { nativeBuildDestination,nativeRuntimeDestination } from '../../tools/phase9-native/path.mjs';

test('Windows native object paths fit the legacy Ninja MAX_PATH boundary', () => {
  const root = nativeBuildDestination('217ad898-2a99-454e-ab79-82cfc583e182');
  assert.equal(root,'C:/r9/217ad898');
  const object = root + '/driver-app/android/app/.cxx/Debug/3b1h2vs1/arm64-v8a/SolanaMobileWalletAdapter_autolinked_build/CMakeFiles/react_codegen_SolanaMobileWalletAdapter.dir/react/renderer/components/SolanaMobileWalletAdapter/ShadowNodes.cpp.o';
  assert.ok(object.length < 248,`Native object path length ${object.length}`);
  assert.equal(nativeRuntimeDestination('D:\\Repos\\RCS','217ad898-2a99-454e-ab79-82cfc583e182'),'D:\\r9\\217ad898');
  assert.equal(nativeRuntimeDestination('C:\\Repos\\RCS','217ad898-2a99-454e-ab79-82cfc583e182'),'C:\\r9\\217ad898');
  assert.throws(() => nativeRuntimeDestination('\\\\network\\share','217ad898-fixture'),/local drive/);
  assert.throws(() => nativeRuntimeDestination('D:\\Repos','invalid'),/generated run/);
  assert.throws(() => nativeRuntimeDestination('\\\\server\\D:\\','217ad898-fixture'),/local drive/);
  assert.throws(() => nativeRuntimeDestination('D:\\Repos','prefix217ad898-fixture'),/generated run/);
});

test('Metro follows native dependency and shared junction targets while preserving its resolver', () => {
  const resolveRequest=() => 'existing resolver';
  const config={ watchFolders:['shared-alias'],resolver:{ nodeModulesPaths:['dependency-alias'],resolveRequest } };
  assert.equal(watchNativeDependencies(config,'real-dependencies',(...args) => { assert.equal(args.length,1); return 'real-' + args[0]; }),config);
  assert.deepEqual(config.watchFolders,['shared-alias','real-shared-alias','real-dependencies']);
  assert.deepEqual(config.resolver.nodeModulesPaths,['real-dependencies','dependency-alias']);
  assert.equal(config.resolver.resolveRequest,resolveRequest);
  assert.deepEqual(watchNativeDependencies({ resolver:{} },'real-dependencies',folder => folder),{
    resolver:{ nodeModulesPaths:['real-dependencies'] },watchFolders:['real-dependencies'] });
  watchNativeDependencies(config,'real-dependencies',folder => folder);
  assert.deepEqual(config.watchFolders,['shared-alias','real-shared-alias','real-dependencies']);
});

test('native test transport requires explicit debug loopback and denies external hosts', async () => {
  for (const [api, debug] of [[undefined,true],['',true],['http://127.0.0.1:1234',false],['https://production.invalid',true],['http://127.0.0.1:1234/path',true],['prefixhttp://127.0.0.1:1234',true]]) {
    assert.throws(() => createNativeFetch(() => {},api,debug),/debug build and loopback/);
  }
  const calls = [];
  const fetch = createNativeFetch(async (...args) => { calls.push(args); return 'fixture'; },'http://127.0.0.1:1234',true);
  for (const input of ['https://production.invalid/a',new URL('http://other.invalid'),new Request('https://third.invalid')]) {
    await assert.rejects(() => fetch(input),/external transport denied/);
  }
  assert.equal(calls.length,0);
  assert.equal(await fetch('http://localhost:1234/status'),'fixture');
  assert.equal(await fetch(new URL('http://127.0.0.1:1234/status')),'fixture');
  const init = { headers: { 'x-fixture': 'unchanged' } };
  await fetch('https://phase9.clerk.accounts.dev/v1/client?native=1',init);
  assert.equal(calls[2][0],'http://127.0.0.1:1234/fixture-auth/v1/client?native=1');
  assert.equal(calls[2][1].headers.get('cookie'),'fixture_actor=captain');
  assert.equal(calls[2][1].headers.get('x-fixture'),'unchanged');
  assert.deepEqual(init,{ headers: { 'x-fixture': 'unchanged' } });
  await fetch(new URL('https://phase9.clerk.accounts.dev/v1/client'));
  const request = new Request('https://phase9.clerk.accounts.dev/v1/client',{ method: 'POST', body: 'synthetic-body', headers: { 'x-original':'kept' } });
  await fetch(request);
  assert.equal(calls[4][0].method,'POST');
  assert.equal(await calls[4][0].text(),'synthetic-body');
  assert.equal(calls[4][1].headers.get('x-original'),'kept');
  const local = new Request('http://localhost:1234/local');
  await fetch(local);
  assert.equal(calls[5][0],local);
});

test('Metro preload binds every supported TCP listen form to loopback and rejects pipes', async () => {
  const file = fileURLToPath(new URL('../../tools/phase9-native/metro-loopback.cjs',import.meta.url));
  const source = await readFile(file,'utf8');
  for (const env of [{},{ PHASE9_METRO_ISOLATED:'1' },{ EXPO_NO_DOTENV:'1' }]) {
    assert.throws(() => vm.runInNewContext(source,{ require: name => { assert.equal(name,'node:net'); return { Server: { prototype: {} } }; }, process: { env: { ...process.env,...env, PHASE9_METRO_ISOLATED:env.PHASE9_METRO_ISOLATED,EXPO_NO_DOTENV:env.EXPO_NO_DOTENV } } },{ filename: file }),/dedicated/);
  }
  const calls = [];
  const prototype = { listen(...args) { calls.push(args); return this; } };
  vm.runInNewContext(source,{ require: name => { assert.equal(name,'node:net'); return { Server: { prototype } }; }, process: { env: { ...process.env,PHASE9_METRO_ISOLATED:'1',EXPO_NO_DOTENV:'1' } } },{ filename: file });
  const server = Object.create(prototype);
  assert.equal(server.listen({ port: 1234, host: '0.0.0.0' }),server);
  server.listen(1234,'::'); server.listen(1234,() => {});
  assert.equal(calls[0][0].host,'127.0.0.1');
  assert.equal(calls[0][0].port,1234);
  assert.equal(calls[1][1],'127.0.0.1'); assert.equal(calls[2][1],'127.0.0.1');
  assert.throws(() => server.listen({ path: 'private-pipe' }),/loopback TCP/);
  assert.throws(() => server.listen('private-pipe'),/numeric TCP port/);
  assert.throws(() => server.listen(null),/numeric TCP port/);
  assert.deepEqual(calls[1],[1234,'127.0.0.1']);
  assert.equal(calls[2][0],1234); assert.equal(typeof calls[2][2],'function');
});

test('native staging preserves application source and excludes production configuration, credentials and build outputs', async t => {
  const temporary = await mkdtemp(join(tmpdir(),'rcs-native-unit-'));
  t.after(async () => { assert.ok(resolve(temporary).startsWith(resolve(tmpdir()) + sep)); await rm(temporary,{ recursive: true,force: true }); });
  const repository = join(temporary,'repository');
  const source = join(repository,'driver-app');
  for (const dir of ['src','assets','node_modules','android/app/src/main','android/app/build','android/.gradle']) await mkdir(join(source,dir),{ recursive: true });
  await mkdir(join(repository,'shared'));
  const config = { expo: { name: 'Production',slug:'driver-app',scheme:'rcscaptains',owner:'original',extra:{ eas:{ projectId:'synthetic-original' } },
    android: { package:'com.rcstravels.driver',intentFilters:['original'],googleServicesFile:'private',config:{ googleMaps:{ apiKey:'synthetic-original-key' } } } } };
  const pkg = { dependencies: { expo: '~55.0.28' } };
  await writeFile(join(source,'package.json'),JSON.stringify(pkg));
  await writeFile(join(source,'app.json'),JSON.stringify(config));
  await writeFile(join(source,'index.ts'),"import App from './src/main';\n");
  await writeFile(join(source,'src/main.tsx'),'real application fixture');
  await writeFile(join(source,'src/.env'),'synthetic-private');
  await writeFile(join(source,'.env.production'),'synthetic-private');
  await writeFile(join(source,'credentials.json'),'synthetic-private');
  await writeFile(join(source,'unrelated.txt'),'unrelated');
  const roots = ['package-lock.json','babel.config.js','metro.config.js','tailwind.config.js','global.css','tsconfig.json','nativewind-env.d.ts'];
  for (const file of roots) await writeFile(join(source,file),file === 'metro.config.js' ? 'module.exports={watchFolders:[],resolver:{}};' : 'synthetic root ' + file);
  await writeFile(join(source,'assets/icon.png'),'synthetic icon');
  const privateFiles = ['.env.local','GoogleService-Info.plist','credentials.json','keystore.properties','local.properties','debug.keystore','release.jks'];
  for (const file of privateFiles) await writeFile(join(source,'src',file),'synthetic-private');
  for (const folder of ['build','.gradle','.cxx','.git','.expo','node_modules']) {
    await mkdir(join(source,'src',folder)); await writeFile(join(source,'src',folder,'private.txt'),'synthetic-private');
  }
  await writeFile(join(source,'android/app/build/old.apk'),'synthetic-private');
  await writeFile(join(source,'android/app/google-services.json'),'synthetic-private');
  const gradle = "applicationId 'com.rcstravels.driver'\ndebug {\n signingConfig signingConfigs.debug\n}\napply plugin: 'com.google.gms.google-services'\n// apply plugin: 'com.google.gms.google-services' is documentation\n";
  const xml = '<manifest><application android:allowBackup="true"><data android:scheme="rcscaptains"/><data android:scheme="exp+driver-app"/><intent-filter data-generated="true">production link</intent-filter><meta-data android:name="com.google.android.geo.API_KEY" android:value="synthetic-excluded-key"/><meta-data android:name="com.google.android.maps.v2.API_KEY" android:value="synthetic-excluded-key"/></application></manifest>';
  await writeFile(join(source,'android/app/build.gradle'),gradle);
  await writeFile(join(source,'android/app/src/main/AndroidManifest.xml'),xml);
  const staged = await stageNativeApp(repository,join(temporary,'not-present/staged'));
  const stagedConfig = JSON.parse(await readFile(join(staged,'app.json'),'utf8'));
  assert.equal(stagedConfig.expo.android.package,'com.rcstravels.driver.phase9');
  assert.equal(stagedConfig.expo.name,'RCS Phase9 Test');
  assert.equal(stagedConfig.expo.slug,'rcs-phase9'); assert.equal(stagedConfig.expo.scheme,'rcsphase9');
  assert.deepEqual(stagedConfig.expo.android.intentFilters,[]); assert.equal(stagedConfig.expo.android.googleServicesFile,undefined);
  assert.equal(stagedConfig.expo.owner,undefined); assert.equal(stagedConfig.expo.extra,undefined);
  assert.equal(stagedConfig.expo.android.config,undefined);
  assert.equal(await readFile(join(staged,'android/app/build.gradle'),'utf8'),"applicationId 'com.rcstravels.driver'\ndebug {\n            applicationIdSuffix '.phase9'\n            signingConfig signingConfigs.debug\n}\n// Phase9: no Firebase production configuration.\n// apply plugin: 'com.google.gms.google-services' is documentation\n");
  assert.doesNotMatch(await readFile(join(staged,'android/app/src/main/AndroidManifest.xml'),'utf8'),/production link|allowBackup="true"|rcscaptains|exp\+driver-app/);
  assert.match(await readFile(join(staged,'android/app/src/main/res/xml/phase9_network.xml'),'utf8'),/127\.0\.0\.1/);
  assert.equal(await readFile(join(staged,'android/app/src/main/AndroidManifest.xml'),'utf8'),'<manifest><application android:networkSecurityConfig="@xml/phase9_network" android:allowBackup="false"><data android:scheme="rcsphase9"/><data android:scheme="exp+rcs-phase9"/><meta-data android:name="com.google.android.geo.API_KEY" android:value="phase9-invalid-offline-key"/></application></manifest>');
  await access(join(staged,'android/app/src/main/res/raw'));
  assert.equal(await readFile(join(staged,'index.ts'),'utf8'),"import './phase9-transport';\nimport App from './src/main';\n");
  assert.equal(await readFile(join(staged,'app.config.js'),'utf8'),'module.exports = ({ config }) => config;\n');
  assert.equal(await readFile(join(staged,'phase9-transport.ts'),'utf8'),"import { createNativeFetch } from './phase9-native-fetch';\nglobalThis.fetch = createNativeFetch(globalThis.fetch, process.env.EXPO_PUBLIC_API_BASE_URL, __DEV__);\n");
  assert.equal(await realpath(join(staged,'node_modules')),await realpath(join(source,'node_modules')));
  assert.equal(await realpath(join(staged,'../shared')),await realpath(join(repository,'shared')));
  await symlink(join(repository,'shared'),join(staged,'test-alias'),'junction');
  const hashes = await stagedSourceHashes(staged);
  assert.equal(hashes['src/main.tsx'],hash('real application fixture'));
  assert.equal(hashes['package.json'],hash(JSON.stringify(pkg)));
  assert.equal(hashes['phase9-native-fetch.js'],hash(await readFile(new URL('../../tools/phase9-native/transport.mjs',import.meta.url))));
  for (const name of ['src/.env','.env.production','credentials.json','unrelated.txt','android/app/build/old.apk','android/app/google-services.json','node_modules','test-alias']) assert.equal(hashes[name],undefined);
  for (const file of privateFiles) assert.equal(hashes['src/' + file],undefined);
  for (const file of roots.filter(file => file !== 'metro.config.js')) assert.equal(hashes[file],hash('synthetic root ' + file));
  const metroSource = await readFile(join(staged,'metro.config.js'),'utf8');
  assert.match(metroSource,/RCS_PHASE9_NATIVE_DEPENDENCIES/);
  const metroHelper=await readFile(new URL('../../tools/phase9-native/metro-dependencies.cjs',import.meta.url),'utf8');
  assert.equal(await readFile(join(staged,'phase9-metro-dependencies.cjs'),'utf8'),metroHelper);
  await writeFile(join(staged,'phase9-metro-dependencies.cjs'),'stale fixture helper');
  await syncNativeMetro(staged);
  assert.equal(await readFile(join(staged,'phase9-metro-dependencies.cjs'),'utf8'),metroHelper);
  assert.equal(await readFile(join(staged,'metro.config.js'),'utf8'),metroSource);
  assert.equal(hashes['assets/icon.png'],hash('synthetic icon'));
  for (const file of ['node_modules','shared']) await access(resolve(staged,file === 'shared' ? '../shared' : file));
  for (const file of ['src/.env',...privateFiles.map(name => 'src/' + name),'android/app/build/old.apk','android/app/google-services.json']) await assert.rejects(() => access(join(staged,file)));
  assert.equal(await readFile(join(source,'android/app/build.gradle'),'utf8'),gradle);
  assert.equal(await readFile(join(source,'app.json'),'utf8'),JSON.stringify(config));
  const comment="// apply plugin: 'com.google.gms.google-services' is documentation\n";
  await writeFile(join(source,'android/app/build.gradle'),comment+gradle);
  const preceded=await stageNativeApp(repository,join(temporary,'comment-before-plugin'));
  assert.ok((await readFile(join(preceded,'android/app/build.gradle'),'utf8')).startsWith(comment));
  await writeFile(join(source,'android/app/build.gradle'),gradle);
  await mkdir(join(source,'android/app/src/main/res/raw'),{ recursive:true });
  await writeFile(join(source,'android/app/src/main/res/raw/existing.txt'),'synthetic public resource');
  const withRaw = await stageNativeApp(repository,join(temporary,'existing-raw'));
  assert.equal((await stagedSourceHashes(withRaw))['android/app/src/main/res/raw/existing.txt'],hash('synthetic public resource'));
  await writeFile(join(source,'android/app/build.gradle'),gradle.replace("applicationId 'com.rcstravels.driver'","applicationId 'com.other.app'"));
  await assert.rejects(() => stageNativeApp(repository,join(temporary,'wrong-identity')));
  await writeFile(join(source,'android/app/build.gradle'),gradle);
  await writeFile(join(source,'package.json'),JSON.stringify({ dependencies:{ expo:'~54.0.0' } }));
  await assert.rejects(() => stageNativeApp(repository,join(temporary,'wrong-sdk')));
});
