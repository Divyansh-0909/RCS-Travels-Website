import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { identityHash, PROVIDERS, buildWireRequest, createExperimentalAdapter, validateRequest } from '../benchmarks/search/decisionComparison/adapters.js';
import { READINESS_VERSION, SCORING, OPERATIONAL_CEILINGS, MAX_INPUT_RESERVATION,
  pipelineLabel, wireMeaning, fakeEnvelope, scoreLevelOne } from '../benchmarks/search/decisionComparison/readiness.js';
import { ownerSimpleTasks } from './search-owner-simple-policy.mjs';
import { routingRequest, extractionRequest, locationRequest, SEARCH_QUESTION_CONTRACT_VERSION } from '../services/search/questions.ts';
import { generateLocationCandidates } from '../services/search/locations/candidates.ts';
import { collectObservations } from '../services/search/observations.ts';

const root = new URL('../../', import.meta.url);
const out = new URL('output/search-v1-v6-readiness-2026-11-02/', root);
const parentDir = new URL('output/search-v1-owner-simple-policy-2026-11-02/', root);
const sha256 = value => createHash('sha256').update(value).digest('hex');
const load = async url => JSON.parse(await readFile(url, 'utf8'));
const save = (name, value) => writeFile(new URL(name, out), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });

function parserRequests(row) {
  const input = { query: row.input.query, candidates: [], timeZone: row.input.context.timeZone };
  const now = new Date(row.input.context.clock).toISOString();
  const booking = { ...input, candidates: generateLocationCandidates(input.query, 'BOOKING_REQUEST').candidates };
  const location = { ...input, candidates: generateLocationCandidates(input.query, 'LOCATION_SEARCH').candidates };
  return { routing: routingRequest(input, now),
    booking: extractionRequest(booking, now, collectObservations(input.query, booking.candidates)),
    ...(location.candidates.length ? { location: locationRequest(location, now) } : {}) };
}

function validateCase(row, truth) {
  if (identityHash(ownerSimpleTasks(row.input)) !== identityHash(row.tasks)) throw new Error('V6_TASK_REGENERATION_DRIFT');
  if (Object.keys(row.tasks.request.questions).length !== 20 || Object.keys(truth.labels).length !== 20) throw new Error('QUESTION_LABEL_ARITY');
  for (const [name, label] of Object.entries(truth.labels)) if (label !== null
    && (!label.allowed.length || label.allowed.some(choice => !Object.hasOwn(row.tasks.request.questions[name].choices, choice)))) throw new Error('LABEL_OUTSIDE_CHOICES');
  for (const candidate of row.tasks.candidates) if (candidate.queryId !== row.input.query.id
    || candidate.queryRevision !== row.input.query.revision
    || row.input.query.text.slice(candidate.start, candidate.end) !== candidate.exactText) throw new Error('CANDIDATE_PROVENANCE');
}

async function register() {
  const baseline = await load(new URL('baseline.json', out));
  const parent = await load(new URL('proposal-v6.json', parentDir));
  const inputs = await load(new URL('proposal-v6-inputs.json', parentDir));
  const labels = await load(new URL('proposal-v6-labels.json', parentDir));
  const historic = await load(new URL('output/search-v1-b1-comparison-2026-11-02/pilot-labels-v4.json', root));
  if (parent.proposalHash !== baseline.parentProposalHash || identityHash(inputs) !== parent.inputArtifactHash
    || identityHash(labels) !== parent.labelArtifactHash) throw new Error('PARENT_IDENTITY_MISMATCH');
  const pipelineLabels = labels.map(row => pipelineLabel(historic.find(value => value.caseId === row.caseId), row));
  const compatibility = [], requests = [];
  for (const row of inputs) {
    validateCase(row, labels.find(value => value.caseId === row.caseId));
    const paths = { common: row.tasks.request, ...parserRequests(row) };
    for (const [stage, request] of Object.entries(paths)) {
      validateRequest(request);
      for (const provider of Object.keys(PROVIDERS)) {
        if (identityHash(wireMeaning(provider, request)) !== identityHash(request)) throw new Error('WIRE_SEMANTIC_MISMATCH');
        const body = buildWireRequest(provider, request), bytes = Buffer.byteLength(JSON.stringify(body));
        if (bytes + 4096 > MAX_INPUT_RESERVATION) throw new Error('CONTEXT_RESERVATION_EXCEEDED');
        const adapter = createExperimentalAdapter(provider, { transport: { async send() {
          return { status: 200, body: fakeEnvelope(provider, request) };
        } } });
        const observation = await adapter.execute(request);
        if (!observation.normalized || observation.error) throw new Error('FAKE_NORMALIZATION_FAILED');
        requests.push({ caseId: row.caseId, stage, provider, bytes,
          requestIdentity: observation.requestIdentity, wireHash: identityHash(body), questions: Object.keys(request.questions).length });
      }
    }
  }
  for (const provider of Object.keys(PROVIDERS)) compatibility.push({ provider, status: 'OFFLINE_COMPATIBLE',
    fakeRequests: requests.filter(row => row.provider === provider).length, liveRequests: 0 });
  const sourcePaths = [...new Set([...parent.sourceManifest.map(row => row.file),
    'backend/benchmarks/search/decisionComparison/readiness.js', 'backend/scripts/search-v6-readiness.mjs',
    'backend/tests/rideSearchV6Readiness.test.js'])].sort();
  const sourceManifest = await Promise.all(sourcePaths.map(async file => ({ file, sha256: sha256(await readFile(new URL(file, root))) })));
  const budgets = Object.fromEntries(['jev', 'clef', 'clefFlash'].map(provider => [provider, {
    minRequestsFor24Cases: 48, expectedRequestRange: [48, 72], maxRequests: 72,
    level1Requests: 24, parserRequests: [24, 48], planningInputTokensPerRequest: MAX_INPUT_RESERVATION,
    maxPlanningInputTokens: 72 * MAX_INPUT_RESERVATION,
    publishedTariffEstimateUsd: 72 * MAX_INPUT_RESERVATION * PROVIDERS[provider].inputPerMillion / 1e6,
    proposedOperationalCeilingUsd: OPERATIONAL_CEILINGS[provider] }]));
  const primary = ['jev', 'clef'];
  const content = { version: READINESS_VERSION, contract: parent.version, createdAt: new Date().toISOString(),
    parentProposalHash: parent.proposalHash, productionQuestionContract: SEARCH_QUESTION_CONTRACT_VERSION,
    status: 'OFFLINE_REGISTERED_NOT_RUN', liveAuthorized: false, executable: false,
    readiness: 'GO_FOR_SEPARATELY_AUTHORIZED_BOUNDED_PILOT; NO_GO_FOR_INFERENCE_NOW',
    selection: inputs.map(row => ({ caseId: row.caseId, language: row.language, queryHash: identityHash(row.input), clock: row.input.context.clock })),
    primaryProviders: primary, secondaryProviders: ['clefFlash'], providerOrder: ['jev', 'clef', 'clefFlash'],
    blockedProviders: { decisions: 'Prior HTTP 429; no automatic resumption. Separate controlled continuation required.' },
    providers: Object.fromEntries(Object.entries(PROVIDERS).map(([key, value]) => [key, { ...value,
      endpoint: value.endpoint ?? `https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/run/${value.model}`,
      immutableWeightsKnown: key === 'jev', reportModel: 'Require Jev jev-1.14.0; Cloudflare records selector, versioned weights unknown.',
      normalizationSource: 'backend/benchmarks/search/decisionComparison/adapters.js' }])),
    scheduling: { caseOrder: 'selection order; common then parser for each case', concurrency: 1, minimumStartGapMs: 1000,
      timeoutMs: 10000, retries: 0, durableClaim: 'Exclusive provider claim bound to this registration before first request; crash cannot replay.' },
    stopping: { scope: 'HALT_ENTIRE_ACTIVATION', terminal: ['RATE_LIMIT', 'AUTH_OR_ACCESS', 'PAYMENT_REQUIRED', 'RESOURCE_LIMIT',
      'PROVIDER_ERROR', 'TRANSPORT_ERROR', 'TIMEOUT', 'INVALID_OUTPUT', 'INVALID_USAGE', 'REFUSAL', 'MODEL_VERSION_CHANGED',
      'MISSING_OUTPUT_OR_USAGE', 'OBSERVED_TARIFF_LIMIT', 'REQUEST_OR_TARIFF_LIMIT', 'LOCAL_CONTEXT_BUDGET'],
      retryAfter: 'Record only; do not sleep/retry/resume automatically.',
      budget: 'Reserve next conservative request before sending. Stop after unknown usage or observed reservation excess; no more requests.',
      localContract: 'Terminal; identify questions/capability rather than remote provider error.',
      semanticFallback: 'Ordinary parser semantic/binding fallback is measured and not a transport stop; never execute it.' },
    budgets, aggregate: { primaryMaxRequests: 144, primaryMaxPlanningTokens: 144 * MAX_INPUT_RESERVATION,
      primaryTariffEstimateUsd: primary.reduce((sum, provider) => sum + budgets[provider].publishedTariffEstimateUsd, 0),
      primaryProposedCeilingUsd: 0.60, withSecondaryMaxRequests: 216, withSecondaryProposedCeilingUsd: 0.70,
      noVerifiedFreeAllocation: true, actualAccountCharges: null, ceilingIsInvoiceGuarantee: false, spendingAuthorized: false },
    scoring: SCORING, eligibleCategoricalLabels: scoreLevelOne(labels, inputs, pipelineLabels).eligible,
    sourceManifest, inputArtifactHash: identityHash(inputs), labelArtifactHash: identityHash(labels),
    pipelineLabelArtifactHash: identityHash(pipelineLabels), requestManifestHash: identityHash(requests),
    preservedHistoricalIdentities: { v4PlanHash: parent.parentPlanHash, v5Proposal: parent.supersedesProposalHash },
    outOfScope: ['LUNA_QUEUE', 'GENERATIVE_FALLBACK', 'PLACES', 'DETAILS', 'HELD_OUT', 'CHALLENGE', 'SUBMISSION', 'ROLLOUT'] };
  const registration = { ...content, planHash: identityHash(content) };
  await save('pilot-inputs-v6.json', inputs); await save('pilot-labels-v6.json', labels);
  await save('pipeline-labels-v6.json', pipelineLabels); await save('request-manifest-v6.json', requests);
  await save('question-contract-v6.json', Object.entries(inputs[0].tasks.request.questions).map(([name, question]) => ({
    name, instructions: question.instructions,
    choices: ['pickup', 'drop'].includes(name) ? 'Per-case exact candidate spans plus NONE / OTHER_OR_UNAVAILABLE / AMBIGUOUS.' : question.choices,
    eligibleLabels: labels.filter(row => row.labels[name] !== null).length,
  })));
  await save('offline-compatibility.json', compatibility); await save('pilot-registration-v6.json', registration);
  console.log(JSON.stringify({ planHash: registration.planHash, cases: inputs.length,
    categoricalLabels: content.eligibleCategoricalLabels, fieldEligibleCases: pipelineLabels.filter(row => row.fieldEligible).length,
    sourceFiles: sourceManifest.length, compatibility, budgets }));
}

async function verify() {
  const baseline = await load(new URL('baseline.json', out));
  const plan = await load(new URL('pilot-registration-v6.json', out));
  const changes = async rows => {
    const changed = [];
    for (const row of rows) if (sha256(await readFile(new URL(row.file, root))) !== row.sha256) changed.push(row.file);
    return changed;
  };
  const report = { checkedAt: new Date().toISOString(), protectedFilesChecked: baseline.protectedFiles.length,
    protectedChanges: await changes(baseline.protectedFiles), registeredSourceFiles: plan.sourceManifest.length,
    staleSources: await changes(plan.sourceManifest), priorSourceChanges: await changes(baseline.sourceManifest),
    headUnchanged: execFileSync('git', ['rev-parse', 'HEAD']).toString().trim() === baseline.head,
    stagedIdentityUnchanged: sha256(execFileSync('git', ['diff', '--cached', '--raw'])) === baseline.stagedIdentity,
    providerInferenceCalls: 0, accountMetadataCalls: 0, pendingQueueCalls: 0, heldOutOrChallengeCalls: 0,
    liveAuthorized: false, planHash: plan.planHash };
  await save('preservation.json', report); console.log(JSON.stringify(report));
  if (report.protectedChanges.length || report.staleSources.length || report.priorSourceChanges.length
    || !report.headUnchanged || !report.stagedIdentityUnchanged) process.exitCode = 1;
}

if (process.argv[2] === '--register') await register();
else if (process.argv[2] === '--verify') await verify();
else throw new Error('Choose --register or --verify. Offline only; no inference mode.');
