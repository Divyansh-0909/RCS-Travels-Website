// Persistent developer preview, launched only through the isolated PostGIS runner.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createBrowserHarness } from '../helpers/phase9BrowserHarness.js';
import { createNativeSession } from './phase9NativeSession.mjs';
import { atomicJson } from '../../../tools/handoff/core.mjs';
import { nativePreviewHealth } from '../helpers/phase9NativePreviewHealth.mjs';
assert.equal(process.env.PHASE9_ISOLATED, '1');
const root = fileURLToPath(new URL('../../../', import.meta.url));
const runtime = path.join(root, 'output/handoff');
const output = path.join(runtime, 'native-preview-session'); fs.mkdirSync(output, { recursive: true });
const record = path.join(runtime, 'native-fixture.json'), stopFile = path.join(runtime, 'native-preview-stop');
if (fs.existsSync(stopFile)) fs.unlinkSync(stopFile);
const update = value => atomicJson(record, { at: new Date().toISOString(), pid: process.pid, package: 'com.rcstravels.driver.phase9', ...value });
let stopping = false, native, harness;
process.on('SIGINT', () => { stopping = true; }); process.on('SIGTERM', () => { stopping = true; });
update({ active: false, stage: 'STARTING ISOLATED FIXTURE' });
try {
  harness = await createBrowserHarness();
  native = await createNativeSession(harness, output, { restoreAwake: false });
  await native.maestro('review-ready', '- tapOn:\n    text: "Not now"\n    optional: true\n- tapOn:\n    text: "Not now"\n    optional: true\n- extendedWaitUntil:\n    visible: "No ride scheduled"\n    timeout: 45000\n');
  while (!stopping && !fs.existsSync(stopFile)) {
    let healthy = false;
    let restoredForwards = 0;
    try { ({ healthy, restoredForwards } = await nativePreviewHealth(native)); } catch {}
    update({ active: healthy, stage: healthy ? 'READY — SYNTHETIC IDLE CAPTAIN' : 'LOCAL TRANSPORT UNAVAILABLE', restoredForwards,
      apkSha256: native.build.apkSha256, scope: 'Local test package and disposable database; no production actions',
      interaction: 'Physical phone; browser VIEW-ONLY' });
    await new Promise(resolve => setTimeout(resolve, 2500));
  }
} catch (error) {
  update({ active: false, stage: 'FIXTURE FAILED', reason: 'Inspect local native-preview logs; no production fallback' });
  throw error;
} finally {
  update({ active: false, stage: 'FIXTURE STOPPED' });
  await native?.close(); await harness?.close();
}
