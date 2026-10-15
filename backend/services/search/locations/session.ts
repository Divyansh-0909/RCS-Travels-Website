import { bookingDraftSchema, type BookingDraft, type DateExpression, type Field, type LocationRef, type SourceRef, type TimeExpression } from '../contracts.ts';
import { isDeepStrictEqual } from 'node:util';
import { validateDraftProvenance } from '../provenance.ts';
import type { RideSearchParseResult } from '../parser.ts';
import { trustedLocationSchema, type TrustedLocation } from './grounding.ts';
import { sourceRefs as refsOf, mapSourceRefs } from './sessionRefs.ts';

type RootField = 'locationSearch' | 'pickup' | 'drop' | 'vehicleClass' | 'passengers' | 'sharing' | 'isOutstation' | 'preferSafeRoute' | 'needsCarrier';
export type SessionField = RootField | 'timing' | 'timing.date' | 'timing.time';
export type SessionEditValue = BookingDraft[RootField] | BookingDraft['timing'] | Field<DateExpression> | Field<TimeExpression> | LocationRef;
export type ParsedRevisionSnapshot = Readonly<{ query: BookingDraft['query']; draft: BookingDraft; anchorDate: string; timeZone: string }>;
export type SessionEdit = Readonly<{ field: SessionField; revision: number; value: SessionEditValue; editedAt?: string }>;
export type DraftSession = Readonly<{
  schemaVersion: 'ride-search-session-v1'; snapshots: readonly ParsedRevisionSnapshot[]; edits: readonly SessionEdit[];
  trustedSelectionRegistry: readonly TrustedLocation[]; effectiveDraft: BookingDraft;
  invalidations: Readonly<{ fare: boolean; route: boolean; locationConfirmation: boolean }>;
}>;

export class DraftSessionError extends Error { constructor(readonly code: 'INVALID_PARSE_RESULT' | 'INVALID_SNAPSHOT' | 'INVALID_EDIT' | 'STALE_QUERY' | 'CORRUPT_PROVENANCE') { super(code); } }

const roots: readonly RootField[] = ['locationSearch', 'pickup', 'drop', 'vehicleClass', 'passengers', 'sharing', 'isOutstation', 'preferSafeRoute', 'needsCarrier'];
const clone = <T>(value: T): T => structuredClone(value);
const key = (query: BookingDraft['query']): string => JSON.stringify([query.id, query.revision]);
function freeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    Object.values(value).forEach(child => { if (typeof child === 'object' && child !== null) freeze(child); });
    Object.freeze(value);
  }
  return value;
}

function checkedSnapshot(parseResult: RideSearchParseResult, anchorDate: Date, timeZone: string): ParsedRevisionSnapshot {
  const draft = parseResult.draft;
  if (!draft || parseResult.route === 'PARSER_UNAVAILABLE' || parseResult.fallbackRequired || !Number.isFinite(anchorDate.getTime()) || !timeZone || !bookingDraftSchema.safeParse(draft).success || validateDraftProvenance(draft).length) {
    throw new DraftSessionError('INVALID_PARSE_RESULT');
  }
  return freeze({ query: freeze(clone(draft.query)), draft: freeze(clone(draft)), anchorDate: anchorDate.toISOString(), timeZone });
}

function isUnspecified(value: object): boolean { return 'state' in value && value.state === 'UNSPECIFIED'; }
function userRefs(field: SessionField, revision: number): SourceRef[] { return [{ kind: 'USER_FIELD', field, revision }]; }
function withUserRefs<T extends object>(value: T, field: SessionField, revision: number): T {
  return mapSourceRefs(value, () => userRefs(field, revision));
}

function fieldValue(field: SessionField, value: SessionEditValue, revision: number): SessionEditValue {
  if ((field === 'pickup' || field === 'drop' || field === 'locationSearch') && 'kind' in value) {
    return { state: 'RESOLVED', value, refs: userRefs(field, revision) };
  }
  return withUserRefs(value, field, revision);
}

function applyEdits(draft: BookingDraft, edits: readonly SessionEdit[]): BookingDraft {
  const result = clone(draft);
  for (const edit of edits) {
    if (edit.field !== 'locationSearch') {
      result.queryType = 'BOOKING_REQUEST'; result.complexity = 'SIMPLE';
    }
    if ((roots as readonly string[]).includes(edit.field)) Object.assign(result, { [edit.field]: clone(edit.value) });
    else if (edit.field === 'timing') result.timing = clone(edit.value) as BookingDraft['timing'];
    else {
      if (result.timing.mode === 'IMMEDIATE') throw new DraftSessionError('INVALID_EDIT');
      if (result.timing.mode === 'UNSPECIFIED') {
        result.timing.mode = 'SCHEDULED';
        result.timing.refs = userRefs(edit.field, edit.revision);
      }
      if (edit.field === 'timing.date') result.timing.date = clone(edit.value) as BookingDraft['timing']['date'];
      else result.timing.time = clone(edit.value) as BookingDraft['timing']['time'];
    }
  }
  return result;
}

function mergeTiming(previous: BookingDraft['timing'], next: BookingDraft['timing']): BookingDraft['timing'] {
  if (next.mode === 'IMMEDIATE') return clone(next);
  const result = clone(next);
  if (result.mode === 'UNSPECIFIED' && previous.mode !== 'UNSPECIFIED') {
    result.mode = previous.mode; result.refs = clone(previous.refs);
  }
  if (result.mode === 'SCHEDULED') {
    if (isUnspecified(result.date) && !isUnspecified(previous.date)) result.date = clone(previous.date);
    if (isUnspecified(result.time) && !isUnspecified(previous.time)) result.time = clone(previous.time);
  }
  return result;
}

function overlay(previous: BookingDraft, next: BookingDraft): BookingDraft {
  const result = clone(next);
  // The projection accumulates a booking across follow-ups. Each raw query's
  // independent classification remains immutable in the snapshot history.
  if (previous.queryType === 'BOOKING_REQUEST' && next.queryType !== 'BOOKING_REQUEST') {
    result.queryType = previous.queryType; result.complexity = previous.complexity;
  }
  for (const field of roots) if (isUnspecified(next[field]) && !isUnspecified(previous[field])) Object.assign(result, { [field]: clone(previous[field]) });
  result.timing = mergeTiming(previous.timing, next.timing);
  result.unsupportedRequests = [...clone(previous.unsupportedRequests),
    ...clone(next.unsupportedRequests).filter(request => !previous.unsupportedRequests.some(prior => isDeepStrictEqual(prior, request)))];
  return result;
}

function reconstruct(snapshots: readonly ParsedRevisionSnapshot[], edits: readonly SessionEdit[]): BookingDraft {
  let result = clone(snapshots[0].draft);
  for (const snapshot of snapshots.slice(1)) result = overlay(result, snapshot.draft);
  return applyEdits(result, edits);
}

function validateHistory(session: DraftSession): void {
  const seen = new Map<string, number>();
  session.snapshots.forEach(snapshot => {
    if (!Number.isFinite(new Date(snapshot.anchorDate).getTime()) || !snapshot.timeZone || !bookingDraftSchema.safeParse(snapshot.draft).success || validateDraftProvenance(snapshot.draft).length || !isDeepStrictEqual(snapshot.query, snapshot.draft.query)) throw new DraftSessionError('INVALID_SNAPSHOT');
    const prior = seen.get(snapshot.query.id);
    if (prior !== undefined && snapshot.query.revision <= prior) throw new DraftSessionError('STALE_QUERY');
    seen.set(snapshot.query.id, snapshot.query.revision);
  });
  session.trustedSelectionRegistry.forEach(selection => { if (!trustedLocationSchema.safeParse(selection).success) throw new DraftSessionError('CORRUPT_PROVENANCE'); });
  session.edits.forEach((edit, index) => {
    if (![...roots, 'timing', 'timing.date', 'timing.time'].includes(edit.field)
      || edit.revision !== index + 1 || (edit.editedAt !== undefined && !Number.isFinite(Date.parse(edit.editedAt)))) throw new DraftSessionError('INVALID_EDIT');
    if (!isDeepStrictEqual(edit.value, fieldValue(edit.field, edit.value, edit.revision))) throw new DraftSessionError('CORRUPT_PROVENANCE');
  });
}

function candidateOwnedBySources(session: DraftSession, candidateId: string, refs: SourceRef[]): boolean {
  return refs.some(ref => ref.kind === 'QUERY_SPAN' && session.snapshots.some(snapshot => snapshot.query.id === ref.queryId
    && snapshot.query.revision === ref.revision && snapshot.draft.candidates.some(candidate => candidate.candidateId === candidateId)));
}

function validateLocations(session: DraftSession): void {
  for (const field of ['locationSearch', 'pickup', 'drop'] as const) {
    const value = session.effectiveDraft[field];
    const refs = value.state === 'RESOLVED' ? [value.value] : value.state === 'AMBIGUOUS' ? value.alternatives : [];
    refs.forEach(ref => {
      if (ref.kind === 'USER_SELECTION' && !session.trustedSelectionRegistry.some(selection => selection.selectionId === ref.selectionId)) throw new DraftSessionError('CORRUPT_PROVENANCE');
      if (ref.kind === 'QUERY_CANDIDATE') {
        if (!candidateOwnedBySources(session, ref.candidateId, refsOf(value))) throw new DraftSessionError('CORRUPT_PROVENANCE');
      }
    });
  }
}

export function validateDraftSession(session: DraftSession): void {
  if (session.schemaVersion !== 'ride-search-session-v1' || session.snapshots.length === 0) throw new DraftSessionError('CORRUPT_PROVENANCE');
  validateHistory(session);
  if (!isDeepStrictEqual(session.effectiveDraft, reconstruct(session.snapshots, session.edits)) || !bookingDraftSchema.safeParse(session.effectiveDraft).success) throw new DraftSessionError('CORRUPT_PROVENANCE');
  validateLocations(session);
}

function makeSession(snapshots: readonly ParsedRevisionSnapshot[], edits: readonly SessionEdit[], draft: BookingDraft, selections: readonly TrustedLocation[], invalidations = { fare: false, route: false, locationConfirmation: false }): DraftSession {
  const session = freeze({ schemaVersion: 'ride-search-session-v1' as const, snapshots: freeze([...snapshots]), edits: freeze([...edits]), trustedSelectionRegistry: freeze([...selections]), effectiveDraft: freeze(clone(draft)), invalidations: freeze(clone(invalidations)) });
  validateDraftSession(session); return session;
}

export function createDraftSession(parseResult: RideSearchParseResult, anchorDate: Date, timeZone: string): DraftSession {
  const snapshot = checkedSnapshot(parseResult, anchorDate, timeZone);
  return makeSession([snapshot], [], snapshot.draft, []);
}

export function mergeParsedRevision(session: DraftSession, parseResult: RideSearchParseResult, anchorDate: Date, timeZone: string): DraftSession {
  validateDraftSession(session);
  const snapshot = checkedSnapshot(parseResult, anchorDate, timeZone);
  if (session.snapshots.some(value => key(value.query) === key(snapshot.query))) throw new DraftSessionError('STALE_QUERY');
  const merged = applyEdits(overlay(session.effectiveDraft, snapshot.draft), session.edits);
  const endpointsChanged = !isDeepStrictEqual(session.effectiveDraft.pickup, merged.pickup) || !isDeepStrictEqual(session.effectiveDraft.drop, merged.drop);
  const changed = !isDeepStrictEqual(session.effectiveDraft, merged);
  return makeSession([...session.snapshots, snapshot], session.edits, merged, session.trustedSelectionRegistry,
    { fare: session.invalidations.fare || changed, route: session.invalidations.route || changed, locationConfirmation: session.invalidations.locationConfirmation || endpointsChanged });
}

export function editDraftField(session: DraftSession, field: SessionField, value: SessionEditValue, editedAt?: Date): DraftSession {
  validateDraftSession(session);
  const revision = session.edits.length + 1;
  if ((field === 'timing.date' || field === 'timing') && editedAt !== undefined && !Number.isFinite(editedAt.getTime())) throw new DraftSessionError('INVALID_EDIT');
  const normal = fieldValue(field, value, revision);
  const edits = [...session.edits, freeze({ field, revision, value: freeze(clone(normal)), ...(editedAt === undefined ? {} : { editedAt: editedAt.toISOString() }) })];
  const draft = applyEdits(session.effectiveDraft, edits);
  if (!bookingDraftSchema.safeParse(draft).success) throw new DraftSessionError('INVALID_EDIT');
  const changedLocations = field === 'pickup' || field === 'drop' || field === 'locationSearch';
  return makeSession(session.snapshots, edits, draft, session.trustedSelectionRegistry, {
    fare: true, route: session.invalidations.route || changedLocations || field === 'timing' || field.startsWith('timing.'), locationConfirmation: session.invalidations.locationConfirmation || changedLocations,
  });
}

export function registerTrustedLocationSelection(session: DraftSession, selection: TrustedLocation): DraftSession {
  validateDraftSession(session);
  trustedLocationSchema.parse(selection);
  if (session.trustedSelectionRegistry.some(value => value.selectionId === selection.selectionId)) throw new DraftSessionError('INVALID_EDIT');
  return makeSession(session.snapshots, session.edits, session.effectiveDraft, [...session.trustedSelectionRegistry, freeze(clone(selection))], session.invalidations);
}
