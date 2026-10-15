import { isDeepStrictEqual } from 'node:util';
import { systemClock } from '../../../lib/clock.js';
import type { RideSearchParseResult } from '../parser.ts';
import { sourceRefSchema, type SourceRef } from '../contracts.ts';
import { issue, type ParseIssue } from '../fields.ts';
import { createDraftSession, editDraftField, mergeParsedRevision, registerTrustedLocationSelection,
  type DraftSession, type SessionEditValue, type SessionField } from './session.ts';
import { resolveSessionTemporal } from './sessionTemporal.ts';
import { followups } from './followup.ts';
import { sourceRefs } from './sessionRefs.ts';
import { groundingSelection, sameGroundedEndpoints, trustedLocationSchema,
  type GroundingResult, type LocationTarget, type TrustedLocation } from './grounding.ts';

export type DerivedDraftState = {
  fareQuote: string | null; route: string | null;
  locationConfirmation: string | null; reviewConfirmation: string | null;
};
export type SelectedLocationHistory = {
  target: LocationTarget; selection: TrustedLocation; formRevision: number;
  candidate?: GroundingResult['candidate']; query?: GroundingResult['query']; targetRefs: SourceRef[];
};
export type LocationReview = {
  revision: number; session: DraftSession; parseIssues: ParseIssue[];
  selected: Partial<Record<LocationTarget, TrustedLocation>>;
  endpointEdits: Partial<Record<LocationTarget, number>>;
  selectionHistory: SelectedLocationHistory[]; derived: DerivedDraftState;
};

const blankDerived = (): DerivedDraftState => ({ fareQuote: null, route: null, locationConfirmation: null, reviewConfirmation: null });

function applicablePolicy(value: ParseIssue, draft: DraftSession['effectiveDraft']): boolean {
  if ((value.category !== 'POLICY' && value.category !== 'AMBIGUOUS') || value.refs.length === 0) return true;
  const entry = Object.entries(draft).find(([name]) => name === value.field.split('.')[0]);
  if (entry === undefined) return true;
  const field = entry[1];
  if (typeof field !== 'object') return true;
  return value.refs.some(ref => sourceRefs(field).some(current => isDeepStrictEqual(current, ref)));
}

export function createLocationReview(parsed: RideSearchParseResult, anchor: Date, timeZone: string, derived = blankDerived()): LocationReview {
  return { revision: 0, session: createDraftSession(parsed, anchor, timeZone), parseIssues: structuredClone(parsed.issues),
    selected: {}, endpointEdits: {}, selectionHistory: [], derived: { ...derived } };
}

function changedReview(previous: LocationReview, session: DraftSession): LocationReview {
  const invalid = session.invalidations;
  // These flags have now been consumed by clearing the actual derived state.
  // Later edits must invalidate their own dependencies, not repeat an old edit.
  const consumed = Object.freeze({ ...session, invalidations: Object.freeze({ fare: false, route: false, locationConfirmation: false }) });
  return { ...previous, revision: previous.revision + 1, session: consumed,
    derived: { fareQuote: null,
      route: invalid.route ? null : previous.derived.route,
      locationConfirmation: invalid.locationConfirmation ? null : previous.derived.locationConfirmation,
      reviewConfirmation: null } };
}

export function editLocationReview(review: LocationReview, field: SessionField, value: SessionEditValue): LocationReview {
  const next = changedReview(review, editDraftField(review.session, field, value));
  if (field === 'pickup' || field === 'drop') {
    const selected = { ...review.selected };
    delete selected[field];
    const effective = next.session.effectiveDraft[field];
    if (effective.state === 'RESOLVED' && effective.value.kind === 'USER_SELECTION') {
      const id = effective.value.selectionId;
      const registered = next.session.trustedSelectionRegistry.find(selection => selection.selectionId === id);
      if (registered !== undefined) selected[field] = registered;
    }
    return { ...next, selected, endpointEdits: { ...review.endpointEdits, [field]: next.revision } };
  }
  return next;
}

export function mergeLocationReview(review: LocationReview, parsed: RideSearchParseResult, anchor: Date, timeZone: string): LocationReview {
  const next = changedReview(review, mergeParsedRevision(review.session, parsed, anchor, timeZone));
  // Every grounded selection is an explicit field edit. Session replay preserves
  // those corrections, so a new parser revision cannot replace their grounding.
  const retained = review.parseIssues.filter(value => value.category === 'POLICY'
    && applicablePolicy(value, next.session.effectiveDraft));
  return { ...next, parseIssues: structuredClone([...retained, ...parsed.issues]) };
}

export function applyTrustedLocation(review: LocationReview, target: LocationTarget, selection: TrustedLocation): LocationReview {
  const checked = trustedLocationSchema.parse(selection);
  const existing = review.session.trustedSelectionRegistry.find(value => value.selectionId === checked.selectionId);
  if (existing !== undefined && !isDeepStrictEqual(existing, checked)) throw new Error('CONFLICTING_TRUSTED_SELECTION');
  const registered = existing === undefined ? registerTrustedLocationSelection(review.session, checked) : review.session;
  const next = editLocationReview({ ...review, session: registered }, target, { kind: 'USER_SELECTION', selectionId: checked.selectionId });
  return { ...next, selectionHistory: [...review.selectionHistory,
    { target, selection: structuredClone(checked), formRevision: next.revision, targetRefs: [] }] };
}

export function applySelectedPlace(review: LocationReview, result: GroundingResult, targetRefs: SourceRef[] = []): LocationReview {
  for (const ref of targetRefs) {
    sourceRefSchema.parse(ref);
    if (ref.kind !== 'USER_FIELD' || ref.field !== 'locationTarget' || ref.revision > review.revision) throw new Error('INVALID_TARGET_PROVENANCE');
  }
  const selection = groundingSelection(result, review.revision);
  const snapshot = review.session.snapshots.find(value => value.query.id === result.query.id && value.query.revision === result.query.revision);
  if (snapshot === undefined || !isDeepStrictEqual(snapshot.query, result.query)
      || !snapshot.draft.candidates.some(candidate => isDeepStrictEqual(candidate, result.candidate))) {
    throw new Error('STALE_QUERY_CANDIDATE');
  }
  const next = applyTrustedLocation(review, result.target, selection);
  const history = next.selectionHistory.at(-1)!;
  return { ...next, selectionHistory: [...next.selectionHistory.slice(0, -1),
    { ...history, candidate: structuredClone(result.candidate), query: structuredClone(result.query), targetRefs: structuredClone(targetRefs) }] };
}

// A user may choose a suggestion after editing a different field. Rebind only
// an unchanged candidate in the same query revision; never reuse a corrected
// endpoint or transfer a result to a later natural-language query revision.
export function preparePlaceSelection(review: LocationReview, result: GroundingResult): GroundingResult {
  const draft = review.session.effectiveDraft;
  if (result.formRevision > review.revision || !isDeepStrictEqual(draft.query, result.query)) {
    throw new Error('STALE_GROUNDING_RESULT');
  }
  if ((review.endpointEdits[result.target] ?? -1) > result.formRevision) throw new Error('STALE_GROUNDING_RESULT');
  const latest = review.session.snapshots.at(-1)!;
  const field = latest.draft.queryType === 'LOCATION_SEARCH' ? draft.locationSearch : draft[result.target];
  if (field.state !== 'RESOLVED' || field.value.kind !== 'QUERY_CANDIDATE' || field.value.candidateId !== result.candidate.candidateId) {
    throw new Error('STALE_GROUNDING_RESULT');
  }
  return { ...structuredClone(result), formRevision: review.revision };
}

export function reviewFollowups(review: LocationReview, groundingIssues: ParseIssue[] = [], clock = systemClock) {
  const draft = review.session.effectiveDraft;
  const schedule = resolveSessionTemporal(review.session, clock);
  const groundedRoles = new Set<LocationTarget>(Object.keys(review.selected) as LocationTarget[]);
  const issues = [...review.parseIssues.filter(value => applicablePolicy(value, draft) && value.category !== 'MISSING' && !value.field.startsWith('timing')
      && value.code !== 'PLACES_GROUNDING_REQUIRED'),
    ...groundingIssues, ...sameGroundedEndpoints(review.selected.pickup, review.selected.drop)];
  if (Object.keys(review.selected).length === 2 && review.derived.locationConfirmation === null) {
    issues.push(issue('LOCATION_REVIEW_REQUIRED', 'locations', 'DEPENDENCY'));
  }
  return { schedule, followups: followups(draft, issues, schedule.issues, groundedRoles) };
}
