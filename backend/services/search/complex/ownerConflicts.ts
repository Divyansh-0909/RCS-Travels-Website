import { createHash } from 'node:crypto';
import type { BookingDraft } from '../contracts.ts';
import { SEARCH_LIMITS } from '../contracts.ts';
import type { Observations } from '../observations.ts';
import { ambiguous, issue, queryRef, type ParseIssue } from '../fields.ts';

export function preserveOwnerConflicts(draft: BookingDraft, observations: Observations): ParseIssue[] {
  const issues: ParseIssue[] = [];
  const times = [...new Map(observations.times.map(value => [JSON.stringify(value.value, (key, item) => key === 'refs' ? undefined : item), value])).values()];
  const competingPickupTimes = /\bat \d+(?::\d+)?\s*(?:AM|PM)?\s+(?:and|or)\s+(?:at\s+)?\d/i.test(draft.query.text);
  if (times.length > 1 && competingPickupTimes) {
    if (times.length > SEARCH_LIMITS.ambiguousAlternatives) return [issue('LUNA_UNSUPPORTED_FACT', 'timing.time', 'INVALID')];
    const refs = times.map(value => value.ref);
    draft.timing.time = ambiguous(times.map(value => value.value), 'TIME_SELECTION_REQUIRED', refs);
    issues.push(issue('TIME_SELECTION_REQUIRED', 'timing.time', 'AMBIGUOUS', refs));
  }
  const match = /\bfrom (.+?) to (.+?), but if my flight changes take me to (.+)$/i.exec(draft.query.text);
  if (match === null) return issues;
  const alternatives = [match[2], match[3]].map((text, index) => {
    const start = index === 0 ? draft.query.text.indexOf(text, match.index + 5 + match[1].length) : draft.query.text.lastIndexOf(text);
    const end = start + text.length;
    const existing = draft.candidates.find(value => value.start === start && value.end === end);
    if (existing !== undefined) return existing;
    const candidateId = `owner-span:${createHash('sha256').update(JSON.stringify([draft.query.id, draft.query.revision, start, end])).digest('hex')}`;
    const candidate = { candidateId, queryId: draft.query.id, queryRevision: draft.query.revision,
      start, end, exactText: text, method: 'LUNA_SOURCE_SPAN' as const, generatorVersion: 'owner-conditional-source-v1' };
    draft.candidates.push(candidate); return candidate;
  });
  if (draft.candidates.length > SEARCH_LIMITS.candidates) return [issue('LUNA_UNSUPPORTED_FACT', 'drop', 'INVALID')];
  const refs = alternatives.map(value => queryRef(draft.query, value.start, value.end));
  draft.drop = ambiguous(alternatives.map(value => ({ kind: 'QUERY_CANDIDATE' as const, candidateId: value.candidateId })),
    'DESTINATION_SELECTION_REQUIRED', refs);
  issues.push(issue('DESTINATION_SELECTION_REQUIRED', 'drop', 'AMBIGUOUS', refs));
  return issues;
}
