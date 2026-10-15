import assert from 'node:assert/strict'
import { getEventListeners } from 'node:events'
import test from 'node:test'
import { emptyDraft } from '../services/search/contracts.ts'
import { ComplexProviderError, LUNA_MODEL } from '../services/search/complex/contracts.ts'
import { createLunaInterpreter, createProductionLunaInterpreter } from '../services/search/complex/luna.ts'

const query = { id: 'final-query', revision: 8, text: 'campus to airport at 9' }
const campus = { candidateId: 'campus', queryId: query.id, queryRevision: query.revision, exactText: 'campus',
  start: 0, end: 6, method: 'DIRECTIONAL_CLAUSE', generatorVersion: 'final-test' }
const airport = { candidateId: 'airport', queryId: query.id, queryRevision: query.revision, exactText: 'airport',
  start: 10, end: 17, method: 'DIRECTIONAL_CLAUSE', generatorVersion: 'final-test' }

function input() {
  return { query, candidates: [campus, airport], partialDraft: null, fallbackReasons: ['COMPLEX_REQUEST'],
    now: '2026-10-03T10:00:00.000Z', timeZone: 'Asia/Kolkata', trustedFields: [] }
}

function span(start, end) {
  return { kind: 'QUERY_SPAN', queryId: query.id, revision: query.revision, start, end }
}

function output(change = () => {}) {
  const { candidates, ...draft } = emptyDraft(query)
  const result = { draft: { ...draft, queryType: 'BOOKING_REQUEST', complexity: 'COMPLEX',
    pickup: { state: 'RESOLVED', value: { kind: 'QUERY_CANDIDATE', candidateId: campus.candidateId }, refs: [span(0, 6)] },
    drop: { state: 'RESOLVED', value: { kind: 'QUERY_CANDIDATE', candidateId: airport.candidateId }, refs: [span(10, 17)] } }, locations: [] }
  change(result)
  return result
}

function transport(response) {
  return { parse: async () => ({ model: LUNA_MODEL, ...response }) }
}

function responseBody(parsed, content = [{ type: 'output_text', text: JSON.stringify(parsed), annotations: [] }]) {
  return { id: 'resp-final', object: 'response', created_at: 0, status: 'completed', model: LUNA_MODEL, output_text: '',
    error: null, incomplete_details: null, instructions: null, metadata: {}, parallel_tool_calls: true, temperature: 1,
    tool_choice: 'auto', tools: [], top_p: 1, truncation: 'disabled', usage: { input_tokens: 3, output_tokens: 2, total_tokens: 5 },
    output: [{ id: 'msg-final', type: 'message', status: 'completed', role: 'assistant', content }] }
}

function isCode(code) {
  return error => error instanceof ComplexProviderError && error.code === code
}

test('Luna fails closed for ambiguous unknown candidates, foreign query identities, and empty evidence spans', async () => {
  const unsafe = [
    output(result => { result.draft.pickup = { state: 'AMBIGUOUS', alternatives: [
      { kind: 'QUERY_CANDIDATE', candidateId: campus.candidateId }, { kind: 'QUERY_CANDIDATE', candidateId: 'unknown' },
    ], reasonCode: 'two places', refs: [span(0, 6)] } }),
    output(result => { result.draft.query = { ...query, revision: query.revision + 1 } }),
    output(result => { result.draft.drop.refs = [{ ...span(10, 17), queryId: 'other-query' }] }),
    output(result => { result.draft.drop.refs = [{ ...span(10, 17), revision: query.revision + 1 }] }),
    output(result => { result.draft.pickup.refs = [span(0, 0)] }),
  ]
  for (const parsed of unsafe) {
    await assert.rejects(createLunaInterpreter({ transport: transport({ output_parsed: parsed }) }).interpret(input()), isCode('LUNA_SCHEMA_ERROR'))
  }
})

test('Luna location declarations reject duplicates and impossible ends independently of geography', async () => {
  for (const locations of [
    [{ key: 'unused', start: 0, end: 6, exactText: 'campus' }, { key: 'unused', start: 10, end: 17, exactText: 'airport' }],
    [{ key: 'unused', start: 0, end: 200, exactText: query.text }],
  ]) {
    const parsed = output(result => { result.locations = locations })
    await assert.rejects(createLunaInterpreter({ transport: transport({ output_parsed: parsed }) }).interpret(input()), isCode('LUNA_SCHEMA_ERROR'))
  }
  const invalidPartial = input()
  invalidPartial.partialDraft = emptyDraft(query)
  invalidPartial.partialDraft.vehicleClass = { state: 'RESOLVED', value: 'suv', strength: 'REQUIRED', excluded: [], refs: [{ ...span(0, 6), queryId: 'foreign' }] }
  let called = false
  const interpreter = createLunaInterpreter({ transport: { parse: async () => { called = true; return { model: LUNA_MODEL, output_parsed: output() } } } })
  await assert.rejects(interpreter.interpret(invalidPartial), isCode('LUNA_SCHEMA_ERROR'))
  assert.equal(called, false)
  invalidPartial.partialDraft = emptyDraft({ ...query, revision: query.revision + 1 })
  await assert.rejects(interpreter.interpret(invalidPartial), isCode('LUNA_SCHEMA_ERROR'))
  assert.equal(called, false)
})

test('UTF-16 provenance does not mistake an unpaired code unit for a split surrogate pair', async () => {
  const standalone = input()
  standalone.query = { ...query, text: '\uDC00 campus' }
  standalone.candidates = []
  const { candidates, ...draft } = emptyDraft(standalone.query)
  draft.queryType = 'LOCATION_SEARCH'; draft.complexity = 'NOT_APPLICABLE'
  draft.locationSearch = { state: 'RESOLVED', value: { kind: 'QUERY_CANDIDATE', candidateId: 'source' },
    refs: [{ kind: 'QUERY_SPAN', queryId: query.id, revision: query.revision, start: 0, end: standalone.query.text.length }] }
  const parsed = { draft, locations: [{ key: 'source', start: 0, end: standalone.query.text.length, exactText: standalone.query.text }] }
  assert.deepEqual((await createLunaInterpreter({ transport: transport({ output_parsed: parsed }) }).interpret(standalone)).output, parsed)
  standalone.query = { ...query, text: 'x\uDC00 campus' }
  parsed.draft.query = standalone.query
  parsed.draft.locationSearch.refs[0].start = 1
  parsed.draft.locationSearch.refs[0].end = standalone.query.text.length
  parsed.locations = [{ key: 'source', start: 1, end: standalone.query.text.length, exactText: standalone.query.text.slice(1) }]
  assert.deepEqual((await createLunaInterpreter({ transport: transport({ output_parsed: parsed }) }).interpret(standalone)).output, parsed)
})

test('Luna redacts non-Error thrown failures without changing their provider-error category', async () => {
  for (const thrown of [null, undefined, 'private-provider-message']) {
    const interpreter = createLunaInterpreter({ transport: { parse: async () => { throw thrown } } })
    await assert.rejects(interpreter.interpret(input()), isCode('LUNA_PROVIDER_ERROR'))
  }
})

test('Luna accepts valid zero-offset evidence and nested date/time and unsupported candidate arrays', async () => {
  const parsed = output(result => {
    result.draft.timing = { mode: 'SCHEDULED', refs: [span(18, 22)],
      date: { state: 'RESOLVED', value: { kind: 'RELATIVE', anchor: 'TODAY' }, refs: [span(0, 6)] },
      time: { state: 'RESOLVED', value: { kind: 'CLOCK', hour: 9, minute: { state: 'UNSPECIFIED' }, notation: 'H12',
        period: { state: 'UNSPECIFIED' }, precision: 'EXACT' }, refs: [span(21, 22)] } }
    result.draft.unsupportedRequests = [{ kind: 'STOP', refs: [span(0, 6)], candidateIds: ['campus', 'airport'], reasonCode: 'multi-stop' }]
  })
  const result = await createLunaInterpreter({ transport: transport({ output_parsed: parsed }) }).interpret(input())
  assert.equal(result.output.draft.pickup.refs[0].start, 0)
  assert.deepEqual(result.output.draft.unsupportedRequests[0].candidateIds, ['campus', 'airport'])
  assert.equal(result.output.draft.timing.time.value.hour, 9)
})

test('Luna rejects unusable timeout configuration before any transport can run', () => {
  for (const timeoutMs of [Number.NaN, 0, -1]) {
    assert.throws(() => createLunaInterpreter({ timeoutMs, transport: transport({ output_parsed: output() }) }), isCode('LUNA_CONFIG_ERROR'))
  }
})

test('Luna removes the caller abort listener after both successful and cancelled work', async () => {
  const successful = new AbortController()
  await createLunaInterpreter({ transport: transport({ output_parsed: output() }) }).interpret(input(), successful.signal)
  assert.equal(getEventListeners(successful.signal, 'abort').length, 0)

  const cancelled = new AbortController()
  const pending = createLunaInterpreter({ transport: { parse: async (_request, { signal }) => new Promise(() => {
    signal.addEventListener('abort', () => {}, { once: true })
  }) } }).interpret(input(), cancelled.signal)
  assert.equal(getEventListeners(cancelled.signal, 'abort').length, 1)
  cancelled.abort()
  await assert.rejects(pending, isCode('LUNA_CANCELLED'))
  assert.equal(getEventListeners(cancelled.signal, 'abort').length, 0)
})

test('production Luna uses OpenAI SDK 7.10.0 response parsing without live credentials or network', async t => {
  const previousKey = process.env.OPENAI_API_KEY
  process.env.OPENAI_API_KEY = 'dummy-offline-key'
  t.after(() => { if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey })
  const requests = []
  t.mock.method(globalThis, 'fetch', async (request, init) => {
    requests.push({ request, init })
    return new Response(JSON.stringify(responseBody(output())), { status: 200, headers: { 'content-type': 'application/json' } })
  })
  const result = await createProductionLunaInterpreter().interpret(input())
  assert.equal(requests.length, 1)
  assert.equal(result.metadata.model, 'gpt-6-luna')
  assert.equal(result.output.draft.pickup.value.candidateId, 'campus')
})

test('production Luna treats a refusal beside valid parsed text as a refusal', async t => {
  const previousKey = process.env.OPENAI_API_KEY
  process.env.OPENAI_API_KEY = 'dummy-offline-key'
  t.after(() => { if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey })
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(responseBody(output(), [
    { type: 'refusal', refusal: 'cannot comply' }, { type: 'output_text', text: JSON.stringify(output()), annotations: [] },
  ])), { status: 200, headers: { 'content-type': 'application/json' } }))
  await assert.rejects(createProductionLunaInterpreter().interpret(input()), isCode('LUNA_REFUSAL'))
})

test('production Luna makes exactly one fetch for a 500 response because SDK retries are disabled', async t => {
  const previousKey = process.env.OPENAI_API_KEY
  process.env.OPENAI_API_KEY = 'dummy-offline-key'
  t.after(() => { if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey })
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () => {
    calls += 1
    return new Response(JSON.stringify({ error: { message: 'offline failure', type: 'server_error' } }), { status: 500,
      headers: { 'content-type': 'application/json' } })
  })
  await assert.rejects(createProductionLunaInterpreter().interpret(input()), isCode('LUNA_PROVIDER_ERROR'))
  assert.equal(calls, 1)
})

test('Luna handles reasoning output without content and catches any refusal in mixed messages', async () => {
  const parsed = output()
  const successful = createLunaInterpreter({ transport: transport({ output_parsed: parsed,
    output: [{ type: 'reasoning' }, { type: 'message', content: [{ type: 'output_text' }] }] }) })
  assert.deepEqual((await successful.interpret(input())).output, parsed)
  const refused = createLunaInterpreter({ transport: transport({ output_parsed: parsed,
    output: [{ type: 'message', content: [{ type: 'output_text' }] },
      { type: 'message', content: [{ type: 'output_text' }, { type: 'refusal' }] }] }) })
  await assert.rejects(refused.interpret(input()), isCode('LUNA_REFUSAL'))
})

test('Luna accepts the bounded context limit exactly and refuses excess before a provider request', async () => {
  const exact = input()
  const length = JSON.stringify(exact).length
  exact.fallbackReasons[0] += 'x'.repeat(12_000 - length)
  assert.equal(JSON.stringify(exact).length, 12_000)
  let calls = 0
  const interpreter = createLunaInterpreter({ transport: { parse: async () => {
    calls += 1; return { model: LUNA_MODEL, output_parsed: output() }
  } } })
  await interpreter.interpret(exact)
  exact.fallbackReasons[0] += 'x'
  await assert.rejects(interpreter.interpret(exact), isCode('LUNA_SCHEMA_ERROR'))
  const invalid = input(); invalid.trustedFields = [{ field: '', value: {} }]
  await assert.rejects(interpreter.interpret(invalid), isCode('LUNA_SCHEMA_ERROR'))
  assert.equal(calls, 1)
})
