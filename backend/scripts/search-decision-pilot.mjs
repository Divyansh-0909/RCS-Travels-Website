import { readFile, writeFile, open } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parse as parseEnv } from 'dotenv';
import { identityHash, createExperimentalAdapter, createHttpTransport } from '../benchmarks/search/decisionComparison/adapters.js';
import { permitPilot, permitOwnerAuthorizedPilot, requestCost, summarizeEconomics } from '../benchmarks/search/decisionComparison/economics.js';
import { scoreCommon } from '../benchmarks/search/decisionComparison/pilot.js';
import { createRideSearchParser } from '../services/search/parser.ts';
import { generateLocationCandidates } from '../services/search/locations/candidates.ts';
import { validateDraftProvenance } from '../services/search/provenance.ts';
import { fallbackEligibility } from '../services/search/complex/eligibility.ts';
import { createTestClock } from '../tests/helpers/testClock.js';
import { searchPrediction } from '../benchmarks/search/prediction.js';
import { scoreSearchBenchmark } from '../benchmarks/search/metrics.js';
import { checks } from '../../output/hindi-temporal-v2-2026-10-08/diagnostic-metrics.mjs';

const version = process.argv.find(arg => arg.startsWith('--revision='))?.slice('--revision='.length) ?? 'v1';
if (!['v1', 'v2', 'v3', 'v4'].includes(version)) throw new Error('UNKNOWN_REVISION');
const revision = version === 'v1' ? '' : `-${version}`;
const root = new URL('../../', import.meta.url), out = new URL(`output/search-v1-b1-comparison-2026-11-${['v3', 'v4'].includes(version) ? '02' : '01'}/`, root);
const load = async name => JSON.parse(await readFile(new URL(name, out), 'utf8'));
const save = (name, data) => writeFile(new URL(name.replace(/\.json$/u, `${revision}.json`), out), JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
const plan = await load(`pilot-registration${revision}.json`);
const { planHash, ...content } = plan;
if (identityHash(content) !== planHash) throw new Error('REGISTRATION_CHANGED');
for (const source of plan.sourceManifest) {
  if (createHash('sha256').update(await readFile(new URL(source.file, root))).digest('hex') !== source.sha256) throw new Error('SOURCE_CHANGED_REREGISTRATION_REQUIRED');
}
const inputs = await load(`pilot-inputs${revision}.json`), labels = await load(`pilot-labels${revision}.json`);
if (identityHash(inputs) !== plan.inputArtifactHash || identityHash(labels) !== plan.labelArtifactHash) throw new Error('PILOT_ARTIFACT_CHANGED');
let evidence = null;
const ownerAuthorized = process.argv.includes('--owner-authorized-pilot');
try { evidence = await load(ownerAuthorized ? 'owner-authorized-pilot-v4.json' : 'verified-no-charge-allocation.json'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
let localEnv = {};
try { localEnv = parseEnv(await readFile(new URL('backend/.env', root))); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const env = { ...localEnv, ...process.env };
const credential = provider => provider === 'jev' ? env.TYPESAFE_API_KEY : provider === 'decisions' ? env.OPENAI_API_KEY
  : env.CLOUDFLARE_API_TOKEN ?? env.CLOUDFLARE_AUTH_TOKEN;
const accountId = env.CLOUDFLARE_ACCOUNT_ID;
const live = process.argv.includes('--live');
const summary = { version: `search-decision-comparison-${version}`, planHash, recordedAt: new Date().toISOString(),
  providerInferenceCalls: 0, actualAdditionalChargeUsd: live ? null : 0, allocationMode: ownerAuthorized ? 'OWNER_WAIVED_FREE_QUOTA_CHECK' : 'VERIFIED_FREE_ALLOCATION_REQUIRED', heldOutCalls: 0, challengeCalls: 0,
  PlacesCalls: 0, pendingQueueLunaCalls: 0, providers: {} };
for (const provider of plan.runOrder) {
  const gate = ownerAuthorized ? permitOwnerAuthorizedPilot(plan, evidence, provider) : permitPilot(plan, evidence, provider);
  const credentialsAvailable = Boolean(credential(provider) && (!provider.startsWith('clef') || accountId));
  if (!live || !gate.allowed || !credentialsAvailable) {
    summary.providers[provider] = { status: 'NOT_RUN', credentialsAvailable, accountAccess: 'NOT_VERIFIED',
      noAdditionalChargeAllocation: 'NOT_VERIFIED', labelStatus: plan.labelsReadyForPrimaryComparison ? 'READY' : 'MULTILINGUAL_OWNER_REVIEW_REQUIRED',
      reason: !credentialsAvailable ? 'CREDENTIALS_OR_ACCOUNT_MISSING' : gate.reason ?? 'OFFLINE_ONLY', inferenceCalls: 0,
      accuracy: null, medianLatencyMs: null, p95LatencyMs: null, costPerValidInterpretationUsd: null, costPerCorrectInterpretationUsd: null,
      economics: { actualAdditionalChargeUsd: 0, publishedMarginalUsd: 0, measuredWorkflowCost: null } };
    continue;
  }
  // Durable exclusive claim: a crash or second invocation cannot repeat this provider's pilot.
  const claim = await open(new URL(`${provider}-live-claim${revision}.json`, out), 'wx');
  await claim.writeFile(JSON.stringify({ planHash, provider, startedAt: new Date().toISOString(), maxRequests: gate.maxRequests })); await claim.close();
  const observations = [], rows = [], pipeline = [];
  let stopped = false, calls = 0, lastCall = 0, level = 'level1', currentCaseId = null, knownTariffUsd = 0;
  let transportTiming = null;
  console.log(JSON.stringify({ provider, status: 'STARTING', maxRequests: gate.maxRequests }));
  const transport = createHttpTransport(provider, { apiKey: credential(provider), accountId });
  const limited = { async send(body, signal) {
    if (stopped || calls >= gate.maxRequests) throw new Error('PILOT_STOPPED');
    if (ownerAuthorized && knownTariffUsd + gate.perRequestReserveUsd > gate.maxPublishedTariffUsd + 1e-12) throw new Error('PILOT_TARIFF_LIMIT');
    const wait = Math.max(0, plan.minimumGapMs - (Date.now() - lastCall));
    if (wait) await new Promise(resolve => setTimeout(resolve, wait));
    calls += 1; lastCall = Date.now(); summary.providerInferenceCalls += 1;
    const start = performance.now(); transportTiming = { clientThrottleMs: wait };
    try { return await transport.send(body, signal); }
    finally { transportTiming.providerLatencyMs = performance.now() - start; }
  } };
  const adapter = createExperimentalAdapter(provider, { transport: limited, timeoutMs: plan.timeoutMs, onObservation(observation) {
    Object.assign(observation, transportTiming);
    observations.push({ ...observation, level, caseId: currentCaseId });
    if (observation.error) stopped = true;
    const cost = requestCost(provider, observation);
    if (cost !== null) knownTariffUsd += cost;
    if (ownerAuthorized && (cost === null || knownTariffUsd > gate.maxPublishedTariffUsd
      || cost > gate.perRequestReserveUsd)) stopped = true;
  } });
  for (const row of inputs) {
    if (stopped) break;
    currentCaseId = row.caseId; level = 'level1';
    const observation = await adapter.execute(row.tasks.request);
    rows.push({ caseId: row.caseId, language: row.language, labels: labels.find(item => item.caseId === row.caseId).labels, observation });
    if (!stopped) {
      level = 'level2';
      const start = performance.now(), before = observations.length;
      const parser = createRideSearchParser(adapter, createTestClock(row.input.context.clock), generateLocationCandidates);
      const result = await parser.parse({ query: row.input.query, candidates: [], timeZone: row.input.context.timeZone });
      pipeline.push({ caseId: row.caseId, result, totalLatencyMs: performance.now() - start, requestCount: observations.length - before,
        fallbackRequired: fallbackEligibility(result).length > 0, provenanceIssues: result.draft ? validateDraftProvenance(result.draft) : [],
        submissionAllowed: false, PlacesExecuted: false, LunaExecuted: false });
    }
    await save(`${provider}-case-${row.caseId}.json`, { planHash, row: rows.at(-1), pipeline: pipeline.at(-1) ?? null,
      observations: observations.slice() });
    console.log(JSON.stringify({ provider, completedCases: rows.length, calls, stopped,
      lastError: observations.at(-1)?.error?.category ?? null, knownPublishedTariffUsd: knownTariffUsd }));
  }
  const completed = new Map(rows.map(row => [row.caseId, row]));
  // Keep failed/unattempted cases in preregistered accuracy denominators.
  const all = inputs.map(row => completed.get(row.caseId) ?? { caseId: row.caseId, language: row.language,
    labels: labels.find(item => item.caseId === row.caseId).labels, observation: null });
  const accuracy = scoreCommon(all), latencies = rows.map(row => row.observation.providerLatencyMs ?? row.observation.latencyMs).sort((a, b) => a - b);
  const pipelineById = new Map(pipeline.map(row => [row.caseId, row]));
  const coreScored = labels.filter(row => row.pipelineRecord).map(row => ({ record: row.pipelineRecord,
    prediction: pipelineById.has(row.caseId) ? searchPrediction(pipelineById.get(row.caseId).result) : null }));
  const hindiRows = labels.filter(row => row.pipelineExpected).map(row => ({ expected: row.pipelineExpected,
    prediction: pipelineById.has(row.caseId) ? searchPrediction(pipelineById.get(row.caseId).result) : null }));
  const hindiFields = Object.fromEntries(Object.entries(checks).map(([field, check]) => {
    const eligible = hindiRows.filter(row => ['queryType', 'complexity'].includes(field) || row.expected.complexity === 'SIMPLE');
    return [field, { correct: eligible.filter(check).length, total: eligible.length }];
  }));
  const accepted = pipeline.filter(row => !row.fallbackRequired && !row.provenanceIssues.length
    && row.result.draft && !row.result.issues.some(issue => issue.category === 'INVALID'));
  summary.providers[provider] = { status: stopped ? 'STOPPED' : 'PILOT_EXECUTED', calls, knownPublishedTariffUsd: knownTariffUsd,
    stopCategory: observations.at(-1)?.error?.category ?? (stopped ? 'USAGE_OR_TARIFF_LIMIT' : null), accuracy,
    byLanguage: Object.fromEntries([...new Set(all.map(row => row.language))].map(language => [language, scoreCommon(all.filter(row => row.language === language))])),
    medianLatencyMs: latencies.length ? latencies[Math.floor((latencies.length - 1) / 2)] : null,
    p95LatencyMs: latencies.length >= 20 ? latencies[Math.ceil(latencies.length * 0.95) - 1] : null,
    latencyLimit: 'Descriptive small-sample statistics, not population guarantees.', pipeline,
    level2: { coreApproved: scoreSearchBenchmark(coreScored, { diagnostic: true }), multilingualDiagnostic: hindiFields,
      guardedDraftAccepted: accepted.length, total: inputs.length,
      providerCallsPerSearch: pipeline.map(row => ({ caseId: row.caseId, calls: row.requestCount })),
      fallbackRequired: pipeline.filter(row => row.fallbackRequired).length, fallbackExecuted: 0, groundedOrConfirmed: 0 },
    economics: {
      commonDecisionBatch: summarizeEconomics(provider, observations.filter(row => row.level === 'level1'),
        { searches: rows.length, valid: accuracy.valid, correct: accuracy.exactAllLabelledTasks }),
      boundedPipeline: summarizeEconomics(provider, observations.filter(row => row.level === 'level2'),
        { searches: pipeline.length, valid: accepted.length, correct: null, fallbackCount: pipeline.filter(row => row.fallbackRequired).length }),
      completeWorkflow: 'UNKNOWN_WITHOUT_ACTUAL_FALLBACK_AND_PLACES_USAGE',
    } };
  await save(`${provider}-observations.json`, observations);
}
await save(live ? 'comparison-live-results.json' : 'comparison-status.json', summary);
console.log(JSON.stringify({ planHash, providerInferenceCalls: summary.providerInferenceCalls,
  providers: Object.fromEntries(Object.entries(summary.providers).map(([key, value]) => [key, { status: value.status, reason: value.reason, credentialsAvailable: value.credentialsAvailable }])) }));
