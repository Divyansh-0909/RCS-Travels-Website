import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { alignedTasks } from '../benchmarks/search/decisionComparison/alignedContract.js';
import { identityHash, buildWireRequest, PROVIDERS } from '../benchmarks/search/decisionComparison/adapters.js';
import { SEARCH_QUESTION_CONTRACT_VERSION } from '../services/search/questions.ts';

export const OWNER_SIMPLE_CONTRACT = 'search-decision-common-v6-owner-simple';
export const OWNER_SIMPLE_DECISIONS = Object.freeze([
  { id: 'RENTAL_ROUTING', caseIds: ['hh-v1-added-007'], complexity: 'SIMPLE' },
  { id: 'VEHICLE_AVAILABILITY_ROUTING', caseIds: ['hh-v1-added-004', 'hh-v1-added-033'], complexity: 'SIMPLE' },
]);
const root = new URL('../../', import.meta.url);
const parentDir = new URL('output/search-v1-decision-contract-alignment-2026-11-02/', root);
const out = new URL('output/search-v1-owner-simple-policy-2026-11-02/', root);
const policyFile = 'docs/search/search-owner-routing-decisions-2026-11-02.md';
const sha256 = data => createHash('sha256').update(data).digest('hex');
const load = async url => JSON.parse(await readFile(url, 'utf8'));
const save = (name, value) => writeFile(new URL(name, out), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });

export function ownerSimpleTasks(input) {
  const tasks = alignedTasks(input);
  const state = JSON.parse(tasks.request.state);
  state.contractVersion = OWNER_SIMPLE_CONTRACT;
  return { ...tasks, request: { ...tasks.request, state: JSON.stringify(state) } };
}

export function resolveOwnerSimpleLabels(rows) {
  const updated = structuredClone(rows);
  for (const decision of OWNER_SIMPLE_DECISIONS) for (const caseId of decision.caseIds) {
    const row = updated.find(value => value.caseId === caseId);
    if (!row || row.labels.complexity !== null || !row.blockedByPolicyDecisions.includes(decision.id)) {
      throw new Error('EXPECTED_MASKED_POLICY_TARGET_NOT_FOUND');
    }
    row.labels.complexity = { allowed: [decision.complexity] };
    row.blockedByPolicyDecisions = row.blockedByPolicyDecisions.filter(id => id !== decision.id);
    row.ownerPolicyDecisionIds = [decision.id];
  }
  return updated;
}

async function register() {
  const baseline = await load(new URL('baseline.json', out));
  const parent = await load(new URL('proposal-v5-final.json', parentDir));
  const inputs = await load(new URL('proposal-v5-final-inputs.json', parentDir));
  const labels = await load(new URL('proposal-v5-final-labels.json', parentDir));
  const proposedInputs = inputs.map(row => ({ ...row, tasks: ownerSimpleTasks(row.input) }));
  const proposedLabels = resolveOwnerSimpleLabels(labels);
  for (const row of proposedInputs) {
    const before = inputs.find(value => value.caseId === row.caseId);
    if (identityHash(row.input) !== identityHash(before.input)
      || identityHash(row.tasks.candidates) !== identityHash(before.tasks.candidates)) throw new Error('INPUT_OR_CANDIDATES_CHANGED');
  }
  const sourcePaths = [...new Set([...parent.sourceManifest.map(row => row.file), policyFile,
    'backend/scripts/search-owner-simple-policy.mjs', 'backend/tests/rideSearchOwnerSimplePolicy.test.js'])].sort();
  const sourceManifest = await Promise.all(sourcePaths.map(async file => ({ file, sha256: sha256(await readFile(new URL(file, root))) })));
  const ownerReceipt = { recordedAt: new Date().toISOString(), answer: 'keep it simple for both',
    scope: 'Resolve R1 and R2 as SIMPLE; no inference authorization.', decisions: OWNER_SIMPLE_DECISIONS,
    policyFile, policySha256: sha256(await readFile(new URL(policyFile, root))), liveAuthorized: false };
  const content = { version: OWNER_SIMPLE_CONTRACT, proposalRevision: 'OWNER_ROUTING_RESOLVED_OFFLINE',
    createdAt: new Date().toISOString(), supersedesProposalHash: parent.proposalHash,
    parentPlanHash: parent.parentPlanHash, productionQuestionContract: SEARCH_QUESTION_CONTRACT_VERSION,
    ownerReceiptHash: identityHash(ownerReceipt), ownerDecisionsRequired: [],
    executable: false, liveAuthorized: false, readyForLive: false, selection: parent.selection,
    originalApprovalDoesNotApproveRewordedTasks: true, modelQuestionCount: parent.modelQuestionCount,
    missingFieldTarget: parent.missingFieldTarget, unsupportedTasks: parent.unsupportedTasks,
    inputArtifactHash: identityHash(proposedInputs), labelArtifactHash: identityHash(proposedLabels), sourceManifest,
    eligibleModelLabels: proposedLabels.reduce((total, row) => total + Object.values(row.labels).filter(Boolean).length, 0),
    costs: parent.costs,
    requestBytes: Object.fromEntries(Object.keys(PROVIDERS).map(provider => [provider, {
      largest: Math.max(...proposedInputs.map(row => Buffer.byteLength(JSON.stringify(buildWireRequest(provider, row.tasks.request))))),
      total: proposedInputs.reduce((sum, row) => sum + Buffer.byteLength(JSON.stringify(buildWireRequest(provider, row.tasks.request))), 0),
    }])), caveats: ['No model accuracy measured under revised questions.',
      'Existing Hindi extraction-binding fallbacks remain; SIMPLE does not imply submission readiness.',
      'Historical v4 and masked v5 artifacts remain immutable.'] };
  if (parent.proposalHash !== baseline.parentProposalHash) throw new Error('PARENT_IDENTITY_MISMATCH');
  const proposal = { ...content, proposalHash: identityHash(content) };
  await save('owner-decisions.json', ownerReceipt);
  await save('proposal-v6-inputs.json', proposedInputs);
  await save('proposal-v6-labels.json', proposedLabels);
  await save('proposal-v6.json', proposal);
  console.log(JSON.stringify({ proposalHash: proposal.proposalHash, cases: proposedInputs.length,
    eligibleModelLabels: proposal.eligibleModelLabels, unresolvedDecisions: 0, liveAuthorized: false }));
}

async function verify() {
  const baseline = await load(new URL('baseline.json', out));
  const proposal = await load(new URL('proposal-v6.json', out));
  const changed = async rows => {
    const changes = [];
    for (const row of rows) if (sha256(await readFile(new URL(row.file, root))) !== row.sha256) changes.push(row.file);
    return changes;
  };
  const git = (...args) => execFileSync('git', args, { cwd: fileURLToPath(root) });
  const report = { checkedAt: new Date().toISOString(), protectedFilesChecked: baseline.protectedFiles.length,
    protectedChanges: await changed(baseline.protectedFiles), archivedV5SourceFiles: baseline.sourceSnapshot.length,
    intentionalSourceChanges: await changed(baseline.sourceSnapshot), proposalSourcesChecked: proposal.sourceManifest.length,
    staleSources: await changed(proposal.sourceManifest), headUnchanged: git('rev-parse', 'HEAD').toString().trim() === baseline.head,
    stagedIdentityUnchanged: sha256(git('diff', '--cached', '--raw')) === baseline.stagedIdentity,
    providerCalls: 0, PlacesCalls: 0, pendingQueueCalls: 0, heldOutCalls: 0, challengeCalls: 0 };
  await save('preservation.json', report);
  console.log(JSON.stringify(report));
  if (report.protectedChanges.length || report.staleSources.length || !report.headUnchanged || !report.stagedIdentityUnchanged) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === '--register') await register();
  else if (process.argv[2] === '--verify') await verify();
  else throw new Error('Choose --register or --verify. Offline only; no live mode.');
}
