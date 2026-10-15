import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeLocationProvenance } from '../lib/locationProvenance.ts'

test('fresh GPS keeps device observation time, server receipt time, and accuracy', () => {
  const receivedAt = new Date('2026-09-25T18:20:02.000Z')
  const observedAt = new Date('2026-09-25T18:20:00.000Z').getTime()

  const result = normalizeLocationProvenance({ observedAt, accuracyMeters: 25 }, receivedAt)

  assert.equal(result.observedAt?.toISOString(), '2026-09-25T18:20:00.000Z')
  assert.equal(result.receivedAt, receivedAt)
  assert.equal(result.accuracyMeters, 25)
})

test('buffered GPS preserves the older observation time independently of receipt', () => {
  const receivedAt = new Date('2026-09-25T18:28:00.000Z')
  const observedAt = new Date('2026-09-25T18:20:00.000Z').getTime()

  const result = normalizeLocationProvenance({ observedAt, accuracyMeters: 40 }, receivedAt)

  assert.equal(result.observedAt?.toISOString(), '2026-09-25T18:20:00.000Z')
  assert.equal(result.receivedAt.toISOString(), '2026-09-25T18:28:00.000Z')
  assert.equal(result.accuracyMeters, 40)
})

test('missing GPS accuracy and timestamp stay unknown', () => {
  const receivedAt = new Date('2026-09-25T18:20:02.000Z')

  const result = normalizeLocationProvenance({}, receivedAt)

  assert.equal(result.observedAt, null)
  assert.equal(result.accuracyMeters, null)
})

test('implausibly old GPS timestamp is discarded without fabricating observedAt', () => {
  const receivedAt = new Date('2026-09-25T18:20:02.000Z')

  const result = normalizeLocationProvenance({ observedAt: 1, accuracyMeters: null }, receivedAt)

  assert.equal(result.observedAt, null)
  assert.equal(result.receivedAt, receivedAt)
})

test('GPS timestamp more than five minutes in the future is discarded', () => {
  const receivedAt = new Date('2026-09-25T18:20:02.000Z')
  const observedAt = receivedAt.getTime() + (5 * 60 * 1000) + 1

  const result = normalizeLocationProvenance({ observedAt, accuracyMeters: 12 }, receivedAt)

  assert.equal(result.observedAt, null)
  assert.equal(result.accuracyMeters, 12)
})

test('GPS timestamp exactly at the accepted clock boundaries remains evidence', () => {
  const receivedAt = new Date('2026-09-25T18:20:02.000Z')
  const earliest = Date.UTC(2000, 0, 1)
  const futureBoundary = receivedAt.getTime() + (5 * 60 * 1000)

  assert.equal(
    normalizeLocationProvenance({ observedAt: earliest }, receivedAt).observedAt?.getTime(),
    earliest,
  )
  assert.equal(
    normalizeLocationProvenance({ observedAt: futureBoundary }, receivedAt).observedAt?.getTime(),
    futureBoundary,
  )
})
