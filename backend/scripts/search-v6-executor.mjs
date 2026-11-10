import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { parse as parseEnv } from 'dotenv';
import { buildAmendment, loadExecution, readJson, sha256, authorizeExecution, EXECUTOR_DIR, ENVELOPE } from '../benchmarks/search/decisionComparison/executorRegistration.js';
import { durableJson } from '../benchmarks/search/decisionComparison/executorEvidence.js';
import { runV6Execution } from '../benchmarks/search/decisionComparison/executor.js';
import { createHttpTransport } from '../benchmarks/search/decisionComparison/adapters.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const directory = join(root, EXECUTOR_DIR);
async function prepare() {
  const amendment = await buildAmendment(root);
  await durableJson(join(directory, 'execution-amendment-v1.json'), amendment);
  await durableJson(join(directory, 'owner-authorization-template.json'), {
    liveAuthorized: false, planHash: amendment.parentPlanHash, amendmentHash: amendment.amendmentHash,
    ownerReply: '', receiptReference: '', issuedAt: null, expiresAt: null, envelope: ENVELOPE,
    note: 'Template only. Separate owner instruction must authorize live Jev/Clef execution and this spending envelope. Save its actual receipt as a NEW owner-live-authorization.json file.',
  });
  console.log(JSON.stringify({ status: 'OFFLINE_PREPARED', amendmentHash: amendment.amendmentHash, liveAuthorized: false }));
}
async function verify() {
  const bundle = await loadExecution(root);
  const baseline = await readJson(root, `${EXECUTOR_DIR}/baseline.json`), changed = [];
  for (const row of baseline.protectedFiles) if (sha256(await readFile(join(root, row.file))) !== row.sha256) changed.push(row.file);
  const report = { checkedAt: new Date().toISOString(), planHash: bundle.plan.planHash, amendmentHash: bundle.amendment.amendmentHash,
    protectedFilesChecked: baseline.protectedFiles.length, protectedChanges: changed, registeredSources: bundle.amendment.sourceManifest.length,
    headUnchanged: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim() === baseline.head,
    stagedIdentityUnchanged: sha256(execFileSync('git', ['diff', '--cached', '--raw'], { cwd: root })) === baseline.stagedIdentity,
    liveAuthorized: false, providerInferenceCalls: 0, accountMetadataCalls: 0 };
  await durableJson(join(directory, `verification-${Date.now()}.json`), report);
  console.log(JSON.stringify(report));
  if (changed.length || !report.headUnchanged || !report.stagedIdentityUnchanged) process.exitCode = 1;
}
async function live(args) {
  const bundle = await loadExecution(root);
  const authorizationPath = args.find(arg => arg.startsWith('--authorization='))?.slice('--authorization='.length);
  const expectedHash = args.find(arg => arg.startsWith('--expected-amendment='))?.slice('--expected-amendment='.length);
  if (!authorizationPath || expectedHash !== bundle.amendment.amendmentHash) throw new Error('LIVE_ACTIVATION_BINDING_REQUIRED');
  const receipt = JSON.parse(await readFile(resolve(authorizationPath), 'utf8'));
  authorizeExecution(bundle.amendment, receipt);
  // Credentials are read only after all identities and separate authorization pass.
  let local = {};
  try { local = parseEnv(await readFile(join(root, 'backend/.env'))); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const env = { ...local, ...process.env };
  const transports = {
    jev: createHttpTransport('jev', { apiKey: env.TYPESAFE_API_KEY }),
    clef: createHttpTransport('clef', { apiKey: env.CLOUDFLARE_API_TOKEN ?? env.CLOUDFLARE_AUTH_TOKEN, accountId: env.CLOUDFLARE_ACCOUNT_ID }),
  };
  const controller = new AbortController(), interrupt = () => controller.abort();
  process.once('SIGINT', interrupt); process.once('SIGTERM', interrupt);
  try {
    const result = await runV6Execution({ root, authorization: receipt, transports, signal: controller.signal });
    console.log(JSON.stringify({ status: result.status, stopReason: result.stopReason, dispatchedCalls: result.dispatchedCalls }));
    if (result.status !== 'COMPLETE') process.exitCode = 1;
  } finally { process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt); }
}
try {
  const args = process.argv.slice(2), mode = args[0];
  const valid = args.every(arg => ['--prepare', '--verify', '--live'].includes(arg)
    || arg.startsWith('--authorization=') || arg.startsWith('--expected-amendment='));
  if (!valid || args.filter(arg => ['--prepare', '--verify', '--live'].includes(arg)).length !== 1) throw new Error('INVALID_EXECUTOR_ARGUMENTS');
  if (mode === '--prepare') await prepare();
  else if (mode === '--verify') await verify();
  else if (mode === '--live') await live(args);
  else throw new Error('INVALID_EXECUTOR_ARGUMENTS');
} catch (error) {
  // Never print environment, provider text, credential values or arbitrary error messages.
  console.error(JSON.stringify({ status: 'REFUSED_OR_STOPPED', category: error.category ?? 'EXECUTOR_CONFIGURATION_OR_EVIDENCE_ERROR' }));
  process.exitCode = 1;
}
