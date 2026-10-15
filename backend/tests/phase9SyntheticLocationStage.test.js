import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import vm from 'node:vm'
import { stageSyntheticLocation } from '../../tools/phase9-native/synthetic-location-stage.mjs'

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'rcs-phase9-gps-'))
  t.after(async () => { assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep + 'rcs-phase9-gps-')); await rm(root, { recursive: true, force: true }) })
  const app = join(root, 'app'), repository = join(root, 'repository')
  await mkdir(app); await mkdir(repository)
  await writeFile(join(app, 'app.json'), JSON.stringify({ expo: { android: { package: 'com.rcstravels.driver.phase9' } } }))
  await writeFile(join(app, 'metro.config.js'), 'module.exports = {resolver:{}};\n')
  return { app, repository }
}

test('synthetic GPS staging binds test ownership and aliases every application position import while preserving native permission resolution', async t => {
  const { app, repository } = await fixture(t)
  assert.deepEqual(await stageSyntheticLocation(app, repository), {
    mode: 'synthetic-only-positions-real-foreground-permission', backgroundCollection: 'DISABLED', ownerGpsCollected: false })
  assert.equal(await readFile(join(app, 'phase9-location-core.mjs'), 'utf8'), await readFile(new URL('../../tools/phase9-native/synthetic-location-core.mjs', import.meta.url), 'utf8'))
  const code = await readFile(join(app, 'metro.config.js'), 'utf8')
  const context = { module: { exports: {} }, require: name => { assert.equal(name, 'node:path'); return { join } }, __dirname: app }
  vm.runInNewContext(code, context)
  const fallback = { marker: 'ordinary resolver' }, resolveRequest = () => fallback
  const resolver = context.module.exports.resolver.resolveRequest
  assert.equal(resolver({ originModulePath: join(app, 'src/main.tsx'), resolveRequest }, 'expo-location', 'android').filePath, join(app, 'phase9-location.js'))
  assert.equal(resolver({ originModulePath: join(app, 'phase9-location.js'), resolveRequest }, 'expo-location', 'android'), fallback)
  assert.equal(resolver({ originModulePath: 'other', resolveRequest }, 'other-module', 'android'), fallback)
  await assert.rejects(stageSyntheticLocation(app, repository))
  const second = await fixture(t)
  await writeFile(join(second.app, 'metro.config.js'), 'module.exports={resolver:{resolveRequest:()=>"previous"}};\n')
  await stageSyntheticLocation(second.app, second.repository)
  context.__dirname = second.app
  vm.runInNewContext(await readFile(join(second.app, 'metro.config.js'), 'utf8'), { ...context, module: { exports: {} } })
  const previous = { ...context, module: { exports: {} } }
  vm.runInNewContext(await readFile(join(second.app, 'metro.config.js'), 'utf8'), previous)
  assert.equal(previous.module.exports.resolver.resolveRequest({ originModulePath: 'other' }, 'other-module', 'android'), 'previous')
})

test('generated GPS module exposes only real permissions and synthetic positions, rejects deployment and external transport', async t => {
  const { app, repository } = await fixture(t)
  await stageSyntheticLocation(app, repository)
  const source = await readFile(join(app, 'phase9-location.js'), 'utf8')
  const code = source.replace("import * as Native from 'expo-location';", `const Native = { Accuracy: {}, ActivityType: {},
    getForegroundPermissionsAsync: async () => ({granted:true}), requestForegroundPermissionsAsync: async () => ({granted:true}),
    getBackgroundPermissionsAsync: async () => ({granted:false}) };`)
    .replace("'./phase9-location-core.mjs'", JSON.stringify(pathToFileURL(join(app, 'phase9-location-core.mjs')).href))
  const previousDev = globalThis.__DEV__, previousBase = process.env.EXPO_PUBLIC_API_BASE_URL, previousFetch = globalThis.fetch
  t.after(() => { globalThis.__DEV__ = previousDev; globalThis.fetch = previousFetch;
    if (previousBase === undefined) delete process.env.EXPO_PUBLIC_API_BASE_URL; else process.env.EXPO_PUBLIC_API_BASE_URL = previousBase })
  const load = suffix => import('data:text/javascript;base64,' + Buffer.from(code + '\n// ' + suffix).toString('base64'))
  globalThis.__DEV__ = true
  process.env.EXPO_PUBLIC_API_BASE_URL = 'http://127.0.0.1:12345'
  let ok = true
  const fix = { timestamp: 123, coords: { latitude: 28.6, longitude: 77.2, accuracy: 8 } }
  globalThis.fetch = async url => { assert.equal(url, 'http://127.0.0.1:12345/phase9-synthetic-location'); return {
    ok, json: async () => ({ schema: 'phase9-synthetic-location-v1', source: 'synthetic-delhi', fix }) } }
  const module = await load('valid')
  assert.deepEqual(await module.getCurrentPositionAsync(), fix)
  assert.equal((await module.requestBackgroundPermissionsAsync()).granted, false)
  assert.equal((await module.requestForegroundPermissionsAsync()).granted, true)
  assert.equal((await module.getBackgroundPermissionsAsync()).granted, false)
  ok = false; await assert.rejects(module.getCurrentPositionAsync())
  globalThis.__DEV__ = false; await assert.rejects(load('deployed'))
  globalThis.__DEV__ = true; process.env.EXPO_PUBLIC_API_BASE_URL = 'https://example.com'; await assert.rejects(load('external'))
})

test('GPS staging rejects repository paths and an unrelated installed application package', async t => {
  const { app, repository } = await fixture(t)
  await assert.rejects(stageSyntheticLocation(repository, repository))
  await assert.rejects(stageSyntheticLocation(app, app))
  await writeFile(join(app, 'app.json'), JSON.stringify({ expo: { android: { package: 'com.rcstravels.driver' } } }))
  await assert.rejects(stageSyntheticLocation(app, repository))
})
