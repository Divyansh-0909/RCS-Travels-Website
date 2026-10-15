import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { refundDriverDebtExcess, refundPayment, refundScheduledCancellationAdvance } from '../services/payments.js'
import { basePayment, paymentDb } from './helpers/paymentDb.js'

describe('refund foundation', () => {
  test('only captured payments can be refunded', async () => {
    const db = paymentDb(basePayment({ status: 'authorized', razorpayPaymentId: 'pay_1' }))
    await assert.rejects(refundPayment({ paymentId: db.row.id, gateway: {}, db }), error => error.code === 'REFUND_NOT_ALLOWED' && error.message === 'Only a captured payment can be refunded')
  })
  test('refund creation is idempotent', async () => {
    const db = paymentDb(basePayment({ status: 'captured', razorpayPaymentId: 'pay_1' })); let calls = 0; let options
    const gateway = { createRefund: async (_paymentId, input) => { calls++; options = input; return { id: 'rfnd_1' } } }
    await refundPayment({ paymentId: db.row.id, gateway, db })
    await refundPayment({ paymentId: db.row.id, gateway, db })
    assert.equal(calls, 1); assert.equal(db.row.razorpayRefundId, 'rfnd_1')
    assert.equal(options.idempotencyKey, db.row.id)
    assert.deepEqual(options.notes, {
      internal_payment_id: db.row.id, refund_request_key: db.row.id,
    })
    assert.deepEqual(db.calls.updateMany[0].where, {
      id: db.row.id, status: 'captured', refundRequestKey: null,
    })
    assert.deepEqual(db.calls.updateMany[1].where, {
      id: db.row.id, refundRequestKey: db.row.id, razorpayRefundId: null,
    })
    assert.deepEqual(db.calls.updateMany[1].data.refundOperationStatus, 'requested')
    assert.equal(db.calls.updateMany[0].data.refundOperationStatus, 'requested')
  })
  test('missing, completed, and concurrently claimed full refunds return exact outcomes', async () => {
    await assert.rejects(refundPayment({ paymentId: 'missing', gateway: {}, db: paymentDb() }),
      error => error.code === 'PAYMENT_NOT_FOUND' && error.message === 'Payment not found')

    const completed = paymentDb(basePayment({
      status: 'refund_pending', razorpayPaymentId: 'pay_1', razorpayRefundId: 'rfnd_1',
    }))
    assert.deepEqual(await refundPayment({ paymentId: completed.row.id, gateway: {}, db: completed }), {
      paymentId: completed.row.id, status: 'refund_pending', refundId: 'rfnd_1', alreadyApplied: true,
    })

    const refunded = paymentDb(basePayment({
      status: 'refunded', razorpayPaymentId: 'pay_1', razorpayRefundId: 'rfnd_done',
    }))
    assert.deepEqual(await refundPayment({ paymentId: refunded.row.id, gateway: {}, db: refunded }), {
      paymentId: refunded.row.id, status: 'refunded', refundId: 'rfnd_done', alreadyApplied: true,
    })

    const claimed = paymentDb(basePayment({ status: 'captured', razorpayPaymentId: 'pay_1' }))
    claimed.payment.updateMany = async () => ({ count: 0 })
    await assert.rejects(refundPayment({ paymentId: claimed.row.id, gateway: {}, db: claimed }),
      error => error.code === 'REFUND_BUSY' && error.status === 409 && error.message === 'Refund is already in progress')

    const capturedWithProviderId = paymentDb(basePayment({
      status: 'captured', razorpayPaymentId: 'pay_1', razorpayRefundId: 'legacy_refund_id',
    }))
    let providerCalls = 0
    await refundPayment({
      paymentId: capturedWithProviderId.row.id,
      gateway: { createRefund: async () => { providerCalls++; return { id: 'rfnd_current' } } },
      db: capturedWithProviderId,
    })
    assert.equal(providerCalls, 1)
  })
  test('refund without a provider identity remains explicitly ambiguous', async () => {
    const db = paymentDb(basePayment({ status: 'captured', razorpayPaymentId: 'pay_1' }))
    await assert.rejects(refundPayment({
      paymentId: db.row.id, gateway: { createRefund: async () => ({}) }, db,
    }), error => error.code === 'REFUND_OUTCOME_UNKNOWN' && error.message === 'Refund outcome is awaiting provider reconciliation')
    assert.equal(db.row.refundOperationStatus, 'outcome_unknown')
    assert.equal(db.row.status, 'refund_pending')
    assert.equal(db.row.failureCode, 'REFUND_OUTCOME_UNKNOWN')

    const timeout = paymentDb(basePayment({ status: 'captured', razorpayPaymentId: 'pay_1' }))
    await assert.rejects(refundPayment({
      paymentId: timeout.row.id,
      gateway: { createRefund: async () => { throw Object.assign(new Error('timeout'), { status: 503 }) } },
      db: timeout,
    }), error => error.message === 'timeout')
    assert.equal(timeout.row.refundOperationStatus, 'outcome_unknown')
    assert.equal(timeout.row.failureCode, 'REFUND_OUTCOME_UNKNOWN')
  })
  test('refund reconciliation distinguishes definite failures, unknown outcomes, and unnecessary lookups', async () => {
    const definite = paymentDb(basePayment({ status: 'captured', razorpayPaymentId: 'pay_1' }))
    let definiteLookups = 0
    const rejected = Object.assign(new Error('rejected'), { status: 400 })
    await assert.rejects(refundPayment({
      paymentId: definite.row.id,
      gateway: {
        createRefund: async () => { throw rejected },
        findRefundsByPayment: async () => { definiteLookups++; return [{
          id: 'rfnd_should_not_win', payment_id: 'pay_1', amount: 12345, currency: 'INR',
          notes: { internal_payment_id: definite.row.id, refund_request_key: definite.row.id },
        }] },
      },
      db: definite,
    }), error => error === rejected)
    assert.equal(definiteLookups, 0)
    assert.equal(definite.row.failureCode, 'REFUND_FAILED')

    const retry = paymentDb(basePayment({
      status: 'refund_pending', razorpayPaymentId: 'pay_1', refundRequestKey: basePayment().id,
      refundRequestedAmount: 12345, refundOperationStatus: 'outcome_unknown',
    }))
    let retryCreates = 0
    const retried = await refundPayment({
      paymentId: retry.row.id,
      gateway: {
        findRefundsByPayment: async () => [],
        createRefund: async () => { retryCreates++; return { id: 'rfnd_retry' } },
      },
      db: retry,
    })
    assert.equal(retried.refundId, 'rfnd_retry')
    assert.equal(retryCreates, 1)

    const retryWithoutLookup = paymentDb(basePayment({
      status: 'refund_pending', razorpayPaymentId: 'pay_1', refundRequestKey: basePayment().id,
      refundRequestedAmount: 12345, refundOperationStatus: 'outcome_unknown',
    }))
    const withoutLookup = await refundPayment({
      paymentId: retryWithoutLookup.row.id,
      gateway: { createRefund: async () => ({ id: 'rfnd_no_lookup' }) }, db: retryWithoutLookup,
    })
    assert.equal(withoutLookup.refundId, 'rfnd_no_lookup')

    const direct = paymentDb(basePayment({ status: 'captured', razorpayPaymentId: 'pay_1' }))
    let directLookups = 0
    await refundPayment({
      paymentId: direct.row.id,
      gateway: {
        createRefund: async () => ({ id: 'rfnd_direct' }),
        findRefundsByPayment: async () => { directLookups++; return [] },
      },
      db: direct,
    })
    assert.equal(directLookups, 0)

    const nullResponse = paymentDb(basePayment({ status: 'captured', razorpayPaymentId: 'pay_1' }))
    await assert.rejects(refundPayment({
      paymentId: nullResponse.row.id, gateway: { createRefund: async () => null }, db: nullResponse,
    }), error => error.code === 'REFUND_OUTCOME_UNKNOWN')
  })
  test('full refund rejects a conflicting durable operation identity', async () => {
    const db = paymentDb(basePayment({
      status: 'captured', razorpayPaymentId: 'pay_1',
      refundRequestKey: 'other', refundRequestedAmount: 12345,
    }))
    await assert.rejects(refundPayment({ paymentId: db.row.id, gateway: {}, db }),
      error => error.code === 'REFUND_AMOUNT_MISMATCH' && error.message === 'Refund does not match the existing operation')

    for (const operation of [
      { refundRequestKey: 'other', refundRequestedAmount: 12345 },
      { refundRequestKey: basePayment().id, refundRequestedAmount: 1 },
    ]) {
      const conflict = paymentDb(basePayment({
        status: 'captured', razorpayPaymentId: 'pay_1', ...operation,
      }))
      await assert.rejects(refundPayment({ paymentId: conflict.row.id, gateway: {}, db: conflict }),
        error => error.code === 'REFUND_AMOUNT_MISMATCH')
    }
  })
  test('definite full-refund provider failure restores captured state for retry', async () => {
    const db = paymentDb(basePayment({ status: 'captured', razorpayPaymentId: 'pay_1' }))
    const failure = Object.assign(new Error('rejected'), { code: 'BAD_REQUEST', status: 400 })
    await assert.rejects(refundPayment({
      paymentId: db.row.id, gateway: { createRefund: async () => { throw failure } }, db,
    }), error => error === failure)
    assert.equal(db.row.status, 'captured')
    assert.equal(db.row.refundOperationStatus, 'failed')
    assert.equal(db.row.failureCode, 'BAD_REQUEST')
    assert.deepEqual(db.calls.updateMany.at(-1).where, {
      id: db.row.id, refundRequestKey: db.row.id, razorpayRefundId: null,
    })

    const longMessage = paymentDb(basePayment({ status: 'captured', razorpayPaymentId: 'pay_1' }))
    await assert.rejects(refundPayment({
      paymentId: longMessage.row.id,
      gateway: { createRefund: async () => { throw Object.assign(new Error('x'.repeat(600)), { status: 400 }) } },
      db: longMessage,
    }))
    assert.equal(longMessage.row.failureDescription.length, 500)
  })
  test('an in-progress refund without a provider ID is retried with its stable identity', async () => {
    const db = paymentDb(basePayment({ status: 'refund_pending', razorpayPaymentId: 'pay_1' })); let calls = 0
    const result = await refundPayment({ paymentId: db.row.id,
      gateway: { createRefund: async () => { calls++; return { id: 'rfnd_1' } } }, db })
    assert.equal(calls, 1); assert.equal(result.refundId, 'rfnd_1')
  })

  test('scheduled cancellation partially refunds only the advance balance', async () => {
    const db = paymentDb(basePayment({
      purpose: 'scheduled_ride_advance', status: 'captured', amount: 15000,
      razorpayPaymentId: 'pay_advance', cancellationRefundAmount: null,
    }))
    let input
    const result = await refundScheduledCancellationAdvance({
      paymentId: db.row.id,
      amount: 5000,
      db,
      gateway: { createRefund: async (_paymentId, options) => { input = options; return { id: 'rfnd_partial' } } },
    })
    assert.equal(result.status, 'partial_refund_pending')
    assert.equal(db.row.cancellationRefundAmount, 5000)
    assert.equal(db.row.razorpayRefundId, 'rfnd_partial')
    assert.equal(input.amount, 5000)
    assert.equal(input.idempotencyKey, `scheduled-cancellation:${db.row.id}:5000`)
    assert.deepEqual(input.notes, {
      reason: 'scheduled_cancellation_partial_refund',
      internal_payment_id: db.row.id,
      refund_request_key: `scheduled-cancellation:${db.row.id}:5000`,
    })
    assert.deepEqual(db.calls.updateMany[0].where, {
      id: db.row.id, status: 'captured', cancellationRefundAmount: null, razorpayRefundId: null,
    })
    assert.equal(db.calls.updateMany[0].data.refundOperationStatus, 'requested')
    assert.equal(db.calls.findUnique.length, 2)
  })

  test('scheduled partial refund validates payment, amount, and captured provider state', async () => {
    await assert.rejects(refundScheduledCancellationAdvance({
      paymentId: 'missing', amount: 1, db: paymentDb(), gateway: {},
    }), error => error.code === 'PAYMENT_NOT_FOUND' && error.message === 'Scheduled advance payment not found')
    const payment = overrides => paymentDb(basePayment({
      purpose: 'scheduled_ride_advance', status: 'captured', amount: 15000,
      razorpayPaymentId: 'pay_advance', ...overrides,
    }))
    for (const amount of [0, 15000, 1.5]) {
      const db = payment()
      await assert.rejects(refundScheduledCancellationAdvance({ paymentId: db.row.id, amount, db, gateway: {} }),
        error => error.code === 'INVALID_REFUND_AMOUNT' && error.message === 'Cancellation refund must be a partial amount in paise')
    }
    for (const overrides of [{ status: 'created' }, { razorpayPaymentId: null }]) {
      const db = payment(overrides)
      await assert.rejects(refundScheduledCancellationAdvance({
        paymentId: db.row.id, amount: 5000, db, gateway: {},
      }), error => error.code === 'REFUND_NOT_ALLOWED' && error.message === 'Only a captured scheduled advance can be partially refunded')
    }
    const wrongPurpose = payment({ purpose: 'ride_final' })
    await assert.rejects(refundScheduledCancellationAdvance({
      paymentId: wrongPurpose.row.id, amount: 5000, db: wrongPurpose, gateway: {},
    }), error => error.code === 'PAYMENT_NOT_FOUND')
  })

  test('an in-progress scheduled cancellation refund is reconciled with the same request key', async () => {
    const db = paymentDb(basePayment({
      purpose: 'scheduled_ride_advance', status: 'captured', amount: 15000,
      razorpayPaymentId: 'pay_advance', cancellationRefundAmount: 5000,
    }))
    let calls = 0
    const result = await refundScheduledCancellationAdvance({
      paymentId: db.row.id, amount: 5000, db,
      gateway: { createRefund: async () => { calls++; return { id: 'rfnd_existing' } } },
    })
    assert.equal(calls, 1)
    assert.equal(result.refundId, 'rfnd_existing')
    assert.deepEqual(db.calls.updateMany[0].where, {
      id: db.row.id, cancellationRefundAmount: 5000, refundRequestKey: null,
    })
    assert.equal(db.calls.updateMany[0].data.refundOperationStatus, 'requested')
    assert.equal(db.row.refundRequestKey, `scheduled-cancellation:${db.row.id}:5000`)
    assert.equal(db.row.refundOperationStatus, 'provider_identified')
    assert.equal(db.calls.findUnique.length, 2)
  })

  test('scheduled cancellation rejects a different refund amount after settlement starts', async () => {
    const db = paymentDb(basePayment({
      purpose: 'scheduled_ride_advance', status: 'captured', amount: 15000,
      razorpayPaymentId: 'pay_advance', cancellationRefundAmount: 5000,
    }))
    await assert.rejects(
      refundScheduledCancellationAdvance({ paymentId: db.row.id, amount: 6000, db, gateway: {} }),
      error => error.code === 'REFUND_AMOUNT_MISMATCH' && error.message === 'Cancellation refund amount does not match the existing settlement',
    )
  })

  test('scheduled cancellation rejects a conflicting durable refund identity', async () => {
    const db = paymentDb(basePayment({
      purpose: 'scheduled_ride_advance', status: 'captured', amount: 15000,
      razorpayPaymentId: 'pay_advance', cancellationRefundAmount: 5000,
      refundRequestKey: 'wrong-key', refundRequestedAmount: 5000,
    }))
    await assert.rejects(refundScheduledCancellationAdvance({
      paymentId: db.row.id, amount: 5000, db, gateway: {},
    }), error => error.code === 'REFUND_AMOUNT_MISMATCH'
      && error.message === 'Cancellation refund does not match the existing operation')

    const sameKeyWrongAmount = paymentDb(basePayment({
      purpose: 'scheduled_ride_advance', status: 'captured', amount: 15000,
      razorpayPaymentId: 'pay_advance', cancellationRefundAmount: 5000,
      refundRequestKey: `scheduled-cancellation:${basePayment().id}:5000`, refundRequestedAmount: 4000,
    }))
    await assert.rejects(refundScheduledCancellationAdvance({
      paymentId: sameKeyWrongAmount.row.id, amount: 5000, db: sameKeyWrongAmount, gateway: {},
    }), error => error.code === 'REFUND_AMOUNT_MISMATCH')
  })

  test('scheduled cancellation reuses an established matching operation without rewriting it', async () => {
    const requestKey = `scheduled-cancellation:${basePayment().id}:5000`
    const db = paymentDb(basePayment({
      purpose: 'scheduled_ride_advance', status: 'captured', amount: 15000,
      razorpayPaymentId: 'pay_advance', cancellationRefundAmount: 5000,
      refundRequestKey: requestKey, refundRequestedAmount: 5000,
    }))
    await refundScheduledCancellationAdvance({
      paymentId: db.row.id, amount: 5000, db,
      gateway: { createRefund: async () => ({ id: 'rfnd_established' }) },
    })
    assert.equal(db.calls.updateMany.some(call => Object.hasOwn(call.where, 'cancellationRefundAmount')), false)
    assert.equal(db.row.refundRequestKey, requestKey)
  })

  test('driver debt excess uses one durable partial-refund operation', async () => {
    const db = paymentDb(basePayment({
      purpose: 'driver_debt_settlement', status: 'captured', amount: 10000,
      razorpayPaymentId: 'pay_debt', driverDebtRefundAmount: 3000,
    }))
    let input
    const gateway = { createRefund: async (_paymentId, options) => {
      input = options
      return { id: 'rfnd_debt' }
    } }
    const first = await refundDriverDebtExcess({ paymentId: db.row.id, amount: 3000, gateway, db })
    const retry = await refundDriverDebtExcess({ paymentId: db.row.id, amount: 3000, gateway, db })
    assert.equal(first.refundId, 'rfnd_debt')
    assert.equal(retry.alreadyApplied, true)
    assert.equal(input.idempotencyKey, `driver-debt-excess:${db.row.id}`); assert.equal(db.calls.updateMany[0].data.refundOperationStatus, 'requested')
  })

  test('driver debt excess validates ownership, captured state, amount, and operation identity', async () => {
    await assert.rejects(refundDriverDebtExcess({ paymentId: 'missing', db: paymentDb(), gateway: {} }),
      error => error.code === 'PAYMENT_NOT_FOUND' && error.message === 'Driver debt payment not found')
    const uncaptured = paymentDb(basePayment({ purpose: 'driver_debt_settlement' }))
    await assert.rejects(refundDriverDebtExcess({ paymentId: uncaptured.row.id, amount: 1, db: uncaptured, gateway: {} }),
      error => error.code === 'REFUND_NOT_ALLOWED' && error.message === 'Only a captured debt payment can return excess funds')
    const invalid = paymentDb(basePayment({
      purpose: 'driver_debt_settlement', status: 'captured', amount: 10000,
      razorpayPaymentId: 'pay_debt', driverDebtRefundAmount: 3000,
    }))
    await assert.rejects(refundDriverDebtExcess({ paymentId: invalid.row.id, amount: 3001, db: invalid, gateway: {} }),
      error => error.code === 'INVALID_REFUND_AMOUNT' && error.message === 'Debt-payment refund amount does not match the captured excess')
    const conflict = paymentDb(basePayment({
      purpose: 'driver_debt_settlement', status: 'captured', amount: 10000,
      razorpayPaymentId: 'pay_debt', driverDebtRefundAmount: 3000,
      refundRequestKey: 'wrong-key', refundRequestedAmount: 3000,
    }))
    await assert.rejects(refundDriverDebtExcess({ paymentId: conflict.row.id, amount: 3000, db: conflict, gateway: {} }),
      error => error.code === 'REFUND_AMOUNT_MISMATCH' && error.message === 'Debt refund does not match the existing operation')

    const wrongPurpose = paymentDb(basePayment({ status: 'captured', razorpayPaymentId: 'pay_1' }))
    await assert.rejects(refundDriverDebtExcess({
      paymentId: wrongPurpose.row.id, amount: 1, db: wrongPurpose, gateway: {},
    }), error => error.code === 'PAYMENT_NOT_FOUND')

    for (const overrides of [
      { status: 'created', razorpayPaymentId: 'pay_debt' },
      { status: 'captured', razorpayPaymentId: null },
    ]) {
      const db = paymentDb(basePayment({ purpose: 'driver_debt_settlement', ...overrides }))
      await assert.rejects(refundDriverDebtExcess({
        paymentId: db.row.id, amount: 1, db, gateway: {},
      }), error => error.code === 'REFUND_NOT_ALLOWED')
    }

    for (const amount of [0, 1.5, 10001, 3001]) {
      const db = paymentDb(basePayment({
        purpose: 'driver_debt_settlement', status: 'captured', amount: 10000,
        razorpayPaymentId: 'pay_debt', driverDebtRefundAmount: 3000,
      }))
      await assert.rejects(refundDriverDebtExcess({
        paymentId: db.row.id, amount, db, gateway: {},
      }), error => error.code === 'INVALID_REFUND_AMOUNT')
    }

    for (const amount of [-1, 0, 1.5, 10001]) {
      const db = paymentDb(basePayment({
        purpose: 'driver_debt_settlement', status: 'captured', amount: 10000,
        razorpayPaymentId: 'pay_debt', driverDebtRefundAmount: amount,
      }))
      await assert.rejects(refundDriverDebtExcess({
        paymentId: db.row.id, amount, db, gateway: {},
      }), error => error.code === 'INVALID_REFUND_AMOUNT')
    }

    const sameKeyWrongAmount = paymentDb(basePayment({
      purpose: 'driver_debt_settlement', status: 'captured', amount: 10000,
      razorpayPaymentId: 'pay_debt', driverDebtRefundAmount: 3000,
      refundRequestKey: `driver-debt-excess:${basePayment().id}`, refundRequestedAmount: 2000,
    }))
    await assert.rejects(refundDriverDebtExcess({
      paymentId: sameKeyWrongAmount.row.id, amount: 3000, db: sameKeyWrongAmount, gateway: {},
    }), error => error.code === 'REFUND_AMOUNT_MISMATCH')
  })

  test('driver debt refund supports exact durable retries and the authoritative full amount', async () => {
    const requestKey = `driver-debt-excess:${basePayment().id}`
    const retry = paymentDb(basePayment({
      purpose: 'driver_debt_settlement', status: 'captured', amount: 10000,
      razorpayPaymentId: 'pay_debt', driverDebtRefundAmount: 3000,
      refundRequestKey: requestKey, refundRequestedAmount: 3000,
    }))
    assert.equal((await refundDriverDebtExcess({
      paymentId: retry.row.id, amount: 3000, db: retry,
      gateway: { createRefund: async () => ({ id: 'rfnd_retry' }) },
    })).refundId, 'rfnd_retry')
    assert.deepEqual(retry.calls.findUnique[0], { where: { id: retry.row.id } })
    assert.equal(retry.calls.updateMany.some(call => (
      call.where.id === retry.row.id && call.where.refundRequestKey === null
    )), false)

    const full = paymentDb(basePayment({
      purpose: 'driver_debt_settlement', status: 'captured', amount: 10000,
      razorpayPaymentId: 'pay_debt', driverDebtRefundAmount: 10000,
    }))
    assert.equal((await refundDriverDebtExcess({
      paymentId: full.row.id, amount: 10000, db: full,
      gateway: { createRefund: async () => ({ id: 'rfnd_full' }) },
    })).refundId, 'rfnd_full')
    assert.equal(full.row.refundRequestKey, full.row.id)
    assert.deepEqual(full.calls.updateMany[0].where, { id: full.row.id, refundRequestKey: null })
  })

  test('scheduled cancellation detects a competing settlement claim', async () => {
    const db = paymentDb(basePayment({
      purpose: 'scheduled_ride_advance', status: 'captured', amount: 15000,
      razorpayPaymentId: 'pay_advance', cancellationRefundAmount: null,
    }))
    const updateMany = db.payment.updateMany
    const findUnique = db.payment.findUnique
    let competingFind
    db.payment.findUnique = async input => {
      competingFind = input
      return findUnique(input)
    }
    db.payment.updateMany = async input => {
      if (Object.hasOwn(input.where, 'cancellationRefundAmount')) return { count: 0 }
      return updateMany(input)
    }
    await assert.rejects(refundScheduledCancellationAdvance({
      paymentId: db.row.id, amount: 5000, db, gateway: {},
    }), error => error.code === 'REFUND_BUSY' && error.message === 'Cancellation refund is already being settled')
    assert.deepEqual(competingFind, { where: { id: db.row.id } })
  })

  test('scheduled cancellation fails closed if a competing claim disappears', async () => {
    const db = paymentDb(basePayment({
      purpose: 'scheduled_ride_advance', status: 'captured', amount: 15000,
      razorpayPaymentId: 'pay_advance', cancellationRefundAmount: null,
    }))
    const findUnique = db.payment.findUnique
    let finds = 0
    db.payment.findUnique = async input => (++finds === 1 ? findUnique(input) : null)
    db.payment.updateMany = async input => Object.hasOwn(input.where, 'cancellationRefundAmount')
      ? { count: 0 }
      : { count: 1 }
    await assert.rejects(refundScheduledCancellationAdvance({
      paymentId: db.row.id, amount: 5000, db, gateway: {},
    }), error => error.code === 'REFUND_BUSY')
  })

  test('scheduled cancellation joins a concurrent claim for the same amount', async () => {
    const db = paymentDb(basePayment({
      purpose: 'scheduled_ride_advance', status: 'captured', amount: 15000,
      razorpayPaymentId: 'pay_advance', cancellationRefundAmount: null,
    }))
    const updateMany = db.payment.updateMany
    db.payment.updateMany = async input => {
      if (Object.hasOwn(input.where, 'cancellationRefundAmount')) {
        await db.payment.update({ data: {
          cancellationRefundAmount: 5000,
          refundRequestKey: `scheduled-cancellation:${db.row.id}:5000`,
          refundRequestedAmount: 5000,
        } })
        return { count: 0 }
      }
      return updateMany(input)
    }
    const result = await refundScheduledCancellationAdvance({
      paymentId: db.row.id, amount: 5000, db,
      gateway: { createRefund: async () => ({ id: 'rfnd_joined' }) },
    })
    assert.equal(result.refundId, 'rfnd_joined')
  })

  test('processed partial refund response reports completed provider state', async () => {
    const db = paymentDb(basePayment({
      purpose: 'scheduled_ride_advance', status: 'captured', amount: 15000,
      razorpayPaymentId: 'pay_advance', cancellationRefundAmount: null,
    }))
    const result = await refundScheduledCancellationAdvance({
      paymentId: db.row.id, amount: 5000, db,
      gateway: { createRefund: async () => ({
        id: 'rfnd_processed', payment_id: 'pay_advance', amount: 5000, currency: 'INR', status: 'processed',
      }) },
    })
    assert.equal(result.status, 'partially_refunded')
    assert.equal(db.row.refundOperationStatus, 'succeeded')
  })
})
