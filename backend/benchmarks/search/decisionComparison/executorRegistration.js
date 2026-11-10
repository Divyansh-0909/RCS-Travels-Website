import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { resolve, relative, isAbsolute } from 'node:path';
import { identityHash, PROVIDERS, buildWireRequest } from './adapters.js';
import { ownerSimpleTasks } from '../../../scripts/search-owner-simple-policy.mjs';
import { routingRequest, extractionRequest, locationRequest } from '../../../services/search/questions.ts';
import { collectObservations } from '../../../services/search/observations.ts';
import { generateLocationCandidates } from '../../../services/search/locations/candidates.ts';
import { parseInputSchema } from '../../../services/search/contracts.ts';

export const BASE_PLAN_HASH = 'a9f820d6121ad94f14534136868fd31c07c4ddadbd4fca9c2b5d44fd07fce22c';
export const BASE_DIR = 'output/search-v1-v6-readiness-2026-11-02';
export const EXECUTOR_DIR = 'output/search-v1-v6-executor-2026-11-02';
export const EXECUTOR_FILES = Object.freeze(['executorRegistration.js', 'executorEvidence.js', 'executorMetrics.js', 'executor.js']
  .map(name => `backend/benchmarks/search/decisionComparison/${name}`).concat([
    'backend/scripts/search-v6-executor.mjs', 'backend/tests/rideSearchV6Executor.test.js',
  ]));
export const ENVELOPE = Object.freeze({ providers: Object.freeze(['jev', 'clef']), maxCasesPerProvider: 24,
  maxRequestsPerProvider: 72, maxRequestsTotal: 144, commonPerProvider: 24, routingPerProvider: 24, extractionPerProvider: 24,
  maxInputTokensPerRequest: 24576, minimumGapMs: 1000, timeoutMs: 10000, concurrency: 1, retries: 0,
  maxUsd: Object.freeze({ jev: 0.10, clef: 0.50, total: 0.60 }) });
export const sha256 = value => createHash('sha256').update(value).digest('hex');
const fail = category => { const error = new Error(category); error.category = category; throw error; };
export function workspacePath(root, file) {
  const target = resolve(root, file), rel = relative(resolve(root), target);
  if (isAbsolute(file) || rel.startsWith('..') || isAbsolute(rel)) fail('INVALID_WORKSPACE_PATH');
  return target;
}
export async function readJson(root, file) {
  try { return JSON.parse(await readFile(workspacePath(root, file), 'utf8')); }
  catch { return fail('REGISTRATION_ARTIFACT_UNAVAILABLE'); }
}
export async function verifySources(root, manifest) {
  for (const row of manifest) {
    let bytes; try { bytes = await readFile(workspacePath(root, row.file)); } catch { fail('SOURCE_UNAVAILABLE'); }
    if (sha256(bytes) !== row.sha256) fail('SOURCE_DRIFT');
  }
}
export function requestKey(provider, caseId, stage) { return `${provider}:${caseId}:${stage}`; }
export function caseRequests(row, applySchemaDefaults = false) {
  const normalize = value => applySchemaDefaults ? parseInputSchema.parse(value) : value;
  const input = normalize({ query: row.input.query, candidates: [], timeZone: row.input.context.timeZone });
  const now = new Date(row.input.context.clock).toISOString();
  const booking = normalize({ ...input, candidates: generateLocationCandidates(input.query, 'BOOKING_REQUEST').candidates });
  const location = normalize({ ...input, candidates: generateLocationCandidates(input.query, 'LOCATION_SEARCH').candidates });
  return { common: row.tasks.request, routing: routingRequest(input, now),
    booking: extractionRequest(booking, now, collectObservations(input.query, booking.candidates)),
    ...(location.candidates.length ? { location: locationRequest(location, now) } : {}) };
}
function verifyRequestManifest(inputs, manifest) {
  const index = new Map();
  for (const row of inputs) {
    if (identityHash(ownerSimpleTasks(row.input)) !== identityHash(row.tasks)) fail('QUESTION_DRIFT');
    for (const [stage, request] of Object.entries(caseRequests(row))) for (const provider of Object.keys(PROVIDERS)) {
      const body = buildWireRequest(provider, request), key = requestKey(provider, row.caseId, stage);
      const expected = manifest.filter(value => requestKey(value.provider, value.caseId, value.stage) === key);
      const requestIdentity = identityHash({ provider, body, timeoutMs: 10000, retries: 0 });
      if (expected.length !== 1 || expected[0].requestIdentity !== requestIdentity
        || expected[0].wireHash !== identityHash(body) || expected[0].bytes !== Buffer.byteLength(JSON.stringify(body))) fail('REQUEST_MANIFEST_DRIFT');
      index.set(key, expected[0]);
    }
  }
  if (index.size !== manifest.length) fail('REQUEST_MANIFEST_DRIFT');
  return index;
}
export async function loadBase(root) {
  const plan = await readJson(root, `${BASE_DIR}/pilot-registration-v6.json`);
  const { planHash, ...content } = plan;
  if (planHash !== BASE_PLAN_HASH || identityHash(content) !== planHash) fail('REGISTRATION_DRIFT');
  await verifySources(root, plan.sourceManifest);
  const inputs = await readJson(root, `${BASE_DIR}/pilot-inputs-v6.json`);
  const labels = await readJson(root, `${BASE_DIR}/pilot-labels-v6.json`);
  const pipelineLabels = await readJson(root, `${BASE_DIR}/pipeline-labels-v6.json`);
  const requests = await readJson(root, `${BASE_DIR}/request-manifest-v6.json`);
  const checks = [[inputs, plan.inputArtifactHash], [labels, plan.labelArtifactHash],
    [pipelineLabels, plan.pipelineLabelArtifactHash], [requests, plan.requestManifestHash]];
  if (checks.some(([value, hash]) => identityHash(value) !== hash)) fail('ARTIFACT_DRIFT');
  if (inputs.length !== 24 || labels.reduce((sum, row) => sum + Object.values(row.labels).filter(Boolean).length, 0) !== 463
    || pipelineLabels.filter(row => row.fieldEligible).length !== 17) fail('DENOMINATOR_DRIFT');
  if (!isDeepStrictEqual(inputs.map(row => row.caseId), plan.selection.map(row => row.caseId))) fail('CASE_ORDER_DRIFT');
  return { plan, inputs, labels, pipelineLabels, requests, requestIndex: verifyRequestManifest(inputs, requests) };
}
export async function buildAmendment(root) {
  const base = await loadBase(root);
  const executorSources = await Promise.all(EXECUTOR_FILES.map(async file => ({ file, sha256: sha256(await readFile(workspacePath(root, file))) })));
  const parserRequestManifest = [];
  for (const row of base.inputs) for (const [stage, request] of Object.entries(caseRequests(row, true))) {
    if (stage === 'common') continue;
    for (const provider of ENVELOPE.providers) {
      const body = buildWireRequest(provider, request);
      parserRequestManifest.push({ provider, caseId: row.caseId, stage,
        originalPreviewRequestIdentity: base.requestIndex.get(requestKey(provider, row.caseId, stage)).requestIdentity,
        requestIdentity: identityHash({ provider, body, timeoutMs: 10000, retries: 0 }),
        wireHash: identityHash(body), bytes: Buffer.byteLength(JSON.stringify(body)) });
    }
  }
  const content = { version: 'search-v6-executor-amendment-v1', parentPlanHash: BASE_PLAN_HASH,
    contract: base.plan.contract, inputArtifactHash: base.plan.inputArtifactHash, labelArtifactHash: base.plan.labelArtifactHash,
    pipelineLabelArtifactHash: base.plan.pipelineLabelArtifactHash, requestManifestHash: base.plan.requestManifestHash,
    envelope: ENVELOPE, liveAuthorized: false, status: 'EXECUTOR_REGISTERED_OFFLINE_ONLY',
    sourceManifest: [...base.plan.sourceManifest, ...executorSources], executorSources,
    parserRequestManifest, parserManifestReason: 'Actual parser schema defaults, including empty trustedLocationSelections and normalized candidate property order. Original manifest remains immutable; common tasks are unchanged.' };
  return { ...content, amendmentHash: identityHash(content) };
}
export async function loadExecution(root, providedAmendment) {
  const base = await loadBase(root);
  const amendment = structuredClone(providedAmendment ?? await readJson(root, `${EXECUTOR_DIR}/execution-amendment-v1.json`));
  const { amendmentHash, ...content } = amendment;
  if (identityHash(content) !== amendmentHash || amendment.parentPlanHash !== BASE_PLAN_HASH
    || amendment.liveAuthorized !== false || !isDeepStrictEqual(amendment.envelope, ENVELOPE)) fail('EXECUTION_AMENDMENT_DRIFT');
  const expected = await buildAmendment(root);
  if (expected.amendmentHash !== amendmentHash) fail('EXECUTOR_SOURCE_OR_CONFIGURATION_DRIFT');
  await verifySources(root, amendment.sourceManifest);
  for (const row of amendment.parserRequestManifest) base.requestIndex.set(requestKey(row.provider, row.caseId, row.stage), row);
  return { ...base, amendment };
}
export function authorizeExecution(amendment, receipt, now = Date.now()) {
  if (receipt?.liveAuthorized !== true || receipt.planHash !== BASE_PLAN_HASH || receipt.amendmentHash !== amendment.amendmentHash
    || typeof receipt.ownerReply !== 'string' || !receipt.ownerReply.trim() || typeof receipt.receiptReference !== 'string'
    || !receipt.receiptReference.trim() || !isDeepStrictEqual(receipt.envelope, ENVELOPE)) fail('SEPARATE_LIVE_AUTHORIZATION_REQUIRED');
  if (!Number.isFinite(Date.parse(receipt.issuedAt)) || Date.parse(receipt.issuedAt) > now
    || !Number.isFinite(Date.parse(receipt.expiresAt)) || Date.parse(receipt.expiresAt) <= now) fail('AUTHORIZATION_EXPIRED');
  return identityHash(receipt);
}
