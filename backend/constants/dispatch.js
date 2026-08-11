// Scheduled-ride dispatch windows. One exported constant each — these numbers
// appear in driver-app copy and in the WhatsApp templates too, and six literals
// is how they drift apart.

/**
 * The owner-first hold on a scheduled booking. Raju is the only driver offered
 * the ride for this long, measured from booking confirmation.
 *
 * 15 min when the pickup is close, 45 when it is further out: a ride two hours
 * away cannot afford to sit unoffered for 45 minutes, and a ride two days away
 * loses nothing by it.
 *
 * RAJU'S NUMBER, 8 Aug 2026. It supersedes BOTH earlier figures — the 15/30 in
 * driver-assignment.txt and the 15/60 in ROADMAP block 3 — which is what open
 * question (g) was about. Do not "restore" either one.
 */
export const OWNER_HOLD_NEAR_MIN = 15
export const OWNER_HOLD_FAR_MIN = 45

/** Pickup closer than this counts as "near" for the hold above. */
export const OWNER_HOLD_NEAR_THRESHOLD_H = 2

/** @param {Date} scheduledAt @param {Date} from @returns {number} minutes */
export function ownerHoldMinutes(scheduledAt, from = new Date()) {
  const hoursAway = (scheduledAt.getTime() - from.getTime()) / (60 * 60 * 1000)
  return hoursAway <= OWNER_HOLD_NEAR_THRESHOLD_H ? OWNER_HOLD_NEAR_MIN : OWNER_HOLD_FAR_MIN
}

/**
 * Which priority group a scheduled booking may be offered to right now.
 *
 * The hold is the ONLY time-based gate. After it expires the ride opens to the
 * fleet, and it reaches partner drivers when every `rcs` offer has come back
 * rejected — not on a second timer. An unanswered offer is not a rejection: the
 * spec keeps it sitting on the driver's notification page, so escalating past it
 * on a clock would hand the ride away while a driver is still deciding.
 *
 * @param {{ confirmedAt: Date | null, scheduledAt: Date }} booking
 * @param {{ rcsOffered: number, rcsRejected: number }} offers
 * @returns {'admin' | 'rcs' | 'partner'}
 */
export function eligibleGroup(booking, offers, now = new Date()) {
  const clockStart = booking.confirmedAt ?? booking.scheduledAt
  const holdEndsAt = new Date(clockStart.getTime() + ownerHoldMinutes(booking.scheduledAt, clockStart) * 60 * 1000)

  if (now < holdEndsAt) return 'admin'

  // Nobody in the fleet has been asked yet, or somebody asked is still thinking.
  if (offers.rcsOffered === 0 || offers.rcsRejected < offers.rcsOffered) return 'rcs'

  return 'partner'
}

/**
 * How far ahead the sweep looks for bookings to fill.
 *
 * Was 12 hours, which is ~12x the spec and meant a ride booked half a day out
 * got a full driver sweep every 5 minutes for nothing. Offers are persisted now,
 * so a wider window is cheap — the sweep skips drivers who already hold an offer
 * — but there is still no reason to open a day-away ride to the whole fleet
 * before the owner hold has even started running.
 */
export const ASSIGNMENT_HORIZON_H = 6

/** The sweep interval, and the retry cadence the spec asks for. */
export const SWEEP_INTERVAL_MS = 5 * 60 * 1000

/** When to WhatsApp Raju that a booking is still unfilled. Once, not per sweep. */
export const ADMIN_ALERT_LEAD_MS = 60 * 60 * 1000
