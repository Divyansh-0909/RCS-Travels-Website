import type { BookingDraft, Field, LocationCandidate, VehiclePreference } from './contracts.ts';
import type { DecisionBatch } from './provider.ts';
import { SearchProviderError } from './provider.ts';
import type { Observations, Observed, VehicleClass, Flag } from './observations.ts';
import { ambiguous, issue, resolved, unspecified, type ParseIssue } from './fields.ts';
import { excludedMention, statedVehicleExclusions, exclusionOnlyPreference, sourceOnlyAnyPreference, statedAnyAcceptance } from './vehiclePolicy.ts';

export function answer(batch: DecisionBatch, name: string, allowed: string[]): string {
  const value = batch.choices[name]?.choice;
  if (value === undefined || !allowed.includes(value)) throw new SearchProviderError('JEV_INVALID_RESPONSE');
  return value;
}

export function selectObserved<T>(batch: DecisionBatch, name: string, candidates: Observed<T>[], issues: ParseIssue[]): Field<T> {
  if (!candidates.length) return unspecified();
  const selected = answer(batch, name, [...candidates.map(candidate => candidate.id), 'NONE', 'UNCLEAR']);
  if (selected === 'NONE' || selected === 'UNCLEAR' || candidates.length > 1) {
    issues.push(issue('EXTRACTION_BINDING_UNRESOLVED', name, 'AMBIGUOUS', candidates.map(candidate => candidate.ref)));
    return ambiguous([...new Map(candidates.map(candidate => [JSON.stringify(candidate.value), candidate.value])).values()],
      'EXTRACTION_BINDING_UNRESOLVED', candidates.map(candidate => candidate.ref));
  }
  const candidate = candidates.find(value => value.id === selected)!;
  return resolved(candidate.value, [candidate.ref]);
}

export function locationField(batch: DecisionBatch, name: string, candidates: LocationCandidate[]): BookingDraft['pickup'] {
  const selected = answer(batch, name, [...candidates.map(candidate => candidate.candidateId), 'NONE_OR_UNCLEAR']);
  if (selected === 'NONE_OR_UNCLEAR') return unspecified();
  const candidate = candidates.find(value => value.candidateId === selected)!;
  return resolved({ kind: 'QUERY_CANDIDATE', candidateId: selected }, [{ kind: 'QUERY_SPAN',
    queryId: candidate.queryId, revision: candidate.queryRevision, start: candidate.start, end: candidate.end }]);
}

function vehicleExclusions(draft: BookingDraft, batch: DecisionBatch, observations: Observations, issues: ParseIssue[]): VehicleClass[] {
  const classes: VehicleClass[] = ['hatchback', 'sedan', 'suv', 'suv_premium'];
  const stated = statedVehicleExclusions(draft, observations.vehicles);
  return classes.filter(vehicle => {
    const decision = answer(batch, `exclude_${vehicle}`, ['EXCLUDED', 'NOT_EXCLUDED', 'UNCLEAR']);
    const observedExclusion = stated.includes(vehicle);
    if (decision === 'UNCLEAR') issues.push(issue('PRODUCT_POLICY_UNRESOLVED', 'vehicleClass', 'POLICY', observations.vehicles.map(value => value.ref)));
    if (decision !== 'EXCLUDED' && !observedExclusion) return false;
    if (!observedExclusion) {
      throw new SearchProviderError('JEV_INVALID_RESPONSE');
    }
    if (decision === 'NOT_EXCLUDED') issues.push(issue('EXTRACTION_BINDING_UNRESOLVED', 'vehicleClass', 'AMBIGUOUS', observations.vehicles.map(candidate => candidate.ref)));
    return true;
  });
}

function statedStrength(draft: BookingDraft, candidate: Observed<VehicleClass>): 'REQUIRED' | 'PREFERRED' {
  const before = draft.query.text.slice(Math.max(0, candidate.ref.start - 20), candidate.ref.start);
  const after = draft.query.text.slice(candidate.ref.end, candidate.ref.end + 20);
  if (/^\s+only\b/i.test(after) || /\bonly\s*$/i.test(before)) return 'REQUIRED';
  if (/\b(?:prefer(?:red)?|ideally)\s*$/i.test(before) || /^\s+(?:preferred|if\s+(?:available|possible))\b/i.test(after)) return 'PREFERRED';
  return 'REQUIRED';
}

export function extractVehicle(draft: BookingDraft, batch: DecisionBatch, observations: Observations, issues: ParseIssue[]): VehiclePreference {
  if (!observations.vehicles.length && !observations.anyVehicle.length) return unspecified();
  const sourceOnlyAny = sourceOnlyAnyPreference(draft, observations.vehicles, observations.anyVehicle);
  if (sourceOnlyAny !== undefined) return sourceOnlyAny;
  const refs = [...observations.vehicles.map(candidate => candidate.ref), ...observations.anyVehicle];
  const positive = observations.vehicles.filter(candidate => !excludedMention(draft, candidate));
  const explicitExclusions = statedVehicleExclusions(draft, observations.vehicles);
  const exclusionOnly = exclusionOnlyPreference(explicitExclusions, positive.length > 0, refs, issues);
  if (exclusionOnly !== undefined) return exclusionOnly;
  const excluded = vehicleExclusions(draft, batch, observations, issues);
  const selected = answer(batch, 'vehicle_class', ['hatchback', 'sedan', 'suv', 'suv_premium', 'NOT_MENTIONED', 'UNCLEAR']);
  const any = answer(batch, 'vehicle_any', ['EXPLICIT_ANY', 'NOT_STATED', 'UNCLEAR']);
  const strength = answer(batch, 'vehicle_strength', ['REQUIRED', 'PREFERRED', 'NOT_APPLICABLE', 'UNCLEAR']);
  const alternatives = [...new Set(observations.vehicles.map(candidate => candidate.value))];
  const conflict = selected === 'UNCLEAR' || any === 'UNCLEAR' || strength === 'UNCLEAR'
    || excluded.includes(selected as VehicleClass) || (any === 'EXPLICIT_ANY' && strength === 'REQUIRED')
    || new Set(positive.map(candidate => candidate.value)).size > 1;
  if (conflict) {
    issues.push(issue('VEHICLE_CONFLICT', 'vehicleClass', 'AMBIGUOUS', refs, excluded));
    return alternatives.length ? { state: 'AMBIGUOUS', alternatives, excluded, reasonCode: 'VEHICLE_CONFLICT', refs } : unspecified();
  }
  if (selected !== 'NOT_MENTIONED') {
    if (!positive.some(candidate => candidate.value === selected) || strength === 'NOT_APPLICABLE') throw new SearchProviderError('JEV_INVALID_RESPONSE');
    const explicitStrength = statedStrength(draft, positive.find(candidate => candidate.value === selected)!);
    if (strength !== explicitStrength) throw new SearchProviderError('JEV_INVALID_RESPONSE');
    return { state: 'RESOLVED', value: selected as VehicleClass, strength: strength as 'REQUIRED' | 'PREFERRED', excluded, refs };
  }
  if (any === 'EXPLICIT_ANY') {
    if (!statedAnyAcceptance(draft, observations.anyVehicle)) throw new SearchProviderError('JEV_INVALID_RESPONSE');
    if (positive.length === 0) return { state: 'EXPLICIT_ANY', excluded, refs };
  }
  issues.push(issue('EXTRACTION_BINDING_UNRESOLVED', 'vehicleClass', 'AMBIGUOUS', refs));
  return alternatives.length ? { state: 'AMBIGUOUS', alternatives, excluded, reasonCode: 'EXTRACTION_BINDING_UNRESOLVED', refs } : unspecified();
}

function extractFlag(batch: DecisionBatch, flag: Flag, candidates: Observed<boolean>[], issues: ParseIssue[]): Field<boolean> {
  if (!candidates.length) return unspecified();
  const selected = answer(batch, flag, ['YES', 'NO', 'NOT_MENTIONED', 'UNCLEAR']);
  const refs = candidates.map(candidate => candidate.ref);
  if (selected === 'UNCLEAR' || selected === 'NOT_MENTIONED' || new Set(candidates.map(candidate => candidate.value)).size > 1) {
    issues.push(issue('EXTRACTION_BINDING_UNRESOLVED', flag, 'AMBIGUOUS', refs));
    return ambiguous([...new Set(candidates.map(candidate => candidate.value))], 'EXTRACTION_BINDING_UNRESOLVED', refs);
  }
  const value = selected === 'YES';
  if (!candidates.some(candidate => candidate.value === value)) throw new SearchProviderError('JEV_INVALID_RESPONSE');
  return resolved(value, refs);
}

function extractTiming(draft: BookingDraft, batch: DecisionBatch, observations: Observations, issues: ParseIssue[]): void {
  const mode = answer(batch, 'timing_mode', ['IMMEDIATE', 'SCHEDULED', 'UNSPECIFIED', 'AMBIGUOUS']) as BookingDraft['timing']['mode'];
  const refs = [...observations.now, ...observations.dates.map(value => value.ref), ...observations.times.map(value => value.ref)];
  draft.timing = { mode, refs, date: selectObserved(batch, 'date_expression', observations.dates, issues),
    time: selectObserved(batch, 'time_expression', observations.times, issues) };
  const temporal = observations.dates.length + observations.times.length > 0;
  const incompatible = mode === 'IMMEDIATE' && (!observations.now.length || temporal)
    || mode === 'UNSPECIFIED' && refs.length > 0 || mode === 'SCHEDULED' && (!temporal || observations.now.length > 0);
  if (incompatible || mode === 'AMBIGUOUS') {
    if (!refs.length) throw new SearchProviderError('JEV_INVALID_RESPONSE');
    draft.timing.mode = 'AMBIGUOUS';
    issues.push(issue('TEMPORAL_CONFLICT', 'timing', 'AMBIGUOUS', refs));
  }
}

export function unsupportedRequests(observations: Observations, candidates: LocationCandidate[], reasonCode: string): BookingDraft['unsupportedRequests'] {
  return observations.unsupported.map(request => ({ kind: request.kind, refs: [request.ref],
    candidateIds: candidates.filter(candidate => request.ref.kind === 'QUERY_SPAN'
      && candidate.start >= request.ref.start && candidate.end <= request.ref.end)
      .sort((left, right) => left.start - right.start).map(candidate => candidate.candidateId),
    reasonCode: request.kind === 'STOP' ? 'PLANNED_PRODUCT_FEATURE' : reasonCode }));
}

export function extractSimple(draft: BookingDraft, batch: DecisionBatch, observations: Observations, issues: ParseIssue[]): void {
  draft.pickup = locationField(batch, 'pickup_candidate', draft.candidates);
  draft.drop = locationField(batch, 'drop_candidate', draft.candidates);
  draft.vehicleClass = extractVehicle(draft, batch, observations, issues);
  extractTiming(draft, batch, observations, issues);
  draft.passengers = selectObserved(batch, 'passenger_candidate', observations.passengers, issues);
  for (const flag of ['sharing', 'isOutstation', 'preferSafeRoute', 'needsCarrier'] as const) {
    draft[flag] = extractFlag(batch, flag, observations.flags[flag], issues);
  }
  draft.unsupportedRequests = unsupportedRequests(observations, draft.candidates, 'BACKEND_CAPABILITY_UNSUPPORTED');
  if (draft.passengers.state !== 'UNSPECIFIED') draft.unsupportedRequests.push({ kind: 'PASSENGER_COUNT',
    refs: draft.passengers.refs, candidateIds: [], reasonCode: 'PASSENGER_ALLOCATION_NOT_ENFORCED' });
  preserveUnsupported(draft, batch, issues);
  for (const request of draft.unsupportedRequests) issues.push(issue('UNSUPPORTED_REQUEST', request.kind, 'UNSUPPORTED', request.refs));
}

function preserveUnsupported(draft: BookingDraft, batch: DecisionBatch, issues: ParseIssue[]): void {
  const selected = answer(batch, 'unsupported_service', ['NONE', 'PASSENGER_COUNT', 'STOP', 'RETURN_JOURNEY', 'RENTAL',
    'AC_PREFERENCE', 'CONDITIONAL_PREFERENCE', 'OTHER', 'UNCLEAR']);
  if (selected === 'NONE') return;
  if (selected === 'UNCLEAR') {
    issues.push(issue('EXTRACTION_BINDING_UNRESOLVED', 'unsupportedRequests', 'AMBIGUOUS'));
    return;
  }
  if (!draft.unsupportedRequests.some(request => request.kind === selected)) {
    if (selected !== 'OTHER') {
      issues.push(issue('EXTRACTION_BINDING_UNRESOLVED', 'unsupportedRequests', 'AMBIGUOUS'));
      return;
    }
    draft.unsupportedRequests.push({ kind: 'OTHER', refs: [{ kind: 'QUERY_SPAN', queryId: draft.query.id,
      revision: draft.query.revision, start: 0, end: draft.query.text.length }], candidateIds: [], reasonCode: 'UNSUPPORTED_CLAUSE_REVIEW_REQUIRED' });
  }
}
