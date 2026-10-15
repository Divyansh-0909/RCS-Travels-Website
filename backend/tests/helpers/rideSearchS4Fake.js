import { emptyDraft } from '../../services/search/contracts.ts';
import { collectObservations } from '../../services/search/observations.ts';
import { resolved, queryRef } from '../../services/search/fields.ts';

export function lunaOutput(query, { type = 'BOOKING_REQUEST', complexity = 'COMPLEX', pickup, drop, locationSearch,
  candidates = [], modify = () => {} } = {}) {
  const draft = emptyDraft(query);
  draft.queryType = type; draft.complexity = type === 'BOOKING_REQUEST' ? complexity : 'NOT_APPLICABLE';
  const locations = [];
  for (const [role, phrase] of Object.entries({ pickup, drop, locationSearch })) {
    if (!phrase) continue;
    const start = query.text.indexOf(phrase); const end = start + phrase.length;
    const existing = candidates.find(value => value.start === start && value.end === end);
    const key = existing?.candidateId ?? role;
    if (!existing) locations.push({ key, start, end, exactText: phrase });
    draft[role] = resolved({ kind: 'QUERY_CANDIDATE', candidateId: key }, [queryRef(query, start, end)]);
  }
  const observations = collectObservations(query, candidates);
  if (observations.now.length) draft.timing = { mode: 'IMMEDIATE', refs: observations.now, date: { state: 'UNSPECIFIED' }, time: { state: 'UNSPECIFIED' } };
  if (observations.dates.length || observations.times.length) {
    draft.timing.mode = 'SCHEDULED';
    draft.timing.refs = [...observations.dates, ...observations.times].map(value => value.ref);
    for (const [field, values] of [['date', observations.dates], ['time', observations.times]]) {
      if (values.length === 1) draft.timing[field] = resolved(values[0].value, [values[0].ref]);
    }
  }
  if (observations.passengers.length === 1) draft.passengers = resolved(observations.passengers[0].value, [observations.passengers[0].ref]);
  for (const [field, values] of Object.entries(observations.flags)) if (values.length === 1) draft[field] = resolved(values[0].value, [values[0].ref]);
  modify(draft, locations);
  delete draft.candidates;
  return { draft, locations };
}
export function lunaFake(create = input => lunaOutput(input.query, { candidates: input.candidates })) {
  return { calls: [], async interpret(input, signal) {
    this.calls.push({ input: structuredClone(input), signal });
    const output = await create(input, signal);
    return { output, metadata: { provider: 'openai', model: 'gpt-6-luna', schemaVersion: 'ride-search-luna-v1',
      requestCount: 1, latencyMs: 0, inputTokens: null, outputTokens: null } };
  } };
}
