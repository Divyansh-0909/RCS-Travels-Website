import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { driverLocationVisibleToRider, SCHEDULED_LOCATION_LEAD_MS } from '../services/riderDriverLocation.js'

describe('assigned driver location visibility for riders', () => {
  const now = Date.parse('2026-08-22T12:00:00.000Z')

  test('shows an assigned Ride Now driver immediately', () => {
    assert.equal(driverLocationVisibleToRider({ status: 'assigned', scheduledAt: null }, now), true)
  })

  test('hides a scheduled driver until the final 30 minutes', () => {
    assert.equal(driverLocationVisibleToRider({
      status: 'assigned',
      scheduledAt: new Date(now + SCHEDULED_LOCATION_LEAD_MS + 1),
    }, now), false)
  })

  test('shows a scheduled driver at exactly T-30 minutes and afterwards', () => {
    assert.equal(driverLocationVisibleToRider({
      status: 'assigned',
      scheduledAt: new Date(now + SCHEDULED_LOCATION_LEAD_MS),
    }, now), true)
    assert.equal(driverLocationVisibleToRider({
      status: 'en_route',
      scheduledAt: new Date(now + 5 * 60 * 1000),
    }, now), true)
  })

  test('does not expose location once a ride is terminal', () => {
    assert.equal(driverLocationVisibleToRider({ status: 'completed', scheduledAt: null }, now), false)
    assert.equal(driverLocationVisibleToRider({ status: 'cancelled', scheduledAt: null }, now), false)
  })
})
