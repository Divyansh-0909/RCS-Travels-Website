import { randomBytes } from 'node:crypto'

/**
 * How long a share link answers for, from the moment it is minted.
 *
 * Twelve hours, which is not a guess about how long a ride takes — the longest
 * outstation trip on the fare sheet is a fraction of it. It is how long the
 * person on the other end might reasonably still care: a rider shares a late
 * ride, the friend watching falls asleep, and opening the link in the morning
 * should still say how it ended rather than nothing at all.
 *
 * It is a ceiling, not the whole rule. The public route stops serving positions
 * the moment the ride reaches a terminal status — see routes/share.js — so a
 * completed trip's remaining hours show an outcome, never a live car.
 */
export const SHARE_TTL_MS = 12 * 60 * 60 * 1000

/**
 * 128 bits from the CSPRNG, base64url so it survives being pasted into a chat
 * without escaping. Not a uuid: uuidv4 spends six of its bits on version and
 * variant tags and prints 36 characters to carry 122 bits, and this ends up in a
 * URL a person forwards by hand.
 *
 * The length is the whole security of the link — there is no second factor
 * behind it — so this must never be narrowed, and never derived from anything
 * about the booking. A token that encodes the ride is a token an attacker can
 * construct.
 */
export const newShareToken = () => randomBytes(16).toString('base64url')

/**
 * Whether a booking's share link is currently live.
 *
 * Both halves are required: a row can hold a token with a past expiry (a share
 * that lapsed) and, if a future migration ever clears one column without the
 * other, a expiry with no token. Neither is a working link.
 *
 * @param {{ shareToken: string | null, shareExpiresAt: Date | null }} booking
 */
export const shareIsLive = (booking) =>
  !!booking.shareToken && !!booking.shareExpiresAt && booking.shareExpiresAt.getTime() > Date.now()

/**
 * The URL a rider actually sends someone.
 *
 * Built from APP_ORIGIN rather than from the request, because the request that
 * mints a link comes from the API's own host and the link has to point at the
 * front end. Falls back to the local Vite port so dev needs no configuration,
 * matching how CORS_ORIGINS is handled in index.js.
 */
export const shareUrlFor = (token) =>
  `${(process.env.APP_ORIGIN ?? 'http://localhost:1574').replace(/\/+$/, '')}/t/${token}`

// Where a shared trip stops being live. Past these there is nothing to follow,
// and the page shows how it ended instead of a car on a map.
export const TERMINAL_STATUSES = ['completed', 'cancelled', 'no_driver']

/**
 * EVERYTHING A SHARE LINK IS ALLOWED TO REVEAL, and nothing else.
 *
 * Pure, and separated from the route on purpose: this is the one function in the
 * codebase whose output goes to an unauthenticated stranger, so what it omits is
 * a security property rather than a formatting choice — and a property worth
 * being able to assert in a test that needs no database. tests/shareLink.test.js
 * is that test; if you add a field here, add the assertion there.
 *
 * WHAT IT DELIBERATELY DOES NOT RETURN, each for its own reason:
 *
 *   phone numbers      Neither the rider's nor the driver's. The rider's is what
 *                      the link is protecting; the driver's is HIS personal
 *                      number, and he never agreed to have it forwarded around a
 *                      group chat because someone took a taxi.
 *   bookingCode        It is the OTP the driver checks before starting the ride,
 *                      and it is per-ACCOUNT and permanent — see the schema. A
 *                      stranger holding it could start a ride, and the rider
 *                      cannot change it.
 *   the fare           What someone paid is nobody's business but theirs.
 *   ids and reference  A booking id is the key the authenticated endpoints take.
 *                      Handing it out turns a share link into a starting point.
 *
 * @param {object} booking with `driver` and `user` included
 * @param {string | null} photoUrl already-signed, because signing is I/O and this
 *   is not
 */
export function sharedTripView(booking, photoUrl) {
  const ended = TERMINAL_STATUSES.includes(booking.status)

  // Once the ride has ended the driver's position stops being served at all — a
  // finished trip's live coordinates are the captain's whereabouts on his own
  // time, not a fact about this ride. His identity survives only on a COMPLETED
  // one, where it is the record of who drove; a cancelled ride has no driver
  // worth naming to a third party.
  const showDriver = !!booking.driver && (!ended || booking.status === 'completed')
  const location = ended ? null : booking.driver?.location

  return {
    status: booking.status,
    ended,
    // First name only. "Divyansh is on the way" is what the page is for; the
    // full name is identity, and the link already went to someone who knows them.
    riderName: booking.user?.name?.trim().split(/\s+/)[0] ?? null,
    pickupAddress: booking.pickupAddress,
    dropAddress:   booking.dropAddress,
    // The route the watcher is following. Coordinates rather than a polyline —
    // Booking stores no polyline, and the map draws a straight connector, which
    // is honest about being an overview rather than turn-by-turn.
    pickup: { lat: booking.pickupLat, lng: booking.pickupLng },
    drop:   { lat: booking.dropLat,   lng: booking.dropLng },
    scheduledAt: booking.scheduledAt ?? null,
    driver: showDriver
      ? {
          name:          booking.driver.name,
          vehicleNumber: booking.vehicleNumber ?? booking.driver.vehicleNumber,
          vehicleModel:  booking.vehicleModel,
          photoUrl:      photoUrl ?? null,
          latitude:      location?.latitude ?? null,
          longitude:     location?.longitude ?? null,
        }
      : null,
    expiresAt: booking.shareExpiresAt,
  }
}
