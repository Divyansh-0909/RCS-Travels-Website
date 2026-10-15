import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createBrowserHarness } from '../helpers/phase9BrowserHarness.js';
import { createNativeSession } from './phase9NativeSession.mjs';
import { runCaptainJourney } from './phase9CaptainJourney.mjs';
import { replaySourceHashes, V5_HASH } from '../helpers/phase9ReplayContract.js';
import { hash } from '../../../tools/phase9-native/stage.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const run = new Date().toISOString().replace(/[^0-9]/g, '') + '-' + randomUUID();
const output = join(root, 'output/phase9-cross-application-2026-10-11', run);
await mkdir(output, { recursive: true });
const harness = await createBrowserHarness();
const sources = await replaySourceHashes();
const actions = [];
let native;
try {
  // The partner replacement is first offered only after the RCS offer resolves.
  // Existing withdrawn offers remain terminal; do not rewrite them to make a retry pass.
  const initial = { booking: await harness.lifecycle.booking(), drivers: await harness.db.driver.findMany(),
    wallets: await harness.db.walletEntry.findMany(), provider: harness.lifecycle.provider.snapshot() };
  native = await createNativeSession(harness, output, { acceptanceFault: 'after', restoreAwake: process.env.PHASE9_KEEP_AWAKE !== '1' });
  await native.maestro('permission-boundary', '- tapOn:\n    text: "Not now"\n    optional: true\n- tapOn:\n    text: "Not now"\n    optional: true\n');
  assert.equal((await harness.lifecycle.deliver()).status, 200);
  assert.equal((await harness.lifecycle.deliver()).status, 200);
  const { incident, shadow } = await runCaptainJourney({ harness, native, actions });
  const receipt = { schema: 'rcs-phase9-expanded-native-v1', run, status: 'PASS', frozenV5: V5_HASH,
    initial, actions, sources, build: native.build, stagedSources: native.stagedSources,
    executorSha256: hash(await readFile(fileURLToPath(import.meta.url))),
    requests: native.gateway.requests, faults: native.gateway.faults, incident, shadow,
    booking: await harness.lifecycle.booking(), drivers: await harness.db.driver.findMany(),
    wallets: await harness.db.walletEntry.findMany(), provider: harness.lifecycle.provider.snapshot(),
    boundary: 'Native actors executed on one physical phone in separate synthetic sessions; booking creation remains service setup' };
  await writeFile(join(output, 'receipt.json'), JSON.stringify({ ...receipt, integrity: hash(JSON.stringify(receipt)) }, null, 2));
  console.log('Expanded native PASS: ' + run);
} catch (error) {
  await writeFile(join(output, 'failure.json'), JSON.stringify({ run, error: error.message, actions,
    requests: native?.gateway.requests ?? [], faults: native?.gateway.faults ?? [], sources,
    stagedSources: native?.stagedSources ?? null, booking: await harness.lifecycle.booking(),
    wallets: await harness.db.walletEntry.findMany() }, null, 2));
  throw error;
} finally {
  await native?.close();
  await harness.close();
}
