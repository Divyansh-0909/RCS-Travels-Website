import test from 'node:test'
import assert from 'node:assert/strict'
import { createTestDatabase } from '../helpers/database.js'
import { createScheduledScenario } from '../helpers/scheduledScenario.js'
import { createBookingFromQuote } from '../../services/bookingCreation.js'
import { settleRideTransitionInTransaction } from '../../services/rideSettlement.js'
import { seedEntitlement } from '../helpers/compensationFixture.js'

const NOW = new Date('2026-09-27T08:00:00.000Z')

function bookingInput(scenario, coupon, { fare = 1000, pickupAddress = 'Phase 6C unique pickup' } = {}) {
  return {
    user: scenario.customer,
    quote: { fares: { sedan: { solo: fare } }, ...(coupon ? { coupon: { id: coupon.id, amount: coupon.amount } } : {}) },
    pickupAddress, pickupLat: 28.6, pickupLng: 77.2,
    dropAddress: 'Phase 6C unique drop', dropLat: 28.7, dropLng: 77.3,
    vehicleClass: 'sedan', scheduledAt: '2026-10-02T08:00:00.000Z',
  }
}

test('Phase 6C booking-time compensation, driver-category independence, and rollback use disposable PostgreSQL',
  { skip: !process.env.TEST_DATABASE_URL && 'set TEST_DATABASE_URL via the disposable PostGIS runner' }, async t => {
    const database = await createTestDatabase()
    t.after(() => database.close())
    const scenario = createScheduledScenario()
    await scenario.persist(database.client)
    const entitlement = await seedEntitlement(database.client, scenario)
    const coupon = await database.client.coupon.create({ data: {
      userId: scenario.customer.id, amount: 100, earnedFor: '2026-08',
    } })
    const options = { db: database.client, createOrder: async () => ({ orderId: 'test-order' }) }

    await t.test('failed payment-intent insert rolls back booking, coupon claim, and reservation', async () => {
      const before = await database.client.booking.count({ where: { userId: scenario.customer.id } })
      await database.client.$executeRawUnsafe(`CREATE FUNCTION phase6c_reject_advance() RETURNS trigger
        LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test payment insert failure'; END $$`)
      await database.client.$executeRawUnsafe(`CREATE TRIGGER phase6c_reject_advance
        BEFORE INSERT ON payments FOR EACH ROW EXECUTE FUNCTION phase6c_reject_advance()`)
      try {
        await assert.rejects(createBookingFromQuote(bookingInput(scenario, coupon, {
          pickupAddress: 'Phase 6C failed pickup',
        }), options))
      } finally {
        await database.client.$executeRawUnsafe('DROP TRIGGER phase6c_reject_advance ON payments')
        await database.client.$executeRawUnsafe('DROP FUNCTION phase6c_reject_advance()')
      }
      assert.equal(await database.client.booking.count({ where: { userId: scenario.customer.id } }), before)
      assert.equal(await database.client.responsibilityCompensationAllocation.count({
        where: { compensationId: entitlement.id },
      }), 0)
      assert.equal((await database.client.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).redeemedAt, null)
    })

    await t.test('reservation precedes ₹80 advance and partner assignment does not reprice it', async () => {
      const result = await createBookingFromQuote(bookingInput(scenario, coupon), options)
      assert.equal(result.financials.advance, 8000)
      assert.equal(result.financials.finalFare, 80000)
      const payment = await database.client.payment.findUniqueOrThrow({
        where: { bookingId_purpose: { bookingId: result.bookingId, purpose: 'scheduled_ride_advance' } },
      })
      assert.equal(payment.amount, 8000)
      const allocation = await database.client.responsibilityCompensationAllocation.findFirstOrThrow({
        where: { bookingId: result.bookingId },
      })
      assert.equal(allocation.amountPaise, 10000)
      let booking = await database.client.booking.findUniqueOrThrow({ where: { id: result.bookingId } })
      assert.equal(booking.driverId, null)
      assert.equal(booking.customerPayment, 800)
      booking = await database.client.booking.update({ where: { id: booking.id }, data: {
        driverId: scenario.driversByGroup.partner.id, status: 'started',
        scheduledAdvancePaidAmount: 8000, scheduledAdvanceDisposition: 'paid', startedAt: NOW,
      } })
      assert.equal(booking.scheduledAdvanceAmount, 8000)
      const driver = await database.client.driver.findUniqueOrThrow({ where: { id: booking.driverId } })
      assert.equal(await database.client.$transaction(tx => settleRideTransitionInTransaction(tx, {
        booking, driver, from: 'started', to: 'completed', distanceKm: 0.2, accuracy: 12,
        capturedAt: NOW.toISOString(), completionOverrideReason: null, customerConfirmedCompletion: false,
      }, NOW)), true)
      const completed = await database.client.booking.findUniqueOrThrow({ where: { id: result.bookingId } })
      assert.equal(completed.fare, 1000)
      assert.equal(completed.customerPayment, 800)
      assert.equal(completed.scheduledRemainingAmount, 72000)
      assert.equal(await database.client.walletEntry.count({ where: {
        bookingId: result.bookingId, type: 'responsibility_compensation_funding', amount: 100,
      } }), 1)
      assert.equal((await database.client.responsibilityCompensationAllocation.findUniqueOrThrow({
        where: { id: allocation.id },
      })).status, 'CONSUMED')
    })

    await t.test('zero post-compensation obligation confirms without a provider order', async () => {
      const zeroScenario = createScheduledScenario({ drivers: { admin: { group: 'partner' } } })
      await zeroScenario.persist(database.client)
      const zeroEntitlement = await seedEntitlement(database.client, zeroScenario)
      const zeroCoupon = await database.client.coupon.create({ data: {
        userId: zeroScenario.customer.id, amount: 100, earnedFor: '2026-08',
      } })
      const result = await createBookingFromQuote(bookingInput(zeroScenario, zeroCoupon, {
        fare: 160, pickupAddress: 'Phase 6C zero-payment pickup',
      }), options)
      assert.equal(result.status, 'confirmed')
      assert.equal(result.financials.finalFare, 0)
      assert.equal(result.financials.advance, 0)
      assert.equal(result.payment, null)
      assert.equal(await database.client.payment.count({ where: { bookingId: result.bookingId } }), 0)
      const allocations = await database.client.responsibilityCompensationAllocation.findMany({
        where: { compensationId: zeroEntitlement.id },
      })
      assert.deepEqual(allocations.map(row => [row.status, row.amountPaise]), [['RESERVED', 6000]])
    })

  })
