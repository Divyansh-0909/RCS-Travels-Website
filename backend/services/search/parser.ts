import { systemClock } from '../../lib/clock.js';
import { bookingDraftSchema, emptyDraft, parseInputSchema, SEARCH_LIMITS, type BookingDraft, type ParseInput, type LocationCandidate } from './contracts.ts';
import { validateDraftProvenance, validateParseInputProvenance } from './provenance.ts';
import { collectObservations } from './observations.ts';
import { extractionRequest, locationRequest, routingRequest } from './questions.ts';
import { answer, extractSimple, locationField, unsupportedRequests } from './extractor.ts';
import { SearchProviderError, type DecisionBatch, type DecisionRequest, type SearchDecisionProvider } from './provider.ts';
import { issue, type ParseIssue } from './fields.ts';
import { resolveTemporal, type TemporalResolution } from './temporal.ts';
import { missingFields, observationLimit, preserveUserFields, validateRoles, validateEndpoints } from './validation.ts';

export type RideSearchParseResult = {
  draft?: BookingDraft;
  route: 'SIMPLE_COMPLETE' | 'SIMPLE_INCOMPLETE' | 'COMPLEX_FALLBACK_REQUIRED' |
    'LOCATION_SEARCH' | 'UNCLEAR_OR_UNRELATED' | 'PARSER_UNAVAILABLE' | 'INTERPRETED_COMPLETE' | 'INTERPRETED_INCOMPLETE';
  issues: ParseIssue[];
  fallbackRequired: boolean;
  fallbackReasons: string[];
  temporal?: TemporalResolution;
  providerMetadata: { attemptedRequests: number; completedRequests: number;
    batches: DecisionBatch['metadata'][]; decisions: DecisionBatch['choices'][]; diagnostics: Record<string, number> };
};

const FALLBACK_CODES = new Set(['ROLE_CONFLICT', 'TEMPORAL_CONFLICT', 'EXTRACTION_BINDING_UNRESOLVED', 'LOCATION_CANDIDATE_MISSING']);
class SearchLimitError extends Error {}
const result = (): RideSearchParseResult => ({ route: 'PARSER_UNAVAILABLE', issues: [],
  fallbackRequired: false, fallbackReasons: [], providerMetadata: {
    attemptedRequests: 0, completedRequests: 0, batches: [], decisions: [], diagnostics: {},
  } });

function addFallback(output: RideSearchParseResult, code: string): void {
  output.fallbackRequired = true;
  output.fallbackReasons = [...new Set([...output.fallbackReasons, code])];
  output.route = 'COMPLEX_FALLBACK_REQUIRED';
}

async function decide(provider: SearchDecisionProvider, request: DecisionRequest, output: RideSearchParseResult): Promise<DecisionBatch> {
  if (request.state.length > SEARCH_LIMITS.providerContext || Object.keys(request.questions).length > SEARCH_LIMITS.questionsPerBatch) {
    throw new SearchLimitError();
  }
  output.providerMetadata.attemptedRequests += 1;
  const batch = await provider.decide(request);
  output.providerMetadata.completedRequests += 1;
  output.providerMetadata.batches.push(batch.metadata);
  output.providerMetadata.decisions.push(batch.choices);
  Object.assign(output.providerMetadata.diagnostics, batch.diagnostics);
  return batch;
}

function validOutput(draft: BookingDraft, input: ParseInput): boolean {
  return validateDraftProvenance(draft, input.trustedLocationSelections, input.formDraft).length === 0;
}

function finishSimple(draft: BookingDraft, input: ParseInput, now: Date, output: RideSearchParseResult): void {
  if (!validOutput(draft, input)) throw new SearchProviderError('JEV_SCHEMA_ERROR');
  output.temporal = resolveTemporal(draft, now, input.timeZone);
  output.issues.push(...output.temporal.issues, ...missingFields(draft));
  for (const value of output.issues) if (FALLBACK_CODES.has(value.code)) addFallback(output, value.code);
  if (output.fallbackRequired) return;
  output.route = output.issues.some(value => value.category !== 'DEPENDENCY') ? 'SIMPLE_INCOMPLETE' : 'SIMPLE_COMPLETE';
}

function inputFailure(output: RideSearchParseResult, codes: string[]): RideSearchParseResult {
  output.issues.push(issue(codes.includes('too_big') ? 'LIMIT_EXCEEDED' : 'INVALID_INPUT_PROVENANCE', 'query', 'INVALID'));
  return output;
}

function providerFailure(output: RideSearchParseResult, failure: Error | object): RideSearchParseResult {
  const code = failure instanceof SearchProviderError ? failure.code : 'JEV_PROVIDER_ERROR';
  output.issues.push(issue(code, 'provider', 'INVALID'));
  addFallback(output, code);
  if (output.draft !== undefined) {
    const safe = emptyDraft(output.draft.query);
    safe.queryType = output.draft.queryType;
    safe.complexity = output.draft.complexity;
    safe.candidates = output.draft.candidates;
    if (!bookingDraftSchema.safeParse(safe).success) {
      safe.queryType = 'UNCLEAR_OR_UNRELATED';
      safe.complexity = 'NOT_APPLICABLE';
    }
    output.draft = safe;
  }
  return output;
}

export type CandidateGenerator = (query: ParseInput['query'], queryType: BookingDraft['queryType']) => {
  candidates: LocationCandidate[]; issues: ParseIssue[];
};

// Candidate generation is a separate input/provenance boundary. Complex queries
// remain untouched, and invalid candidates stop extraction before another call.
function prepareCandidates(input: ParseInput, draft: BookingDraft, output: RideSearchParseResult, generate?: CandidateGenerator): boolean {
  if (generate === undefined || draft.complexity === 'COMPLEX') return true;
  const generated = generate(input.query, draft.queryType);
  const checked = parseInputSchema.safeParse({ ...input, candidates: generated.candidates });
  if (!checked.success) {
    inputFailure(output, checked.error.issues.map(value => value.code));
    return false;
  }
  input.candidates = checked.data.candidates;
  draft.candidates = input.candidates;
  output.issues.push(...generated.issues);
  for (const value of generated.issues) addFallback(output, value.code);
  return generated.issues.length === 0;
}

export function createRideSearchParser(provider: SearchDecisionProvider, clock = systemClock, generateCandidates?: CandidateGenerator) {
  return { async parse(rawInput: Parameters<typeof parseInputSchema.parse>[0]): Promise<RideSearchParseResult> {
    const output = result();
    const parsed = parseInputSchema.safeParse(rawInput);
    if (!parsed.success) return inputFailure(output, parsed.error.issues.map(value => value.code));
    const input = parsed.data;
    if (validateParseInputProvenance(input).length) return inputFailure(output, ['custom']);
    const now = clock.now();
    const draft = emptyDraft(input.query);
    draft.candidates = input.candidates;
    output.draft = draft;
    if (!input.query.text.trim()) { output.route = 'UNCLEAR_OR_UNRELATED'; return output; }
    try {
      const routing = await decide(provider, routingRequest(input, now.toISOString()), output);
      draft.queryType = answer(routing, 'query_type', ['LOCATION_SEARCH', 'BOOKING_REQUEST', 'UNCLEAR_OR_UNRELATED']) as BookingDraft['queryType'];
      draft.complexity = answer(routing, 'booking_complexity', ['SIMPLE', 'COMPLEX', 'NOT_APPLICABLE']) as BookingDraft['complexity'];
      if (!validOutput(draft, input)) throw new SearchProviderError('JEV_SCHEMA_ERROR');
      if (draft.queryType === 'UNCLEAR_OR_UNRELATED') { output.route = 'UNCLEAR_OR_UNRELATED'; return output; }
      if (!prepareCandidates(input, draft, output, generateCandidates)) return output;
      if (draft.queryType === 'LOCATION_SEARCH') {
        output.route = 'LOCATION_SEARCH';
        if (!input.candidates.length) { output.issues.push(issue('LOCATION_CANDIDATE_MISSING', 'locationSearch', 'DEPENDENCY')); return output; }
        const batch = await decide(provider, locationRequest(input, now.toISOString()), output);
        draft.locationSearch = locationField(batch, 'location_search_candidate', input.candidates);
        if (draft.locationSearch.state === 'UNSPECIFIED') output.issues.push(issue('LOCATION_CANDIDATE_MISSING', 'locationSearch', 'DEPENDENCY'));
        return output;
      }
      const observations = collectObservations(input.query, input.candidates);
      if (draft.complexity === 'COMPLEX') {
        draft.unsupportedRequests = unsupportedRequests(observations, draft.candidates, 'COMPLEX_QUERY');
        addFallback(output, 'COMPLEX_QUERY');
        return output;
      }
      if (observationLimit(observations, SEARCH_LIMITS.observedTemporalCandidates, SEARCH_LIMITS.observedPassengerCandidates)) {
        output.issues.push(issue('LIMIT_EXCEEDED', 'observations', 'INVALID')); return output;
      }
      const batch = await decide(provider, extractionRequest(input, now.toISOString(), observations), output);
      extractSimple(draft, batch, observations, output.issues);
      validateRoles(draft, batch, output.issues);
      preserveUserFields(draft, input);
      validateEndpoints(draft, output.issues);
      finishSimple(draft, input, now, output);
      return output;
    } catch (failure) {
      if (failure instanceof SearchLimitError) return inputFailure(output, ['too_big']);
      return providerFailure(output, failure instanceof Error ? failure : {});
    }
  } };
}
