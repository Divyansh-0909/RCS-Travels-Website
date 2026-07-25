import rateLimit from 'express-rate-limit'

// These endpoints cannot require auth — a rider sees fares and types addresses
// before logging in — so per-IP throttling is the only front-line defence.
//
// The limits are deliberately loose. Campus users sit behind one NAT'd public
// IP, so a tight per-IP cap would throttle the whole university at once. These
// exist to stop a script hammering the proxy; the real ceiling is the monthly
// cap in services/apiUsage.js, which bounds the bill regardless of source.
//
// NOTE: on Render this only works with `app.set('trust proxy', 1)` — without it
// every request appears to come from the load balancer and one caller would
// exhaust the limit for everybody.
const shared = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down and try again in a few minutes.' },
}

// Autocomplete fires on a debounced keystroke across two address fields, so one
// genuine booking is easily a dozen calls before anyone has picked anything.
export const googleApiLimiter = rateLimit({
  ...shared,
  windowMs: 15 * 60 * 1000,
  limit: 300,
})

// One estimate per vehicle-type change, plus a refresh after the pin confirm and
// another if the safer-route toggle flips.
export const fareLimiter = rateLimit({
  ...shared,
  windowMs: 15 * 60 * 1000,
  limit: 100,
})
