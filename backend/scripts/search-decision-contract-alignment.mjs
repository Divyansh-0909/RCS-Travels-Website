import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { emptyDraft } from '../services/search/contracts.ts';
import { routingRequest, extractionRequest, SEARCH_QUESTION_CONTRACT_VERSION } from '../services/search/questions.ts';
import { collectObservations } from '../services/search/observations.ts';
import { generateLocationCandidates } from '../services/search/locations/candidates.ts';
import { createRideSearchParser } from '../services/search/parser.ts';
import { validateDecisionRequest } from '../services/search/provider.ts';
import { validateDraftProvenance } from '../services/search/provenance.ts';
import { fallbackEligibility } from '../services/search/complex/eligibility.ts';
import { decisionFake, bookingRouting, expressionChoices } from '../tests/helpers/rideSearchFake.js';
import { createTestClock } from '../tests/helpers/testClock.js';
import { buildWireRequest, validateRequest, identityHash, PROVIDERS } from '../benchmarks/search/decisionComparison/adapters.js';
import { commonLabels, labelView } from '../benchmarks/search/decisionComparison/pilot.js';
import { alignedTasks, alignedLabels, requiredFieldProjection, ALIGNED_CONTRACT_VERSION } from '../benchmarks/search/decisionComparison/alignedContract.js';

// Offline only: no fetch, credentials, HTTP transports, live runner or env loading.
const root = new URL('../../', import.meta.url);
const out = new URL('output/search-v1-decision-contract-alignment-2026-11-02/', root);
const prior = 'output/search-v1-b1-comparison-2026-11-02/';
const load = async file => JSON.parse(await readFile(new URL(file, root), 'utf8'));
const save = (name, value) => writeFile(new URL(name, out), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const baseline = JSON.parse(await readFile(new URL('baseline.json', out), 'utf8'));
const inputs = await load(prior + 'pilot-inputs-v4.json');
const labels = await load(prior + 'pilot-labels-v4.json');
const originalPlan = await load(prior + 'pilot-registration-v4.json');
const results = await load(prior + 'comparison-live-results-v4.json');

function expectedView(row) {
  if (row.pipelineExpected) return labelView({ expected: row.pipelineExpected }, row.language);
  return Object.fromEntries(Object.entries(row.pipelineRecord.truth.expected)
    .filter(([, field]) => field.status === 'LABELLED').map(([name, field]) => [name, field.value]));
}
const fieldState = value => value === 'UNSPECIFIED' || value === undefined ? 'UNSPECIFIED' : value.state ?? 'RESOLVED';
function annotationPolicyProjection(input, expected) {
  // Annotation-state audit only: no provider output, candidate ID or geography is
  // fabricated. This partial object cannot serve as a valid booking draft.
  const state = emptyDraft(input.query);
  state.queryType = expected.queryType; state.complexity = expected.complexity;
  for (const role of ['pickup', 'drop']) state[role] = expected[`${role}Spans`].length
    ? { state: 'RESOLVED', value: { kind: 'QUERY_CANDIDATE' }, refs: [] }
    : role === 'drop' && expected.conditionalAlternatives?.includes('CONDITIONAL_DESTINATIONS')
      ? { state: 'AMBIGUOUS', alternatives: [], refs: [] } : { state: 'UNSPECIFIED' };
  state.vehicleClass = expected.vehicle;
  state.timing.mode = expected.timingMode;
  state.timing.date = { state: fieldState(expected.date) };
  state.timing.time = { state: fieldState(expected.time) };
  return requiredFieldProjection(state);
}
function errorStratum(field, expected) {
  if (['timing.date', 'timing.time'].includes(field) && expected.timingMode !== 'SCHEDULED') return 'INAPPLICABLE_TIMING_CHILD';
  if (field === 'timing.time' && fieldState(expected.time) === 'AMBIGUOUS') return 'AMBIGUOUS_NOT_ABSENT_TIME';
  if (field === 'drop' && expected.conditionalAlternatives?.includes('CONDITIONAL_DESTINATIONS')) return 'CONDITIONAL_DESTINATION_REQUIREMENT';
  if (['pickup', 'drop'].includes(field) && expected[`${field}Spans`].length) return 'STATED_ENDPOINT_VS_GROUNDING';
  if (field === 'timing.time' && fieldState(expected.time) === 'RESOLVED') return 'STATED_TIME_VS_PRECISION_CONTROL';
  if (field === 'vehicleClass' && ['EXPLICIT_ANY', 'EXCLUDED', 'AMBIGUOUS'].includes(expected.vehicle.state)) return 'VEHICLE_CONSTRAINT_VS_SELECTION';
  if (field === 'timing' && expected.timingMode !== 'UNSPECIFIED') return 'STATED_TIMING_PARENT';
  return 'OTHER_REQUIRED_SOURCE_FIELD_DISAGREEMENT';
}

async function analyze() {
  const projections = labels.map(row => {
    const expected = expectedView(row), input = inputs.find(value => value.caseId === row.caseId).input;
    const projection = annotationPolicyProjection(input, expected);
    return { caseId: row.caseId, applicable: projection.applicable, legacyMissing: expected.missingFields,
      policyMissing: projection.missingFields, policyIssues: projection.issues,
      differs: projection.applicable && identityHash([...expected.missingFields].sort()) !== identityHash(projection.missingFields) };
  });
  const missing = {};
  for (const provider of ['jev', 'clefFlash', 'clef', 'decisions']) {
    const observations = await load(prior + `${provider}-observations-v4.json`);
    const level1 = new Map(observations.filter(row => row.level === 'level1').map(row => [row.caseId, row]));
    const errors = [], strata = {}, fieldCounts = {};
    let cases = 0, exactSets = 0, correct = 0, total = 0;
    for (const row of labels) {
      const expected = expectedView(row), observation = level1.get(row.caseId);
      if (expected.queryType !== 'BOOKING_REQUEST' || !observation?.normalized) continue;
      cases += 1; let exact = true;
      for (const field of ['pickup', 'drop', 'vehicleClass', 'timing', 'timing.date', 'timing.time']) {
        const name = `missing_${field.replaceAll('.', '_')}`;
        const actual = observation.normalized.choices[name].choice, gold = row.labels[name].allowed;
        const matched = gold.includes(actual); total += 1; correct += Number(matched);
        fieldCounts[field] ??= { correct: 0, total: 0 }; fieldCounts[field].total += 1; fieldCounts[field].correct += Number(matched);
        if (!matched) {
          exact = false; const stratum = errorStratum(field, expected); strata[stratum] = (strata[stratum] ?? 0) + 1;
          errors.push({ caseId: row.caseId, field, actual, expected: gold, stratum });
        }
      }
      exactSets += Number(exact);
    }
    missing[provider] = { observedBookingCases: cases, exactMissingSets: exactSets, perField: { correct, total },
      fieldCounts, errorsByObservablePolicyStratum: strata, errors,
      caveat: 'These are observable error contexts, not causal proof of what a model reasoned. Original v4 scores remain unchanged.' };
    if (provider !== 'decisions' && exactSets !== ({ jev: 3, clefFlash: 7, clef: 5 })[provider]) throw new Error('V4_MISSING_SCORES_NOT_REPRODUCED');
  }
  const snapshot = baseline.sourceSnapshot.find(row => row.file === 'backend/services/search/questions.ts');
  const originalDirectory = dirname(fileURLToPath(new URL(snapshot.file, root)));
  const oldSource = stripTypeScriptTypes(snapshot.text).replace(/from (['"])(\.[^'"]+)\1/gu,
    (_, quote, relative) => `from ${quote}${pathToFileURL(resolve(originalDirectory, relative)).href}${quote}`);
  const oldQuestions = await import(`data:text/javascript;base64,${Buffer.from(oldSource).toString('base64')}`);
  const answers = {
    'hh-v1-seed-007': { vehicle_class: 'suv', vehicle_strength: 'REQUIRED', exclude_sedan: 'EXCLUDED' },
    'hh-v1-seed-040': { sharing: 'NO' },
    'hh-v1-added-004': { vehicle_class: 'sedan', vehicle_strength: 'PREFERRED', exclude_suv: 'EXCLUDED', exclude_suv_premium: 'EXCLUDED', unsupported_service: 'CONDITIONAL_PREFERENCE' },
    'hh-v1-added-007': { unsupported_service: 'RENTAL' },
  };
  const singletonCases = [];
  for (const [caseId, selected] of Object.entries(answers)) {
    const input = inputs.find(row => row.caseId === caseId).input;
    const requestInput = { query: input.query, timeZone: input.context.timeZone,
      candidates: generateLocationCandidates(input.query, 'BOOKING_REQUEST').candidates };
    const nowIso = new Date(input.context.clock).toISOString();
    const before = oldQuestions.extractionRequest(requestInput, nowIso, collectObservations(input.query, requestInput.candidates));
    const after = extractionRequest(requestInput, nowIso, collectObservations(input.query, requestInput.candidates));
    let beforeFailure = null; try { validateRequest(before); } catch (error) { beforeFailure = error.category; }
    validateRequest(after);
    const fake = decisionFake([bookingRouting, request => ({ ...expressionChoices(request), pickup_mentioned: 0, drop_mentioned: 0, ...selected })]);
    const provider = { decide(request) { validateDecisionRequest(request); validateRequest(request); return fake.decide(request); } };
    const parsed = await createRideSearchParser(provider, createTestClock(input.context.clock), generateLocationCandidates).parse(requestInput);
    singletonCases.push({ caseId, candidateCount: requestInput.candidates.length,
      before: { failure: beforeFailure, pickupChoiceCount: Object.keys(before.questions.pickup_candidate.choices).length,
        dropChoiceCount: Object.keys(before.questions.drop_candidate.choices).length, requestHash: identityHash(before) },
      after: { requestHash: identityHash(after), candidateQuestionsOmitted: !after.questions.pickup_candidate && !after.questions.drop_candidate,
        requestValidated: true, fakeRequests: fake.requests.length, route: parsed.route, issues: parsed.issues,
        pickup: parsed.draft.pickup.state, drop: parsed.draft.drop.state, fallbackReasons: fallbackEligibility(parsed),
        provenanceIssues: validateDraftProvenance(parsed.draft), assertion: 'FAKE_ONLY_NOT_MODEL_ACCURACY' } });
  }
  const routingRequestsUnchanged = inputs.every(row => {
    const input = { query: row.input.query, candidates: [], timeZone: row.input.context.timeZone };
    return identityHash(oldQuestions.routingRequest(input, new Date(row.input.context.clock).toISOString()))
      === identityHash(routingRequest(input, new Date(row.input.context.clock).toISOString()));
  });
  await save('analysis.json', { version: 'search-contract-alignment-analysis-v1', historicalPlanHash: originalPlan.planHash,
    inferenceCalls: 0, singletonCases, routingRequestsUnchanged, annotationStatePolicyProjections: projections,
    annotationProjectionCaveat: 'State-only truth audit, not valid booking drafts or invented provider/candidate answers.', missingFields: missing });
  console.log(JSON.stringify({ singletonCases: singletonCases.map(row => ({ id: row.caseId, before: row.before.failure,
    afterValid: row.after.requestValidated, route: row.after.route })), routingRequestsUnchanged,
    policyProjectionDifferences: projections.filter(row => row.differs).map(row => row.caseId),
    missing: Object.fromEntries(Object.entries(missing).map(([id, row]) => [id, { exact: row.exactMissingSets,
      cases: row.observedBookingCases, fields: row.perField, strata: row.errorsByObservablePolicyStratum }])) }));
}

async function propose() {
  for (const row of labels) {
    const candidates = inputs.find(input => input.caseId === row.caseId).tasks.candidates;
    if (identityHash(commonLabels(expectedView(row), candidates)) !== identityHash(row.labels)) throw new Error('ORIGINAL_LABEL_PROJECTION_NOT_PRESERVED');
  }
  const conflicts = [
    { id: 'RENTAL_ROUTING', caseIds: ['hh-v1-added-007'], fields: ['complexity'],
      existingRule: 'Production routing explicitly allows rental to be SIMPLE; owner-approved rental-duration family keeps unsupported rental without mandatory fallback.',
      reviewedLabel: 'COMPLEX', decision: 'For rental-only intent without endpoints, retain SIMPLE plus unsupported form resolution, or require COMPLEX interpretation?' },
    { id: 'VEHICLE_AVAILABILITY_ROUTING', caseIds: ['hh-v1-added-004', 'hh-v1-added-033'], fields: ['complexity'],
      existingRule: 'One journey and a soft preferred class do not alone clearly establish branching; owner policy explicitly exempts soft AC, but does not specify all vehicle-availability conditions.',
      reviewedLabel: 'COMPLEX', decision: 'Does a single preferred vehicle if available need COMPLEX interpretation, or SIMPLE while preserving the material preference for form review?' },
  ];
  const proposedInputs = inputs.map(row => ({ caseId: row.caseId, language: row.language, input: row.input, tasks: alignedTasks(row.input) }));
  const proposedLabels = labels.map(row => {
    const blocked = conflicts.filter(conflict => conflict.caseIds.includes(row.caseId));
    return { caseId: row.caseId, originalV4LabelsHash: identityHash(row.labels), originalApprovalPreserved: true,
      labels: alignedLabels(expectedView(row), proposedInputs.find(value => value.caseId === row.caseId).tasks.candidates, blocked.flatMap(value => value.fields)),
      blockedByPolicyDecisions: blocked.map(value => value.id), liveApproval: false };
  });
  const paths = [...new Set([...baseline.sourceSnapshot.map(row => row.file),
    'backend/benchmarks/search/decisionComparison/alignedContract.js',
    'backend/scripts/search-decision-contract-alignment.mjs', 'backend/tests/rideSearchDecisionContractAlignment.test.js',
    'backend/tests/rideSearchAdversarial.test.js', 'backend/tests/rideSearchObservationMutations.test.js', 'backend/tests/rideSearchS4Trusted.test.js'])].sort();
  const sourceManifest = await Promise.all(paths.map(async file => ({ file, sha256: hash(await readFile(new URL(file, root))) })));
  const costs = Object.fromEntries(Object.entries(PROVIDERS).map(([provider, spec]) => [provider,
    { level1MaxCalls: 24, level2MaxCalls: 48, maxCalls: 72, planningInputTokensPerCall: 24576,
      publishedUsdPlanningEstimate: 72 * 24576 * spec.inputPerMillion / 1_000_000, additionalCallsExecuted: 0 }]));
  const final = process.argv[2] === '--propose-final';
  const earlier = final ? JSON.parse(await readFile(new URL('proposal-v5.json', out), 'utf8')) : null;
  const content = { version: ALIGNED_CONTRACT_VERSION, proposalRevision: final ? 'FINAL_OFFLINE_REVIEW' : 'PRELIMINARY',
    supersedesProposalHash: earlier?.proposalHash ?? null, productionQuestionContract: SEARCH_QUESTION_CONTRACT_VERSION,
    createdAt: new Date().toISOString(), parentPlanHash: originalPlan.planHash,
    executable: false, liveAuthorized: false, readyForLive: false, ownerDecisionsRequired: conflicts,
    selection: originalPlan.selection, originalApprovalDoesNotApproveRewordedTasks: true,
    modelQuestionCount: 20, missingFieldTarget: 'DETERMINISTIC_APPLICATION_POLICY_NOT_DIRECT_MODEL_DECISIONS',
    unsupportedTasks: proposedInputs[0].tasks.unsupportedTasks,
    inputArtifactHash: identityHash(proposedInputs), labelArtifactHash: identityHash(proposedLabels),
    sourceManifest, costs,
    requestBytes: Object.fromEntries(Object.keys(PROVIDERS).map(provider => [provider,
      { largest: Math.max(...proposedInputs.map(row => Buffer.byteLength(JSON.stringify(buildWireRequest(provider, row.tasks.request))))),
        total: proposedInputs.reduce((sum, row) => sum + Buffer.byteLength(JSON.stringify(buildWireRequest(provider, row.tasks.request))), 0) }])),
    caveats: ['No v4 response is replayed as v5 accuracy.', 'Planning estimate is not measured token usage or an invoice cap.',
      'Existing policy, form controls, fallback eligibility and booking authority are unchanged.'] };
  const proposal = { ...content, proposalHash: identityHash(content) };
  const suffix = final ? '-final' : '';
  await save(`proposal-v5${suffix}-inputs.json`, proposedInputs); await save(`proposal-v5${suffix}-labels.json`, proposedLabels); await save(`proposal-v5${suffix}.json`, proposal);
  console.log(JSON.stringify({ proposalHash: proposal.proposalHash, cases: proposedInputs.length,
    questionsPerCase: proposal.modelQuestionCount, sourceFiles: sourceManifest.length, liveAuthorized: false, costs, requestBytes: proposal.requestBytes }));
}

async function verify() {
  const protectedChanges = [];
  for (const source of baseline.protectedFiles) if (hash(await readFile(new URL(source.file, root))) !== source.sha256) protectedChanges.push(source.file);
  const proposal = JSON.parse(await readFile(new URL('proposal-v5-final.json', out), 'utf8'));
  const staleSources = [];
  for (const source of proposal.sourceManifest) if (hash(await readFile(new URL(source.file, root))) !== source.sha256) staleSources.push(source.file);
  const changedV4Sources = [];
  for (const source of baseline.sourceSnapshot) if (hash(await readFile(new URL(source.file, root))) !== source.sha256) changedV4Sources.push(source.file);
  const git = (...args) => execFileSync('git', args, { cwd: fileURLToPath(root) });
  const report = { checkedAt: new Date().toISOString(), protectedFilesChecked: baseline.protectedFiles.length, protectedChanges,
    archivedV4SourceFiles: baseline.sourceSnapshot.length, changedV4Sources, currentProposalSourcesChecked: proposal.sourceManifest.length, staleSources,
    headUnchanged: git('rev-parse', 'HEAD').toString().trim() === baseline.head,
    stagedIdentityUnchanged: hash(git('diff', '--cached', '--raw')) === baseline.stagedIdentity,
    inferenceCalls: 0, PlacesCalls: 0, heldOutCalls: 0, challengeCalls: 0, pendingQueueCalls: 0,
    historicalResultIdentity: results.planHash, historicalResultsNotReboundToNewSources: true };
  await save('preservation.json', report); console.log(JSON.stringify(report));
  if (protectedChanges.length || staleSources.length || !report.headUnchanged || !report.stagedIdentityUnchanged) process.exitCode = 1;
}

const mode = process.argv[2];
if (mode === '--analyze') await analyze();
else if (mode === '--propose' || mode === '--propose-final') await propose();
else if (mode === '--verify') await verify();
else throw new Error('Choose --analyze, --propose, --propose-final or --verify. This script has no live mode.');
