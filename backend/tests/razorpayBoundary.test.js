import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { getRazorpayConfig, getRazorpayWebhookSecret, safeRazorpayConfig } from '../config/razorpay.js'
import { createRazorpayGateway, createRazorpayWebhookVerifier, verifyPaymentSignature, verifyWebhookSignature } from '../services/razorpay.js'

describe('Razorpay configuration', () => {
  test('missing Checkout credentials fail clearly', () => assert.throws(() => getRazorpayConfig({}), /RAZORPAY_KEY_ID.*RAZORPAY_KEY_SECRET/))
  test('Checkout does not require an unrelated webhook secret', () => assert.deepEqual(
    getRazorpayConfig({ RAZORPAY_KEY_ID: 'public', RAZORPAY_KEY_SECRET: 'secret' }),
    { keyId: 'public', keySecret: 'secret' },
  ))
  test('the webhook secret is required only by webhook verification', () => {
    assert.throws(() => getRazorpayWebhookSecret({}), /RAZORPAY_WEBHOOK_SECRET/)
    assert.equal(getRazorpayWebhookSecret({ RAZORPAY_WEBHOOK_SECRET: 'hook' }), 'hook')
  })
  test('only the public key is safe for Checkout', () => assert.deepEqual(
    safeRazorpayConfig({ keyId: 'public', keySecret: 'secret' }),
    { keyId: 'public' },
  ))
})

describe('Razorpay signatures', () => {
  const secret = 'top-secret'
  test('accepts a valid Checkout signature', () => {
    const signature = createHmac('sha256', secret).update('order_1|pay_1').digest('hex')
    assert.equal(verifyPaymentSignature({ orderId: 'order_1', paymentId: 'pay_1', signature, secret }), true)
  })
  test('rejects invalid and malformed Checkout signatures', () => {
    assert.equal(verifyPaymentSignature({ orderId: 'order_1', paymentId: 'pay_1', signature: '0'.repeat(64), secret }), false)
    assert.equal(verifyPaymentSignature({ orderId: 'order_1', paymentId: 'pay_1', signature: 'bad', secret }), false)
    assert.equal(verifyPaymentSignature({ orderId: '', paymentId: 'pay_1', signature: 'bad', secret }), false)
    assert.equal(verifyPaymentSignature({ orderId: 'order_1', paymentId: '', signature: 'bad', secret }), false)
  })
  test('verifies the raw webhook bytes', () => {
    const rawBody = Buffer.from('{"event":"payment.captured"}')
    const signature = createHmac('sha256', secret).update(rawBody).digest('hex')
    assert.equal(verifyWebhookSignature({ rawBody, signature, secret }), true)
    assert.equal(verifyWebhookSignature({ rawBody: Buffer.from('{}'), signature, secret }), false)
    assert.equal(verifyWebhookSignature({ rawBody: '{}', signature, secret }), false)
  })
  test('creates the SDK gateway from explicit test credentials without a network call', () => {
    const gateway = createRazorpayGateway({ config: { keyId: 'test_public', keySecret: 'test_secret' } })
    assert.equal(gateway.keyId, 'test_public')
    assert.equal(typeof gateway.createOrder, 'function')
    const signature = createHmac('sha256', 'test_secret').update('order_1|pay_1').digest('hex')
    assert.equal(gateway.verifyPaymentSignature({ orderId: 'order_1', paymentId: 'pay_1', signature }), true)
  })
  test('webhook verification does not require Checkout API credentials', () => {
    const rawBody = Buffer.from('{"event":"payment.captured"}')
    const signature = createHmac('sha256', secret).update(rawBody).digest('hex')
    const verifier = createRazorpayWebhookVerifier({ secret })
    assert.equal(verifier.verifyWebhookSignature(rawBody, signature), true)
  })
})
