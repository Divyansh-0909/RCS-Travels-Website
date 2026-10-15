import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DRIVER_PICKUP_GRACE_MS,
  driverDelayEligibleAt,
  expectedPickupAtForAssignment,
  isDriverDelayed,
} from '../services/driverDelay.js'

describe('delayed driver pickup clock', () => {
  const expectedPickupAt = new Date('2026-09-21T10:00:00.000Z')

  test('starts the grace period from the frozen expected pickup time', () => {
    const booking = { status: 'en_route', expectedPickupAt }
    assert.equal(
      driverDelayEligibleAt(booking)?.toISOString(),
      new Date(expectedPickupAt.getTime() + DRIVER_PICKUP_GRACE_MS).toISOString(),
    )
    assert.equal(isDriverDelayed(booking, expectedPickupAt.getTime() + DRIVER_PICKUP_GRACE_MS - 1), false)
    assert.equal(isDriverDelayed(booking, expectedPickupAt.getTime() + DRIVER_PICKUP_GRACE_MS), true)
  })

  test('never marks an arrived or terminal ride delayed', () => {
    for (const status of ['reached', 'started', 'completed', 'cancelled']) {
      assert.equal(isDriverDelayed({ status, expectedPickupAt }, expectedPickupAt.getTime() + DRIVER_PICKUP_GRACE_MS), false)
    }
  })

  test('uses a future scheduled pickup as the reporting time', async () => {
    const now = new Date('2026-09-21T08:00:00.000Z')
    const scheduledAt = new Date('2026-09-21T12:00:00.000Z')
    const result = await expectedPickupAtForAssignment({ scheduledAt }, 'unused', now)
    assert.equal(result.toISOString(), scheduledAt.toISOString())
  })
})
