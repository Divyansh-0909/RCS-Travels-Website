import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createBrowserHarness } from '../helpers/phase9BrowserHarness.js';
import { createNativeSession } from './phase9NativeSession.mjs';
import { phase9UiSourceHashes } from '../helpers/phase9UiSources.js';

const output = join(process.env.PHASE9_UI_OUTPUT, 'native-' + Date.now() + '-' + randomUUID());
await mkdir(output, { recursive: true });
const harness = await createBrowserHarness();
const { phase9FinancialSnapshot } = await import('../helpers/phase9Lifecycle.js');
let native;
const record = { status: 'RUNNING', groups: [], sources: await phase9UiSourceHashes([
  'backend/middleware/liveSession.js', 'backend/tests/helpers/liveSessionFake.js', 'backend/tests/e2e/sessionRevocationNative.mjs',
  'shared/auth/signOutCurrentSession.mjs', 'driver-app/src/hooks/useApi.js', 'backend/tests/e2e/phase9NativeSession.mjs']) };
try {
  native = await createNativeSession(harness, output, { acceptanceFault: false, restoreAwake: false });
  const before = await phase9FinancialSnapshot(harness.db);
  const originalId = 'sess_' + harness.actors.captain.id;
  assert(native.gateway.requests.some(row => row.path === '/api/driver/me' && row.status === 200));
  harness.liveSessions.sessions.get(originalId).status = 'revoked';
  const start = native.gateway.requests.length;
  await native.device.adb('shell', 'am', 'force-stop', '--user', '0', native.build.package);
  await native.device.adb('shell', 'am', 'start', '--user', '0', '-n', native.build.package + '/com.rcstravels.driver.MainActivity',
    '-a', 'android.intent.action.VIEW', '-d', native.launchUrl);
  await native.untilState(() => native.gateway.requests.slice(start).some(row => row.path === '/api/driver/me' && row.status === 401), 'revoked native reconnect rejected');
  assert(!native.gateway.requests.slice(start).some(row => row.path === '/api/driver/me' && row.status === 200));
  await native.maestro('revoked-reconnect', '- takeScreenshot: revoked-native-session\n');
  record.groups.push('Physical native process reconnect with still-signed old session receives 401');
  const newId = 'sess_native_new_' + randomUUID();
  harness.actors.captain.sessionId = newId;
  harness.liveSessions.sessions.set(newId, { id: newId, userId: harness.actors.captain.clerkId, status: 'active' });
  await native.reopen();
  assert(harness.liveSessions.calls.includes(newId));
  await native.maestro('active-reconnect', '- takeScreenshot: new-native-session\n');
  record.groups.push('Physical native SDK loads a new active matching session and protected profile succeeds');
  assert.equal(harness.liveSessions.sessions.get(originalId).status, 'revoked');
  assert.deepEqual(await phase9FinancialSnapshot(harness.db), before);
  record.status = 'PASS'; record.unchangedFinancialState = true;
} catch (error) { record.status = 'FAILED'; record.error = error.message; process.exitCode = 1; }
finally {
  record.native = native && { build: native.build, stagedSources: native.stagedSources, requests: native.gateway.requests };
  record.boundary = 'Physical Samsung Android, real Expo Clerk SDK and signed synthetic JWTs, deterministic backend provider session state. No live provider credential or real device location data.';
  await writeFile(join(output, 'report.json'), JSON.stringify(record, null, 2));
  await native?.close(); await harness.close();
  console.log(JSON.stringify({ output, status: record.status, groups: record.groups.length }));
}
