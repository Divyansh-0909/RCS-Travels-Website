import { readFile, readdir } from 'node:fs/promises';
import { loadExecution as loadParent, readJson, workspacePath, sha256, requestKey, ENVELOPE } from './executorRegistration.js';
import { identityHash } from './adapters.js';
export { authorizeExecution, verifySources, requestKey, ENVELOPE } from './executorRegistration.js';

export const EXECUTOR_DIR = 'output/search-v1-v6-retry-2026-11-03';
const PARENT_DIR = 'output/search-v1-v6-executor-2026-11-02/activation';
const EXTRA_FILES = ['backend/benchmarks/search/decisionComparison/executorRetry.js',
  'backend/benchmarks/search/decisionComparison/executorRetryRegistration.js',
  'backend/scripts/search-v6-retry.mjs', 'backend/tests/rideSearchV6Retry.test.js'];
async function parentEvidence(root) {
  const rows = [];
  async function visit(directory) {
    for (const entry of await readdir(workspacePath(root, directory), { withFileTypes: true })) {
      const file = `${directory}/${entry.name}`;
      if (entry.isDirectory()) await visit(file);
      else rows.push({ file, sha256: sha256(await readFile(workspacePath(root, file))) });
    }
  }
  await visit(PARENT_DIR);
  return rows.sort((a, b) => a.file.localeCompare(b.file));
}
function verifyPriorResponse(base, row) {
  const expected = base.requestIndex.get(requestKey(row.provider, row.caseId, row.stage));
  if (row.provider !== 'jev' || row.error || !row.normalized || !row.normalized.metadata.usage
    || row.normalized.metadata.model !== 'jev-1.14.0' || row.requestIdentity !== expected?.requestIdentity
    || identityHash(row.request) !== expected.wireHash) throw new Error('RETRY_PARENT_RESPONSE_DRIFT');
}
function verifyCompletedPrefix(base, terminal) {
  if (terminal.status !== 'STOPPED' || terminal.stopReason !== 'THROTTLE_CLOCK_FAILURE' || terminal.synthetic
    || terminal.dispatchedCalls !== 6 || terminal.unresolvedIntent !== null || terminal.cases.length !== 2
    || terminal.observations.length !== 6) throw new Error('RETRY_PARENT_NOT_ELIGIBLE');
  for (const [index, row] of terminal.cases.entries()) if (row.provider !== 'jev'
    || row.caseId !== base.inputs[index].caseId || !row.parserResult) throw new Error('RETRY_PREFIX_DRIFT');
  for (const row of terminal.observations) verifyPriorResponse(base, row);
  if (terminal.providers.clef.economics.all.attempts !== 0
    || terminal.providers.jev.economics.all.completeTariffUsd === null) throw new Error('RETRY_PARENT_USAGE_UNKNOWN');
}
export async function buildAmendment(root) {
  const parent = await loadParent(root);
  const terminal = await readJson(root, `${PARENT_DIR}/terminal.json`);
  verifyCompletedPrefix(parent, terminal);
  const extra = await Promise.all(EXTRA_FILES.map(async file => ({ file, sha256: sha256(await readFile(workspacePath(root, file))) })));
  const content = { version: 'search-v6-executor-amendment-v2-deadline-wait', parentPlanHash: parent.plan.planHash,
    predecessorAmendmentHash: parent.amendment.amendmentHash, contract: parent.plan.contract,
    inputArtifactHash: parent.plan.inputArtifactHash, labelArtifactHash: parent.plan.labelArtifactHash,
    pipelineLabelArtifactHash: parent.plan.pipelineLabelArtifactHash, requestManifestHash: parent.plan.requestManifestHash,
    envelope: ENVELOPE, liveAuthorized: false, sourceManifest: [...parent.amendment.sourceManifest, ...extra],
    parentEvidence: await parentEvidence(root), completedPrefix: terminal.cases.map(row => ({ provider: row.provider, caseId: row.caseId })),
    carryForward: { jevRequests: 6, jevTariffUsd: terminal.providers.jev.economics.all.completeTariffUsd,
      clefRequests: 0, remainingMaxRequests: 138, remainingJevMaxRequests: 66, remainingClefMaxRequests: 72 },
    scheduler: 'Recompute monotonic deadline after each rounded-up sleep; maximum eight wakes; never send before deadline.',
    continuation: 'Skip only the two fully persisted Jev cases. Seed ledger and scoring with the six exact prior responses; no inference replay.' };
  return { ...content, amendmentHash: identityHash(content) };
}
export async function loadExecution(root, provided) {
  const parent = await loadParent(root);
  const amendment = structuredClone(provided ?? await readJson(root, `${EXECUTOR_DIR}/execution-amendment-v2.json`));
  const expected = await buildAmendment(root);
  if (identityHash(amendment) !== identityHash(expected)) throw new Error('RETRY_AMENDMENT_OR_PARENT_DRIFT');
  const inheritedTerminal = await readJson(root, `${PARENT_DIR}/terminal.json`);
  return { ...parent, amendment, inheritedTerminal };
}
