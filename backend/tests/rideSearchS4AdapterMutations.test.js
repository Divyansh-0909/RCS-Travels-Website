import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyDraft } from '../services/search/contracts.ts';
import { ComplexProviderError, LUNA_MODEL } from '../services/search/complex/contracts.ts';
import { createLunaInterpreter } from '../services/search/complex/luna.ts';
import { LUNA_GENERATOR_VERSION, newSpanCount, normalizeLunaOutput } from '../services/search/complex/locations.ts';

const query = { id: 'mutation-query', revision: 3, text: 'from campus to airport' };
const at = text => ({ start: query.text.indexOf(text), end: query.text.indexOf(text) + text.length, exactText: text });
const campus = { candidateId: 'campus-id', queryId: query.id, queryRevision: query.revision, ...at('campus'), method: 'DIRECTIONAL_CLAUSE', generatorVersion: 'test' };
const misleadingCampusPrefix = { candidateId: 'campus-prefix', queryId: query.id, queryRevision: query.revision,
  start: campus.start, end: campus.start + 1, exactText: 'c', method: 'DIRECTIONAL_CLAUSE', generatorVersion: 'test' };
const airport = at('airport');

function input(candidates = [campus]) {
  return { query, candidates, partialDraft: null, fallbackReasons: ['COMPLEX_REQUEST'], now: '2026-10-03T10:00:00.000Z',
    timeZone: 'Asia/Kolkata', trustedFields: [] };
}

function raw({ pickup = 'campus', drop = 'airport', candidates = [campus], modify = () => {} } = {}) {
  const { candidates: ignored, ...draft } = emptyDraft(query);
  const locations = [];
  for (const [role, phrase] of Object.entries({ pickup, drop })) {
    if (!phrase) continue;
    const span = at(phrase);
    const existing = candidates.find(value => value.start === span.start && value.end === span.end && value.exactText === span.exactText);
    const key = existing?.candidateId ?? `${role}-alias`;
    if (!existing) locations.push({ key, ...span });
    draft[role] = { state: 'RESOLVED', value: { kind: 'QUERY_CANDIDATE', candidateId: key },
      refs: [{ kind: 'QUERY_SPAN', queryId: query.id, revision: query.revision, start: span.start, end: span.end }] };
  }
  draft.queryType = 'BOOKING_REQUEST';
  draft.complexity = 'COMPLEX';
  modify(draft, locations);
  return { draft, locations };
}

function transport(response) {
  return { async parse() { return { model: LUNA_MODEL, ...response }; } };
}

test('Luna normalization reuses only an exact existing span and gives new spans a stable code-owned identity', () => {
  const normalized = normalizeLunaOutput(input([misleadingCampusPrefix, campus]), raw({ candidates: [misleadingCampusPrefix, campus] }));
  assert.equal(normalized.pickup.value.candidateId, 'campus-id');
  assert.equal(normalized.candidates.filter(value => value.candidateId === 'campus-id').length, 1);
  const generated = normalized.candidates.find(value => value.exactText === 'airport');
  assert.ok(generated);
  assert.equal(generated.method, 'LUNA_SOURCE_SPAN');
  assert.equal(generated.generatorVersion, LUNA_GENERATOR_VERSION);
  assert.match(generated.candidateId, /^luna-[a-f0-9]{24}$/);
  assert.equal(normalized.drop.value.candidateId, generated.candidateId);
  assert.equal(newSpanCount(normalized, [misleadingCampusPrefix, campus]), 1);
});

test('Luna normalization rejects colliding aliases and role values without their own exact source evidence', () => {
  const collision = { candidateId: 'drop-alias', queryId: query.id, queryRevision: query.revision, ...at('campus'),
    method: 'DIRECTIONAL_CLAUSE', generatorVersion: 'test' };
  assert.throws(() => normalizeLunaOutput(input([campus, collision]), raw({ candidates: [campus], drop: 'airport' })),
    error => error instanceof ComplexProviderError && error.code === 'LUNA_SCHEMA_ERROR');

  const noDropEvidence = raw();
  noDropEvidence.draft.drop.refs = [{ kind: 'QUERY_SPAN', queryId: query.id, revision: query.revision, start: campus.start, end: campus.end }];
  assert.throws(() => normalizeLunaOutput(input(), noDropEvidence),
    error => error instanceof ComplexProviderError && error.code === 'LUNA_SCHEMA_ERROR');
});

test('Luna adapter rejects either model-generated user provenance and forged source spans before output escapes', async () => {
  for (const modify of [
    draft => { draft.pickup = { state: 'RESOLVED', value: { kind: 'USER_SELECTION', selectionId: 'forged' },
      refs: [{ kind: 'QUERY_SPAN', queryId: query.id, revision: query.revision, start: campus.start, end: campus.end }] }; },
    draft => { draft.passengers = { state: 'RESOLVED', value: 2,
      refs: [{ kind: 'USER_FIELD', field: 'passengers', revision: query.revision }] }; },
    draft => { draft.drop.refs = [{ kind: 'QUERY_SPAN', queryId: 'other-query', revision: query.revision, start: airport.start, end: airport.end }]; },
    draft => { draft.drop.refs = [{ kind: 'QUERY_SPAN', queryId: query.id, revision: query.revision, start: airport.end, end: airport.start }]; },
  ]) {
    await assert.rejects(createLunaInterpreter({ transport: transport({ output_parsed: raw({ modify }) }) }).interpret(input()),
      error => error instanceof ComplexProviderError && error.code === 'LUNA_SCHEMA_ERROR');
  }
});

test('Luna adapter preserves the transport safety envelope for a successful offline interpretation', async () => {
  const calls = [];
  const adapter = createLunaInterpreter({ transport: { async parse(request, options) {
    calls.push({ request, options });
    return { model: LUNA_MODEL, output_parsed: raw(), usage: { input_tokens: 0, output_tokens: 1 } };
  } } });
  const result = await adapter.interpret(input());
  assert.equal(calls.length, 1);
  assert.equal(calls[0].request.model, LUNA_MODEL);
  assert.deepEqual(calls[0].request.reasoning, { effort: 'low' });
  assert.equal(calls[0].request.max_output_tokens, 4_096);
  assert.equal(calls[0].request.text.format.strict, true);
  assert.equal(calls[0].request.text.format.name, 'ride-search-luna-v1');
  assert.match(calls[0].request.instructions, /source query is authoritative/i);
  assert.match(calls[0].request.instructions, /Do not invent missing fields/i);
  assert.equal(calls[0].options.signal instanceof AbortSignal, true);
  assert.deepEqual([result.metadata.inputTokens, result.metadata.outputTokens], [0, 1]);
});

test('Luna adapter aborts its injected transport when the bounded request times out', async () => {
  let aborts = 0;
  const adapter = createLunaInterpreter({ timeoutMs: 1, transport: { parse(_request, { signal }) {
    return new Promise(resolve => signal.addEventListener('abort', () => {
      aborts += 1;
      setTimeout(() => resolve({ model: LUNA_MODEL, output_parsed: raw() }), 0);
    }, { once: true }));
  } } });
  await assert.rejects(adapter.interpret(input()), error => error instanceof ComplexProviderError && error.code === 'LUNA_TIMEOUT');
  assert.equal(aborts, 1);
});
