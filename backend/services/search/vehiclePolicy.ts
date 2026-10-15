import type { BookingDraft, SourceRef, VehiclePreference } from './contracts.ts';
import type { Observed, VehicleClass } from './observations.ts';
import { issue, type ParseIssue } from './fields.ts';

export function statedAnyAcceptance(draft: Pick<BookingDraft, 'query'>, refs: SourceRef[]): boolean {
  return refs.length > 0 && refs.every(ref => ref.kind === 'QUERY_SPAN'
    && !/\b(?:no|not|except|without|don't|do\s+not)\s*$/i.test(draft.query.text.slice(0, ref.start)));
}

export function sourceOnlyAnyPreference(draft: Pick<BookingDraft, 'query'>, mentions: Observed<VehicleClass>[], refs: SourceRef[]): VehiclePreference | undefined {
  if (mentions.length || !statedAnyAcceptance(draft, refs)) return undefined;
  const explicit = refs.every(ref => ref.kind === 'QUERY_SPAN'
    && /^any\s+(?:car|cab|vehicle)$/i.test(draft.query.text.slice(ref.start, ref.end)));
  return explicit ? { state: 'EXPLICIT_ANY', excluded: [], refs } : undefined;
}

export function excludedMention(draft: Pick<BookingDraft, 'query'>, candidate: Observed<VehicleClass>): boolean {
  const prefix = draft.query.text.slice(Math.max(0, candidate.ref.start - 40), candidate.ref.start);
  return /\b(?:no|not|except|without|don't(?:\s+send)?|do\s+not(?:\s+send)?)\s*(?:an?\s+)?$/i.test(prefix);
}

export function statedVehicleExclusions(draft: Pick<BookingDraft, 'query'>, candidates: Observed<VehicleClass>[]): VehicleClass[] {
  return [...new Set(candidates.filter(candidate => excludedMention(draft, candidate)).flatMap(candidate =>
    candidate.value === 'suv' && !/^regular\s+suv$/i.test(candidate.text) ? ['suv', 'suv_premium'] as VehicleClass[] : [candidate.value]))];
}

export function exclusionOnlyPreference(excluded: VehicleClass[], hasPositive: boolean, refs: SourceRef[], issues: ParseIssue[]): VehiclePreference | undefined {
  if (hasPositive || excluded.length === 0) return undefined;
  if (excluded.length < 4) return { state: 'EXCLUDED', excluded, refs };
  issues.push(issue('VEHICLE_CONFLICT', 'vehicleClass', 'AMBIGUOUS', refs, excluded));
  return { state: 'AMBIGUOUS', alternatives: excluded, excluded, reasonCode: 'VEHICLE_CONFLICT', refs };
}
