import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

// ---------------------------------------------------------------------------
// A quote is the server's own estimate, handed to the rider signed.
//
// POST /api/bookings used to take `fare` off the request body and store it. A
// crafted POST could book any ride for ₹1 — the only check was "positive
// number", and the clamps on toll/carrier/airport bounded the commission
// deduction, not the fare itself.
//
// The fix has two shapes and this is the cheaper one. Recomputing the estimate
// at booking time spends a second Google Routes call on every booking (the free
// tier is 10k/month, hard-capped in rideEstimate.js) and re-prices the trip
// against traffic that has moved since the rider looked — quoting ₹430 and
// charging ₹470. Signing the estimate instead costs nothing per booking and
// charges exactly the number on screen, because it IS that number: the booking
// endpoint reads the fare out of the signature rather than out of the request.
//
// What that means for anything sent alongside it: a field the fare depends on
// is now read from the quote and IGNORED on the request. The client no longer
// gets a say in what a ride costs, only in which of the priced cards it wants.
// ---------------------------------------------------------------------------

// Every booking is preceded by a fresh estimate (VehicleSelect re-prices on the
// pin-confirm screen, seconds before it posts), so this window exists for the
// rider who leaves the tab open, not for the normal path. Long enough that no
// one hits it by pausing to think; short enough that a price can't be held
// while the rate card is edited underneath it.
const TTL_MS = 10 * 60 * 1000

// Signing key. Missing in production is fatal at boot rather than silently
// unsigned: a quote nobody signs is a fare the client gets to choose, which is
// the exact hole this file closes. Dev gets a per-process key instead of a
// config chore — quotes issued before a restart stop verifying, which reads as
// "price expired, refresh" and is harmless.
const SECRET = process.env.FARE_QUOTE_SECRET ?? (() => {
  if (process.env.NODE_ENV === 'production')
    throw new Error('FARE_QUOTE_SECRET is not set. Fare quotes cannot be signed, and an unsigned quote lets the client name its own fare.')
  console.warn('FARE_QUOTE_SECRET unset — signing fare quotes with a per-process key. Quotes do not survive a restart.')
  return randomBytes(32).toString('hex')
})()

const macOf = (body) => createHmac('sha256', SECRET).update(body).digest('base64url')

/**
 * Signs a priced estimate. Everything the booking endpoint will read back —
 * the fares, the route they were priced for, the options they were priced
 * under — has to be inside `payload`, because nothing outside it is trusted.
 */
export function signQuote(payload) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + TTL_MS })).toString('base64url')
  return `${body}.${macOf(body)}`
}

/**
 * @returns {{ quote: object } | { error: 'QUOTE_MISSING' | 'QUOTE_INVALID' | 'QUOTE_EXPIRED' }}
 */
export function verifyQuote(token) {
  if (typeof token !== 'string' || token === '') return { error: 'QUOTE_MISSING' }

  const [body, mac] = token.split('.')
  if (!body || !mac) return { error: 'QUOTE_INVALID' }

  // Constant-time, and length-checked first because timingSafeEqual throws on a
  // length mismatch rather than returning false.
  const expected = macOf(body)
  if (mac.length !== expected.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(expected)))
    return { error: 'QUOTE_INVALID' }

  let quote
  try {
    quote = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  } catch {
    return { error: 'QUOTE_INVALID' }
  }

  // Signed, so the timestamp is ours and can be believed.
  if (!(quote?.exp > Date.now())) return { error: 'QUOTE_EXPIRED' }

  return { quote }
}
