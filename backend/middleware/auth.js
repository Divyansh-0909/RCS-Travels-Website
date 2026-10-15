import { clerkMiddleware, clerkClient, getAuth } from '@clerk/express'
import { verifyLiveSession } from './liveSession.js'

const localParties = 'http://localhost:1574,http://127.0.0.1:1574,http://localhost:5173,http://127.0.0.1:5173'
export function createHumanClerkAuth(options) {
  const middleware = clerkMiddleware({ ...options, enableHandshake: false })
  return (req, res, next) => middleware(req, res, error => {
    if (!error) return next()
    // This SDK can throw SyntaxError while decoding malformed bearer tokens.
    if (error instanceof SyntaxError) return res.status(401).json({ error: 'Sign in to continue', code: 'AUTH_REQUIRED' })
    res.setHeader('Retry-After', '1')
    return res.status(503).json({ error: 'Authentication temporarily unavailable. Please retry.', code: 'AUTH_UNAVAILABLE' })
  })
}

export const clerkAuth = createHumanClerkAuth({
  authorizedParties: (process.env.CLERK_AUTHORIZED_PARTIES ?? process.env.CORS_ORIGINS ?? localParties).split(',').map(value => value.trim()),
  audience: process.env.CLERK_AUDIENCE,
})

// Router and route guards reuse only this request's result. Never cross requests.
const verified = new WeakSet()

// Deliberately not Clerk's own requireAuth(). That one answers an unauthenticated
// request with `res.redirect(signInUrl)` — a 302 to "/" unless CLERK_SIGN_IN_URL
// says otherwise — which is the right move for a rendered page and the wrong one
// for every route in this app. `fetch` follows redirects by default, so the
// browser re-requested "/" on the API, found no route there, and handed the caller
// Express's 404 HTML page. An expired session therefore surfaced as
// "Server error (404)" with no hint that signing in again was the fix.
//
// `code` is the machine-readable tag the client keys off (same contract as
// FARE_QUOTE): a 401 here means the session is gone, not that the request was bad.
export async function protect(req, res, next) {
  if (verified.has(req)) return next()
  let identity
  // Handshake/signed-out cookie states in this SDK can lack an Auth object.
  // They carry no verified human identity and must receive the same JSON 401.
  try { identity = getAuth(req) } catch { identity = {} }
  const result = await verifyLiveSession(identity, id => clerkClient.sessions.getSession(id))
  if (result !== 'active') {
    if (result === 'unavailable') {
      res.setHeader('Retry-After', '1')
      return res.status(503).json({ error: 'Authentication temporarily unavailable. Please retry.', code: 'AUTH_UNAVAILABLE' })
    }
    return res.status(401).json({ error: 'Sign in to continue', code: 'AUTH_REQUIRED' })
  }
  verified.add(req)
  return next()
}

// getAuth(req) rather than req.auth.*: since @clerk/express 1.7 the request carries
// a Proxy over a function, and every property read on it logs a deprecation warning
// before falling through to the auth object. The values are the same; only this
// route into them is still supported. routes/driver.ts already reads it this way.
export function protectAdmin(req, res, next) {
  return protect(req, res, () => {
    const { sessionClaims } = getAuth(req)
    if (sessionClaims.metadata?.role !== 'admin') return res.status(403).json({ error: 'Admin access required' })
    return next()
  })
}

// Public fare estimates authenticate only when claiming a private coupon.
export function protectCoupon(req, res, next) {
  return req.body?.couponId ? protect(req, res, next) : next()
}
