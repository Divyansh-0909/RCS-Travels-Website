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
