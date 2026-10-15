import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { createScheduledScenario, DEFAULT_NOW } from './helpers/scheduledScenario.js'

function recordingTransaction() {
  const calls = []
  const model = (name) => ({
    create: async ({ data }) => { calls.push({ operation: `${name}.create`, data }); return data },
    update: async ({ where, data }) => { calls.push({ operation: `${name}.update`, where, data }); return data },
  })
  return {
    calls,
    tx: {
      user: model('user'), driver: model('driver'), vehicle: model('vehicle'),
      driverLocation: model('driverLocation'), booking: model('booking'),
      rideOffer: model('rideOffer'), payment: model('payment'),
    },
  }
}

describe('scheduled scenario fixture', () => {
  test('builds reproducible time states with coherent advance payment data', () => {
    const now = new Date(DEFAULT_NOW)
    const scenario = createScheduledScenario({ now })

    assert.equal(scenario.now.toISOString(), now.toISOString())
    assert.equal(scenario.bookings.length, 4)
    assert.ok(scenario.bookingStates.previous.scheduledAt < now)
    assert.equal(scenario.bookingStates.current.scheduledAt.toISOString(), now.toISOString())
    assert.ok(scenario.bookingStates.next.scheduledAt > scenario.bookingStates.scheduled.scheduledAt)
    assert.equal(scenario.payments[0].amount, scenario.bookingStates.scheduled.scheduledAdvanceAmount)
    assert.equal(scenario.bookingStates.scheduled.scheduledAdvancePaidAmount, scenario.payments[0].amount)
    assert.equal(scenario.driversByGroup.partner.payoutUpiVerifiedAt, null)
    assert.ok(scenario.driversByGroup.rcs.payoutUpiVerifiedAt)
    assert.equal(scenario.driversByGroup.rcs.activeVehicleId,
      scenario.vehicles.find((vehicle) => vehicle.driverId === scenario.driversByGroup.rcs.id).id)
    for (const row of [scenario.customer, ...scenario.drivers, ...scenario.vehicles, ...scenario.bookings]) {
      assert.ok(row.createdAt <= now)
    }
    for (const location of scenario.locations) assert.equal(location.updatedAt.toISOString(), now.toISOString())
    assert.equal(scenario.payments[0].createdAt.toISOString(), '2026-09-23T09:40:00.000Z')
    assert.equal(scenario.payments[0].updatedAt.toISOString(), '2026-09-23T09:40:00.000Z')
  })

  test('accepts readable booking and driver overrides', () => {
    const scenario = createScheduledScenario({
      booking: { status: 'cancelled', cancellationReason: 'fixture case' },
      current: { status: 'reached' },
      drivers: { partner: { isOnline: false } },
    })

    assert.equal(scenario.bookingStates.scheduled.status, 'cancelled')
    assert.equal(scenario.bookingStates.current.status, 'reached')
    assert.equal(scenario.driversByGroup.partner.isOnline, false)
  })

  test('accepts ISO timestamps with an offset and rejects naive strings', () => {
    const scenario = createScheduledScenario({ now: '2026-09-23T10:00:00+05:30' })

    assert.equal(scenario.now.toISOString(), '2026-09-23T04:30:00.000Z')
    assert.throws(() => createScheduledScenario({ now: '2026-09-23T10:00:00' }), /timezone/)
    assert.throws(() => createScheduledScenario({ now: '23 September 2026' }), /timezone/)
  })

  test('keeps caller-supplied test-only metadata out of persisted collections', () => {
    const metadata = { liability: { amountPaise: 5_000 }, compensation: { driverId: 'later' } }
    const scenario = createScheduledScenario({ metadata })

    assert.deepEqual(scenario.metadata, metadata)
    assert.equal(Object.values(scenario.collections).flat().includes(metadata), false)
  })

  test('persists through a transaction client and a Prisma-style transaction route', async () => {
    const scenario = createScheduledScenario()
    const direct = recordingTransaction()
    const returned = await scenario.persist(direct.tx)

    assert.equal(returned, scenario.collections)
    assert.deepEqual(direct.calls.map((call) => call.operation), [
      'user.create',
      'driver.create', 'driver.create', 'driver.create',
      'vehicle.create', 'vehicle.create', 'vehicle.create',
      'driver.update', 'driver.update', 'driver.update',
      'driverLocation.create', 'driverLocation.create', 'driverLocation.create',
      'booking.create', 'booking.create', 'booking.create', 'booking.create',
      'rideOffer.create', 'payment.create',
    ])
    assert.equal(direct.calls.filter((call) => call.operation === 'driver.create')
      .every((call) => !('activeVehicleId' in call.data)), true)

    const routed = recordingTransaction()
    let transactionCalls = 0
    await scenario.persist({ $transaction: async (work) => { transactionCalls++; return work(routed.tx) } })
    assert.equal(transactionCalls, 1)
    assert.deepEqual(routed.calls.map((call) => call.operation), direct.calls.map((call) => call.operation))
  })
})
