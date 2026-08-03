import { clerkMiddleware, getAuth } from '@clerk/express'

export const clerkAuth = clerkMiddleware()

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
export function protect(req, res, next) {
  const { userId } = getAuth(req)
  if (!userId) return res.status(401).json({ error: 'Sign in to continue', code: 'AUTH_REQUIRED' })
  next()
}

// getAuth(req) rather than req.auth.*: since @clerk/express 1.7 the request carries
// a Proxy over a function, and every property read on it logs a deprecation warning
// before falling through to the auth object. The values are the same; only this
// route into them is still supported. routes/driver.ts already reads it this way.
export function protectAdmin(req, res, next) {
  const { sessionClaims } = getAuth(req)
  if (sessionClaims?.metadata?.role !== 'admin') return res.status(403).json({ error: 'Admin access required' })
  next()
}
