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

// Measured per booking: two address fields × ~6 debounced lookups (300ms debounce,
// 3-char minimum, repeat queries served from the client cache) + 2 place-details
// ≈ 15 calls. A Friday-evening peak of ~15 simultaneous bookers behind the campus
// IP ≈ 225 — 300 covers that with headroom while still stopping a scripted loop.
export const googleApiLimiter = rateLimit({
  ...shared,
  windowMs: 15 * 60 * 1000,
  limit: 300,
})

// Measured per booking: one estimate on address confirm, one per vehicle-class
// change (4 classes), plus carrier and safer-route toggles ≈ 8 calls. The same
// ~15-booker campus peak ≈ 120, so 150 leaves room without inviting abuse.
export const fareLimiter = rateLimit({
  ...shared,
  windowMs: 15 * 60 * 1000,
  limit: 150,
})

// The public share route, which is the only unauthenticated way to read a booking.
// Its token is 128 random bits, so this is not what stops guessing — nothing gets
// to guess a keyspace that size. It is here for the two things a limiter can
// actually do: cap what one address costs us in database round trips, and stop a
// scripted poll of a link that leaked from running hot forever.
//
// Sized off honest use: the page polls every 5s, so one watcher spends 12 requests
// a minute, 180 over the window. 900 leaves room for a handful of people following
// the same ride from one home or office NAT — and a phone that reloads a few times
// — while a script hammering the endpoint still hits the wall inside a minute.
export const shareLimiter = rateLimit({
  ...shared,
  windowMs: 15 * 60 * 1000,
  limit: 900,
})

// Login is once per device — Clerk sessions persist — so even a hostel IP rarely
// produces more than ~10 fresh logins an hour (each ≈ 2 sends + a few verify
// attempts). 60 absorbs that; the per-phone cooldown in /send-otp is what actually
// guards the WhatsApp spend (~₹0.115 per OTP), this just caps one IP's burn rate.
export const authLimiter = rateLimit({
  ...shared,
  windowMs: 60 * 60 * 1000,
  limit: 60,
})
