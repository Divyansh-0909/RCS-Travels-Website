import type { BookingDraft, ParseInput } from './contracts.ts';
import { answer } from './extractor.ts';
import type { DecisionBatch } from './provider.ts';
import { issue, type ParseIssue } from './fields.ts';

export function validateRoles(draft: BookingDraft, batch: DecisionBatch, issues: ParseIssue[]): void {
  for (const role of ['pickup', 'drop'] as const) {
    const presence = answer(batch, `${role}_presence`, ['PRESENT', 'ABSENT', 'UNCLEAR']);
    if (presence === 'PRESENT' && draft[role].state === 'UNSPECIFIED') {
      issues.push(issue('LOCATION_CANDIDATE_MISSING', role, 'DEPENDENCY'));
    }
    if (presence === 'UNCLEAR') issues.push(issue('ROLE_CONFLICT', role, 'AMBIGUOUS'));
    if (presence === 'ABSENT' && draft[role].state === 'RESOLVED') issues.push(issue('ROLE_CONFLICT', role, 'INVALID', draft[role].refs));
  }
  const consistency = answer(batch, 'role_consistency', ['CONSISTENT', 'REVERSAL_RISK', 'CONFLICT', 'NO_ROLES']);
  if (consistency === 'REVERSAL_RISK' || consistency === 'CONFLICT') issues.push(issue('ROLE_CONFLICT', 'locations', 'AMBIGUOUS'));
  if (consistency === 'NO_ROLES' && (draft.pickup.state === 'RESOLVED' || draft.drop.state === 'RESOLVED')) {
    issues.push(issue('ROLE_CONFLICT', 'locations', 'INVALID'));
  }
  validateDirection(draft, issues);
}

export function validateDirection(draft: BookingDraft, issues: ParseIssue[]): void {
  for (const role of ['pickup', 'drop'] as const) {
    const field = draft[role];
    if (field.state !== 'RESOLVED' || field.value.kind !== 'QUERY_CANDIDATE') continue;
    const id = field.value.candidateId;
    const candidate = draft.candidates.find(value => value.candidateId === id);
    if (candidate === undefined) continue;
    const before = draft.query.text.slice(0, candidate.start);
    const after = draft.query.text.slice(candidate.end);
    const explicitPickup = /\b(?:from|pick(?:up|\s+me(?:\s+up)?)\s+(?:at|from))\s*$/i.test(before) || /^\s+se\b/i.test(after);
    const explicitDrop = /\b(?:to|drop(?:\s+me)?(?:\s+off)?\s+at)\s*$/i.test(before);
    if ((role === 'pickup' && explicitDrop) || (role === 'drop' && explicitPickup)) {
      issues.push(issue('ROLE_CONFLICT', role, 'INVALID', field.refs));
    }
  }
}

export function validateEndpoints(draft: BookingDraft, issues: ParseIssue[]): void {
  const pickup = draft.pickup;
  const drop = draft.drop;
  if (pickup.state === 'RESOLVED' && drop.state === 'RESOLVED'
    && JSON.stringify(pickup.value) === JSON.stringify(drop.value)) issues.push(issue('ROLE_CONFLICT', 'locations', 'AMBIGUOUS', [...pickup.refs, ...drop.refs]));
  if (pickup.state === 'RESOLVED' && drop.state === 'RESOLVED'
    && pickup.value.kind === 'QUERY_CANDIDATE' && drop.value.kind === 'QUERY_CANDIDATE') {
    const originId = pickup.value.candidateId;
    const destinationId = drop.value.candidateId;
    const origin = draft.candidates.find(candidate => candidate.candidateId === originId);
    const destination = draft.candidates.find(candidate => candidate.candidateId === destinationId);
    if (origin !== undefined && destination !== undefined && origin.start < destination.end && destination.start < origin.end) {
      issues.push(issue('ROLE_CONFLICT', 'locations', 'AMBIGUOUS', [...pickup.refs, ...drop.refs]));
    }
  }
}

export function missingFields(draft: BookingDraft): ParseIssue[] {
  const issues: ParseIssue[] = [];
  for (const role of ['pickup', 'drop'] as const) {
    if (draft[role].state === 'UNSPECIFIED') issues.push(issue('FIELD_REQUIRED', role, 'MISSING'));
    else if (draft[role].state === 'RESOLVED' && draft[role].value.kind === 'QUERY_CANDIDATE') {
      issues.push(issue('PLACES_GROUNDING_REQUIRED', role, 'DEPENDENCY', draft[role].refs));
    }
  }
  if (draft.vehicleClass.state !== 'RESOLVED') issues.push(issue('VEHICLE_SELECTION_REQUIRED', 'vehicleClass', 'MISSING'));
  if (draft.timing.mode === 'UNSPECIFIED') issues.push(issue('TIMING_REQUIRED', 'timing', 'MISSING'));
  if (draft.timing.mode === 'SCHEDULED') {
    if (draft.timing.date.state === 'UNSPECIFIED') issues.push(issue('DATE_REQUIRED', 'timing.date', 'MISSING'));
    if (draft.timing.time.state === 'UNSPECIFIED') issues.push(issue('TIME_REQUIRED', 'timing.time', 'MISSING'));
  }
  if (draft.passengers.state !== 'UNSPECIFIED' && !draft.unsupportedRequests.some(request => request.kind === 'PASSENGER_COUNT')) {
    issues.push(issue('UNSUPPORTED_REQUEST', 'PASSENGER_COUNT', 'UNSUPPORTED', draft.passengers.refs));
  }
  return issues;
}

export function observationLimit(observations: { dates: object[]; times: object[]; passengers: object[] }, temporal: number, passengers: number): boolean {
  return observations.dates.length > temporal || observations.times.length > temporal || observations.passengers.length > passengers;
}

function replaceRefs<T>(value: T, field: string, revision: number): T {
  return JSON.parse(JSON.stringify(value, (key, current) => key === 'refs'
    ? [{ kind: 'USER_FIELD', field, revision }] : current)) as T;
}

export function preserveUserFields(draft: BookingDraft, input: ParseInput): void {
  if (input.formDraft === undefined) return;
  const trusted = input.formDraft;
  for (const field of ['pickup', 'drop', 'vehicleClass', 'passengers', 'sharing', 'isOutstation', 'preferSafeRoute', 'needsCarrier'] as const) {
    if (draft[field].state === 'UNSPECIFIED' && trusted[field].state !== 'UNSPECIFIED') {
      Object.assign(draft, { [field]: replaceRefs(trusted[field], field, trusted.query.revision) });
    }
  }
  if (draft.timing.mode === 'UNSPECIFIED' && trusted.timing.mode !== 'UNSPECIFIED') {
    draft.timing = replaceRefs(trusted.timing, 'timing', trusted.query.revision);
  }
  for (const request of trusted.unsupportedRequests) {
    if (!draft.unsupportedRequests.some(value => value.kind === request.kind)) {
      draft.unsupportedRequests.push(replaceRefs(request, 'unsupportedRequests', trusted.query.revision));
    }
  }
}
