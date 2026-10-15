import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { stageNavigationFixture } from '../../tools/phase9-native/navigation-fixture.mjs'

test('isolated navigation staging cannot launch an external app or change production sources', async t => {
  const root = await mkdtemp(join(tmpdir(), 'rcs-phase9-navigation-'))
  t.after(async () => { assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep + 'rcs-phase9-navigation-')); await rm(root, { recursive: true, force: true }) })
  const app = join(root, 'app'), repo = join(root, 'repo')
  await mkdir(join(app, 'src/lib'), { recursive: true }); await mkdir(repo)
  await writeFile(join(app, 'app.json'), JSON.stringify({ expo: { android: { package: 'com.rcstravels.driver.phase9' } } }))
  const original = "import { Linking } from 'react-native';\nexport async function openDriverNavigation(url) { await Linking.openURL(url); return true; }\n"
  const path = join(app, 'src/lib/navigation.ts')
  await writeFile(path, original)
  await assert.rejects(stageNavigationFixture(app, app))
  assert.deepEqual(await stageNavigationFixture(app, repo), { externalNavigation: 'SYNTHETIC_INTENT_ONLY', liveDirectionsRequested: false })
  const result = await readFile(path, 'utf8')
  assert.ok(!result.includes('Linking.openURL'))
  assert.ok(!result.includes("import { Linking } from 'react-native';"))
  assert.ok(result.includes('/phase9-navigation-intent'))
  assert.ok(result.includes("if (!reply.ok) throw new Error('Isolated navigation intent rejected');"))
  const originalFetch = globalThis.fetch, originalBase = process.env.EXPO_PUBLIC_API_BASE_URL
  t.after(() => { globalThis.fetch = originalFetch;
    if (originalBase === undefined) delete process.env.EXPO_PUBLIC_API_BASE_URL; else process.env.EXPO_PUBLIC_API_BASE_URL = originalBase })
  process.env.EXPO_PUBLIC_API_BASE_URL = 'http://127.0.0.1:12345'
  let ok = true, calls = 0
  globalThis.fetch = async (url, options) => { calls++; assert.equal(url, 'http://127.0.0.1:12345/phase9-navigation-intent');
    assert.equal(options.method, 'POST'); assert.equal(JSON.parse(options.body).url, 'synthetic-url'); return { ok } }
  const module = await import('data:text/javascript;base64,' + Buffer.from(result).toString('base64'))
  assert.equal(await module.openDriverNavigation('synthetic-url'), true)
  ok = false; await assert.rejects(module.openDriverNavigation('synthetic-url'), { message: 'Isolated navigation intent rejected' })
  assert.equal(calls, 2)
  await assert.rejects(stageNavigationFixture(app, repo))
  await assert.rejects(stageNavigationFixture(app, app))
  await writeFile(join(app, 'app.json'), JSON.stringify({ expo: { android: { package: 'com.rcstravels.driver' } } }))
  await assert.rejects(stageNavigationFixture(app, repo))
})
