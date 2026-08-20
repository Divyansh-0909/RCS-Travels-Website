const REQUIRED_KEYS = ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET']

export function getRazorpayConfig(env = process.env) {
  const missing = REQUIRED_KEYS.filter((key) => !env[key]?.trim())
  if (missing.length) throw new Error(`Razorpay configuration missing: ${missing.join(', ')}`)
  return {
    keyId: env.RAZORPAY_KEY_ID,
    keySecret: env.RAZORPAY_KEY_SECRET,
    webhookSecret: env.RAZORPAY_WEBHOOK_SECRET,
  }
}

export const safeRazorpayConfig = (config) => ({ keyId: config.keyId })
