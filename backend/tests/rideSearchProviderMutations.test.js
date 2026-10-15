import assert from 'node:assert/strict'
import test from 'node:test'
import {
  APIConnectionError, APIError, APITimeoutError, APIUserAbortError, TypeSafeClient, TypeSafeError, VERSION,
} from '@typesafe-ai/sdk'
import { SearchProviderError, createJevSearchProvider } from '../services/search/provider.ts'
import { createTestClock } from './helpers/testClock.js'

const requestFixture = () => ({
  state: 'A ride from campus to station',
  questions: {
    mode: { kind: 'choice', instructions: 'Select the intent.', choices: { RIDE: 'A ride.', OTHER: 'Another intent.' } },
    mentioned: { kind: 'noul', instructions: 'Is an origin mentioned?' },
  },
})

const responseFixture = () => ({
  model: 'jev-returned-model',
  answers: {
    mode: { type: 'choice', choice: 'RIDE', confidence: 0.9, probabilities: { RIDE: 0.9, OTHER: 0.1 } },
    mentioned: { type: 'noul', noul: 0.75 },
  },
  usage: { input_tokens: 12, output_tokens: 4 },
})

const answerResponse = (field, answer) => {
  const response = responseFixture()
  response.answers[field] = answer
  return response
}

const safeError = (code) => (error) => {
  assert.ok(error instanceof SearchProviderError)
  assert.equal(error.name, 'SearchProviderError')
  assert.equal(error.code, code)
  assert.equal(error.message, code === 'JEV_TIMEOUT'
    ? 'The decision provider timed out.' : 'The decision provider could not complete the request.')
  assert.deepEqual(Object.keys(error).sort(), ['code', 'name'])
  assert.equal(Object.hasOwn(error, 'cause'), false)
  return true
}

async function rejectResponse(response, label, request = requestFixture()) {
  let calls = 0
  const provider = createJevSearchProvider({ client: { systemOne: async () => { calls += 1; return response } } })
  await assert.rejects(provider.decide(request), safeError('JEV_INVALID_RESPONSE'), label)
  assert.equal(calls, 1)
}

async function rejectRequest(request, label) {
  let calls = 0
  const provider = createJevSearchProvider({ client: { systemOne: async () => { calls += 1; return responseFixture() } } })
  await assert.rejects(provider.decide(request), safeError('JEV_SCHEMA_ERROR'), label)
  assert.equal(calls, 0, label)
}

test('provider accepts inclusive state, batch, and enum limits together', async () => {
  const choices = Object.fromEntries(Array.from({ length: 255 }, (_, i) => [`C${i}`, `Candidate ${i}`]))
  const questions = Object.fromEntries(Array.from({ length: 47 }, (_, i) => [
    `flag${i}`, { kind: 'noul', instructions: `Inspect flag ${i}.` },
  ]))
  questions.mode = { kind: 'choice', instructions: 'Select a candidate.', choices }
  const answers = Object.fromEntries(Array.from({ length: 47 }, (_, i) => [`flag${i}`, { type: 'noul', noul: i / 47 }]))
  answers.mode = { type: 'choice', choice: 'C0', confidence: 1,
    probabilities: Object.fromEntries(Object.keys(choices).map(key => [key, key === 'C0' ? 1 : 0])) }
  const calls = []
  const provider = createJevSearchProvider({ client: { systemOne: async (...args) => {
    calls.push(args)
    return { model: 'jev-boundaries', answers, usage: { input_tokens: 0, output_tokens: 0 } }
  } } })
  const batch = await provider.decide({ state: 'x'.repeat(12_000), questions })
  assert.equal(calls.length, 1)
  assert.equal(calls[0][0].state.length, 12_000)
  assert.equal(Object.keys(calls[0][0].questions).length, 48)
  assert.deepEqual(calls[0][0].questions.mode.criteria, choices)
  assert.equal(Object.keys(batch.choices.mode.probabilities).length, 255)
  assert.deepEqual(batch.choices.mode, {
    choice: 'C0', confidence: 1, probabilities: answers.mode.probabilities,
  })
  assert.equal(batch.metadata.questionCount, 48)
  assert.deepEqual(batch.metadata.usage, { inputTokens: 0, outputTokens: 0 })
  assert.deepEqual(batch.diagnostics, Object.fromEntries(Object.entries(answers)
    .filter(([key]) => key !== 'mode').map(([key, answer]) => [key, answer.noul])))
})

test('provider rejects mixed empty keys, empty instructions, unsupported kinds, and malformed criteria before dispatch', async () => {
  const valid = requestFixture().questions.mode
  const cases = [
    ['mixed empty question key', { valid, '': { kind: 'noul', instructions: 'Check.' } }],
    ['empty instructions', { bad: { kind: 'noul', instructions: '' } }],
    ['unsupported kind with valid choices', { bad: { ...valid, kind: 'score' } }],
    ['empty choices', { bad: { ...valid, choices: {} } }],
    ['mixed empty choice key', { bad: { ...valid, choices: { RIDE: 'Ride.', '': 'Invalid.' } } }],
    ['mixed nontext description', { bad: { ...valid, choices: { RIDE: 'Ride.', OTHER: 1 } } }],
    ['string instead of criteria map', { bad: { ...valid, choices: 'a' } }],
    ['array instead of criteria map', { bad: { ...valid, choices: ['Ride.'] } }],
  ]
  for (const [label, questions] of cases) await rejectRequest({ state: 'ride', questions }, label)
})

test('provider rejects arrays even when their index keys match requested questions', async () => {
  const request = { state: 'ride', questions: { 0: { kind: 'noul', instructions: 'Check.' } } }
  await rejectResponse({ model: 'jev-test', answers: [{ type: 'noul', noul: 0.75 }] }, 'array of answers', request)
  const choiceRequest = { state: 'ride', questions: {
    mode: { kind: 'choice', instructions: 'Choose.', choices: { 0: 'First.', 1: 'Second.' } },
  } }
  await rejectResponse({ model: 'jev-test', answers: {
    mode: { type: 'choice', choice: '0', confidence: 0.9, probabilities: [0.9, 0.1] },
  } }, 'array of probabilities', choiceRequest)
})

test('provider preserves zero, one, and raw uncalibrated noul probabilities', async () => {
  for (const value of [0, 1, 0.499999, 0.5, 0.500001]) {
    const response = responseFixture()
    response.answers.mode.confidence = value
    response.answers.mode.probabilities = { RIDE: value, OTHER: 1 - value }
    response.answers.mentioned.noul = value
    const provider = createJevSearchProvider({ client: { systemOne: async () => response } })
    const batch = await provider.decide(requestFixture())
    assert.equal(batch.choices.mode.confidence, value)
    assert.deepEqual(batch.choices.mode.probabilities, response.answers.mode.probabilities)
    assert.equal(batch.diagnostics.mentioned, value)
    assert.equal(typeof batch.diagnostics.mentioned, 'number')
  }
})

test('provider rejects invalid confidence and noul without relying on distribution sum', async () => {
  for (const value of [-0.01, 1.01, Number.NaN, Infinity, -Infinity, null, '0.9', true]) {
    await rejectResponse(answerResponse('mode', { ...responseFixture().answers.mode, confidence: value }), `confidence ${value}`)
    await rejectResponse(answerResponse('mentioned', { type: 'noul', noul: value }), `noul ${value}`)
  }
  for (const type of ['choice', 'score', undefined]) {
    await rejectResponse(answerResponse('mentioned', { type, noul: 0.75 }), `noul type ${type}`)
  }
})

test('provider requires complete exact enum probabilities and rejects invalid mass hidden beside a certain answer', async () => {
  const maps = [
    ['missing unchosen label', { RIDE: 1 }],
    ['extra label', { RIDE: 1, OTHER: 0, EXTRA: 0 }],
    ['renamed label with same count', { RIDE: 1, EXTRA: 0 }],
    ['below zero with total one', { RIDE: 1.01, OTHER: -0.01 }],
    ...[null, 'invalid', true, Number.NaN, Infinity].map(value => [`invalid zero-mass label ${value}`, { RIDE: 1, OTHER: value }]),
  ]
  for (const [label, probabilities] of maps) {
    await rejectResponse(answerResponse('mode', { ...responseFixture().answers.mode, probabilities }), label)
  }
})

test('provider accepts rounded distributions within tolerance and rejects excess in either direction', async () => {
  for (const delta of [-0.000000999, 0.000000999]) {
    const response = answerResponse('mode', { ...responseFixture().answers.mode, probabilities: { RIDE: 0.9, OTHER: 0.1 + delta } })
    const batch = await createJevSearchProvider({ client: { systemOne: async () => response } }).decide(requestFixture())
    assert.deepEqual(batch.choices.mode.probabilities, response.answers.mode.probabilities)
  }
  for (const delta of [-0.000001001, 0.000001001]) {
    await rejectResponse(answerResponse('mode', { ...responseFixture().answers.mode,
      probabilities: { RIDE: 0.9, OTHER: 0.1 + delta } }), `sum deviation ${delta}`)
  }
})

test('provider requires string choices even when a numeric value names an offered enum key', async () => {
  const request = { state: 'ride', questions: {
    mode: { kind: 'choice', instructions: 'Select a year.', choices: { 1: 'First.', 2: 'Second.' } },
  } }
  await rejectResponse({ model: 'jev-test', answers: {
    mode: { type: 'choice', choice: 1, confidence: 1, probabilities: { 1: 1, 2: 0 } },
  } }, 'numeric enum value', request)
})

test('provider requires a nonempty returned model and exact requested answer keys', async () => {
  for (const model of [undefined, null, 42, { length: 1 }, '', []]) {
    await rejectResponse({ ...responseFixture(), model }, `returned model ${JSON.stringify(model)}`)
  }
  const answers = responseFixture().answers
  await rejectResponse({ ...responseFixture(), answers: { mode: answers.mode, renamed: answers.mentioned } }, 'renamed question with same count')
  await rejectResponse({ ...responseFixture(), answers: { mentioned: answers.mentioned } }, 'missing choice question')
})

test('provider rejects invalid output token usage independently of valid input usage', async () => {
  for (const output_tokens of [null, '4', true, 0.1, -1, Number.NaN, Infinity]) {
    await rejectResponse({ ...responseFixture(), usage: { input_tokens: 12, output_tokens } }, `output tokens ${output_tokens}`)
  }
  const provider = createJevSearchProvider({ client: { systemOne: async () => ({
    ...responseFixture(), usage: { input_tokens: 0, output_tokens: 0, extra: 'not metadata' },
  }) } })
  assert.deepEqual((await provider.decide(requestFixture())).metadata.usage, { inputTokens: 0, outputTokens: 0 })
})

test('provider validates model types and positive finite timeout before any SDK call', () => {
  const client = { systemOne: () => assert.fail('invalid options must not dispatch') }
  for (const model of ['', null, 1, { length: 1 }]) {
    assert.throws(() => createJevSearchProvider({ client, model }), safeError('JEV_SCHEMA_ERROR'))
  }
  for (const timeoutMs of [0, -1, null, '100', Number.NaN, Infinity, -Infinity]) {
    assert.throws(() => createJevSearchProvider({ client, timeoutMs }), safeError('JEV_SCHEMA_ERROR'))
  }
})

test('provider uses search defaults and reports only authoritative safe metadata', async () => {
  const calls = []
  const clock = createTestClock('2026-10-02T12:00:00+05:30')
  const provider = createJevSearchProvider({ clock, client: { systemOne: async (...args) => {
    calls.push(args)
    clock.advance(-37)
    return { ...responseFixture(), latencyMs: 9999, provider: 'injected', requestCount: 99, privateData: 'fake-secret' }
  } } })
  const batch = await provider.decide(requestFixture())
  assert.equal(calls.length, 1)
  assert.equal(calls[0][0].model, 'jev-latest')
  assert.deepEqual(calls[0][1], { timeout: 10_000, retry: { maxRetries: 0 } })
  assert.deepEqual(batch.metadata, {
    provider: 'typesafe-ai', model: 'jev-returned-model', requestCount: 1, latencyMs: 0, questionCount: 2,
    usage: { inputTokens: 12, outputTokens: 4 }, sdkVersion: VERSION,
  })
})

test('provider sanitizes actual SDK error classes, synchronous throws, and non-error rejections', async () => {
  const secret = 'Bearer fake-private-value'
  const cases = [
    [new APITimeoutError(321, { cause: new Error(secret) }), 'JEV_TIMEOUT'],
    [APIError.fromResponse(429, { error: secret }, new Headers({ 'x-typesafe-request-id': secret })), 'JEV_PROVIDER_ERROR'],
    [new APIConnectionError(secret), 'JEV_PROVIDER_ERROR'],
    [new APIUserAbortError(secret), 'JEV_PROVIDER_ERROR'],
    [new TypeSafeError(secret), 'JEV_PROVIDER_ERROR'],
    [new Error('timed out: ' + secret), 'JEV_PROVIDER_ERROR'],
    [secret, 'JEV_PROVIDER_ERROR'],
    [null, 'JEV_PROVIDER_ERROR'],
  ]
  for (const [failure, code] of cases) {
    let calls = 0
    const provider = createJevSearchProvider({ client: { systemOne: () => { calls += 1; throw failure } } })
    await assert.rejects(provider.decide(requestFixture()), safeError(code))
    assert.equal(calls, 1)
  }
})

test('provider preserves its classified contract error rather than converting it to an outage', async () => {
  const failure = new SearchProviderError('JEV_INVALID_RESPONSE')
  const provider = createJevSearchProvider({ client: { systemOne: async () => { throw failure } } })
  await assert.rejects(provider.decide(requestFixture()), error => {
    assert.equal(error, failure)
    return safeError('JEV_INVALID_RESPONSE')(error)
  })
})

test('actual SDK fetch injection verifies response shape and disables retries despite client defaults', async () => {
  const calls = []
  const client = new TypeSafeClient({ apiKey: 'test-only-key', logLevel: 'off', retry: { maxRetries: 2 }, fetch: async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) })
    return Response.json(responseFixture())
  } })
  const batch = await createJevSearchProvider({ client, model: 'search-only-alias' }).decide(requestFixture())
  assert.equal(calls.length, 1)
  assert.equal(new URL(calls[0].url).pathname, '/v1/systemone')
  assert.equal(calls[0].body.model, 'search-only-alias')
  assert.deepEqual(batch.choices.mode, { choice: 'RIDE', confidence: 0.9, probabilities: { RIDE: 0.9, OTHER: 0.1 } })
  assert.equal(batch.metadata.model, 'jev-returned-model')
  let attempts = 0
  const unavailable = new TypeSafeClient({ apiKey: 'test-only-key', logLevel: 'off', retry: { maxRetries: 2 }, fetch: async () => {
    attempts += 1
    return Response.json({ error: 'fake-private-value' }, { status: 503 })
  } })
  await assert.rejects(createJevSearchProvider({ client: unavailable }).decide(requestFixture()), safeError('JEV_PROVIDER_ERROR'))
  assert.equal(attempts, 1)
})
