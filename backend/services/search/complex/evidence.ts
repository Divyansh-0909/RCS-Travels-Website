import { isDeepStrictEqual } from 'node:util';
import type { BookingDraft, Field, LocationCandidate } from '../contracts.ts';
import { collectObservations, type Observed } from '../observations.ts';
import { issue, queryRef, type ParseIssue } from '../fields.ts';
import { unsupportedRequests } from '../extractor.ts';
import { sourceRefs } from '../locations/sessionRefs.ts';
import { excludedMention, statedVehicleExclusions } from '../vehiclePolicy.ts';
import { preserveOwnerConflicts } from './ownerConflicts.ts';

function semantic(value: object): string {
  return JSON.stringify(value, (key, child) => key === 'refs' ? undefined : child);
}
function supported<T>(field: Field<T>, observations: Observed<T>[]): boolean {
  if (field.state === 'UNSPECIFIED') return true;
  const values = field.state === 'RESOLVED' ? [field.value] : field.alternatives;
  return values.every(value => observations.some(observed =>
    isDeepStrictEqual(JSON.parse(semantic({ value })), JSON.parse(semantic({ value: observed.value })))
    && field.refs.some(ref => ref.kind === 'QUERY_SPAN' && observed.ref.start >= ref.start && observed.ref.end <= ref.end)));
}
function vehicleEvidence(draft: BookingDraft, observations: ReturnType<typeof collectObservations>, issues: ParseIssue[]): void {
  const field = draft.vehicleClass;
  const exclusions = statedVehicleExclusions(draft, observations.vehicles);
  const provided = 'excluded' in field ? field.excluded ?? [] : [];
  const invalid = provided.some(value => !exclusions.includes(value)) || exclusions.some(value => !provided.includes(value));
  if (invalid) issues.push(issue('LUNA_UNSUPPORTED_FACT', 'vehicleClass', 'INVALID'));
  if (field.state === 'EXPLICIT_ANY' && observations.anyVehicle.length === 0) issues.push(issue('LUNA_UNSUPPORTED_FACT', 'vehicleClass', 'INVALID'));
  if (field.state === 'RESOLVED') {
    const mentions = observations.vehicles.filter(value => value.value === field.value && !excludedMention(draft, value));
    if (!mentions.some(value => field.refs.some(ref => ref.kind === 'QUERY_SPAN' && value.ref.start >= ref.start && value.ref.end <= ref.end))) {
      issues.push(issue('LUNA_UNSUPPORTED_FACT', 'vehicleClass', 'INVALID'));
    }
    for (const value of mentions) {
      const before = draft.query.text.slice(Math.max(0, value.ref.start - 20), value.ref.start);
      const after = draft.query.text.slice(value.ref.end, value.ref.end + 20);
      const required = /\bonly\s*$/i.test(before) || /^\s+only\b/i.test(after);
      const preferred = /\bprefer(?:red)?\s*$/i.test(before) || /^\s+preferred\b/i.test(after);
      if (required && field.strength !== 'REQUIRED' || preferred && field.strength !== 'PREFERRED') {
        issues.push(issue('LUNA_UNSUPPORTED_FACT', 'vehicleClass', 'INVALID'));
      }
    }
  }
  if (field.state === 'AMBIGUOUS' && field.alternatives.some(value => !observations.vehicles.some(observed => observed.value === value))) {
    issues.push(issue('LUNA_UNSUPPORTED_FACT', 'vehicleClass', 'INVALID'));
  }
}

// Source validity is necessary but insufficient. Deterministic observations
// also guard stated scalar values and preserve unsupported clauses.
function scalarEvidence(draft: BookingDraft, observations: ReturnType<typeof collectObservations>, issues: ParseIssue[]): void {
  for (const flag of ['sharing', 'isOutstation', 'preferSafeRoute', 'needsCarrier'] as const) {
    if (!supported(draft[flag], observations.flags[flag])) issues.push(issue('LUNA_UNSUPPORTED_FACT', flag, 'INVALID'));
  }
  if (!supported(draft.passengers, observations.passengers)) issues.push(issue('LUNA_UNSUPPORTED_FACT', 'passengers', 'INVALID'));
  if (!supported(draft.timing.date, observations.dates)) issues.push(issue('LUNA_UNSUPPORTED_FACT', 'timing.date', 'INVALID'));
  if (!supported(draft.timing.time, observations.times)) issues.push(issue('LUNA_UNSUPPORTED_FACT', 'timing.time', 'INVALID'));
}
function temporalEvidence(draft: BookingDraft, observations: ReturnType<typeof collectObservations>, issues: ParseIssue[]): void {
  const timed = observations.dates.length + observations.times.length > 0;
  if (draft.timing.mode === 'IMMEDIATE' && (!observations.now.length || timed)
    || draft.timing.mode === 'SCHEDULED' && (!timed || observations.now.length > 0)
    || draft.timing.mode === 'UNSPECIFIED' && (timed || observations.now.length > 0)
    || draft.timing.mode === 'AMBIGUOUS' && !timed && observations.now.length === 0) {
    issues.push(issue('TEMPORAL_CONFLICT', 'timing', 'INVALID', draft.timing.refs));
  }
}
function preserveUnsupported(draft: BookingDraft, observations: ReturnType<typeof collectObservations>, issues: ParseIssue[]): void {
  for (const request of draft.unsupportedRequests) {
    const stated = request.kind === 'PASSENGER_COUNT' ? observations.passengers.map(value => value.ref)
      : observations.unsupported.filter(value => value.kind === request.kind).map(value => value.ref);
    if (!request.refs.some(ref => ref.kind === 'QUERY_SPAN' && stated.some(value => value.kind === 'QUERY_SPAN' && value.start >= ref.start && value.end <= ref.end))) {
      issues.push(issue('LUNA_UNSUPPORTED_FACT', 'unsupportedRequests', 'INVALID'));
    }
  }
  for (const request of unsupportedRequests(observations, draft.candidates, 'BACKEND_CAPABILITY_UNSUPPORTED')) {
    if (!draft.unsupportedRequests.some(value => value.kind === request.kind && sourceRefs(value).some(ref => isDeepStrictEqual(ref, request.refs[0])))) {
      draft.unsupportedRequests.push(request);
    }
  }
  if (draft.passengers.state !== 'UNSPECIFIED' && !draft.unsupportedRequests.some(value => value.kind === 'PASSENGER_COUNT')) {
    draft.unsupportedRequests.push({ kind: 'PASSENGER_COUNT', refs: draft.passengers.refs, candidateIds: [], reasonCode: 'PASSENGER_ALLOCATION_NOT_ENFORCED' });
  }
  issues.push(...draft.unsupportedRequests.map(value => issue('UNSUPPORTED_REQUEST', value.kind, 'UNSUPPORTED', value.refs)));
}
export function validateLunaEvidence(draft: BookingDraft, trustedCandidates: LocationCandidate[] = draft.candidates): ParseIssue[] {
  // Model-proposed spans cannot mask a conflicting fact or unsupported clause.
  // Only candidates known before interpretation may suppress location-word hits.
  const observations = collectObservations(draft.query, trustedCandidates);
  for (const match of draft.query.text.matchAll(/\b(?:get|collect|pick\s+up)\s+(?:my\s+)?friend\b/gi)) {
    observations.unsupported.push({ kind: 'STOP', ref: queryRef(draft.query, match.index, match.index + match[0].length) });
  }
  const issues: ParseIssue[] = [];
  vehicleEvidence(draft, observations, issues);
  scalarEvidence(draft, observations, issues);
  temporalEvidence(draft, observations, issues);
  preserveUnsupported(draft, observations, issues);
  issues.push(...preserveOwnerConflicts(draft, observations));
  return issues;
}
