import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { parse as parseEnv } from 'dotenv';
import { durableJson } from '../benchmarks/search/decisionComparison/executorEvidence.js';
import { buildAmendment, verifyAmendment, authorizationTemplate, authorize, DIRECTORY, workspaceRoot } from '../benchmarks/search/s5Executor/registration.js';
import { createLiveTransport } from '../benchmarks/search/s5Executor/transports.js';
import { runS5Phase } from '../benchmarks/search/s5Executor/executor.js';

const root = fileURLToPath(workspaceRoot), directory = join(root, DIRECTORY);
async function load() { return JSON.parse(await readFile(join(directory, 'execution-amendment-v1.json'), 'utf8')); }
async function prepare() {
  const amendment = await buildAmendment();
  await mkdir(directory, { recursive: true });
  await durableJson(join(directory, 'execution-amendment-v1.json'), amendment);
  for (const phase of ['A', 'B']) await durableJson(join(directory, `phase-${phase.toLowerCase()}-authorization-template.json`), authorizationTemplate(amendment, phase));
  console.log(JSON.stringify({ status: 'OFFLINE_PREPARED', amendmentHash: amendment.amendmentHash, liveAuthorized: false }));
}
async function verify() {
  const amendment = await load(); await verifyAmendment(amendment);
  const receipt = { status: 'VERIFIED_OFFLINE', amendmentHash: amendment.amendmentHash,
    sourceFiles: amendment.sourceManifest.length, phaseA: 'READY_FOR_SEPARATE_LIVE_AUTHORIZATION', phaseB: 'READY_FOR_SEPARATE_LIVE_AUTHORIZATION',
    inferenceCalls: 0, accountMetadataCalls: 0, liveAuthorized: false };
  await durableJson(join(directory, `verification-${Date.now()}.json`), receipt); console.log(JSON.stringify(receipt));
}
async function live(args) {
  const phase = args.find(value => value.startsWith('--phase='))?.slice(8);
  const expected = args.find(value => value.startsWith('--expected-amendment='))?.slice(21);
  const authorizationFile = args.find(value => value.startsWith('--authorization='))?.slice(16);
  const amendment = await load();
  if (!['A', 'B'].includes(phase) || expected !== amendment.amendmentHash || !authorizationFile) throw new Error('LIVE_BINDING_REQUIRED');
  await verifyAmendment(amendment);
  const authorization = JSON.parse(await readFile(resolve(authorizationFile), 'utf8'));
  authorize(amendment, authorization, phase, Date.now());
  // No credentials are read until the exact source, amendment and independent
  // phase authorization have passed. Do not log configuration or provider text.
  let local = {};
  try { local = parseEnv(await readFile(join(root, 'backend/.env'))); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const transport = createLiveTransport(phase, { ...local, ...process.env });
  const controller = new AbortController(), interrupt = () => controller.abort();
  process.once('SIGINT', interrupt); process.once('SIGTERM', interrupt);
  try {
    const result = await runS5Phase({ amendment, authorization, phase, transport, signal: controller.signal });
    console.log(JSON.stringify({ status: result.status, phase, stopReason: result.stopReason,
      dispatchedCalls: result.budget.dispatched, receiptCommitted: result.receiptCommitted }));
    if (result.status !== 'COMPLETE' || !result.receiptCommitted) process.exitCode = 1;
  } finally { process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt); }
}
try {
  const args = process.argv.slice(2), mode = args[0];
  const valid = args.every(value => ['--prepare', '--verify', '--live'].includes(value)
    || value.startsWith('--phase=') || value.startsWith('--expected-amendment=') || value.startsWith('--authorization='));
  if (!valid || new Set(args.map(value => value.split('=')[0])).size !== args.length
    || args.filter(value => ['--prepare', '--verify', '--live'].includes(value)).length !== 1
    || mode !== '--live' && args.length !== 1) throw new Error('INVALID_ARGUMENTS');
  if (mode === '--prepare') await prepare();
  else if (mode === '--verify') await verify();
  else if (mode === '--live') await live(args);
  else throw new Error('INVALID_ARGUMENTS');
} catch (error) {
  console.error(JSON.stringify({ status: 'REFUSED_OR_STOPPED', category: error.category ?? 'EXECUTOR_CONFIGURATION_OR_EVIDENCE_ERROR' }));
  process.exitCode = 1;
}
