import { normalizeLunaOutput, newSpanCount } from '../../../services/search/complex/locations.ts';
import { validateLunaEvidence } from '../../../services/search/complex/evidence.ts';
import { preservePartial, mergeInterpretedReview, applyFormFields } from '../../../services/search/complex/trusted.ts';
import { validateDirection, validateEndpoints, missingFields } from '../../../services/search/validation.ts';
import { resolveTemporal } from '../../../services/search/temporal.ts';
import { validateDraftProvenance } from '../../../services/search/provenance.ts';
import { formResolution } from '../../../services/search/locations/formResolution.ts';
import { reviewFollowups, createLocationReview } from '../../../services/search/locations/review.ts';
import { groundingRoles } from '../providerStages.js';
import { fallbackEligibility } from '../../../services/search/complex/eligibility.ts';
import { stop } from './accounting.js';

// Mirrors the composition service's adoption sequence using its public guards.
// Grounding is represented as deferred work, never a fabricated Places response.
export function adoptDeferred(input, response, previous, activeField) {
  const draft = normalizeLunaOutput(input, response.output);
  preservePartial(draft, input.partialDraft);
  const issues = validateLunaEvidence(draft, input.candidates);
  validateDirection(draft, issues); validateEndpoints(draft, issues);
  if (issues.some(row => row.category === 'INVALID') || validateDraftProvenance(draft).length) stop('LUNA_ADOPTION_SCHEMA_OR_PROVENANCE_FAILURE');
  const now = new Date(input.now), clock = { now: () => now };
  const temporal = resolveTemporal(draft, now, input.timeZone); issues.push(...temporal.issues, ...missingFields(draft));
  const parsed = { ...previous, draft, temporal, issues, fallbackRequired: false, fallbackReasons: [],
    route: draft.queryType === 'LOCATION_SEARCH' ? 'LOCATION_SEARCH' : draft.queryType === 'UNCLEAR_OR_UNRELATED' ? 'UNCLEAR_OR_UNRELATED'
      : issues.some(row => row.category !== 'DEPENDENCY') ? 'INTERPRETED_INCOMPLETE' : 'INTERPRETED_COMPLETE' };
  const merged = mergeInterpretedReview(parsed, now, input.timeZone, undefined);
  const review = applyFormFields(merged, undefined);
  const form = formResolution(review, clock);
  if (form.submissionAllowed) stop('UNEXPECTED_SUBMISSION_AUTHORITY');
  return { parserResult: parsed, draft: review.session.effectiveDraft, review, formResolution: form,
    followups: reviewFollowups(review, [], clock).followups, interpretationSnapshot: parsed,
    grounding: { executed: false, status: 'DEFERRED_NOT_EXECUTED', roles: groundingRoles(parsed, activeField) },
    newSourceSpans: newSpanCount(draft, input.candidates), submittedBookings: 0, PlacesCalls: 0, DetailsCalls: 0 };
}
export function parserResultDeferred(parsed, row) {
  const issues = parsed.draft ? validateDraftProvenance(parsed.draft) : [];
  if (issues.length || parsed.issues.some(value => ['INVALID_INPUT_PROVENANCE', 'LIMIT_EXCEEDED', 'JEV_SCHEMA_ERROR', 'JEV_INVALID_RESPONSE'].includes(value.code))) stop('PARSER_SCHEMA_OR_PROVENANCE_FAILURE');
  let form = null, reviewRejected = null;
  try {
    const review = createLocationReview(parsed, new Date(row.modelInput.context.clock), row.modelInput.context.timeZone);
    form = formResolution(review, { now: () => new Date(row.modelInput.context.clock) });
  } catch { reviewRejected = 'INVALID_PARSE_RESULT'; }
  if (form?.submissionAllowed) stop('UNEXPECTED_SUBMISSION_AUTHORITY');
  return { parserResult: parsed, fallbackEligibility: fallbackEligibility(parsed), formResolution: form, reviewRejected,
    grounding: { executed: false, status: 'DEFERRED_NOT_EXECUTED', roles: groundingRoles(parsed, row.modelInput.context.activeField) },
    automaticLunaCalls: 0, PlacesCalls: 0, DetailsCalls: 0, submittedBookings: 0 };
}
