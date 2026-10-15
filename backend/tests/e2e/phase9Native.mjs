import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { createBrowserHarness } from '../helpers/phase9BrowserHarness.js';
import { createNativeSession } from './phase9NativeSession.mjs';
import { replaySourceHashes, V5_HASH } from '../helpers/phase9ReplayContract.js';
import { hash } from '../../../tools/phase9-native/stage.mjs';

const repository = fileURLToPath(new URL('../../../', import.meta.url));
const executorSource = hash(await readFile(fileURLToPath(import.meta.url)));
const evidence = join(repository, 'output/phase9-native-device-2026-10-10');
const run = new Date().toISOString().replace(/[^0-9]/g, '') + '-' + randomUUID();
const output = join(evidence, run);
await mkdir(output, { recursive: true });
const harness = await createBrowserHarness();
const sources = await replaySourceHashes();
const actions = [];
let native, gateway, build, installation, stagedSources, runtimeApp;
const maestro = (...args) => native.maestro(...args);
const untilState = (...args) => native.untilState(...args);
try {
  const initial = { booking: await harness.lifecycle.booking(), wallets: await harness.db.walletEntry.findMany(),
    provider: harness.lifecycle.provider.snapshot() };
  native = await createNativeSession(harness, output, { acceptanceFault: 'before', restoreAwake: process.env.PHASE9_KEEP_AWAKE !== '1' });
  ({ gateway, build, installation, stagedSources } = native);
  runtimeApp = JSON.parse(await readFile(join(output, 'native-source-identities.json'), 'utf8')).runtimeApp;
  actions.push({ actor: 'native captain', action: 'actual Clerk synthetic session restoration and protected profile', status: 'PASS' });
  await maestro('dismiss-optional-permission-prompts',`- tapOn:\n    text: "Not now"\n    optional: true\n- tapOn:\n    text: "Not now"\n    optional: true\n`);
  assert.equal((await harness.lifecycle.deliver()).status,200);
  assert.equal((await harness.lifecycle.deliver()).status,200);
  await harness.lifecycle.offer();
  const booking = await harness.lifecycle.booking();
  const acceptFlow = `- extendedWaitUntil:\n    visible: "Accept"\n    timeout: 90000\n- tapOn:\n    text: "Accept"\n    waitToSettleTimeoutMs: 500\n- assertVisible: "Controlled acceptance outage. Please retry."\n- takeScreenshot: acceptance-failure\n- extendedWaitUntil:\n    notVisible: "Swipe away to hide, it stays in Notifications"\n    timeout: 45000\n- tapOn:\n    text: "Notifications"\n    waitToSettleTimeoutMs: 500\n- assertVisible: "Notifications"\n- assertVisible: "Accept"\n- tapOn:\n    text: "Accept"\n    waitToSettleTimeoutMs: 500\n- extendedWaitUntil:\n    visible: "Contact the rider"\n    timeout: 30000\n- takeScreenshot: accepted\n`;
  await maestro('accept-failure-and-retry',acceptFlow);
  const assigned = await harness.lifecycle.booking();
  assert.equal(assigned.driverId,harness.actors.captain.id);
  assert.equal(assigned.status,'assigned');
  assert.equal(gateway.faults.length,1);
  assert.equal(gateway.faults[0].driverAssigned,false);
  assert.equal(gateway.faults[0].walletBalance,1000);
  const owner = await harness.db.driver.findUniqueOrThrow({ where: { id: harness.actors.captain.id } });
  assert.equal(owner.walletBalance,900);
  actions.push({ actor: 'native captain', action: 'controlled acceptance failure, native retry, assignment and owner reservation', status: 'PASS' });
  const cancelFlow = `- tapOn: "Close"\n- tapOn: "Back"\n- tapOn: "Ride details"\n- extendedWaitUntil:\n    visible: "Ride details"\n    timeout: 30000\n- assertVisible: "${booking.reference}"\n- takeScreenshot: ride-details\n- scrollUntilVisible:\n    element: "Cancel ride"\n    direction: DOWN\n- tapOn: "Cancel ride"\n- tapOn: "Rider cannot be contacted"\n- tapOn: "Cancel ride"\n`;
  await maestro('cancel',cancelFlow);
  await untilState(async () => (await harness.lifecycle.booking()).driverId === null,'native cancellation committed',30000);
  const incident = await harness.shadow();
  const guarded = await harness.db.responsibilityShadowResult.findFirstOrThrow({ where: { caseId: incident.id } });
  assert.equal(guarded.route,'NEEDS_ADMIN_REVIEW');
  assert.equal(guarded.analysisEnvelope.output.suggestedClassification,'DRIVER_CAUSED');
  const retainedOwner = await harness.db.driver.findUniqueOrThrow({ where: { id: owner.id } });
  assert.equal(retainedOwner.walletBalance,900);
  assert.equal(retainedOwner.vehicleCapacity,4);
  assert.equal(await harness.db.responsibilityFinalDecision.count(),0);
  assert.equal(await harness.db.responsibilityLiability.count(),0);
  assert.equal(await harness.db.reliabilityStrike.count(),0);
  actions.push({ actor: 'native captain', action: 'native cancellation, retained owner hold, immutable incident and guarded offline analysis', status: 'PASS' });
  const receipt = { schema: 'rcs-phase9-native-v1', run, status: 'PASS', build: { run: build.run, package: build.package, apkSha256: build.apkSha256 },
    device: JSON.parse((await readFile(join(evidence,'device-preflight.json'),'utf8')).replace(/^\uFEFF/,'')),
    initial, actions, requests: gateway.requests, faults: gateway.faults, booking: await harness.lifecycle.booking(),
    case: incident, shadow: await harness.db.responsibilityShadowResult.findMany(), wallets: await harness.db.walletEntry.findMany(),
    provider: harness.lifecycle.provider.snapshot(), frozenV5: V5_HASH, sources, stagedSources, runtimeApp, installation,
    scope: 'Physical native acceptance failure, panel expiry, durable Notifications retry and cancellation; synthetic restored Clerk session; fixture booking/payment setup',
    executorSource,
    replay: 'Native recipe re-execution; not exact saved-input UI or backend replay' };
  assert.equal(hash(await readFile(fileURLToPath(import.meta.url))),executorSource,'Native executor changed during execution');
  receipt.integrity = hash(JSON.stringify(receipt));
  await writeFile(join(output,'receipt.json'),JSON.stringify(receipt,null,2));
  console.log(`NATIVE PASS: ${run}`);
} catch (error) {
  await writeFile(join(output,'failure.json'),JSON.stringify({ run, error: error.message, actions, requests: gateway?.requests ?? [],
    faults: gateway?.faults ?? [], booking: await harness.lifecycle.booking(), sources, stagedSources, build: build?.apkSha256 ?? null },null,2));
  throw error;
} finally {
  await native?.close();
  await harness.close();
}
