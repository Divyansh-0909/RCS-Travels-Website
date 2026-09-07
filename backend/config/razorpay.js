const CHECKOUT_KEYS = ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET']

export function getRazorpayConfig(env = process.env) {
  const missing = CHECKOUT_KEYS.filter((key) => !env[key]?.trim())
  if (missing.length) throw new Error(`Razorpay configuration missing: ${missing.join(', ')}`)
  return {
    keyId: env.RAZORPAY_KEY_ID,
    keySecret: env.RAZORPAY_KEY_SECRET,
  }
}

export function getRazorpayWebhookSecret(env = process.env) {
  const secret = env.RAZORPAY_WEBHOOK_SECRET?.trim()
  if (!secret) throw new Error('Razorpay configuration missing: RAZORPAY_WEBHOOK_SECRET')
  return secret
}

export const safeRazorpayConfig = (config) => ({ keyId: config.keyId })
