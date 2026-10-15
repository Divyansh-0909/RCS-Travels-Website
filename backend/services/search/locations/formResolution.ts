import { reviewFollowups, type LocationReview } from './review.ts';
import type { ResolutionRequirement } from './followup.ts';
import { systemClock } from '../../../lib/clock.js';

export type FormResolution = {
  state: 'NEEDS_USER_RESOLUTION' | 'READY_FOR_REVIEW' | 'READY_FOR_SUBMISSION';
  resolutionRequirements: ResolutionRequirement[];
  advisories: ResolutionRequirement[];
  submissionAllowed: boolean;
};

export function formResolution(review: LocationReview, clock = systemClock): FormResolution {
  const evaluated = reviewFollowups(review, [], clock);
  const draft = review.session.effectiveDraft;
  const softAc = /\bAC(?:\s+car)?\s+if available\b/i.test(draft.query.text)
    && draft.query.text.match(/\bif\b/gi)!.length === 1
    && !/\b(?:unless|provided|depending)\b/i.test(draft.query.text);
  const advisory = (entry: ResolutionRequirement) => entry.field === 'PASSENGER_COUNT'
    || softAc && ['AC_PREFERENCE', 'CONDITIONAL_PREFERENCE'].includes(entry.field);
  const advisories = evaluated.followups.filter(advisory);
  const requirements = evaluated.followups.filter(entry => !advisory(entry));
  if (draft.queryType !== 'BOOKING_REQUEST') requirements.push({ field: 'query', code: 'BOOKING_INTENT_REQUIRED', category: 'required', priority: 2 });
  if (review.selected.pickup === undefined || review.selected.drop === undefined) requirements.push({ field: 'locations', code: 'GROUNDED_LOCATIONS_REQUIRED', category: 'grounding', priority: 1 });
  if (draft.timing.mode === 'SCHEDULED' && evaluated.schedule.scheduledAt === undefined) requirements.push({ field: 'timing', code: 'VALID_SCHEDULE_REQUIRED', category: 'temporalambiguity', priority: 3 });
  if (review.derived.fareQuote === null || review.derived.route === null) requirements.push({ field: 'derived', code: 'FARE_ROUTE_RECOMPUTATION_REQUIRED', category: 'review', priority: 5 });
  const unresolved = requirements.some(entry => entry.code !== 'LOCATION_REVIEW_REQUIRED');
  const confirmed = review.derived.locationConfirmation !== null && review.derived.reviewConfirmation !== null;
  const state = unresolved ? 'NEEDS_USER_RESOLUTION' : confirmed ? 'READY_FOR_SUBMISSION' : 'READY_FOR_REVIEW';
  return { state, resolutionRequirements: requirements, advisories, submissionAllowed: state === 'READY_FOR_SUBMISSION' };
}
