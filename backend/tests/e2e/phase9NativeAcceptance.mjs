import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { createBrowserHarness } from '../helpers/phase9BrowserHarness.js';
import { createNativeSession } from './phase9NativeSession.mjs';
import { verifyNativeAcceptance } from '../helpers/phase9NativeAcceptanceFlow.mjs';
import { hash } from '../../../tools/phase9-native/stage.mjs';

assert.equal(process.env.PHASE9_ISOLATED, '1');
const theme = process.env.PHASE9_NATIVE_THEME;
assert.ok(['light', 'dark'].includes(theme));
const sourceHash = hash(await readFile(fileURLToPath(import.meta.url)));
const run = new Date().toISOString().replace(/[^0-9]/g, '') + '-' + randomUUID();
const output = fileURLToPath(new URL('../../../output/phase9-native-device-2026-10-10/' + run + '/', import.meta.url));
await mkdir(output, { recursive: true });
const harness = await createBrowserHarness();
let native;
try {
  native = await createNativeSession(harness, output, { acceptanceFault: 'before', restoreAwake: process.env.PHASE9_KEEP_AWAKE !== '1' });
  await native.maestro('dismiss-optional-permission-prompts', '- tapOn:\n    text: "Not now"\n    optional: true\n- tapOn:\n    text: "Not now"\n    optional: true\n');
  const result = await verifyNativeAcceptance(harness, native, output, { theme });
  assert.equal(hash(await readFile(fileURLToPath(import.meta.url))), sourceHash);
  const receipt = { author: 'CODEX', phase: 'P02', run, status: 'PASS', theme,
    scope: 'Physical Android controlled acceptance 503, visible error, real panel expiry, retained Notifications offer and retry/assignment',
    package: 'com.rcstravels.driver.phase9', apkSha256: native.build.apkSha256, sourceHash,
    stagedSources: native.stagedSources, requests: native.gateway.requests, faults: native.gateway.faults,
    assigned: { status: result.assigned.status, correctDriver: result.assigned.driverId === harness.actors.captain.id },
    walletBalance: result.owner.walletBalance, productionTouched: false };
  await writeFile(join(output, 'receipt.json'), JSON.stringify(receipt, null, 2));
  console.log(`P02 NATIVE ACCEPTANCE PASS: ${run} (${theme})`);
} catch (error) {
  await writeFile(join(output, 'failure.json'), JSON.stringify({ run, theme, error: error.message,
    requests: native?.gateway.requests, faults: native?.gateway.faults }, null, 2));
  throw error;
} finally { await native?.close(); await harness.close(); }
