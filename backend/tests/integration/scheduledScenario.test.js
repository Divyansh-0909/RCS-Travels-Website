import test from 'node:test'
import assert from 'node:assert/strict'

import { createTestDatabase } from '../helpers/database.js'
import { createScheduledScenario } from '../helpers/scheduledScenario.js'

test('scheduled scenario persists its relations and payment commitments', async t => {
  const db = await createTestDatabase()
  t.after(() => db.close())

  const scenario = createScheduledScenario()
  await scenario.persist(db.client)

  const scheduled = await db.client.booking.findUniqueOrThrow({
    where: { id: scenario.bookingStates.scheduled.id },
    include: { user: true, offers: true, payments: true },
  })
  const assignedDriver = await db.client.driver.findUniqueOrThrow({
    where: { id: scenario.driversByGroup.rcs.id },
    include: { activeVehicle: true, location: true },
  })
  const commitments = await db.client.booking.findMany({
    where: { id: { in: [
      scenario.bookingStates.previous.id,
      scenario.bookingStates.current.id,
      scenario.bookingStates.next.id,
    ] } },
    select: { id: true, driverId: true },
  })

  assert.equal(scheduled.user.id, scenario.customer.id)
  assert.equal(scheduled.user.phone, scenario.customer.phone)
  assert.equal(scheduled.offers.length, 1)
  assert.equal(scheduled.offers[0].driverId, scenario.driversByGroup.rcs.id)
  assert.equal(scheduled.offers[0].group, 'rcs')
  assert.equal(scheduled.payments.length, 1)
  assert.equal(scheduled.payments[0].amount, scheduled.scheduledAdvanceAmount)
  assert.equal(scheduled.scheduledAdvancePaidAmount, scheduled.payments[0].amount)
  assert.equal(scheduled.scheduledRemainingAmount, scheduled.payments[0].remainingAmount)
  assert.equal(assignedDriver.activeVehicleId, assignedDriver.activeVehicle.id)
  assert.equal(assignedDriver.location.driverId, assignedDriver.id)
  assert.equal(commitments.length, 3)
  for (const booking of commitments) assert.equal(booking.driverId, scenario.driversByGroup.rcs.id)
})
