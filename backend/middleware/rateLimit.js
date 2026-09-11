import crypto from 'crypto'
import rateLimit, { ipKeyGenerator } from 'express-rate-limit'
import { getAuth } from '@clerk/express'

// These are deliberately in-process counters. They provide useful best-effort
// protection on each instance; deploy a shared rate-limit store if a strict
// cross-instance quota is required.
const WINDOW_15_MINUTES = 15 * 60 * 1000

function rateLimitResponse(policy) {
  return (_req, res, _next, options) => {
    res.set('Cache-Control', 'no-store')
    res.status(options.statusCode).json({
      error: 'Too many requests. Please slow down and try again in a few minutes.',
      code: 'RATE_LIMITED',
      policy,
    })
  }
}

export function createLimiter({ policy, ...options }) {
  return rateLimit({
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: rateLimitResponse(policy),
    ...options,
  })
}

// ipKeyGenerator normalizes IPv6 addresses so a caller cannot acquire a new
// bucket merely by using another textual representation of the same address.
export const ipFallbackKey = req => `ip:${ipKeyGenerator(req.ip)}`

export function normalizedPhone(value) {
  if (typeof value !== 'string') return null
  const phone = value.replace(/[\s()+-]/g, '')
  return /^\d{10}$/.test(phone) ? phone : null
}

export function phoneKey(req) {
  const phone = normalizedPhone(req.body?.phone)
  if (!phone) return ipFallbackKey(req)
  return `phone:${crypto.createHash('sha256').update(phone).digest('hex')}`
}

export function identityKey(req, getUserId = request => getAuth(request).userId) {
  const userId = getUserId(req)
  return userId ? `user:${userId}` : ipFallbackKey(req)
}

const publicOptions = { windowMs: WINDOW_15_MINUTES, keyGenerator: ipFallbackKey }

// Riders see fares and type addresses before logging in, so these targeted public
// policies remain IP-based. Their independent limits account for campus NATs.
export const googleApiLimiter = createLimiter({ ...publicOptions, policy: 'google-api', limit: 300 })
export const fareLimiter = createLimiter({ ...publicOptions, policy: 'fare', limit: 150 })
export const shareLimiter = createLimiter({ ...publicOptions, policy: 'share', limit: 900 })
export const authLimiter = createLimiter({ ...publicOptions, policy: 'auth-ip', windowMs: 60 * 60 * 1000, limit: 60 })

export function createApiLimiters({ getUserId, readLimit = 1200, writeLimit = 120, locationLimit = 300 } = {}) {
  const keyGenerator = req => identityKey(req, getUserId)
  const isRead = req => req.method === 'GET' || req.method === 'HEAD'
  const isDriverLocation = req => {
    const pathname = req.originalUrl.split('?')[0]
    return pathname === '/api/driver/location' || pathname === '/api/driver/location/'
  }
  const isWrite = req => !isRead(req)

  return {
    read: createLimiter({ policy: 'api-read', windowMs: WINDOW_15_MINUTES, limit: readLimit, keyGenerator, skip: req => !isRead(req) }),
    write: createLimiter({ policy: 'api-write', windowMs: WINDOW_15_MINUTES, limit: writeLimit, keyGenerator,
      skip: req => !isWrite(req) || isDriverLocation(req) }),
    location: createLimiter({ policy: 'driver-location', windowMs: WINDOW_15_MINUTES, limit: locationLimit, keyGenerator,
      skip: req => !isWrite(req) || !isDriverLocation(req) }),
  }
}

export const apiLimiters = createApiLimiters()

export function createPaymentWriteLimiter({ getUserId, limit = 30 } = {}) {
  return createLimiter({
    policy: 'payment-write', windowMs: WINDOW_15_MINUTES, limit,
    keyGenerator: req => identityKey(req, getUserId),
    skip: req => req.method === 'GET' || req.method === 'HEAD',
  })
}

export const paymentWriteLimiter = createPaymentWriteLimiter()

export function createOtpLimiters({ sendLimit = 5, verifyLimit = 5 } = {}) {
  return {
    send: createLimiter({ policy: 'otp-send', windowMs: 60 * 60 * 1000, limit: sendLimit, keyGenerator: phoneKey }),
    // Successful codes do not consume the failed-attempt budget; the library
    // decrements their count when the response completes.
    verify: createLimiter({ policy: 'otp-verify-failed', windowMs: 5 * 60 * 1000, limit: verifyLimit,
      keyGenerator: phoneKey, skipSuccessfulRequests: true }),
  }
}

export const otpLimiters = createOtpLimiters()
