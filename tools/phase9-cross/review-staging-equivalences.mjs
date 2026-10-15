import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const output = resolve('output/phase9-cross-application-2026-10-11');
const root = await mkdtemp(join(tmpdir(), 'rcs-phase9-staging-equivalence-'));
const results = [], originalFetch = globalThis.fetch, previousBase = process.env.EXPO_PUBLIC_API_BASE_URL;
try {
  for (const file of ['maps-test.mjs', 'stage.mjs']) await copyFile('tools/phase9-native/' + file, join(root, file));
  const repo = join(root, 'repo'); await mkdir(repo);
  const fixture = async name => {
    const app = join(root, name); await mkdir(join(app, 'src/lib'), { recursive: true });
    await mkdir(join(app, 'android/app/src/main/res/xml'), { recursive: true });
    await writeFile(join(app, 'app.json'), JSON.stringify({ expo: { name: '\u0939\u093f\u0928\u094d\u0926\u0940', android: { package: 'com.rcstravels.driver.phase9' } } }));
    await writeFile(join(app, 'android/app/src/main/AndroidManifest.xml'), '<meta-data android:value="phase9-invalid-offline-key" />');
    await writeFile(join(app, 'android/app/src/main/res/xml/phase9_network.xml'), '<network-security-config></network-security-config>');
    await writeFile(join(app, 'src/lib/navigation.ts'), "import { Linking } from 'react-native';\nexport async function openDriverNavigation(url) { await Linking.openURL(url); return true; }\n// \u0939\u093f\u0928\u094d\u0926\u0940\n");
    return app;
  };
  const key = join(root, 'synthetic-key.txt'); await writeFile(key, 'AIza' + 'x'.repeat(35));
  let navigationOk = true, calls = [];
  process.env.EXPO_PUBLIC_API_BASE_URL = 'http://127.0.0.1:12345';
  globalThis.fetch = async (url, options) => { calls.push({ url, options }); return { ok: navigationOk }; };
  for (const [label, file] of [['maps-verified', 'maps-test.mjs'], ['navigation-focused', 'navigation-fixture.mjs']]) {
    const sourcePath = 'tools/phase9-native/' + file;
    const original = await readFile(sourcePath, 'utf8');
    const report = JSON.parse(await readFile(join(output, 'mutation-' + label + '.json'), 'utf8'));
    assert.equal(report.files[sourcePath].source, original);
    const survivors = report.files[sourcePath].mutants.filter(m => m.status === 'Survived');
    assert.equal(survivors.length, file === 'maps-test.mjs' ? 1 : 2);
    await writeFile(join(root, 'baseline-' + file), original);
    const baseline = await import(pathToFileURL(join(root, 'baseline-' + file)).href);
    const baseApp = await fixture('baseline-' + label);
    const apply = (module, app) => file === 'maps-test.mjs' ? module.configureNativeMaps(app, key, repo) : module.stageNavigationFixture(app, repo);
    const metadata = await apply(baseline, baseApp);
    for (const mutant of survivors) {
      const { start, end } = mutant.location, lines = original.split('\n');
      assert.equal(start.line, end.line); assert.equal(mutant.replacement, '""');
      const line = lines[start.line - 1], removed = line.slice(start.column - 1, end.column - 1);
      const comment = removed === "'// External native navigation is recorded by the explicit isolated provider.'";
      assert.ok(removed === "'utf8'" || comment);
      lines[start.line - 1] = line.slice(0, start.column - 1) + mutant.replacement + line.slice(end.column - 1);
      const variant = join(root, 'variant-' + label + '-' + mutant.id + '.mjs'); await writeFile(variant, lines.join('\n'));
      const module = await import(pathToFileURL(variant).href), app = await fixture('app-' + label + '-' + mutant.id);
      assert.deepEqual(await apply(module, app), metadata);
      if (file === 'maps-test.mjs') {
        for (const path of ['android/app/src/main/AndroidManifest.xml', 'android/app/src/main/res/xml/phase9_network.xml']) {
          assert.deepEqual(await readFile(join(app, path)), await readFile(join(baseApp, path)));
        }
      } else {
        const generated = await readFile(join(app, 'src/lib/navigation.ts'), 'utf8');
        const base = await readFile(join(baseApp, 'src/lib/navigation.ts'), 'utf8');
        assert.equal(generated, comment ? base.replace('// External native navigation is recorded by the explicit isolated provider.', '') : base);
        for (const source of [base, generated]) {
          calls = []; navigationOk = true;
          const runtime = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
          assert.equal(await runtime.openDriverNavigation('synthetic-url'), true);
          navigationOk = false;
          await assert.rejects(runtime.openDriverNavigation('synthetic-url'), { message: 'Isolated navigation intent rejected' });
          assert.deepEqual(calls, Array.from({ length: 2 }, () => ({ url: 'http://127.0.0.1:12345/phase9-navigation-intent', options: {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"url":"synthetic-url"}' } })));
        }
      }
      results.push({ file: sourcePath, location: mutant.location, mutatorName: mutant.mutatorName, replacement: mutant.replacement,
        sourceSha256: createHash('sha256').update(original).digest('hex'), status: 'REVIEWED_EQUIVALENT',
        reason: comment ? 'The replacement removes only an explanatory comment. The native import remains stripped and runtime transport is identical.' : 'Buffer coercion gives identical UTF-8 JSON decoding.',
        witness: comment ? 'Generated baseline/variant modules execute identical success and rejection paths with exact request bodies.' : 'Multibyte filesystem JSON inputs produce identical metadata and generated bytes.' });
    }
  }
  await writeFile(join(output, 'reviewed-staging-equivalences.json'), JSON.stringify({ results }, null, 2));
  console.log('Staging equivalences: ' + results.length + '/3 PASS');
} finally {
  globalThis.fetch = originalFetch;
  if (previousBase === undefined) delete process.env.EXPO_PUBLIC_API_BASE_URL; else process.env.EXPO_PUBLIC_API_BASE_URL = previousBase;
  assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep + 'rcs-phase9-staging-equivalence-'));
  await rm(root, { recursive: true, force: true });
}
