const RAZORPAYX_KEYS = ['RAZORPAYX_KEY_ID', 'RAZORPAYX_KEY_SECRET', 'RAZORPAYX_ACCOUNT_NUMBER']

export function getRazorpayXConfig(env = process.env) {
  const missing = RAZORPAYX_KEYS.filter((key) => !env[key]?.trim())
  if (missing.length) throw new Error(`RazorpayX configuration missing: ${missing.join(', ')}`)
  return {
    keyId: env.RAZORPAYX_KEY_ID.trim(),
    keySecret: env.RAZORPAYX_KEY_SECRET.trim(),
    accountNumber: env.RAZORPAYX_ACCOUNT_NUMBER.trim(),
  }
}

export const safeRazorpayXConfig = (config) => ({
  keyId: config.keyId,
  accountNumber: config.accountNumber,
})
