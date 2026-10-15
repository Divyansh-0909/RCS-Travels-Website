import test from 'node:test'
import assert from 'node:assert/strict'
import { inspect } from 'node:util'
import axios from 'axios'
import { createRazorpayGateway } from '../services/razorpay.js'

const config = { keyId: 'synthetic-id', keySecret: 'synthetic-secret' }

test('the refund transport sends a stable idempotency header and bounded timeout', async t => {
  let captured
  t.mock.method(axios, 'create', options => {
    assert.equal(options.timeout, 10000)
    return { post: async (...args) => { captured = args; return { data: { id: 'test-refund' } } } }
  })
  const gateway = createRazorpayGateway({ config, client: {} })
  assert.deepEqual(await gateway.createRefund('pay_test', { amount: 100, idempotencyKey: 'stable-payment-id' }), { id: 'test-refund' })
  assert.deepEqual(captured, ['/payments/pay_test/refund', { amount: 100 }, { headers: { 'X-Refund-Idempotency': 'stable-payment-id' } }])
})

test('refund transport errors cannot expose Basic-auth credentials to loggers', async t => {
  t.mock.method(axios, 'create', () => ({ post: async () => {
    throw Object.assign(new Error('provider failure'), { config: { auth: { password: config.keySecret } } })
  } }))
  const gateway = createRazorpayGateway({ config, client: {} })
  await assert.rejects(gateway.createRefund('pay_test', { amount: 100, idempotencyKey: 'stable-payment-id' }), error => {
    assert.equal(error.code, 'REFUND_GATEWAY_ERROR')
    assert(!inspect(error).includes(config.keySecret))
    assert.equal(error.cause, undefined)
    return true
  })
})

test('gateway reconciles orders by receipt and refunds by payment without network fallbacks', async t => {
  const calls = []
  t.mock.method(axios, 'create', () => ({
    get: async (...args) => {
      calls.push(args)
      return { data: { items: [{ id: 'rfnd_test' }] } }
    },
  }))
  const client = {
    orders: {
      create: async input => ({ id: 'order_created', ...input }),
      all: async input => ({ items: [{ id: 'order_found', ...input }] }),
    },
    payments: { fetch: async id => ({ id }) },
  }
  const gateway = createRazorpayGateway({ config, client })

  assert.equal((await gateway.createOrder({ amount: 100, currency: 'INR' })).id, 'order_created')
  assert.deepEqual(await gateway.findOrdersByReceipt('receipt-1'), [{
    id: 'order_found', receipt: 'receipt-1', count: 100,
  }])
  assert.deepEqual(await gateway.fetchPayment('pay_test'), { id: 'pay_test' })
  assert.deepEqual(await gateway.findRefundsByPayment('pay/test'), [{ id: 'rfnd_test' }])
  assert.deepEqual(calls, [['/payments/pay%2Ftest/refunds', { params: { count: 100 } }]])
})

test('gateway uses empty reconciliation lists and sanitizes refund-list failures', async t => {
  let fail = false
  t.mock.method(axios, 'create', () => ({
    get: async () => {
      if (fail) throw new Error('secret transport details')
      return { data: {} }
    },
  }))
  const gateway = createRazorpayGateway({
    config,
    client: { orders: { all: async () => ({}) }, payments: {} },
  })
  assert.deepEqual(await gateway.findOrdersByReceipt('missing'), [])
  assert.deepEqual(await gateway.findRefundsByPayment('pay_test'), [])
  fail = true
  await assert.rejects(gateway.findRefundsByPayment('pay_test'), error => (
    error.code === 'REFUND_RECONCILIATION_FAILED'
    && error.message === 'Payment refunds could not be reconciled'
    && !error.message.includes('secret transport details')
  ))
})
