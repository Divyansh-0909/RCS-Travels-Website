import test, { mock } from 'node:test'
import assert from 'node:assert/strict'
import { guardDevelopmentProvider, developmentProviderFailure } from '../benchmarks/responsibility/developmentBudget.js'
test('responsibility development provider taxonomy distinguishes auth, quota, rate limits and infrastructure failure without exposing raw details', () => {
  for (const [error, expected] of [[{ status: 401 }, 'AUTH'], [{ status: 403 }, 'AUTH'], [{ status: 429, message: 'requests per day' }, 'QUOTA'],
    [{ status: 429 }, 'RATE_LIMIT'], [{ message: 'rate limit' }, 'RATE_LIMIT'], [{ status: 404 }, 'MODEL_API_NOT_FOUND'],
    [{ name: 'TimeoutError' }, 'TIMEOUT'], [{ message: 'ETIMEDOUT' }, 'TIMEOUT'], [{ name: 'ZodError' }, 'SCHEMA'], [{}, 'PROVIDER']]) assert.equal(developmentProviderFailure(error), expected)
})
test('development budget paces calls and fails closed after quota; queued subsequent cases make no network request', async () => {
  let time = 100; let calls = 0; const waits = []
  const adapter = guardDevelopmentProvider({ async analyzeResponsibilityCase() { calls++; if (calls === 3) throw Object.assign(new Error('organization PRIVATE quota'), { status: 429 }); return calls } },
    { minIntervalMs: 6500, requestLimit: 10, now: () => time, wait: async ms => { waits.push(ms); time += ms } })
  assert.equal(await adapter.analyzeResponsibilityCase({}), 1)
  assert.equal(await adapter.analyzeResponsibilityCase({}), 2)
  await assert.rejects(adapter.analyzeResponsibilityCase({}), /^Error: RESPONSIBILITY_PROVIDER_FAILURE:QUOTA$/)
  await assert.rejects(adapter.analyzeResponsibilityCase({}), /PAUSED:QUOTA/)
  assert.deepEqual(waits, [6500, 6500]); assert.equal(calls, 3)
  assert.deepEqual(adapter.budgetState(), { requests: 3, halted: 'QUOTA' })
})
test('development request budget and input limits fail closed; transient failures do not disable all later cases', async () => {
  for (const limits of [{ minIntervalMs: -1, requestLimit: 1 }, { minIntervalMs: NaN, requestLimit: 1 }, { minIntervalMs: 0, requestLimit: 0 }, { minIntervalMs: 0, requestLimit: 1.5 }]) assert.throws(() => guardDevelopmentProvider({}, limits), /INVALID/)
  let calls = 0
  const adapter = guardDevelopmentProvider({ async analyzeResponsibilityCase() { calls++; if (calls === 1) throw new Error('network outage'); return true } }, { minIntervalMs: 0, requestLimit: 2 })
  await assert.rejects(adapter.analyzeResponsibilityCase({}), /FAILURE:PROVIDER/)
  assert.equal(await adapter.analyzeResponsibilityCase({}), true)
  await assert.rejects(adapter.analyzeResponsibilityCase({}), /PAUSED:REQUEST_BUDGET/)
  assert.equal(calls, 2)
})
test('default pacing wait can be used with an injected clock and auth/model failures open the circuit', { timeout: 2000 }, async () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    const adapter = guardDevelopmentProvider({ analyzeResponsibilityCase: async () => true }, { minIntervalMs: 1, requestLimit: 2, now: () => 0 })
    assert.equal(await adapter.analyzeResponsibilityCase({}), true)
    let settled = false
    const pending = adapter.analyzeResponsibilityCase({}).then(value => { settled = true; return value })
    for (let turn = 0; turn < 4; turn++) await Promise.resolve()
    assert.equal(settled, false)
    mock.timers.tick(1)
    assert.equal(await pending, true)
  } finally { mock.timers.reset() }
  const single = guardDevelopmentProvider({ analyzeResponsibilityCase: async () => true }, { minIntervalMs: 0, requestLimit: 1 })
  assert.equal(await single.analyzeResponsibilityCase({}), true)
  await assert.rejects(single.analyzeResponsibilityCase({}), /PAUSED:REQUEST_BUDGET/)
  for (const status of [401, 404, 429]) {
    const failure = guardDevelopmentProvider({ analyzeResponsibilityCase: async () => { throw { status } } }, { minIntervalMs: 0, requestLimit: 2 })
    await assert.rejects(failure.analyzeResponsibilityCase({}), /FAILURE/)
    await assert.rejects(failure.analyzeResponsibilityCase({}), /PAUSED/)
    assert.equal(failure.budgetState().requests, 1)
  }
})
