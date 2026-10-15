import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep, dirname } from 'node:path'
import { assertOutsideRepository, configureNativeMaps } from '../../tools/phase9-native/maps-test.mjs'

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'rcs-phase9-maps-'))
  t.after(async () => {
    assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep + 'rcs-phase9-maps-'))
    await rm(root, { recursive: true, force: true })
  })
  const app = join(root, 'app'), repository = join(root, 'repository'), keyFile = join(root, 'test-key.txt')
  await mkdir(repository)
  await mkdir(join(app, 'android/app/src/main/res/xml'), { recursive: true })
  const manifest = join(app, 'android/app/src/main/AndroidManifest.xml')
  const network = join(app, 'android/app/src/main/res/xml/phase9_network.xml')
  await writeFile(join(app, 'app.json'), JSON.stringify({ expo: { android: { package: 'com.rcstravels.driver.phase9' } } }))
  await writeFile(keyFile, 'AIza' + 'A'.repeat(35))
  await writeFile(manifest, '<application><meta-data android:value="phase9-invalid-offline-key"/></application>')
  await writeFile(network, '<network-security-config></network-security-config>')
  return { app, keyFile, repository, manifest, network }
}

test('owner-approved Maps configuration touches only the staged test package and omits the key from metadata', async t => {
  const context = await fixture(t)
  await writeFile(context.keyFile, '  AIza' + 'A'.repeat(35) + '\r\n')
  const metadata = await configureNativeMaps(context.app, context.keyFile, context.repository)
  assert.deepEqual(metadata, { mode: 'owner-approved-android-sdk-only', package: 'com.rcstravels.driver.phase9',
    tlsDomains: ['googleapis.com', 'gstatic.com', 'google.com'], mapId: null,
    privateKeySource: 'outside repository; value omitted', productionConfigurationChanged: false })
  assert.equal(metadata.mapId, null)
  assert.equal(metadata.productionConfigurationChanged, false)
  assert.equal(JSON.stringify(metadata).includes('AIza'), false)
  assert.ok((await readFile(context.manifest, 'utf8')).includes('AIza' + 'A'.repeat(35)))
  const network = await readFile(context.network, 'utf8')
  for (const domain of metadata.tlsDomains) assert.ok(network.includes(`<domain includeSubdomains="true">${domain}</domain>`))
  assert.ok(network.includes('certificates src="system"'))
  assert.equal(network, '<network-security-config><domain-config cleartextTrafficPermitted="false">\n'
    + '<domain includeSubdomains="true">googleapis.com</domain>\n<domain includeSubdomains="true">gstatic.com</domain>\n'
    + '<domain includeSubdomains="true">google.com</domain>\n<trust-anchors><certificates src="system" /></trust-anchors>\n'
    + '</domain-config>\n</network-security-config>')
  await assert.rejects(configureNativeMaps(context.app, context.keyFile, context.repository))
})

test('Maps private paths reject the repository itself and every nested path', () => {
  const repository = resolve('synthetic-repository')
  assert.throws(() => assertOutsideRepository(repository, repository), /Maps test key and staged native project must stay outside the repository/)
  assert.throws(() => assertOutsideRepository(repository, join(repository, 'private', 'key.txt')))
  assertOutsideRepository(repository, resolve('synthetic-private', 'key.txt'))
  assertOutsideRepository(repository, resolve('..'))
  assertOutsideRepository(repository, dirname(repository))
  if (process.platform === 'win32') {
    assertOutsideRepository('D:\\synthetic-repository', 'C:\\synthetic-private\\key.txt')
    assert.throws(() => assertOutsideRepository('D:\\synthetic-repository', 'D:\\synthetic-repository\\key.txt'))
  }
})

test('Maps configuration rejects production package and malformed or multiline keys', async t => {
  const context = await fixture(t)
  for (const key of ['', 'AIza' + 'A'.repeat(34), 'AIza' + 'A'.repeat(36), 'prefixAIza' + 'A'.repeat(35), 'AIza' + 'A'.repeat(34) + '<', 'AIza' + 'A'.repeat(35) + '\nsecond']) {
    await writeFile(context.keyFile, key)
    await assert.rejects(configureNativeMaps(context.app, context.keyFile, context.repository), error =>
      error.message === 'Expected one private Maps test key' && !error.message.includes('AIza'))
  }
  await writeFile(context.keyFile, 'AIza' + 'A'.repeat(35))
  await writeFile(join(context.app, 'app.json'), JSON.stringify({ expo: { android: { package: 'com.rcstravels.driver' } } }))
  await assert.rejects(configureNativeMaps(context.app, context.keyFile, context.repository))
})
test('Maps staging cannot use a valid app or private key inside the repository boundary', async t => {
  const context = await fixture(t)
  await assert.rejects(configureNativeMaps(context.app, context.keyFile, context.app))
  const insideKey = join(context.repository, 'private-key.txt')
  await writeFile(insideKey, 'AIza' + 'A'.repeat(35))
  await assert.rejects(configureNativeMaps(context.app, insideKey, context.repository))
  assert.equal(await readFile(context.manifest, 'utf8'), '<application><meta-data android:value="phase9-invalid-offline-key"/></application>')
})

test('Maps configuration fails before writing when manifest or network metadata is absent or ambiguous', async t => {
  for (const [manifest, network] of [
    ['<application/>', '<network-security-config></network-security-config>'],
    ['android:value="phase9-invalid-offline-key" android:value="phase9-invalid-offline-key"', '</network-security-config>'],
    ['android:value="phase9-invalid-offline-key"', '<network-security-config>'],
    ['android:value="phase9-invalid-offline-key"', '</network-security-config></network-security-config>'],
  ]) {
    const context = await fixture(t)
    await writeFile(context.manifest, manifest); await writeFile(context.network, network)
    await assert.rejects(configureNativeMaps(context.app, context.keyFile, context.repository))
    assert.equal(await readFile(context.manifest, 'utf8'), manifest)
    assert.equal(await readFile(context.network, 'utf8'), network)
  }
})
