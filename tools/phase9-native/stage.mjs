import { cp, mkdir, readFile, writeFile, readdir, symlink } from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

export const TEST_PACKAGE = 'com.rcstravels.driver.phase9';
const excluded = /^(?:node_modules|build|\.gradle|\.cxx|\.git|\.expo|\.env(?:\..*)?|google-services\.json|GoogleService-Info\.plist|credentials\.json|keystore\.properties|local\.properties|.*\.(?:keystore|jks))$/;
const appRoots = new Set(['src','assets','android','index.ts','app.json','package.json','package-lock.json',
  'babel.config.js','metro.config.js','tailwind.config.js','global.css','tsconfig.json','nativewind-env.d.ts']);
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');

export async function stageNativeApp(repository, destination) {
  assert.equal(await readFile(join(repository, 'driver-app/package.json'), 'utf8').then(JSON.parse).then(p => p.dependencies.expo.startsWith('~55.')), true);
  const source = join(repository, 'driver-app');
  const app = join(destination, 'driver-app');
  await mkdir(destination, { recursive: true });
  await cp(source, app, { recursive: true, filter: file => {
    const parts = relative(source, file).split(/[\\/]/);
    return (!parts[0] || appRoots.has(parts[0])) && !parts.some(part => excluded.test(part));
  } });
  await symlink(resolve(source, 'node_modules'), join(app, 'node_modules'), 'junction');
  await symlink(resolve(repository, 'shared'), join(destination, 'shared'), 'junction');
  const manifestPath = join(app, 'app.json');
  const config = JSON.parse(await readFile(manifestPath, 'utf8'));
  config.expo.name = 'RCS Phase9 Test';
  config.expo.slug = 'rcs-phase9';
  config.expo.scheme = 'rcsphase9';
  config.expo.android.package = TEST_PACKAGE;
  config.expo.android.intentFilters = [];
  delete config.expo.owner;
  delete config.expo.extra;
  delete config.expo.android.googleServicesFile;
  delete config.expo.android.config;
  await writeFile(manifestPath, JSON.stringify(config, null, 2));
  await writeFile(join(app, 'app.config.js'), 'module.exports = ({ config }) => config;\n');
  const gradlePath = join(app, 'android/app/build.gradle');
  const gradle = await readFile(gradlePath, 'utf8');
  assert.match(gradle, /applicationId 'com\.rcstravels\.driver'/);
  assert.match(gradle, /debug \{\s*signingConfig signingConfigs\.debug/);
  await writeFile(gradlePath, gradle.replace(/debug \{\s*signingConfig signingConfigs\.debug/, "debug {\n            applicationIdSuffix '.phase9'\n            signingConfig signingConfigs.debug")
    .replace(/^apply plugin: 'com\.google\.gms\.google-services'.*$/m, '// Phase9: no Firebase production configuration.'));
  const xmlPath = join(app, 'android/app/src/main/AndroidManifest.xml');
  let xml = await readFile(xmlPath, 'utf8');
  xml = xml.replace(/<intent-filter data-generated="true">[\s\S]*?<\/intent-filter>/g, '')
    .replace(/<meta-data\b[^>]*(?:com\.google\.android\.geo\.API_KEY|com\.google\.android\.maps\.v2\.API_KEY)[^>]*\/>/g,'')
    .replace(/android:scheme="rcscaptains"/g, 'android:scheme="rcsphase9"')
    .replace(/android:scheme="exp\+driver-app"/g, 'android:scheme="exp+rcs-phase9"')
    .replace('android:allowBackup="true"', 'android:allowBackup="false"')
    .replace('<application ', '<application android:networkSecurityConfig="@xml/phase9_network" ')
    .replace('</application>', '<meta-data android:name="com.google.android.geo.API_KEY" android:value="phase9-invalid-offline-key"/></application>');
  await writeFile(xmlPath, xml);
  const xmlResources = join(app, 'android/app/src/main/res/xml');
  await mkdir(xmlResources, { recursive: true });
  await mkdir(join(app, 'android/app/src/main/res/raw'), { recursive: true });
  await writeFile(join(xmlResources, 'phase9_network.xml'), `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false">
    <trust-anchors><certificates src="@raw/phase9_ca" /></trust-anchors>
  </base-config>
  <domain-config cleartextTrafficPermitted="true">
    <domain>127.0.0.1</domain><domain>localhost</domain>
  </domain-config>
</network-security-config>
`);
  await syncNativeTransport(app);
  await syncNativeMetro(app);
  const entry = await readFile(join(app, 'index.ts'), 'utf8');
  await writeFile(join(app, 'index.ts'), "import './phase9-transport';\n" + entry);
  return app;
}

// Generated only into the isolated app copy. The actual Clerk SDK, hooks and
// protected backend remain active; this substitutes the synthetic auth transport.
export async function syncNativeTransport(app) {
  await writeFile(join(app, 'phase9-native-fetch.js'), await readFile(new URL('./transport.mjs', import.meta.url)));
  await writeFile(join(app, 'phase9-transport.ts'), `import { createNativeFetch } from './phase9-native-fetch';
globalThis.fetch = createNativeFetch(globalThis.fetch, process.env.EXPO_PUBLIC_API_BASE_URL, __DEV__);
`);
}

export async function syncNativeMetro(app) {
  const file = join(app,'metro.config.js');
  const source = await readFile(file,'utf8');
  await writeFile(join(app,'phase9-metro-dependencies.cjs'),await readFile(new URL('./metro-dependencies.cjs',import.meta.url)));
  if (source.includes('// RCS_PHASE9_NATIVE_DEPENDENCIES')) return;
  await writeFile(file,source + `
// RCS_PHASE9_NATIVE_DEPENDENCIES
const phase9RealPath = require('node:fs').realpathSync;
module.exports = require('./phase9-metro-dependencies.cjs')(module.exports,
  phase9RealPath(require('node:path').join(__dirname,'node_modules')),phase9RealPath);
`);
}

export async function stagedSourceHashes(app) {
  const hashes = {};
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (excluded.test(entry.name) || entry.isSymbolicLink()) continue;
      const file = join(directory, entry.name);
      if (entry.isDirectory()) await visit(file);
      else hashes[relative(app, file).replaceAll('\\', '/')] = hash(await readFile(file));
    }
  }
  await visit(app);
  return hashes;
}
