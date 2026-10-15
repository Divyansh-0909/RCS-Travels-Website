import { isDeepStrictEqual } from 'node:util';
import type { BookingDraft } from '../contracts.ts';
import { issue, type ParseIssue } from '../fields.ts';
import { sourceRefs } from '../locations/sessionRefs.ts';
import { validateDraftSession, type DraftSession, type SessionField } from '../locations/session.ts';
import { createLocationReview, editLocationReview, mergeLocationReview, type LocationReview } from '../locations/review.ts';
import type { RideSearchParseResult } from '../parser.ts';

function at(draft: BookingDraft, field: SessionField): object {
  if (field === 'timing.date') return draft.timing.date;
  if (field === 'timing.time') return draft.timing.time;
  return draft[field];
}
function comparable(value: object): object {
  return JSON.parse(JSON.stringify(value, (key, child) => key === 'refs' ? undefined : child)) as object;
}
export function trustedFields(session?: DraftSession): Array<{ field: string; value: object }> {
  if (session === undefined) return [];
  validateDraftSession(session);
  const fields = [...new Set(session.edits.map(edit => edit.field))];
  return fields.map(field => ({ field, value: structuredClone(at(session.effectiveDraft, field)) }));
}

export function formTrustedFields(form?: BookingDraft): Array<{ field: string; value: object }> {
  if (form === undefined) return [];
  const fields = ['pickup', 'drop', 'locationSearch', 'vehicleClass', 'passengers', 'sharing', 'isOutstation', 'preferSafeRoute', 'needsCarrier', 'timing'] as const;
  return fields.filter(field => sourceRefs(form[field]).some(ref => ref.kind === 'USER_FIELD'))
    .map(field => ({ field, value: structuredClone(form[field]) }));
}
export function applyFormFields(review: LocationReview, form: BookingDraft | undefined): LocationReview {
  let result = review;
  for (const { field, value } of formTrustedFields(form)) {
    if ((field === 'pickup' || field === 'drop' || field === 'locationSearch') && 'value' in value
      && typeof value.value === 'object' && value.value !== null && 'kind' in value.value && value.value.kind === 'USER_SELECTION') {
      // Coordinates/confirmation cannot be reconstructed from a display-only ID.
      throw new Error('TRUSTED_REVIEW_CONTEXT_REQUIRED');
    }
    const current = at(result.session.effectiveDraft, field as SessionField);
    if (!('state' in current && current.state === 'UNSPECIFIED') && !isDeepStrictEqual(comparable(current), comparable(value))) {
      result = { ...result, parseIssues: [...result.parseIssues, issue('TRUSTED_STATE_CONFLICT', field, 'AMBIGUOUS', sourceRefs(value))] };
    }
    result = editLocationReview(result, field as SessionField, value as BookingDraft['timing']);
  }
  return result;
}

export function requiresTrustedReview(form?: BookingDraft): boolean {
  return form !== undefined && ['pickup', 'drop', 'locationSearch'].some(role => {
    const field = form[role as 'pickup' | 'drop' | 'locationSearch'];
    return field.state === 'RESOLVED' && field.value.kind === 'USER_SELECTION';
  });
}
export function mergeInterpretedReview(parsed: RideSearchParseResult, anchor: Date, timeZone: string, previous?: LocationReview): LocationReview {
  const conflicts: ParseIssue[] = [];
  if (previous !== undefined) {
    for (const field of [...new Set(previous.session.edits.map(value => value.field))]) {
      const value = at(parsed.draft!, field);
      if ('state' in value && value.state === 'UNSPECIFIED') continue;
      const effective = at(previous.session.effectiveDraft, field);
      if (!isDeepStrictEqual(comparable(value), comparable(effective))) {
        conflicts.push(issue('TRUSTED_STATE_CONFLICT', field, 'AMBIGUOUS', sourceRefs(effective)));
      }
    }
  }
  const review = previous === undefined ? createLocationReview(parsed, anchor, timeZone)
    : mergeLocationReview(previous, parsed, anchor, timeZone);
  return { ...review, parseIssues: [...review.parseIssues, ...conflicts] };
}

export function preservePartial(draft: BookingDraft, partial: BookingDraft | null): void {
  if (partial === null) return;
  for (const field of ['pickup', 'drop', 'locationSearch', 'vehicleClass', 'passengers', 'sharing', 'isOutstation', 'preferSafeRoute', 'needsCarrier'] as const) {
    if (draft[field].state === 'UNSPECIFIED' && sourceRefs(partial[field]).every(ref => ref.kind === 'QUERY_SPAN')) {
      Object.assign(draft, { [field]: structuredClone(partial[field]) });
    }
  }
  if (sourceRefs(partial.timing).every(ref => ref.kind === 'QUERY_SPAN')) {
    if (draft.timing.mode === 'UNSPECIFIED') draft.timing = structuredClone(partial.timing);
    else if (draft.timing.mode === 'SCHEDULED' && partial.timing.mode === 'SCHEDULED') {
      if (draft.timing.date.state === 'UNSPECIFIED') draft.timing.date = structuredClone(partial.timing.date);
      if (draft.timing.time.state === 'UNSPECIFIED') draft.timing.time = structuredClone(partial.timing.time);
    }
  }
}
