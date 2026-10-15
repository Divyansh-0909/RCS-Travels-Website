import assert from 'node:assert/strict';
import { readFile, writeFile, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { assertOutsideRepository } from './maps-test.mjs';
import { TEST_PACKAGE } from './stage.mjs';

export async function stageSyntheticLocation(app, repository) {
  const [appPath, repoPath] = await Promise.all([realpath(app), realpath(repository)]);
  assertOutsideRepository(repoPath, appPath);
  assert.equal(JSON.parse(await readFile(join(appPath, 'app.json'), 'utf8')).expo.android.package, TEST_PACKAGE);
  await writeFile(join(appPath, 'phase9-location-core.mjs'), await readFile(new URL('./synthetic-location-core.mjs', import.meta.url)));
  await writeFile(join(appPath, 'phase9-location.js'), `import * as Native from 'expo-location';
import { createSyntheticLocation } from './phase9-location-core.mjs';
const fixtureUrl = process.env.EXPO_PUBLIC_API_BASE_URL + '/phase9-synthetic-location';
if (!__DEV__ || !/^http:\\/\\/127\\.0\\.0\\.1:\\d+\\/phase9-synthetic-location$/.test(fixtureUrl)) throw new Error('Synthetic GPS requires isolated loopback');
export const Accuracy = Native.Accuracy;
export const ActivityType = Native.ActivityType;
export const getForegroundPermissionsAsync = Native.getForegroundPermissionsAsync;
export const requestForegroundPermissionsAsync = Native.requestForegroundPermissionsAsync;
export const getBackgroundPermissionsAsync = Native.getBackgroundPermissionsAsync;
export const requestBackgroundPermissionsAsync = async () => ({ granted: false, status: 'denied', canAskAgain: false, expires: 'never' });
const fixture = createSyntheticLocation({ permission: getForegroundPermissionsAsync,
  read: async () => { const response = await fetch(fixtureUrl); if (!response.ok) throw new Error('GPS fixture transport unavailable'); return response.json(); } });
export const { getCurrentPositionAsync, getLastKnownPositionAsync, watchPositionAsync,
  hasStartedLocationUpdatesAsync, startLocationUpdatesAsync, stopLocationUpdatesAsync } = fixture;
`);
  const metro = join(appPath, 'metro.config.js');
  const code = await readFile(metro, 'utf8');
  assert.ok(!code.includes('RCS_PHASE9_SYNTHETIC_LOCATION'));
  await writeFile(metro, code + `
// RCS_PHASE9_SYNTHETIC_LOCATION: permission UI is real; every position source is synthetic.
const phase9LocationFile = require('node:path').join(__dirname, 'phase9-location.js');
const phase9PreviousResolve = module.exports.resolver.resolveRequest;
module.exports.resolver.resolveRequest = (context, name, platform) => {
  if (name === 'expo-location' && context.originModulePath !== phase9LocationFile) return { type: 'sourceFile', filePath: phase9LocationFile };
  return phase9PreviousResolve ? phase9PreviousResolve(context, name, platform) : context.resolveRequest(context, name, platform);
};
`);
  return { mode: 'synthetic-only-positions-real-foreground-permission', backgroundCollection: 'DISABLED', ownerGpsCollected: false };
}
