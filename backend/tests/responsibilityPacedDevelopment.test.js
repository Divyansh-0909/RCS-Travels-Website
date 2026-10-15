import test, { mock } from 'node:test'
import assert from 'node:assert/strict'
import { pacedDevelopmentProvider, safeRateLimitDetail } from '../benchmarks/responsibility/pacedDevelopment.js'
test('rate diagnostics retain only category, axis, numeric limit and retry delay; malformed/date headers remain safe', () => {
  assert.deepEqual(safeRateLimitDetail({ status: 429, message: 'org SECRET requests per minute Limit: 10', headers: new Headers({ 'retry-after': '7' }) }),
    { category: 'RATE_LIMIT', axis: 'RPM', limit: 10, retryAfterMs: 7000 })
  assert.equal(safeRateLimitDetail({ status: 429, message: 'tokens per minute', headers: { 'retry-after': 'bogus' } }).retryAfterMs, null)
  assert.equal(safeRateLimitDetail({ headers: { 'retry-after': 'Thu, 01 Jan 1970 00:00:02 GMT' } }, 1000).retryAfterMs, 1000)
  assert.equal(safeRateLimitDetail({ message: 'requests per day' }).axis, 'RPD')
  assert.equal(safeRateLimitDetail({ message: 'TPM' }).axis, 'TPM')
})
test('concurrent callers serialize and honor spacing; temporary RPM retries respect Retry-After and bound request spend', async () => {
  let clock = 0; let calls = 0; const waits = []
  const provider = pacedDevelopmentProvider({ async analyzeResponsibilityCase() {
    calls++; if (calls === 1) throw { status: 429, message: 'RPM', headers: { 'retry-after': '10' } }; return calls
  } }, { requestLimit: 3, minIntervalMs: 6500, now: () => clock, random: () => 0,
    wait: async ms => { waits.push(ms); clock += ms } })
  assert.deepEqual(await Promise.all([provider.analyzeResponsibilityCase({}), provider.analyzeResponsibilityCase({})]), [2, 3])
  assert.deepEqual(waits, [10000, 6500]); assert.equal(provider.budgetState().requests, 3)
  await assert.rejects(provider.analyzeResponsibilityCase({}), /REQUEST_BUDGET/)
})
test('daily quota/auth/model errors stop retries; long server delays are deferred; poison schema case does not starve a valid case', async () => {
  for (const error of [{ status: 429, message: 'requests per day Limit 50' }, { status: 401 }, { status: 404 }, { message: 'credits' }]) {
    let calls = 0; const provider = pacedDevelopmentProvider({ async analyzeResponsibilityCase() { calls++; throw error } }, { requestLimit: 3, minIntervalMs: 0 })
    await assert.rejects(provider.analyzeResponsibilityCase({}), /FAILURE/)
    await assert.rejects(provider.analyzeResponsibilityCase({}), /PAUSED/); assert.equal(calls, 1)
  }
  const long = pacedDevelopmentProvider({ async analyzeResponsibilityCase() { throw { status: 429, headers: { 'retry-after': '3600' } } } },
    { requestLimit: 2, wait: async () => assert.fail('A server delay exceeding the budget must never be waited or retried early') })
  await assert.rejects(long.analyzeResponsibilityCase({}), /DEFERRED/); assert.equal(long.budgetState().requests, 1)
  let calls = 0
  const schema = pacedDevelopmentProvider({ async analyzeResponsibilityCase() { if (++calls === 1) throw new Error('schema invalid'); return true } }, { requestLimit: 3, minIntervalMs: 0 })
  await assert.rejects(schema.analyzeResponsibilityCase({}), /SCHEMA/); assert.equal(await schema.analyzeResponsibilityCase({}), true)
})
test('retry exhaustion and invalid budgets fail closed', async () => {
  for (const limits of [{ requestLimit: 0 }, { requestLimit: 1.5 }, { requestLimit: 1, minIntervalMs: -1 },
    { requestLimit: 1, maxRetries: -1 }, { requestLimit: 1, maxDelayMs: 0 }]) assert.throws(() => pacedDevelopmentProvider({}, limits), /INVALID/)
  const provider = pacedDevelopmentProvider({ async analyzeResponsibilityCase() { throw new Error('network') } },
    { requestLimit: 3, minIntervalMs: 0, maxRetries: 1, random: () => 0, wait: async () => {} })
  await assert.rejects(provider.analyzeResponsibilityCase({}), /FAILURE:PROVIDER/); assert.equal(provider.budgetState().requests, 2)
})
test('default timer honors the reserved interval without wall-clock waits', { timeout: 2000 }, async () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    const provider = pacedDevelopmentProvider({ async analyzeResponsibilityCase() { return true } }, { requestLimit: 2, minIntervalMs: 1, now: () => 0 })
    assert.equal(await provider.analyzeResponsibilityCase({}), true)
    let settled = false
    const pending = provider.analyzeResponsibilityCase({}).then(value => { settled = true; return value })
    for (let index = 0; index < 6; index++) await Promise.resolve()
    assert.equal(settled, false); mock.timers.tick(1); assert.equal(await pending, true)
  } finally { mock.timers.reset() }
})
test('rate-limit diagnostics distinguish missing, zero, negative and date headers, and safe axis/limit variants', () => {
  assert.equal(safeRateLimitDetail({}).retryAfterMs, null)
  assert.equal(safeRateLimitDetail({ headers: { 'retry-after': '0' } }).retryAfterMs, 0)
  assert.equal(safeRateLimitDetail({ headers: { 'retry-after': '-1' } }, 1_000_000_000_000).retryAfterMs, 0)
  assert.equal(safeRateLimitDetail({ message: 'RPM limit   10' }).limit, 10)
  assert.equal(safeRateLimitDetail({ name: 'RPD' }).axis, 'RPD')
  assert.equal(safeRateLimitDetail({}).axis, 'UNSPECIFIED')
  assert.equal(safeRateLimitDetail({}).limit, null)
})
test('retry backoff grows and adds positive jitter; exact server delay boundary is admitted and diagnostics are immutable', async () => {
  let time = 0; let calls = 0; const delays = []
  const provider = pacedDevelopmentProvider({ async analyzeResponsibilityCase() {
    if (++calls <= 2) throw { status: 429, message: 'RPM' }; return 'success'
  } }, { requestLimit: 3, minIntervalMs: 100, random: () => 0.5, now: () => time,
    wait: async delay => { delays.push(delay); time += delay } })
  assert.equal(await provider.analyzeResponsibilityCase({}), 'success')
  assert.deepEqual(delays, [225, 325]); assert.equal(provider.budgetState().events.length, 2)
  assert.equal(provider.budgetState().events[0].requestNumber, 1); assert.equal(provider.budgetState().events[1].attempt, 1)
  const copy = provider.budgetState(); copy.events.push('changed'); assert.equal(provider.budgetState().events.length, 2)
  let boundaryCalls = 0
  const boundary = pacedDevelopmentProvider({ async analyzeResponsibilityCase() {
    if (++boundaryCalls === 1) throw { status: 429, headers: { 'retry-after': '0.001' } }; return true
  } }, { requestLimit: 2, minIntervalMs: 0, maxDelayMs: 1, random: () => 0, now: () => 0, wait: async () => {} })
  assert.equal(await boundary.analyzeResponsibilityCase({}), true)
  assert.equal(pacedDevelopmentProvider({}, { requestLimit: 1, maxRetries: 0, maxDelayMs: 1 }).budgetState().events.length, 0)
})
