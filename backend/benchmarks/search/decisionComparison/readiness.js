import { isDeepStrictEqual } from 'node:util';
import { PROVIDERS, buildWireRequest, identityHash } from './adapters.js';
import { requestCost } from './economics.js';
import { labelView } from './pilot.js';
import { requiredFieldProjection } from './alignedContract.js';
import { fallbackEligibility } from '../../../services/search/complex/eligibility.ts';
import { validateDraftProvenance } from '../../../services/search/provenance.ts';

export const READINESS_VERSION = 'search-decision-v6-readiness-v1';
export const MAX_INPUT_RESERVATION = 24_576;
export const OPERATIONAL_CEILINGS = Object.freeze({ jev: 0.10, clef: 0.50, clefFlash: 0.10 });
export const SCORING = Object.freeze({
  level1: '463 eligible categorical labels over 24 registered cases; missing/unattempted output is not correct. Report micro, exact cases, per-task and language strata.',
  endpoints: 'Common role-choice correctness includes NONE/OTHER/AMBIGUOUS. Exact positive-span correctness additionally requires selecting an exact approved source span; OTHER is not extraction success.',
  level2: '24 fixed-clock parser attempts with the same injected provider. No Luna, Places, generative fallback or submission. Field denominators use expected SIMPLE booking cases, never provider-selected eligibility.',
  missingFields: 'Derived application requirements, not model questions. Gold is independently derived from approved annotation states; actual requirements use production policy on observed extraction only.',
  negatives: 'Exact four-class exclusion set and explicit negative-sharing cohort, plus false positives outside those cohorts.',
  partialDraft: 'Guard-accepted booking partial: observed draft, no INVALID issues, no eligible/declared fallback, valid source provenance. This is not a correct complete or confirmed booking.',
  fallback: 'Report eligibility/reason codes, declared fallback, local contract versus remote errors. R1/R2 are not fallback-required solely by complexity; existing binding failures remain possible.',
  economics: 'Separate Level 1 and Level 2 measured usage. Unknown failed-request usage makes full tariff total unknown. Complete-workflow cost and booking success remain unmeasured.',
});

const sorted = values => [...new Set(values)].sort();
const fieldState = value => value === undefined || value === 'UNSPECIFIED' ? 'UNSPECIFIED'
  : value === 'AMBIGUOUS' ? 'AMBIGUOUS' : value.state ?? 'RESOLVED';

// Independent annotation-based hierarchy: do not invoke the production projector
// to manufacture its own expected answer. This is not a valid booking draft.
export function requiredFieldsGold(expected, roleLabels) {
  if (expected.queryType !== 'BOOKING_REQUEST') return null;
  const fields = [];
  for (const role of ['pickup', 'drop']) if (roleLabels[role].allowed.includes('NONE')) fields.push(role);
  if (expected.vehicle.state !== 'RESOLVED') fields.push('vehicleClass');
  if (expected.timingMode === 'UNSPECIFIED') fields.push('timing');
  if (expected.timingMode === 'SCHEDULED') {
    if (fieldState(expected.date) === 'UNSPECIFIED') fields.push('timing.date');
    if (fieldState(expected.time) === 'UNSPECIFIED') fields.push('timing.time');
  }
  return sorted(fields);
}

export function pipelineLabel(historical, common) {
  const expected = historical.pipelineExpected ? labelView({ expected: historical.pipelineExpected }, historical.language)
    : Object.fromEntries(Object.entries(historical.pipelineRecord.truth.expected)
      .filter(([, value]) => value.status === 'LABELLED').map(([key, value]) => [key, value.value]));
  const originalComplexity = expected.complexity;
  expected.complexity = common.labels.complexity.allowed[0];
  return { caseId: historical.caseId, language: historical.language, expected,
    fieldEligible: expected.queryType === 'BOOKING_REQUEST' && expected.complexity === 'SIMPLE',
    requiredFields: requiredFieldsGold(expected, common.labels), roleLabels: { pickup: common.labels.pickup, drop: common.labels.drop },
    originalComplexity, ownerDecisionIds: common.ownerPolicyDecisionIds ?? [],
    historicalFallbackAnnotation: expected.fallbackExpectation ?? expected.fallbackExpected ?? null,
    fallbackScoring: 'DESCRIPTIVE_ELIGIBILITY; historical COMPLEX-only expectations do not override new SIMPLE policy.',
    historicalLabelHash: identityHash(historical) };
}

export function wireMeaning(provider, request) {
  const body = buildWireRequest(provider, request);
  return provider === 'decisions' ? { state: body.input,
    questions: Object.fromEntries(body.questions.map(question => [question.name, {
      kind: question.type === 'predicate' ? 'noul' : question.type, instructions: question.instructions,
      ...(question.type === 'choice' ? { choices: Object.fromEntries(question.choices.map(choice => [choice.value, choice.description])) } : {}),
    }])) } : { state: body.state, questions: Object.fromEntries(Object.entries(body.questions).map(([name, question]) => [name, {
    kind: question.type, instructions: question.instructions, ...(question.type === 'choice' ? { choices: question.criteria } : {}),
  }])) };
}

export function fakeEnvelope(provider, request, selections = {}) {
  const answers = Object.fromEntries(Object.entries(request.questions).map(([name, question]) => {
    if (question.kind === 'noul') return [name, { type: 'noul', noul: 0.8 }];
    const choice = selections[name] ?? Object.keys(question.choices)[0];
    return [name, { type: 'choice', choice, confidence: 1,
      probabilities: Object.fromEntries(Object.keys(question.choices).map(value => [value, Number(value === choice)])) }];
  }));
  const body = { model: PROVIDERS[provider].expectedModel ?? PROVIDERS[provider].selector,
    answers, usage: { input_tokens: 100, output_tokens: 0 } };
  if (provider === 'decisions') {
    body.usage.input_tokens_details = { cached_tokens: 0, cache_write_tokens: 0 };
    body.answers = Object.entries(answers).map(([name, answer]) => answer.type === 'noul'
      ? { name, type: 'predicate', probability: answer.noul }
      : { ...answer, name, probabilities: Object.entries(answer.probabilities).map(([value, probability]) => ({ value, probability })) });
  }
  return provider.startsWith('clef') ? { success: true, result: body, errors: [], messages: [] } : body;
}

export function scoreLevelOne(labels, inputs, pipelineLabels, observations = new Map()) {
  const counts = { registeredCases: labels.length, eligible: 0, correct: 0, observedCases: 0, exactCases: 0,
    tasks: {}, languages: {}, positiveEndpoints: { pickup: { correct: 0, total: 0 }, drop: { correct: 0, total: 0 } } };
  for (const row of labels) {
    const input = inputs.find(value => value.caseId === row.caseId);
    const observation = observations.get(row.caseId);
    const stratum = counts.languages[input.language] ??= { cases: 0, eligible: 0, correct: 0, exact: 0 };
    stratum.cases += 1;
    if (observation?.normalized) counts.observedCases += 1;
    let exact = Boolean(observation?.normalized);
    for (const [name, label] of Object.entries(row.labels)) {
      if (label === null) continue;
      const task = counts.tasks[name] ??= { correct: 0, total: 0 };
      const choice = observation?.normalized?.choices[name]?.choice;
      const correct = label.allowed.includes(choice);
      task.total += 1; task.correct += Number(correct); counts.eligible += 1; counts.correct += Number(correct);
      stratum.eligible += 1; stratum.correct += Number(correct); exact &&= correct;
      if (['pickup', 'drop'].includes(name) && pipelineLabels.find(value => value.caseId === row.caseId).expected[`${name}Spans`].length) {
        counts.positiveEndpoints[name].total += 1;
        const candidate = input.tasks.candidates.find(value => value.candidateId === choice);
        const spans = pipelineLabels.find(value => value.caseId === row.caseId).expected[`${name}Spans`];
        counts.positiveEndpoints[name].correct += Number(Boolean(candidate && spans.some(span => span.start === candidate.start
          && span.end === candidate.end && span.exactText === candidate.exactText)));
      }
    }
    counts.exactCases += Number(exact); stratum.exact += Number(exact);
  }
  return counts;
}

function sourceSpan(draft, role) {
  const field = draft[role];
  if (field.state !== 'RESOLVED' || field.value.kind !== 'QUERY_CANDIDATE') return null;
  const candidate = draft.candidates.find(value => value.candidateId === field.value.candidateId);
  return candidate && candidate.queryId === draft.query.id && candidate.queryRevision === draft.query.revision
    && draft.query.text.slice(candidate.start, candidate.end) === candidate.exactText ? candidate : null;
}

function parserAvailability(result) {
  const draft = result?.draft;
  const provenance = draft ? validateDraftProvenance(draft) : null;
  const observed = Boolean(draft), valid = observed && provenance.length === 0 && !result.issues.some(issue => issue.category === 'INVALID');
  const extracted = valid && draft.queryType === 'BOOKING_REQUEST' && draft.complexity === 'SIMPLE'
    && result.providerMetadata.completedRequests >= 2;
  return { observed, extracted, provenance };
}

function endpointScores(draft, label, extracted) {
  const expected = label.expected;
  return Object.fromEntries(['pickup', 'drop'].map(role => {
    const expectedSpans = expected[`${role}Spans`], span = extracted ? sourceSpan(draft, role) : null;
    const positive = expectedSpans.length > 0;
    const correct = extracted && (positive ? expectedSpans.some(value => span && value.start === span.start
      && value.end === span.end && value.exactText === span.exactText)
      : draft[role].state === (label.roleLabels[role].allowed.includes('AMBIGUOUS') ? 'AMBIGUOUS' : 'UNSPECIFIED'));
    return [role, { eligible: label.fieldEligible, positive, correct: Boolean(correct),
      positiveCorrect: positive && Boolean(correct) }];
  }));
}

function preferenceScores(draft, expected, extracted) {
  const expectedExclusions = sorted(expected.vehicle.excluded ?? expected.vehicleExclusions ?? []);
  const observedExclusions = extracted ? sorted(draft.vehicleClass.excluded ?? []) : null;
  const expectedSharing = expected.flags.sharing;
  return {
    vehicleCorrect: Boolean(extracted && draft.vehicleClass.state === expected.vehicle.state
      && (expected.vehicle.state !== 'RESOLVED' || draft.vehicleClass.value === expected.vehicle.value)),
    timingModeCorrect: Boolean(extracted && draft.timing.mode === expected.timingMode),
    exclusionSetCorrect: extracted && isDeepStrictEqual(observedExclusions, expectedExclusions),
    expectedExclusions, observedExclusions, explicitNegativeSharing: expectedSharing?.state === 'RESOLVED' && expectedSharing.value === false,
    sharingCorrect: Boolean(extracted && draft.sharing.state === expectedSharing?.state
      && (expectedSharing.state !== 'RESOLVED' || draft.sharing.value === expectedSharing.value)),
  };
}

export function scorePipelineCase(result, label) {
  const draft = result?.draft, expected = label.expected;
  const { observed, extracted, provenance } = parserAvailability(result);
  const fallback = result ? fallbackEligibility(result) : [];
  const actualMissing = extracted ? requiredFieldProjection(draft).missingFields : null;
  return { observed, fieldEligible: label.fieldEligible, extractionObserved: Boolean(extracted),
    queryTypeCorrect: observed && draft.queryType === expected.queryType,
    complexityCorrect: observed && draft.complexity === expected.complexity,
    roles: endpointScores(draft, label, extracted), ...preferenceScores(draft, expected, extracted),
    missingFieldSetCorrect: Boolean(extracted && isDeepStrictEqual(actualMissing, label.requiredFields)), actualMissing,
    provenanceViolations: provenance?.length ?? null, fallbackReasons: fallback, declaredFallback: result?.fallbackRequired ?? null,
    guardAcceptedBookingPartial: Boolean(extracted && !fallback.length && !result.fallbackRequired),
    localContractFailure: Boolean(result?.issues.some(issue => issue.code === 'JEV_SCHEMA_ERROR' && issue.field === 'questions')),
    groundingExecuted: false, submittedBookings: 0 };
}

// Pure request/usage ledger. It creates no transport and never reads credentials.
// One ledger belongs to the entire activation: any stop freezes all providers.
export function createStopLedger(enabledProviders = ['jev', 'clef']) {
  const state = { stopped: false, reason: null, inFlight: null, lastStart: -Infinity,
    providers: Object.fromEntries(enabledProviders.map(provider => [provider, { calls: 0, knownUsd: 0, usageUnknown: false }])) };
  const stop = reason => { state.stopped = true; state.reason = reason; };
  return { state, stop,
    reserve(provider, requestBytes, nowMs) {
      if (state.stopped) throw new Error('ACTIVATION_STOPPED');
      if (!Number.isFinite(nowMs)) throw new Error('INVALID_CLOCK');
      if (provider === 'decisions' || !Object.hasOwn(OPERATIONAL_CEILINGS, provider) || !state.providers[provider]) throw new Error('PROVIDER_NOT_ENABLED');
      if (state.inFlight) throw new Error('CONCURRENCY_LIMIT');
      if (nowMs - state.lastStart < 1000) throw new Error('THROTTLE_REQUIRED');
      const usage = state.providers[provider], reserve = MAX_INPUT_RESERVATION * PROVIDERS[provider].inputPerMillion / 1e6;
      if (!Number.isSafeInteger(requestBytes) || requestBytes < 0 || requestBytes + 4096 > MAX_INPUT_RESERVATION) {
        stop('LOCAL_CONTEXT_BUDGET'); throw new Error(state.reason);
      }
      if (usage.calls >= 72 || usage.knownUsd + reserve > OPERATIONAL_CEILINGS[provider] + 1e-12) {
        stop('REQUEST_OR_TARIFF_LIMIT'); throw new Error(state.reason);
      }
      usage.calls += 1; state.lastStart = nowMs; state.inFlight = provider;
    },
    settle(observation) {
      const provider = state.inFlight;
      if (!provider || observation.provider !== provider) { stop('OBSERVATION_IDENTITY'); throw new Error(state.reason); }
      state.inFlight = null;
      const usage = state.providers[provider], cost = requestCost(provider, observation);
      if (cost === null) usage.usageUnknown = true; else usage.knownUsd += cost;
      if (observation.error) { stop(observation.error.category); return; }
      if (!observation.normalized || cost === null) { stop('MISSING_OUTPUT_OR_USAGE'); return; }
      if (provider === 'jev' && observation.normalized.metadata.model !== PROVIDERS.jev.expectedModel) { stop('MODEL_VERSION_CHANGED'); return; }
      const inputTokens = observation.normalized.metadata.usage?.inputTokens;
      if (!Number.isSafeInteger(inputTokens) || inputTokens > MAX_INPUT_RESERVATION
        || cost > MAX_INPUT_RESERVATION * PROVIDERS[provider].inputPerMillion / 1e6
        || usage.knownUsd > OPERATIONAL_CEILINGS[provider]) stop('OBSERVED_TARIFF_LIMIT');
    } };
}
