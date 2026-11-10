import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { load, save, hash, root, directory } from './search-post-v6-offline.mjs';
import { caseRequests } from '../benchmarks/search/decisionComparison/executorRegistration.js';
import { buildWireRequest, identityHash } from '../benchmarks/search/decisionComparison/adapters.js';
import { scorePipelineCase } from '../benchmarks/search/decisionComparison/readiness.js';
import { isDeepStrictEqual } from 'node:util';

const previousDirectory = 'output/search-v1-v6-retry-2026-11-03/';
const terminal = await load(previousDirectory + 'comparison-live-results-v6-complete.json');
const historical = await load(previousDirectory + 'comparison-analysis-v6-complete.json');
const amendment = await load(previousDirectory + 'execution-amendment-v2.json');
const executor = await load('output/search-v1-v6-executor-2026-11-02/execution-amendment-v1.json');
const inputs = await load('output/search-v1-v6-readiness-2026-11-02/pilot-inputs-v6.json');
const labels = await load('output/search-v1-v6-readiness-2026-11-02/pipeline-labels-v6.json');
const before = await load(directory + 'v6-before-replay.json');
const after = await load(directory + 'v6-closure-replay.json');
const pending = await load('output/search-provider-continuation-2026-10-08/runtime-pending-manifest.json');
const canonical = value => JSON.parse(JSON.stringify(value));

const diagnoses = {
  'core-ambiguity-conflict-001': { categories: ['CORRECT_FALLBACK'], explanation: 'Two incompatible scheduled times: COMPLEX route is correct. No extraction was attempted; excluded from the 17-case field cohort.' },
  'hh-v1-seed-007': { categories: ['MODEL_VEHICLE', 'CORRECT_FORM_CONTAINMENT'], explanation: 'Jev chose required SUV and EXPLICIT_ANY together although no any-vehicle phrase is stated. Existing conflict guard correctly retains ambiguity and requires a concrete selection. Do not replace the model answer. Extra missing vehicle is a consequence of containment.' },
  'hh-v1-added-028': { categories: ['CORRECT_FALLBACK'], explanation: 'Conditional destination branches require complex interpretation. Unsupported condition is retained; no default destination or fallback output is fabricated.' },
  'hh-v1-added-030': { categories: ['MODEL_UNSUPPORTED_KIND', 'BOUNDED_ANY_LEXICON_LIMIT', 'CORRECT_FALLBACK'], explanation: 'Negative sedan is preserved. Source koi aur gaadi chalegi is outside explicit-ANY observer; EXCLUDED still requires a concrete vehicle. Jev falsely chose CONDITIONAL_PREFERENCE, which lacks source support and correctly triggers unresolved-binding fallback. No invented condition is added.' },
  'hh-v1-added-032': { categories: ['MODEL_ROUTING', 'CANDIDATE_GENERATION', 'MODEL_CANDIDATE_SELECTION', 'CORRECT_FALLBACK'], explanation: 'Frozen expectation is COMPLEX for a correction; Jev routed SIMPLE. Corrected destination beta 1 is not supplied as an exact usable candidate; drop NONE_OR_UNCLEAR plus PRESENT triggers fallback. Correction grammar is not expanded in this patch.' },
  'hh-v1-added-033': { categories: ['LOCAL_UNSUPPORTED_BINDING_FIXED', 'MODEL_VEHICLE', 'CORRECT_FORM_CONTAINMENT'], explanation: 'Romanized mile toh theek hai already supported preferred strength but was missing from unsupported-condition observations. Closed condition now retained. Saved vehicle_any UNCLEAR still produces an ambiguous vehicle and user resolution; no deterministic override. Removing the local binding error is not proof of a correct vehicle draft.' },
  'hh-v1-added-003': { categories: ['MODEL_ROUTING', 'CANDIDATE_GENERATION', 'MODEL_ROLE_ASSIGNMENT', 'CORRECT_FALLBACK'], explanation: 'Correction expects COMPLEX, but model chose SIMPLE. Candidate grammar supplies the negated old destination and campus, missing beta 1. Model assigns campus to both roles and simultaneously marks pickup ABSENT. Role and overlap guards reject it; no corrected endpoint is inferred.' },
  'hh-v1-added-004': { categories: ['LOCAL_SOURCE_STRENGTH_FIXED', 'LOCAL_UNSUPPORTED_BINDING_FIXED'], explanation: 'Valid sedan PREFERRED answer was rejected because the shared suffix helper recognized only Romanized text. It now recognizes the exact Hindi availability suffix, and observations retain that material condition. EXPLICIT_ANY from the saved answer does not replace the selected positive preferred class. SUV exclusions remain, availability stays unverified, and submission remains blocked.' },
  'hh-v1-added-007': { categories: ['LOCAL_UNSUPPORTED_BINDING_FIXED', 'SUCCESSFUL_RENTAL_CONTAINMENT'], explanation: 'Correct RENTAL answer could not bind to the English-only rental observer. Closed affirmative Hindi vehicle-rental phrase is now preserved as unsupported source evidence. Unsupported rental alone needs form resolution, not Luna. No rental duration, capability or booking payload is created.' },
  'hh-v1-added-018': { categories: ['CANDIDATE_GENERATION', 'TIMEZONE_SOURCE_LEXICON_LIMIT'], explanation: 'Model selects the offered pickup faithfully, but that exact candidate contains the London-time prefix. Provenance is valid; endpoint correctness is false. Stripping this prefix alone would risk silently defaulting the unrecognized Hindi timezone to IST. Fix requires coordinated timezone recognition and route-prefix handling; deferred rather than adding a pilot-specific text replacement.' },
};

function transition(row) {
  const parsed = row.parsed;
  return { route: parsed.route, vehicle: parsed.draft?.vehicleClass, unsupported: parsed.draft?.unsupportedRequests,
    issues: parsed.issues, eligibleFallback: row.fallbackEligibility, form: row.form, reviewRejection: row.reviewRejection,
    provenance: row.provenance };
}
const cases = [];
for (const label of labels) {
  const saved = terminal.cases.find(row => row.provider === 'jev' && row.caseId === label.caseId);
  const savedScore = historical.providers.jev.level2.rows.find(row => row.caseId === label.caseId).score;
  assert.deepEqual(scorePipelineCase(saved.parserResult, label), savedScore);
  const replay = before.strictReplay.results.find(row => row.caseId === label.caseId);
  assert.deepEqual(canonical(replay.parsed), saved.parserResult);
  const oldFixture = before.counterfactualSavedAnswerFixtures.results.find(row => row.caseId === label.caseId);
  const newFixture = after.counterfactualSavedAnswerFixtures.results.find(row => row.caseId === label.caseId);
  cases.push({ caseId: label.caseId, query: saved.parserResult.draft.query.text, fieldEligible: label.fieldEligible,
    historicalScore: savedScore, expected: label.expected,
    sourceCandidates: saved.parserResult.draft.candidates, sourceObservations: newFixture.observations,
    savedDecisions: saved.parserResult.providerMetadata.decisions,
    diagnosis: diagnoses[label.caseId] ?? { categories: ['NO_IDENTIFIED_PIPELINE_MISMATCH'],
      explanation: 'Source fields in the fixed pipeline cohort agree with registered expectations, or the non-booking route is correct. Existing missing-field, timing-precision and grounding controls remain applicable.' },
    before: transition(oldFixture), after: transition(newFixture),
    fixtureSemanticsChanged: !isDeepStrictEqual(transition(oldFixture), transition(newFixture)) });
}
assert.equal(historical.providers.jev.level1.correct, 450);
assert.equal(historical.providers.clef.level1.correct, 456);
assert.equal(terminal.aggregateDispatchedCalls, 138);

const requests = [];
for (const row of inputs) {
  const current = caseRequests(row, true);
  for (const old of executor.parserRequestManifest.filter(value => value.caseId === row.caseId)) {
    const body = buildWireRequest(old.provider, current[old.stage]);
    const requestIdentity = identityHash({ provider: old.provider, body, timeoutMs: 10000, retries: 0 });
    requests.push({ provider: old.provider, caseId: row.caseId, stage: old.stage,
      previousIdentity: old.requestIdentity, currentIdentity: requestIdentity, changed: requestIdentity !== old.requestIdentity });
  }
}
const actualChanged = terminal.observations.filter(row => row.stage !== 'common').filter(row => {
  const current = requests.find(value => value.provider === row.provider && value.caseId === row.caseId && value.stage === row.stage);
  return current.changed;
}).map(row => ({ provider: row.provider, caseId: row.caseId, stage: row.stage, previousIdentity: row.requestIdentity }));
const queueSourceDrift = [];
for (const row of pending.currentSourceManifest) {
  if (hash(await readFile(new URL(row.file, root))) !== row.sha256) queueSourceDrift.push(row.file);
}
const oldSourceDrift = [];
for (const row of amendment.sourceManifest) {
  if (hash(await readFile(new URL(row.file, root))) !== row.sha256) oldSourceDrift.push(row.file);
}
await save('case-diagnosis-and-request-compatibility.json', {
  version: 'search-post-v6-offline-diagnosis-v1', recordedAt: new Date().toISOString(),
  scope: 'DEVELOPMENT_SAVED_EVIDENCE_AND_COUNTERFACTUAL_FIXTURES_ONLY', inferenceCalls: 0, PlacesCalls: 0,
  unchangedHistoricalJevDecisions: 450, unchangedHistoricalClefDecisions: 456,
  canonicalBeforeResultsVerified: cases.length, historicalPipelineScoresRecomputed: cases.length,
  equalityNote: 'The initial before-replay in-memory counter counted undefined properties omitted from persisted JSON. Canonical persisted parser results are independently identical for all 24 cases.',
  fieldCohort: cases.filter(row => row.fieldEligible).length,
  historicalFallbackCases: cases.filter(row => row.historicalScore.fallbackReasons.length).map(row => row.caseId),
  changedFixtures: cases.filter(row => row.fixtureSemanticsChanged).map(row => row.caseId),
  cases, requests, actualChangedRequests: actualChanged, oldV6SourceDrift: oldSourceDrift,
  S5: { readyToResumeAsIs: false, pendingCases: pending.LunaQueue.length, queueSourceDrift,
    providerAvailability: 'UNVERIFIED', authorization: 'NOT_AUTHORIZED_BY_THIS_TASK',
    prerequisite: 'Add a current-source continuation manifest and audit trusted partials, request/cache compatibility and provider availability before separately authorized bounded Luna execution. Preserve the original 50-case queue and receipts.' },
});
console.log(JSON.stringify({ cases: cases.length, fieldCases: cases.filter(row => row.fieldEligible).length,
  canonicalBeforeVerified: 24, fixtureChanges: cases.filter(row => row.fixtureSemanticsChanged).map(row => row.caseId),
  amendedParserRequests: requests.length, changedRequestIdentities: requests.filter(row => row.changed).length,
  actualChangedRequests: actualChanged.length, oldV6SourceDrift: oldSourceDrift, queueSourceDrift }));
