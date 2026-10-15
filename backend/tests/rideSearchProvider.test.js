import assert from 'node:assert/strict'
import test from 'node:test'
import { APITimeoutError } from '@typesafe-ai/sdk'
import { SearchProviderError, createJevSearchProvider } from '../services/search/provider.ts'
import { createTestClock } from './helpers/testClock.js'

const request = {
  state: 'Ride from campus to station now',
  questions: {
    queryType: { kind: 'choice', instructions: 'Classify the request.', choices: { RIDE: 'A ride request.', OTHER: 'Not a ride request.' } },
    pickupMentioned: { kind: 'noul', instructions: 'Is a pickup mentioned?' },
  },
}

const response = (overrides = {}) => ({
  model: 'jev-test',
  answers: {
    queryType: { type: 'choice', choice: 'RIDE', confidence: 0.9, probabilities: { RIDE: 0.9, OTHER: 0.1 } },
    pickupMentioned: { type: 'noul', noul: 0.75 },
  },
  usage: { input_tokens: 12, output_tokens: 4 },
  ...overrides,
})


test('Jev provider translates bounded questions and response metadata using injected dependencies', async () => {
  const calls = []
  const clock = createTestClock('2026-10-02T12:00:00+05:30')
  const provider = createJevSearchProvider({
    client: { systemOne: async (...args) => { calls.push(args); clock.advance(37); return response() } },
    model: 'search-jev',
    timeoutMs: 321,
    clock,
  })

  const batch = await provider.decide(request)

  assert.deepEqual(batch, {
    choices: { queryType: { choice: 'RIDE', confidence: 0.9, probabilities: { RIDE: 0.9, OTHER: 0.1 } } },
    diagnostics: { pickupMentioned: 0.75 },
    metadata: {
      provider: 'typesafe-ai', model: 'jev-test', requestCount: 1, latencyMs: 37, questionCount: 2,
      usage: { inputTokens: 12, outputTokens: 4 }, sdkVersion: '0.6.0',
    },
  })
  assert.deepEqual(calls[0][0], {
    state: request.state,
    model: 'search-jev',
    questions: {
      queryType: { type: 'choice', instructions: 'Classify the request.', criteria: request.questions.queryType.choices },
      pickupMentioned: { type: 'noul', instructions: 'Is a pickup mentioned?', criteria: undefined },
    },
  })
  assert.deepEqual(calls[0][1], { timeout: 321, retry: { maxRetries: 0 } })
})

test('Jev provider classifies SDK timeouts and provider failures without exposing provider messages', async () => {
  const timeoutProvider = createJevSearchProvider({ client: { systemOne: async () => { throw new APITimeoutError(10) } } })
  await assert.rejects(timeoutProvider.decide(request), error => error instanceof SearchProviderError
    && error.code === 'JEV_TIMEOUT' && error.message === 'The decision provider timed out.')

  const failedProvider = createJevSearchProvider({ client: { systemOne: async () => { throw new Error('Bearer secret-value') } } })
  await assert.rejects(failedProvider.decide(request), error => error instanceof SearchProviderError
    && error.code === 'JEV_PROVIDER_ERROR' && error.message === 'The decision provider could not complete the request.')
})

test('Jev provider rejects malformed answers and exact-key mismatches', async () => {
  for (const malformed of [
    null,
    response({ answers: null }),
    response({ answers: { queryType: response().answers.queryType } }),
    response({ answers: { ...response().answers, extra: { type: 'noul', noul: 0.2 } } }),
  ]) {
    const provider = createJevSearchProvider({ client: { systemOne: async () => malformed } })
    await assert.rejects(provider.decide(request), error => error instanceof SearchProviderError && error.code === 'JEV_INVALID_RESPONSE')
  }
})

test('Jev provider rejects invalid enums and probabilities while preserving valid noul diagnostics', async () => {
  const invalidResponses = [
    response({ answers: { ...response().answers, queryType: { ...response().answers.queryType, choice: 'INVENTED' } } }),
    response({ answers: { ...response().answers, queryType: { ...response().answers.queryType, probabilities: { RIDE: 1, INVENTED: 0 } } } }),
    response({ answers: { ...response().answers, queryType: { ...response().answers.queryType, probabilities: { RIDE: 0.7, OTHER: 0.7 } } } }),
    response({ answers: { ...response().answers, queryType: { ...response().answers.queryType, probabilities: { RIDE: 1.1, OTHER: 0 } } } }),
    response({ answers: { ...response().answers, queryType: { ...response().answers.queryType, probabilities: { RIDE: Number.POSITIVE_INFINITY, OTHER: 0 } } } }),
    response({ answers: { ...response().answers, pickupMentioned: { type: 'noul', noul: Number.NaN } } }),
  ]
  for (const invalid of invalidResponses) {
    const provider = createJevSearchProvider({ client: { systemOne: async () => invalid } })
    await assert.rejects(provider.decide(request), error => error instanceof SearchProviderError && error.code === 'JEV_INVALID_RESPONSE')
  }
})

test('Jev provider rejects invalid request schemas before calling the client', async () => {
  let calls = 0
  const provider = createJevSearchProvider({ client: { systemOne: async () => { calls += 1; return response() } } })
  await assert.rejects(provider.decide({ state: 'ride', questions: {} }), error => error instanceof SearchProviderError && error.code === 'JEV_SCHEMA_ERROR')
  await assert.rejects(provider.decide({ state: 'ride', questions: { invalid: { kind: 'noul' } } }), error => error instanceof SearchProviderError && error.code === 'JEV_SCHEMA_ERROR')
  await assert.rejects(provider.decide({ state: 'ride', questions: { invalid: { kind: 'choice', instructions: 'Choose.', choices: { '': 'Invalid.' } } } }), error => error instanceof SearchProviderError && error.code === 'JEV_SCHEMA_ERROR')
  assert.equal(calls, 0)
})

test('Jev provider enforces state, question, choice, model, and timeout boundaries', async () => {
  const client = { systemOne: async () => response() }
  await assert.rejects(createJevSearchProvider({ client }).decide({ ...request, state: 'x'.repeat(12_001) }), error => error instanceof SearchProviderError && error.code === 'JEV_SCHEMA_ERROR')
  const tooManyQuestions = Object.fromEntries(Array.from({ length: 49 }, (_, index) => [`q${index}`, { kind: 'noul', instructions: 'Check.' }]))
  await assert.rejects(createJevSearchProvider({ client }).decide({ state: 'ride', questions: tooManyQuestions }), error => error instanceof SearchProviderError && error.code === 'JEV_SCHEMA_ERROR')
  const choices = Object.fromEntries(Array.from({ length: 256 }, (_, index) => [`C${index}`, 'Choice.']))
  await assert.rejects(createJevSearchProvider({ client }).decide({ state: 'ride', questions: { many: { kind: 'choice', instructions: 'Choose.', choices } } }), error => error instanceof SearchProviderError && error.code === 'JEV_SCHEMA_ERROR')
  assert.throws(() => createJevSearchProvider({ client, model: '' }), error => error instanceof SearchProviderError && error.code === 'JEV_SCHEMA_ERROR')
  assert.throws(() => createJevSearchProvider({ client, timeoutMs: Number.POSITIVE_INFINITY }), error => error instanceof SearchProviderError && error.code === 'JEV_SCHEMA_ERROR')
})

test('Jev provider rejects non-integer and negative SDK token counts', async () => {
  for (const usage of [{ input_tokens: 1.5, output_tokens: 2 }, { input_tokens: -1, output_tokens: 2 }, { input_tokens: Number.POSITIVE_INFINITY, output_tokens: 2 }]) {
    const provider = createJevSearchProvider({ client: { systemOne: async () => response({ usage }) } })
    await assert.rejects(provider.decide(request), error => error instanceof SearchProviderError && error.code === 'JEV_INVALID_RESPONSE')
  }
})

test('Jev provider omits unavailable usage metadata', async () => {
  const provider = createJevSearchProvider({ client: { systemOne: async () => response({ usage: null }) } })
  const batch = await provider.decide(request)
  assert.equal(Object.hasOwn(batch.metadata, 'usage'), false)
})

test('Jev provider rejects every malformed answer shape before interpreting it', async () => {
  const invalidAnswers = [
    { ...response().answers, queryType: null },
    { ...response().answers, queryType: { ...response().answers.queryType, type: 'noul' } },
    { ...response().answers, queryType: { ...response().answers.queryType, choice: '' } },
    { ...response().answers, queryType: { ...response().answers.queryType, confidence: null } },
    { ...response().answers, queryType: { ...response().answers.queryType, probabilities: null } },
    { ...response().answers, pickupMentioned: null },
  ]
  for (const answers of invalidAnswers) {
    const provider = createJevSearchProvider({ client: { systemOne: async () => response({ answers }) } })
    await assert.rejects(provider.decide(request), error => error instanceof SearchProviderError && error.code === 'JEV_INVALID_RESPONSE')
  }
})

test('Jev provider validates runtime request shapes and partial usage records', async () => {
  const client = { systemOne: async () => response() }
  const invalidRequests = [
    { state: 7, questions: request.questions },
    { state: 'ride', questions: [] },
    { state: 'ride', questions: { invalid: null } },
    { state: 'ride', questions: { invalid: { kind: 'wrong', instructions: 'Check.' } } },
    { state: 'ride', questions: { invalid: { kind: 'choice', instructions: 'Choose.', choices: null } } },
  ]
  for (const invalidRequest of invalidRequests) {
    await assert.rejects(createJevSearchProvider({ client }).decide(invalidRequest), error => error instanceof SearchProviderError && error.code === 'JEV_SCHEMA_ERROR')
  }
  const provider = createJevSearchProvider({ client: { systemOne: async () => response({ usage: { input_tokens: 2 } }) } })
  assert.deepEqual((await provider.decide(request)).metadata.usage, { inputTokens: 2, outputTokens: undefined })
  const outputOnly = createJevSearchProvider({ client: { systemOne: async () => response({ usage: { output_tokens: 3 } }) } })
  assert.deepEqual((await outputOnly.decide(request)).metadata.usage, { inputTokens: undefined, outputTokens: 3 })
  const emptyUsage = createJevSearchProvider({ client: { systemOne: async () => response({ usage: {} }) } })
  assert.equal(Object.hasOwn((await emptyUsage.decide(request)).metadata, 'usage'), false)
})

test('Jev provider can construct its real SDK client without calling the network', () => {
  const previousKey = process.env.TYPESAFE_API_KEY
  process.env.TYPESAFE_API_KEY = 'test-key'
  try {
    assert.equal(typeof createJevSearchProvider().decide, 'function')
  } finally {
    if (previousKey === undefined) delete process.env.TYPESAFE_API_KEY
    else process.env.TYPESAFE_API_KEY = previousKey
  }
})
