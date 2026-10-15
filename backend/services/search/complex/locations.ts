import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { bookingDraftSchema, parseInputSchema, type BookingDraft, type LocationCandidate } from '../contracts.ts';
import { validateDraftProvenance } from '../provenance.ts';
import { sourceRefs } from '../locations/sessionRefs.ts';
import { ComplexProviderError, lunaOutputSchema, type ComplexInterpretationInput, type LunaOutput } from './contracts.ts';

export const LUNA_GENERATOR_VERSION = 'ride-search-luna-spans-v1';

function mapLocations(input: ComplexInterpretationInput, spans: LunaOutput['locations']) {
  const candidates = structuredClone(input.candidates);
  const aliases = new Map(candidates.map(value => [value.candidateId, value.candidateId]));
  const declared = new Set<string>();
  for (const span of spans) {
    if (declared.has(span.key)) throw new ComplexProviderError('LUNA_SCHEMA_ERROR');
    declared.add(span.key);
    const same = candidates.find(value => value.start === span.start && value.end === span.end && value.exactText === span.exactText);
    const owned = candidates.find(value => value.candidateId === span.key);
    if (owned !== undefined && owned !== same) throw new ComplexProviderError('LUNA_SCHEMA_ERROR');
    const candidateId = same?.candidateId ?? `luna-${createHash('sha256').update(JSON.stringify([
      input.query.id, input.query.revision, LUNA_GENERATOR_VERSION, span.start, span.end, span.exactText,
    ])).digest('hex').slice(0, 24)}`;
    if (same === undefined) candidates.push({ candidateId, queryId: input.query.id, queryRevision: input.query.revision,
      exactText: span.exactText, start: span.start, end: span.end, method: 'LUNA_SOURCE_SPAN', generatorVersion: LUNA_GENERATOR_VERSION });
    aliases.set(span.key, candidateId);
  }
  if (!parseInputSchema.safeParse({ query: input.query, candidates, timeZone: input.timeZone }).success) {
    throw new ComplexProviderError('LUNA_SCHEMA_ERROR');
  }
  return { candidates, aliases };
}

function rebind(draft: BookingDraft, aliases: Map<string, string>): void {
  const bind = (id: string): string => {
    const result = aliases.get(id);
    if (result === undefined) throw new ComplexProviderError('LUNA_SCHEMA_ERROR');
    return result;
  };
  for (const role of ['pickup', 'drop', 'locationSearch'] as const) {
    const field = draft[role];
    const values = field.state === 'RESOLVED' ? [field.value] : field.state === 'AMBIGUOUS' ? field.alternatives : [];
    for (const value of values) {
      if (value.kind !== 'QUERY_CANDIDATE') throw new ComplexProviderError('LUNA_SCHEMA_ERROR');
      value.candidateId = bind(value.candidateId);
      const candidate = draft.candidates.find(entry => entry.candidateId === value.candidateId)!;
      if (!sourceRefs(field).some(ref => ref.kind === 'QUERY_SPAN' && ref.start === candidate.start && ref.end === candidate.end)) {
        throw new ComplexProviderError('LUNA_SCHEMA_ERROR');
      }
    }
  }
  draft.unsupportedRequests.forEach(value => { value.candidateIds = value.candidateIds.map(bind); });
}

export function normalizeLunaOutput(input: ComplexInterpretationInput, raw: LunaOutput): BookingDraft {
  const checked = lunaOutputSchema.safeParse(raw);
  if (!checked.success || !isDeepStrictEqual(checked.data.draft.query, input.query)) throw new ComplexProviderError('LUNA_SCHEMA_ERROR');
  const mapped = mapLocations(input, checked.data.locations);
  const draft = bookingDraftSchema.parse({ ...checked.data.draft, candidates: mapped.candidates });
  rebind(draft, mapped.aliases);
  if (sourceRefs(draft).some(ref => ref.kind !== 'QUERY_SPAN') || validateDraftProvenance(draft).length > 0) {
    throw new ComplexProviderError('LUNA_SCHEMA_ERROR');
  }
  return draft;
}

export function newSpanCount(draft: BookingDraft, prior: LocationCandidate[]): number {
  return draft.candidates.filter(value => !prior.some(candidate => candidate.candidateId === value.candidateId)).length;
}
