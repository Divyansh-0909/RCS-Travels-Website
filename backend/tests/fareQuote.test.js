import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { signQuote, verifyQuote } from '../services/fareQuote.js'

describe('signed fare quotes', () => {
  test('round-trips every money-bearing and route-bound field', () => {
    const payload = {
      pickup: { address: 'Campus', coords: { lat: 28.52, lng: 77.57 } },
      drop: { address: 'Sector 18', coords: { lat: 28.57, lng: 77.32 } },
      fares: { hatchback: { solo: 800, sharing: 600, toll: 0, airport: 0, carrier: 0 } },
      safeRoute: { applied: false, waypoint: null },
      coupon: { id: 'coupon-1', amount: 100 },
    }
    const result = verifyQuote(signQuote(payload))
    assert.equal(result.error, undefined)
    assert.deepEqual(result.quote.pickup, payload.pickup)
    assert.deepEqual(result.quote.fares, payload.fares)
    assert.deepEqual(result.quote.coupon, payload.coupon)
  })

  test('rejects a token whose signed body was changed', () => {
    const token = signQuote({ fares: { hatchback: { solo: 800 } } })
    const [body, mac] = token.split('.')
    const changed = `${body.slice(0, -1)}${body.endsWith('A') ? 'B' : 'A'}.${mac}`
    assert.deepEqual(verifyQuote(changed), { error: 'QUOTE_INVALID' })
  })

  test('expires after the ten-minute quote window', () => {
    const realNow = Date.now
    const issuedAt = realNow()
    try {
      Date.now = () => issuedAt
      const token = signQuote({ fares: { hatchback: { solo: 800 } } })
      Date.now = () => issuedAt + 10 * 60 * 1000 + 1
      assert.deepEqual(verifyQuote(token), { error: 'QUOTE_EXPIRED' })
    } finally {
      Date.now = realNow
    }
  })

  test('distinguishes missing and malformed quotes', () => {
    assert.deepEqual(verifyQuote(''), { error: 'QUOTE_MISSING' })
    assert.deepEqual(verifyQuote('not-a-quote'), { error: 'QUOTE_INVALID' })
  })
})
