import { isDeepStrictEqual } from 'node:util';
import { systemClock } from '../../../lib/clock.js';
import { parseInputSchema, type BookingDraft, type Query, type LocationCandidate } from '../contracts.ts';
import { issue } from '../fields.ts';
import type { SearchDecisionProvider } from '../provider.ts';
import type { RideSearchParseResult } from '../parser.ts';
import { createSearchGroundingService, type SearchGroundingResult } from '../locations/service.ts';
import type { PlaceSearchProvider } from '../locations/places.ts';
import type { LocationReview } from '../locations/review.ts';
import { reviewFollowups } from '../locations/review.ts';
import { createLocationReview } from '../locations/review.ts';
import { formResolution, type FormResolution } from '../locations/formResolution.ts';
import type { Followup } from '../locations/followup.ts';
import { resolveTemporal } from '../temporal.ts';
import { missingFields, validateDirection, validateEndpoints } from '../validation.ts';
import { ComplexProviderError, type ComplexBookingInterpreter, type ComplexProviderMetadata } from './contracts.ts';
import { fallbackEligibility } from './eligibility.ts';
import { normalizeLunaOutput, newSpanCount } from './locations.ts';
import { validateLunaEvidence } from './evidence.ts';
import { trustedFields, formTrustedFields, applyFormFields, requiresTrustedReview, mergeInterpretedReview, preservePartial } from './trusted.ts';

export type SearchEvaluationRoute = 'JEV_SIMPLE' | 'LUNA_COMPLEX' | 'LUNA_PROVIDER_FALLBACK' | 'FOLLOW_UP_ONLY' | 'UNSUPPORTED' | 'UNCLEAR';
export type SearchInterpretationContext = {
  activeField: 'pickup' | 'drop' | null; formRevision: number;
  review?: LocationReview; signal?: AbortSignal; currentQuery?: () => Query;
};
export type SearchInterpretationResult = SearchGroundingResult & {
  draft?: BookingDraft; review?: LocationReview;
  interpretationSnapshot?: RideSearchParseResult;
  followups?: Followup[];
  formResolution?: FormResolution;
  evaluationRoute: SearchEvaluationRoute;
  telemetry: { fallbackReasons: string[]; lunaAttempts: number; luna?: ComplexProviderMetadata;
    schemaFailures: number; trustedConflicts: number; newSourceSpans: number; recoveredMissingCandidates: boolean };
};

function current(query: Query, context: SearchInterpretationContext): boolean {
  return !context.signal?.aborted && (context.currentQuery === undefined || isDeepStrictEqual(query, context.currentQuery()));
}
function initialRoute(output: SearchGroundingResult): SearchEvaluationRoute {
  if (output.parse.route === 'UNCLEAR_OR_UNRELATED') return 'UNCLEAR';
  if (output.parse.draft?.unsupportedRequests.length) return 'UNSUPPORTED';
  return output.parse.issues.some(value => value.category !== 'DEPENDENCY') || output.issues.some(value => value.code !== 'PLACE_SELECTION_REQUIRED')
    ? 'FOLLOW_UP_ONLY' : 'JEV_SIMPLE';
}
function failed(output: SearchInterpretationResult, code: string): SearchInterpretationResult {
  return { ...output, evaluationRoute: 'FOLLOW_UP_ONLY', locations: [], issues: [...output.issues, issue(code, 'parser', 'DEPENDENCY')],
    telemetry: { ...output.telemetry, schemaFailures: code === 'LUNA_SCHEMA_ERROR' ? 1 : 0 } };
}
function interpretedParse(draft: BookingDraft, previous: RideSearchParseResult, now: Date, timeZone: string, candidates: LocationCandidate[]): RideSearchParseResult {
  const issues = validateLunaEvidence(draft, candidates);
  validateDirection(draft, issues); validateEndpoints(draft, issues);
  if (issues.some(value => value.category === 'INVALID')) throw new ComplexProviderError('LUNA_SCHEMA_ERROR');
  const temporal = resolveTemporal(draft, now, timeZone);
  issues.push(...temporal.issues, ...missingFields(draft));
  return { ...previous, draft, temporal, issues, fallbackRequired: false, fallbackReasons: [],
    route: draft.queryType === 'LOCATION_SEARCH' ? 'LOCATION_SEARCH' : draft.queryType === 'UNCLEAR_OR_UNRELATED'
      ? 'UNCLEAR_OR_UNRELATED' : issues.some(value => value.category !== 'DEPENDENCY') ? 'INTERPRETED_INCOMPLETE' : 'INTERPRETED_COMPLETE' };
}

export function createSearchInterpretationService(decisions: SearchDecisionProvider, places: PlaceSearchProvider,
  interpreter: ComplexBookingInterpreter, clock = systemClock) {
  const simple = createSearchGroundingService(decisions, places, clock);
  return {
    async parse(rawInput: Parameters<typeof parseInputSchema.parse>[0], context: SearchInterpretationContext = { activeField: null, formRevision: 0 }): Promise<SearchInterpretationResult> {
      const output = await simple.parse(rawInput, { activeField: context.activeField, formRevision: context.formRevision });
      const reasons = fallbackEligibility(output.parse);
      const result: SearchInterpretationResult = { ...output, draft: output.parse.draft, evaluationRoute: initialRoute(output),
        telemetry: { fallbackReasons: reasons, lunaAttempts: 0, schemaFailures: 0, trustedConflicts: 0,
          newSourceSpans: 0, recoveredMissingCandidates: false } };
      const checked = parseInputSchema.safeParse(rawInput);
      if (!checked.success || output.parse.draft === undefined) return result;
      const query = checked.data.query;
      if (reasons.length === 0 && !output.parse.fallbackRequired && output.parse.route !== 'PARSER_UNAVAILABLE') {
        const initialReview = context.review ?? createLocationReview(output.parse, clock.now(), checked.data.timeZone);
        result.formResolution = formResolution(initialReview, clock);
      }
      if (!current(query, context)) return failed(result, 'STALE_QUERY_RESULT');
      if (reasons.length === 0) return result;
      if (context.review === undefined && requiresTrustedReview(checked.data.formDraft)) return failed(result, 'TRUSTED_REVIEW_CONTEXT_REQUIRED');
      const now = clock.now();
      result.telemetry.lunaAttempts = 1;
      try {
        const input = { query, candidates: output.parse.draft.candidates,
          partialDraft: output.parse.draft, trustedFields: context.review === undefined
            ? formTrustedFields(checked.data.formDraft) : trustedFields(context.review.session),
          fallbackReasons: reasons, now: now.toISOString(), timeZone: checked.data.timeZone };
        const response = await interpreter.interpret(input, context.signal);
        if (!current(query, context)) return failed(result, 'STALE_QUERY_RESULT');
        const draft = normalizeLunaOutput(input, response.output);
        preservePartial(draft, input.partialDraft);
        const parsed = interpretedParse(draft, output.parse, now, checked.data.timeZone, input.candidates);
        const merged = mergeInterpretedReview(parsed, now, checked.data.timeZone, context.review);
        const review = context.review === undefined ? applyFormFields(merged, checked.data.formDraft) : merged;
        const effective = review.session.effectiveDraft;
        const grounded = await simple.groundParsed({ ...parsed, draft: effective }, { activeField: context.activeField, formRevision: review.revision });
        if (!current(query, context)) return failed(result, 'STALE_QUERY_RESULT');
        const follow = reviewFollowups(review, grounded.issues, clock);
        return { ...grounded, draft: effective, review, interpretationSnapshot: parsed,
          evaluationRoute: draft.queryType === 'UNCLEAR_OR_UNRELATED' ? 'UNCLEAR'
            : reasons.includes('COMPLEX_QUERY') ? 'LUNA_COMPLEX' : 'LUNA_PROVIDER_FALLBACK',
          issues: [...grounded.issues, ...review.parseIssues], followups: follow.followups,
          formResolution: formResolution(review, clock),
          telemetry: { ...result.telemetry, luna: response.metadata,
            trustedConflicts: review.parseIssues.filter(value => value.code === 'TRUSTED_STATE_CONFLICT').length,
            newSourceSpans: newSpanCount(draft, input.candidates),
            recoveredMissingCandidates: reasons.includes('LOCATION_CANDIDATE_MISSING') && draft.candidates.length > input.candidates.length } };
      } catch (error) {
        return failed(result, error instanceof ComplexProviderError ? error.code : 'LUNA_SCHEMA_ERROR');
      }
    },
    chooseLocationTarget: simple.chooseLocationTarget,
    selectLocation: simple.selectLocation,
  };
}
