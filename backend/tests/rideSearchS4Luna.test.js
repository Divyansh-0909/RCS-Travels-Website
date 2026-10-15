import assert from 'node:assert/strict'
import test from 'node:test'
import { emptyDraft } from '../services/search/contracts.ts'
import { ComplexProviderError, LUNA_MODEL, LUNA_SCHEMA_VERSION } from '../services/search/complex/contracts.ts'
import { createLunaInterpreter, createProductionLunaInterpreter } from '../services/search/complex/luna.ts'

const query = { id: 'q-7', revision: 4, text: 'ride from campus to airport tomorrow' }
const candidate = { candidateId: 'campus', queryId: query.id, queryRevision: query.revision, exactText: 'campus',
  start: 10, end: 16, method: 'DIRECTIONAL_CLAUSE', generatorVersion: 'test' }
const input = () => ({ query, candidates: [candidate], partialDraft: null, fallbackReasons: ['COMPLEX_REQUEST'],
  now: '2026-10-03T10:00:00.000Z', timeZone: 'Asia/Kolkata', trustedFields: [{ field: 'pickup', value: { selection: 'home' } }] })

function output(overrides = {}) {
  const { candidates, ...draft } = emptyDraft(query)
  return { draft: { ...draft, queryType: 'BOOKING_REQUEST', complexity: 'COMPLEX',
    pickup: { state: 'RESOLVED', value: { kind: 'QUERY_CANDIDATE', candidateId: 'campus' },
      refs: [{ kind: 'QUERY_SPAN', queryId: query.id, revision: query.revision, start: 10, end: 16 }] }, ...overrides.draft },
  locations: overrides.locations ?? [] }
}

function fake(response) {
  const calls = []
  return { calls, parse: async (...args) => {
    calls.push(args)
    const result = typeof response === 'function' ? await response(...args) : response
    return { model: LUNA_MODEL, ...result }
  } }
}

function assertStrictObjects(schema) {
  if (!schema || typeof schema !== 'object') return
  if (schema.properties) assert.equal(schema.additionalProperties, false)
  for (const value of Object.values(schema)) {
    if (Array.isArray(value)) value.forEach(assertStrictObjects)
    else assertStrictObjects(value)
  }
}

test('Luna sends the exact model, low reasoning, strict Zod JSON schema and bounded advisory context', async () => {
  const transport = fake({ output_parsed: output(), usage: { input_tokens: 11, output_tokens: 7 } })
  let now = 100
  const controller = new AbortController()
  const result = await createLunaInterpreter({ transport, clock: { now: () => now += 23 } }).interpret(input(), controller.signal)
  const [request, options] = transport.calls[0]
  assert.equal(request.model, LUNA_MODEL)
  assert.equal(request.max_output_tokens, 4096)
  assert.deepEqual(request.reasoning, { effort: 'low' })
  assert.equal(request.text.format.type, 'json_schema')
  assert.equal(request.text.format.name, LUNA_SCHEMA_VERSION)
  assert.equal(request.text.format.strict, true)
  assert.equal(request.text.format.schema.additionalProperties, false)
  assert.match(JSON.stringify(request.text.format.schema), /"anyOf"/)
  assertStrictObjects(request.text.format.schema)
  assert.deepEqual(JSON.parse(request.input).trustedFields, input().trustedFields)
  assert.equal(options.signal instanceof AbortSignal, true)
  assert.deepEqual(result.metadata, { provider: 'openai', model: LUNA_MODEL, schemaVersion: LUNA_SCHEMA_VERSION,
    requestCount: 1, latencyMs: 23, inputTokens: 11, outputTokens: 7 })
})

test('Luna rejects absent, refused, malformed and semantically unsafe structured output', async () => {
  const invalid = [
    {},
    { output_parsed: null },
    { output_parsed: { ...output(), extra: true } },
    { output: [{ content: [{ type: 'refusal' }] }], output_parsed: null },
    { output_parsed: output({ locations: [{ key: 'invented', start: 0, end: 4, exactText: 'nope' }] }) },
    { output_parsed: output({ draft: { pickup: { state: 'RESOLVED', value: { kind: 'USER_SELECTION', selectionId: 'forged' }, refs: [{ kind: 'USER_FIELD', field: 'pickup', revision: 4 }] } } }) },
  ]
  for (const response of invalid) {
    const interpreter = createLunaInterpreter({ transport: fake(response) })
    await assert.rejects(interpreter.interpret(input()), (error) => error instanceof ComplexProviderError
      && (error.code === 'LUNA_REFUSAL' || error.code === 'LUNA_SCHEMA_ERROR'))
  }
})

test('Luna only accepts existing candidate identities and exact UTF-16 location spans', async () => {
  for (const draft of [
    { pickup: { state: 'RESOLVED', value: { kind: 'QUERY_CANDIDATE', candidateId: 'invented' }, refs: [{ kind: 'QUERY_SPAN', queryId: query.id, revision: 4, start: 10, end: 16 }] } },
    { pickup: { state: 'RESOLVED', value: { kind: 'QUERY_CANDIDATE', candidateId: 'campus' }, refs: [{ kind: 'QUERY_SPAN', queryId: query.id, revision: 4, start: 10, end: 99 }] } },
  ]) {
    await assert.rejects(createLunaInterpreter({ transport: fake({ output_parsed: output({ draft }) }) }).interpret(input()),
      (error) => error instanceof ComplexProviderError && error.code === 'LUNA_SCHEMA_ERROR')
  }
})

test('Luna accepts declared exact new span keys for later deterministic normalization', async () => {
  const airport = { start: 20, end: 27, exactText: 'airport' }
  const raw = output({ locations: [{ key: 'new-airport', ...airport }], draft: {
    pickup: { state: 'RESOLVED', value: { kind: 'QUERY_CANDIDATE', candidateId: 'new-airport' },
      refs: [{ kind: 'QUERY_SPAN', queryId: query.id, revision: query.revision, start: airport.start, end: airport.end }] },
  } })
  const result = await createLunaInterpreter({ transport: fake({ output_parsed: raw }) }).interpret(input())
  assert.equal(result.output.draft.pickup.value.candidateId, 'new-airport')
})

test('Luna validates ambiguous candidate fields and rejects UTF-16 surrogate splits', async () => {
  const ambiguous = output({ draft: { pickup: { state: 'AMBIGUOUS', alternatives: [{ kind: 'QUERY_CANDIDATE', candidateId: 'campus' }],
    reasonCode: 'AMBIGUOUS_PICKUP', refs: [{ kind: 'QUERY_SPAN', queryId: query.id, revision: query.revision, start: 10, end: 16 }] } } })
  assert.equal((await createLunaInterpreter({ transport: fake({ output_parsed: ambiguous }) }).interpret(input())).output.draft.pickup.state, 'AMBIGUOUS')
  const emojiQuery = { id: 'emoji', revision: 1, text: 'ride 🚕' }
  const { candidates, ...emojiDraft } = emptyDraft(emojiQuery)
  const emojiInput = { ...input(), query: emojiQuery, candidates: [], trustedFields: [] }
  const split = { draft: { ...emojiDraft, queryType: 'BOOKING_REQUEST', complexity: 'COMPLEX' },
    locations: [{ key: 'split', start: 6, end: 7, exactText: emojiQuery.text.slice(6, 7) }] }
  await assert.rejects(createLunaInterpreter({ transport: fake({ output_parsed: split }) }).interpret(emojiInput),
    (error) => error instanceof ComplexProviderError && error.code === 'LUNA_SCHEMA_ERROR')
})

test('Luna classifies transport timeout, cancellation, authentication and provider errors without provider details', async () => {
  const timeout = createLunaInterpreter({ transport: fake(() => new Promise(() => {})), timeoutMs: 2 })
  await assert.rejects(timeout.interpret(input()), (error) => error instanceof ComplexProviderError && error.code === 'LUNA_TIMEOUT')
  const controller = new AbortController(); controller.abort()
  const cancelledTransport = fake(() => new Promise(() => {}))
  await assert.rejects(createLunaInterpreter({ transport: cancelledTransport }).interpret(input(), controller.signal),
    (error) => error instanceof ComplexProviderError && error.code === 'LUNA_CANCELLED')
  assert.equal(cancelledTransport.calls.length, 0)
  const auth = new Error('secret'); auth.name = 'AuthenticationError'
  await assert.rejects(createLunaInterpreter({ transport: fake(() => { throw auth }) }).interpret(input()),
    (error) => error instanceof ComplexProviderError && error.code === 'LUNA_AUTH_ERROR' && error.message === 'LUNA_AUTH_ERROR')
  await assert.rejects(createLunaInterpreter({ transport: fake(() => { throw new Error('secret') }) }).interpret(input()),
    (error) => error instanceof ComplexProviderError && error.code === 'LUNA_PROVIDER_ERROR' && error.message === 'LUNA_PROVIDER_ERROR')
  const namedTimeout = new Error('secret'); namedTimeout.name = 'TimeoutError'
  await assert.rejects(createLunaInterpreter({ transport: fake(() => { throw namedTimeout }) }).interpret(input()),
    (error) => error instanceof ComplexProviderError && error.code === 'LUNA_TIMEOUT')
  await assert.rejects(createLunaInterpreter({ transport: fake(() => { throw 'secret' }) }).interpret(input()),
    (error) => error instanceof ComplexProviderError && error.code === 'LUNA_PROVIDER_ERROR')
  const active = new AbortController()
  const pending = createLunaInterpreter({ transport: fake(() => new Promise(() => {})) }).interpret(input(), active.signal)
  active.abort()
  await assert.rejects(pending, (error) => error instanceof ComplexProviderError && error.code === 'LUNA_CANCELLED')
})

test('Luna validates response model, resource bounds, usage metadata and production credential configuration before a request', async () => {
  const malformedTransport = fake({ output_parsed: output() })
  await assert.rejects(createLunaInterpreter({ transport: malformedTransport }).interpret({}),
    (error) => error instanceof ComplexProviderError && error.code === 'LUNA_SCHEMA_ERROR')
  assert.equal(malformedTransport.calls.length, 0)
  await assert.rejects(createLunaInterpreter({ transport: fake({ model: 'gpt-6-luna-2026-10-01', output_parsed: output() }) }).interpret(input()),
    (error) => error instanceof ComplexProviderError && error.code === 'LUNA_SCHEMA_ERROR')
  const telemetry = await createLunaInterpreter({ transport: fake({ output_parsed: output() }) }).interpret(input())
  assert.deepEqual([telemetry.metadata.inputTokens, telemetry.metadata.outputTokens], [null, null])
  const withPartial = input(); withPartial.partialDraft = emptyDraft(query)
  await createLunaInterpreter({ transport: fake({ output_parsed: output() }) }).interpret(withPartial)
  const transport = fake({ output_parsed: output(), usage: { input_tokens: -1 } })
  await assert.rejects(createLunaInterpreter({ transport }).interpret(input()), (error) => error instanceof ComplexProviderError && error.code === 'LUNA_SCHEMA_ERROR')
  const oversized = input(); oversized.fallbackReasons = ['x'.repeat(12_001)]
  await assert.rejects(createLunaInterpreter({ transport: fake({ output_parsed: output() }) }).interpret(oversized),
    (error) => error instanceof ComplexProviderError && error.code === 'LUNA_SCHEMA_ERROR')
  const invalidCandidate = input(); invalidCandidate.candidates = [{ ...candidate, exactText: 'forged' }]
  const invalidTransport = fake({ output_parsed: output() })
  await assert.rejects(createLunaInterpreter({ transport: invalidTransport }).interpret(invalidCandidate),
    (error) => error instanceof ComplexProviderError && error.code === 'LUNA_SCHEMA_ERROR')
  assert.equal(invalidTransport.calls.length, 0)
  assert.throws(() => createLunaInterpreter({ transport: fake({ output_parsed: output() }), timeoutMs: 15_001 }),
    (error) => error instanceof ComplexProviderError && error.code === 'LUNA_CONFIG_ERROR')
  await assert.rejects(createLunaInterpreter().interpret(input()),
    (error) => error instanceof ComplexProviderError && error.code === 'LUNA_CONFIG_ERROR')
  const prior = process.env.OPENAI_API_KEY
  delete process.env.OPENAI_API_KEY
  try {
    await assert.rejects(createProductionLunaInterpreter().interpret(input()), (error) => error instanceof ComplexProviderError && error.code === 'LUNA_CONFIG_ERROR')
    process.env.OPENAI_API_KEY = 'test-key'
    assert.equal(typeof createProductionLunaInterpreter().interpret, 'function')
  } finally {
    if (prior === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = prior
  }
})
