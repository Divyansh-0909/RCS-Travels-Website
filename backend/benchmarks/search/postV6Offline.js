import { isDeepStrictEqual } from 'node:util';
import { createRideSearchParser } from '../../services/search/parser.ts';
import { generateLocationCandidates } from '../../services/search/locations/candidates.ts';
import { collectObservations } from '../../services/search/observations.ts';
import { validateDraftProvenance } from '../../services/search/provenance.ts';
import { fallbackEligibility } from '../../services/search/complex/eligibility.ts';
import { createLocationReview } from '../../services/search/locations/review.ts';
import { formResolution } from '../../services/search/locations/formResolution.ts';
import { buildWireRequest } from './decisionComparison/adapters.js';
import { createTestClock } from '../../tests/helpers/testClock.js';

// No transport, credentials, SDK client or production provider factory exists here.
// Strict replay refuses changed requests. Answer fixtures are a separate, explicitly
// counterfactual mode: saved answers exercise new code, never measure new accuracy.
export async function replayDevelopmentCase(row, terminal, mode = 'STRICT_REQUEST_REPLAY') {
  if (!['STRICT_REQUEST_REPLAY', 'COUNTERFACTUAL_SAVED_ANSWER_FIXTURE'].includes(mode)) throw new Error('INVALID_OFFLINE_MODE');
  const original = terminal.cases.find(item => item.provider === 'jev' && item.caseId === row.caseId).parserResult;
  const saved = terminal.observations.filter(item => item.provider === 'jev' && item.caseId === row.caseId && item.stage !== 'common');
  let index = 0;
  const requests = [];
  const provider = { async decide(request) {
    const previous = saved[index++];
    const exact = Boolean(previous && isDeepStrictEqual(buildWireRequest('jev', request), previous.request));
    requests.push({ stage: previous?.stage ?? 'UNRECORDED_BRANCH', exactRequest: exact, state: request.state, questions: request.questions });
    if (!previous || (!exact && mode === 'STRICT_REQUEST_REPLAY')) throw new Error('INCOMPATIBLE_REQUEST_NEEDS_FRESH_INFERENCE');
    const answer = structuredClone(previous.normalized);
    if (mode === 'COUNTERFACTUAL_SAVED_ANSWER_FIXTURE') {
      answer.metadata = { ...answer.metadata, provider: 'offline-saved-answer-fixture', latencyMs: 0,
        questionCount: Object.keys(request.questions).length, usage: undefined };
      for (const [key, question] of Object.entries(request.questions)) {
        if (question.kind === 'choice' && !Object.hasOwn(question.choices, answer.choices[key]?.choice)) {
          throw new Error('UNSUPPORTED_FIXTURE_CHOICE_SHAPE');
        }
        if (question.kind === 'noul' && answer.diagnostics[key] === undefined) answer.diagnostics[key] = 0;
      }
    }
    return answer;
  } };
  const clock = createTestClock(row.input.context.clock);
  const parsed = await createRideSearchParser(provider, clock, generateLocationCandidates).parse({
    query: row.input.query, candidates: [], timeZone: row.input.context.timeZone,
  });
  const compatible = requests.every(value => value.exactRequest) && requests.length === saved.length;
  let review = null, reviewRejection = null;
  if (parsed.draft) {
    try { review = createLocationReview(parsed, clock.now(), row.input.context.timeZone); }
    catch (error) { if (error.code !== 'INVALID_PARSE_RESULT') throw error; reviewRejection = error.code; }
  }
  return { caseId: row.caseId, mode, compatible, requests, parsed,
    originalParseReproduced: mode === 'STRICT_REQUEST_REPLAY' && compatible
      && isDeepStrictEqual(JSON.parse(JSON.stringify(parsed)), original),
    provenance: parsed.draft ? validateDraftProvenance(parsed.draft) : null,
    fallbackEligibility: fallbackEligibility(parsed), reviewRejection, form: review ? formResolution(review, clock) : null,
    observations: collectObservations(row.input.query, parsed.draft?.candidates ?? []) };
}
