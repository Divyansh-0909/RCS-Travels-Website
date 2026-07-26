import rateLimit from 'express-rate-limit'

// Riders see fares and type addresses before logging in, so these endpoints can't
// require auth and per-IP throttling is the only front-line defence.
//
// Loose on purpose: campus sits behind one NAT'd IP, so a tight cap would throttle
// the whole university at once. These stop a script hammering the proxy; the spend
// ceiling is the per-key quota in Google Cloud Console (see routes/googleAPI.js).
//
// Needs `app.set('trust proxy', 1)` on Render, or every request looks like it came
// from the load balancer and one caller exhausts the limit for everyone.
const shared = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down and try again in a few minutes.' },
}

// One genuine booking is easily a dozen calls — autocomplete fires on debounced
// keystrokes across two address fields, before anyone has picked anything.
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
