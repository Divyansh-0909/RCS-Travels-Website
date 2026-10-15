import test from 'node:test'
import assert from 'node:assert/strict'
import { providerAvailability } from '../benchmarks/common/providerAvailability.js'
test('provider capacity respects the shared retry window without treating availability as semantic accuracy', () => {
  const preflight = { status: 'FAIL', recordedAt: '2026-10-06T10:00:00Z', providerFailure: { category: 'RATE_LIMIT', retryAfterMs: 60000 } }
  assert.deepEqual(providerAvailability(preflight, new Date('2026-10-06T10:00:59Z')), { allowed: false, reason: 'SERVER_RETRY_WINDOW', retryAt: '2026-10-06T10:01:00.000Z' })
  assert.deepEqual(providerAvailability(preflight, new Date('2026-10-06T10:01:00Z')), { allowed: true, reason: null, retryAt: '2026-10-06T10:01:00.000Z' })
  assert.deepEqual(providerAvailability({ status: 'PASS' }, new Date(0)), { allowed: true, reason: null, retryAt: null })
  assert.deepEqual(providerAvailability({ ...preflight, providerFailure: { category: 'RATE_LIMIT', retryAfterMs: 0 } }, new Date('2026-10-06T10:00:00Z')), { allowed: true, reason: null, retryAt: '2026-10-06T10:00:00.000Z' })
  for (const failure of [undefined, { category: 'AUTH' }, { category: 'RATE_LIMIT', retryAfterMs: null }, { category: 'RATE_LIMIT', retryAfterMs: -1 }, { category: 'RATE_LIMIT', retryAfterMs: NaN }]) {
    assert.deepEqual(providerAvailability({ status: 'FAIL', providerFailure: failure }, new Date(0)), { allowed: false, reason: 'PREFLIGHT_REQUIRED', retryAt: null })
    assert.deepEqual(providerAvailability({ ...preflight, providerFailure: failure }, new Date(0)), { allowed: false, reason: 'PREFLIGHT_REQUIRED', retryAt: null })
  }
  assert.equal(providerAvailability({ ...preflight, recordedAt: 'invalid' }, new Date(0)).allowed, false)
  assert.throws(() => providerAvailability(preflight, new Date('invalid')), /PROVIDER_CLOCK_INVALID/)
})
