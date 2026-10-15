import { readFile, realpath, writeFile } from 'node:fs/promises';
import { join, relative, isAbsolute, sep } from 'node:path';
import assert from 'node:assert/strict';
import { TEST_PACKAGE } from './stage.mjs';

export function assertOutsideRepository(repository, file) {
  const child = relative(repository, file);
  assert.ok(child && (child === '..' || child.startsWith('..' + sep) || isAbsolute(child)),
    'Maps test key and staged native project must stay outside the repository');
}

// The owner approved Android SDK tiles only. This operates on the disposable
// test app, never on driver-app/ or a production key/configuration.
export async function configureNativeMaps(app, keyFile, repository) {
  const [appPath, keyPath, repositoryPath] = await Promise.all([realpath(app), realpath(keyFile), realpath(repository)]);
  assertOutsideRepository(repositoryPath, appPath);
  assertOutsideRepository(repositoryPath, keyPath);
  const config = JSON.parse(await readFile(join(appPath, 'app.json'), 'utf8'));
  assert.equal(config.expo.android.package, TEST_PACKAGE);
  const key = (await readFile(keyPath, 'utf8')).trim();
  assert.ok(/^AIza[A-Za-z0-9_-]{35}$/.test(key), 'Expected one private Maps test key');
  const manifest = join(appPath, 'android/app/src/main/AndroidManifest.xml');
  const xml = await readFile(manifest, 'utf8');
  assert.equal((xml.match(/android:value="phase9-invalid-offline-key"/g) ?? []).length, 1);
  const network = join(appPath, 'android/app/src/main/res/xml/phase9_network.xml');
  const security = await readFile(network, 'utf8');
  assert.equal((security.match(/<\/network-security-config>/g) ?? []).length, 1);
  const domains = ['googleapis.com', 'gstatic.com', 'google.com'];
  const sdkTls = `<domain-config cleartextTrafficPermitted="false">\n${domains.map(domain =>
    `<domain includeSubdomains="true">${domain}</domain>`).join('\n')}\n<trust-anchors><certificates src="system" /></trust-anchors>\n</domain-config>\n`;
  await writeFile(network, security.replace('</network-security-config>', sdkTls + '</network-security-config>'));
  await writeFile(manifest, xml.replace('android:value="phase9-invalid-offline-key"', `android:value="${key}"`));
  return { mode: 'owner-approved-android-sdk-only', package: TEST_PACKAGE, tlsDomains: domains, mapId: null,
    privateKeySource: 'outside repository; value omitted', productionConfigurationChanged: false };
}
