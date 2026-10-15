import test from 'node:test'
import assert from 'node:assert/strict'
import { createBrowserHarness } from '../helpers/phase9BrowserHarness.js'

test('real scheduled booking creates one order through the isolated SDK provider transport', async t => {
  const harness = await createBrowserHarness({ formBooking: true })
  t.after(() => harness.close())
  const { createBookingFromQuote } = await import('../../services/bookingCreation.js')
  const { createOrderForPayment } = await import('../../services/payments.js')
  const errors = []
  const result = await createBookingFromQuote({ user: harness.actors.customer,
    quote: { fares: { sedan: { solo: 1000, toll: 0, airport: 0, carrier: 0 } }, distanceKm: 4.2, durationMin: 18 },
    pickupAddress: 'Synthetic Delhi pickup', pickupLat: 28.6129, pickupLng: 77.2295,
    dropAddress: 'Synthetic Delhi drop', dropLat: 28.6315, dropLng: 77.2167,
    vehicleClass: 'sedan', scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  }, { db: harness.db, createOrder: async args => {
    try { return await createOrderForPayment(args) }
    catch (error) { errors.push({ code: error.code, message: error.message }); throw error }
  } })
  assert.deepEqual(errors, [])
  assert.ok(result.payment)
  assert.equal(harness.lifecycle.provider.snapshot().orders.length, 1)
  const payment = await harness.lifecycle.adoptBooking(result.bookingId)
  assert.equal(payment.order_id, result.payment.orderId)
})
