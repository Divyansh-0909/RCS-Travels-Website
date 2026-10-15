import assert from 'node:assert/strict';
import { readFile, writeFile, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { assertOutsideRepository } from './maps-test.mjs';
import { TEST_PACKAGE } from './stage.mjs';

// This substitutes the external navigation launch only in an owned test copy.
// Native SDK tiles remain live; no installed maps application is opened.
export async function stageNavigationFixture(app, repository) {
  const [appPath, repoPath] = await Promise.all([realpath(app), realpath(repository)]);
  assertOutsideRepository(repoPath, appPath);
  assert.equal(JSON.parse(await readFile(join(appPath, 'app.json'), 'utf8')).expo.android.package, TEST_PACKAGE);
  const module = join(appPath, 'src/lib/navigation.ts');
  const original = await readFile(module, 'utf8');
  assert.ok(original.includes('await Linking.openURL(url);'));
  const replacement = `const reply = await fetch(process.env.EXPO_PUBLIC_API_BASE_URL + '/phase9-navigation-intent', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url }) });
  if (!reply.ok) throw new Error('Isolated navigation intent rejected');`;
  await writeFile(module, original.replace('await Linking.openURL(url);', replacement)
    .replace("import { Linking } from 'react-native';", '// External native navigation is recorded by the explicit isolated provider.'));
  return { externalNavigation: 'SYNTHETIC_INTENT_ONLY', liveDirectionsRequested: false };
}
