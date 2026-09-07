import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openRazorpayCheckout } from '../src/services/razorpayCheckout.js'

test('Checkout handles cancellation, failure and an in-modal retry', async () => {
  const instances = []
  globalThis.window = {
    Razorpay: class {
      constructor(options) { this.options = options; instances.push(this) }
      on(name, callback) { if (name === 'payment.failed') this.onFailed = callback }
      open() {}
    },
  }
  const checkout = { keyId: 'public', orderId: 'order_test', amount: 100, currency: 'INR' }

  const cancelled = openRazorpayCheckout(checkout)
  await new Promise(setImmediate)
  instances.at(-1).options.modal.ondismiss()
  await assert.rejects(cancelled, /Payment cancelled/)

  const failed = openRazorpayCheckout(checkout)
  await new Promise(setImmediate)
  instances.at(-1).onFailed({ error: { description: 'Card declined' } })
  instances.at(-1).options.modal.ondismiss()
  await assert.rejects(failed, /Card declined/)

  const retried = openRazorpayCheckout(checkout)
  await new Promise(setImmediate)
  instances.at(-1).onFailed({ error: { description: 'First attempt failed' } })
  instances.at(-1).options.handler({ razorpay_payment_id: 'pay_test' })
  assert.equal((await retried).razorpay_payment_id, 'pay_test')

  delete globalThis.window
})
