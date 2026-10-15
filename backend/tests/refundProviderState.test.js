import test from 'node:test'
import assert from 'node:assert/strict'
import { applyRefundProviderState } from '../services/refundProviderState.js'

const payment = (overrides = {}) => ({
  id: 'payment-1',
  bookingId: 'booking-1',
  purpose: 'scheduled_ride_advance',
  status: 'captured',
  amount: 10000,
  currency: 'INR',
  razorpayPaymentId: 'pay_1',
  cancellationRefundAmount: 4000,
  refundRequestedAmount: 4000,
  ...overrides,
})

const refund = (overrides = {}) => ({
  id: 'rfnd_1',
  payment_id: 'pay_1',
  amount: 4000,
  currency: 'INR',
  status: 'pending',
  ...overrides,
})

function stateDb(initial) {
  let row = { ...initial }
  let disposition = 'partial_refund_pending'
  const paymentUpdates = []
  const bookingUpdates = []
  return {
    tx: {
      $queryRaw: async () => [],
      payment: { findUniqueOrThrow: async input => { assert.deepEqual(input, { where: { id: initial.id } }); return { ...row } }, update: async (input) => {
        paymentUpdates.push(input)
        row = { ...row, ...input.data }
        return row
      } },
      booking: { updateMany: async (input) => {
        bookingUpdates.push(input)
        const { data } = input
        disposition = data.scheduledAdvanceDisposition
        return { count: 1 }
      } },
    },
    row: () => ({ ...row }),
    disposition: () => disposition,
    paymentUpdates,
    bookingUpdates,
  }
}

test('pending provider refund stores its durable identity without claiming success', async () => {
  const store = stateDb(payment())
  const result = await applyRefundProviderState(store.tx, store.row(), refund())
  assert.deepEqual(result, { processed: true, result: 'scheduled_partial.identified' })
  assert.equal(store.row().razorpayRefundId, 'rfnd_1')
  assert.equal(store.row().refundOperationStatus, 'provider_identified')
  assert.equal(store.row().status, 'captured')
  assert.deepEqual(store.paymentUpdates[0].where, { id: 'payment-1' })
})

test('processed refund kinds update only their intended payment and booking state', async () => {
  const partial = stateDb(payment())
  assert.deepEqual(await applyRefundProviderState(partial.tx, partial.row(), refund({ status: 'processed' })), {
    processed: true, result: 'scheduled_partial.processed',
  })
  assert.equal(partial.row().status, 'captured')
  assert.equal(partial.disposition(), 'partially_refunded')
  assert.deepEqual(partial.paymentUpdates[0].where, { id: 'payment-1' })
  assert.deepEqual(partial.bookingUpdates[0].where, {
    id: 'booking-1', scheduledAdvanceDisposition: 'partial_refund_pending',
  })

  const debt = stateDb(payment({
    purpose: 'driver_debt_settlement', bookingId: null, cancellationRefundAmount: null,
    driverDebtRefundAmount: 4000, refundRequestedAmount: null,
  }))
  assert.deepEqual(await applyRefundProviderState(debt.tx, debt.row(), refund({ status: 'processed' })), {
    processed: true, result: 'driver_debt_excess.processed',
  })
  assert.equal(debt.row().status, 'captured')
  assert.equal(debt.bookingUpdates.length, 0)

  const full = stateDb(payment({ cancellationRefundAmount: null, refundRequestedAmount: 10000,
    status: 'refund_pending' }))
  assert.deepEqual(await applyRefundProviderState(full.tx, full.row(), refund({ amount: 10000, status: 'processed' })), {
    processed: true, result: 'full.processed',
  })
  assert.equal(full.row().status, 'refunded')
  assert.deepEqual(full.bookingUpdates[0].where, {
    id: 'booking-1', scheduledAdvanceDisposition: 'refund_pending',
  })
  assert.equal(full.disposition(), 'refunded')
})

test('failed partial refund clears the retriable provider and cancellation claim', async () => {
  const store = stateDb(payment())
  const result = await applyRefundProviderState(store.tx, store.row(), refund({
    status: 'failed', error_description: 'gateway rejected',
  }))
  assert.deepEqual(result, { processed: true, result: 'scheduled_partial.failed' })
  assert.equal(store.row().refundOperationStatus, 'failed')
  assert.equal(store.row().razorpayRefundId, null)
  assert.equal(store.row().cancellationRefundAmount, null)
  assert.equal(store.row().failureDescription, 'gateway rejected')
})

test('failed full refund restores captured state while debt excess keeps payment state', async () => {
  const fullStore = stateDb(payment({ cancellationRefundAmount: null, refundRequestedAmount: 10000,
    status: 'refund_pending' }))
  const fullResult = await applyRefundProviderState(fullStore.tx, fullStore.row(), refund({
    amount: 10000, status: 'failed', error_description: undefined,
  }))
  assert.equal(fullResult.result, 'full.failed')
  assert.equal(fullStore.row().status, 'captured')
  assert.equal(fullStore.row().failureDescription, null)
  assert.equal(fullStore.row().failureCode, 'REFUND_FAILED')

  const debtStore = stateDb(payment({
    purpose: 'driver_debt_settlement',
    cancellationRefundAmount: null,
    driverDebtRefundAmount: 4000,
    status: 'refund_pending',
  }))
  const debtResult = await applyRefundProviderState(debtStore.tx, debtStore.row(), refund({ status: 'failed' }))
  assert.equal(debtResult.result, 'driver_debt_excess.failed')
  assert.equal(debtStore.row().status, 'refund_pending')
  assert.deepEqual(debtStore.paymentUpdates[0].where, { id: 'payment-1' })
})

test('unexpected refund identifiers, amounts, and currencies are ignored', async () => {
  const cases = [
    refund({ payment_id: 'other' }),
    refund({ currency: 'USD' }),
    refund({ amount: 1.5 }),
    refund({ id: null }),
    refund({ amount: 5000 }),
  ]
  for (const providerRefund of cases) {
    const store = stateDb(payment())
    assert.deepEqual(await applyRefundProviderState(store.tx, store.row(), providerRefund), {
      ignored: true, result: 'unexpected_refund',
    })
    assert.equal(store.row().razorpayRefundId, undefined)
  }
})

test('refund kind requires the matching purpose and amount evidence', async () => {
  const cases = [
    payment({ purpose: 'ride_final', cancellationRefundAmount: 4000, refundRequestedAmount: null }),
    payment({ purpose: 'ride_final', cancellationRefundAmount: null,
      driverDebtRefundAmount: 4000, refundRequestedAmount: null }),
    payment({ purpose: 'driver_debt_settlement', cancellationRefundAmount: null,
      driverDebtRefundAmount: 3000, refundRequestedAmount: null }),
  ]
  for (const localPayment of cases) {
    const store = stateDb(localPayment)
    assert.deepEqual(await applyRefundProviderState(store.tx, store.row(), refund()), {
      ignored: true, result: 'unexpected_refund',
    })
    assert.equal(store.paymentUpdates.length, 0)
  }

  const requestedAmount = stateDb(payment({ purpose: 'ride_final', cancellationRefundAmount: null,
    refundRequestedAmount: 4000 }))
  assert.equal((await applyRefundProviderState(requestedAmount.tx, requestedAmount.row(),
    refund({ status: 'processed' }))).result, 'full.processed')
  assert.equal(requestedAmount.row().status, 'refunded')

  const authoritativeAmount = stateDb(payment({ purpose: 'ride_final', cancellationRefundAmount: null,
    refundRequestedAmount: null }))
  assert.equal((await applyRefundProviderState(authoritativeAmount.tx, authoritativeAmount.row(),
    refund({ amount: 10000, status: 'processed' }))).result, 'full.processed')
  assert.equal(authoritativeAmount.row().status, 'refunded')
})

test('refund acknowledgement locks and reloads the payment; conflicting identities and terminal outcomes are preserved', async () => {
  const store = stateDb(payment({ razorpayRefundId: 'other-refund' }))
  let query
  store.tx.$queryRaw = async (strings, id) => { query = [strings.join('?'), id]; return [] }
  assert.deepEqual(await applyRefundProviderState(store.tx, store.row(), refund()), {
    ignored: true, result: 'conflicting_refund_identity',
  })
  assert.deepEqual(query, ['SELECT id FROM payments WHERE id = ? FOR UPDATE', 'payment-1'])
  assert.equal(store.paymentUpdates.length, 0)
  for (const status of ['succeeded', 'failed']) {
    const terminal = stateDb(payment({ refundOperationStatus: status, razorpayRefundId: 'rfnd_1' }))
    assert.deepEqual(await applyRefundProviderState(terminal.tx, payment(), refund()), {
      ignored: true, result: 'terminal_refund',
    })
    assert.equal(terminal.paymentUpdates.length, 0)
  }
})
