import { isDeepStrictEqual } from 'node:util';
import { scoreLevelOne, scorePipelineCase } from './readiness.js';
import { requestCost } from './economics.js';

const sorted = values => [...new Set(values)].sort();
function latency(values) {
  const samples = values.filter(Number.isFinite).sort((a, b) => a - b);
  const rank = fraction => samples.length ? samples[Math.max(0, Math.ceil(fraction * samples.length) - 1)] : null;
  return { n: samples.length, median: rank(0.5), p95: samples.length >= 20 ? rank(0.95) : null };
}
function usage(provider, observations) {
  const costs = observations.map(row => row.eligibleForRegisteredScores === false ? null : requestCost(provider, row));
  const known = observations.filter(row => {
    const measured = (row.raw?.result ?? row.raw)?.usage;
    return Number.isSafeInteger(measured?.input_tokens) && measured.input_tokens >= 0
      && Number.isSafeInteger(measured.output_tokens) && measured.output_tokens >= 0;
  });
  const tokens = key => known.reduce((sum, row) => sum + (row.raw.result ?? row.raw).usage[key], 0);
  const subtotal = costs.reduce((sum, cost) => sum + (cost ?? 0), 0);
  return { attempts: observations.length, knownUsage: known.length, knownTariffRequests: costs.filter(cost => cost !== null).length,
    knownInputTokens: tokens('input_tokens'), knownOutputTokens: tokens('output_tokens'),
    knownTariffSubtotalUsd: subtotal, completeTariffUsd: costs.every(cost => cost !== null) ? subtotal : null,
    actualAccountChargeUsd: null, freeAllocation: 'UNVERIFIED' };
}
function fieldSummary(rows) {
  const eligible = rows.filter(row => row.score.fieldEligible), count = property => eligible.filter(row => row.score[property]).length;
  const negatives = eligible.filter(row => row.score.expectedExclusions.length);
  const sharing = eligible.filter(row => row.score.explicitNegativeSharing);
  return { cases: eligible.length, extractionObserved: count('extractionObserved'), vehicleCorrect: count('vehicleCorrect'),
    timingModeCorrect: count('timingModeCorrect'), missingFieldSetsCorrect: count('missingFieldSetCorrect'),
    exclusionSetsCorrect: count('exclusionSetCorrect'), negativeExclusionCohort: { total: negatives.length,
      correct: negatives.filter(row => row.score.exclusionSetCorrect).length },
    exclusionFalsePositives: eligible.reduce((sum, row) => sum + (row.score.observedExclusions ?? []).filter(value => !row.score.expectedExclusions.includes(value)).length, 0),
    negativeSharingCohort: { total: sharing.length, correct: sharing.filter(row => row.score.sharingCorrect).length },
    unsupportedSetsCorrect: eligible.filter(row => row.unsupportedCorrect).length,
    endpoints: Object.fromEntries(['pickup', 'drop'].map(role => [role, { total: eligible.length,
      correct: eligible.filter(row => row.score.roles[role].correct).length,
      positiveTotal: eligible.filter(row => row.score.roles[role].positive).length,
      positiveCorrect: eligible.filter(row => row.score.roles[role].positiveCorrect).length }])) };
}
export function providerResults(provider, bundle, observations, cases) {
  const own = observations.filter(row => row.provider === provider), completed = cases.filter(row => row.provider === provider);
  const common = new Map(own.filter(row => row.stage === 'common').map(row => [row.caseId,
    row.eligibleForRegisteredScores === false ? { ...row, normalized: null } : row]));
  const rows = bundle.pipelineLabels.map(label => {
    const parsed = completed.find(row => row.caseId === label.caseId)?.parserResult ?? null;
    const score = scorePipelineCase(parsed, label);
    return { caseId: label.caseId, language: label.language, score,
      unsupportedCorrect: score.extractionObserved && isDeepStrictEqual(sorted(parsed.draft.unsupportedRequests.map(row => row.kind)), sorted(label.expected.unsupportedRequests)),
      requiredComplex: label.expected.queryType === 'BOOKING_REQUEST' && label.expected.complexity === 'COMPLEX' };
  });
  const required = rows.filter(row => row.requiredComplex);
  return { status: completed.length === 24 ? 'CASES_VISITED' : own.length ? 'STOPPED_OR_PARTIAL' : 'NOT_STARTED',
    level1: scoreLevelOne(bundle.labels, bundle.inputs, bundle.pipelineLabels, common),
    level2: { registeredCases: 24, observed: rows.filter(row => row.score.observed).length,
      queryTypeCorrect: rows.filter(row => row.score.queryTypeCorrect).length, complexityCorrect: rows.filter(row => row.score.complexityCorrect).length,
      fields: fieldSummary(rows), guardAcceptedBookingPartials: rows.filter(row => row.score.guardAcceptedBookingPartial).length,
      eligibleFallback: rows.filter(row => row.score.fallbackReasons.length).length,
      requiredComplexFallback: { total: required.length, eligible: required.filter(row => row.score.fallbackReasons.length).length },
      localContractFailures: rows.filter(row => row.score.localContractFailure).length,
      provenanceViolations: rows.reduce((sum, row) => sum + (row.score.provenanceViolations ?? 0), 0),
      provenanceUnobserved: rows.filter(row => row.score.provenanceViolations === null).length,
      rows, fallbackExecuted: 0, PlacesExecuted: 0, submittedBookings: 0 },
    requests: { common: own.filter(row => row.stage === 'common').length, routing: own.filter(row => row.stage === 'routing').length,
      extraction: own.filter(row => ['booking', 'location'].includes(row.stage)).length },
    latency: { level1ProviderMs: latency(own.filter(row => row.stage === 'common').map(row => row.providerLatencyMs)),
      parserEndToEndMs: latency(completed.map(row => row.parserLatencyMs)) },
    economics: { all: usage(provider, own), level1: usage(provider, own.filter(row => row.stage === 'common')),
      parser: usage(provider, own.filter(row => row.stage !== 'common')), fullWorkflowCostUsd: null } };
}
