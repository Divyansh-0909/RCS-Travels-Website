import { decodePolyline, projectOntoPath } from './geo.js'
import { isNearCampus } from './fareZones.js'
import { routeSequence } from './rideEstimate.js'

// ---------------------------------------------------------------------------
// Deciding whether a new sharing request can be added to a trip a driver is
// already doing, and if so, in what order he should make the stops.
//
// The vocabulary throughout, and it is worth learning because every function
// here speaks it:
//
//   C   the driver's current position
//   P1  the HOST booking's pickup      D1  the host's drop
//   P2  the JOINER booking's pickup    D2  the joiner's drop
//
// "Host" and "joiner" are roles inside one matching attempt, not stored states.
// A joiner becomes a host the moment it is assigned, which is what lets a pool
// exist at all: the first sharing rider is seeded onto an idle car, and the
// second joins him. See Sharing-Design.md §2.
//
// WHAT THIS FILE DOES NOT DO: it does not choose a driver, offer anything, or
// write anything. It answers one question — "can this pair be driven together,
// and how?" — and driverAssignment.js decides what to do with the answer.
// ---------------------------------------------------------------------------

/**
 * How much later the host may reach his drop because somebody joined him.
 *
 * Measured on the host's TOTAL added time, from wherever the car is now: the
 * chosen sequence's arrival at D1, minus the arrival the host would have had if
 * nobody had joined. It is not a per-leg allowance and not a percentage — see
 * the note in Sharing-Design.md §10 on what a flat number means at the short
 * end, which is that a 15-minute cap is generous on a 45-minute run to Delhi and
 * enormous on a 12-minute local hop. Nearly every shared ride here is the former.
 */
export const MAX_HOST_DELAY_MIN = 15

/** How long the joiner may wait to be collected, wall-clock from right now. */
export const MAX_JOINER_WAIT_MIN = 15

/**
 * How far from the joiner's pickup a driver may be and still be considered as a
 * host, in km straight-line.
 *
 * A COARSE PREFILTER AND NOTHING MORE. MAX_JOINER_WAIT_MIN is the real gate, and
 * it is measured in routed minutes; this only exists so that dispatch does not
 * spend five routing calls proving that a car 30 km away is too far. It must
 * stay loose enough never to reject a candidate the wait cap would have
 * accepted — err wide, because a wrong rejection here is silent and a wrong
 * acceptance merely costs a call.
 *
 * Wider than the fleet's own 3 km spread on purpose: the fresh-driver rings
 * start at 20 km and this is not meant to mirror them, only to bound the pool
 * scan somewhere sane.
 */
export const POOL_RADIUS_KM = 8

/**
 * The cap on the TURN ITSELF when a pickup sits behind the car — the C → P2 leg
 * alone, not the whole detour.
 *
 * This is a separate filter rather than a smaller delay budget, and the
 * distinction is the point: a five-minute turnaround followed by a twenty-minute
 * detour passes this and is then rejected by MAX_HOST_DELAY_MIN. A cheap turn
 * does not buy an expensive trip. Both apply, independently.
 */
export const MAX_REVERSAL_LEG_MIN = 10

/**
 * How far from the host's route a pickup may sit and still count as "on it".
 *
 * Deliberately tighter than a bearing corridor. The question is whether the
 * pickup is on the ROAD the driver is already driving, not whether it lies in
 * the same general direction — a point 6 km off the expressway satisfies any
 * bearing test and is a 25-minute round trip.
 */
export const ON_ROUTE_TOLERANCE_KM = 1.0

/**
 * How much further along the route a pickup must project before it counts as
 * ahead of the car rather than level with it.
 *
 * Pure noise margin. A driver's fix is metres-accurate at best and the
 * projection quantises to the polyline's vertices, so without this a pickup the
 * car is drawing alongside would flip between "ahead" and "behind" between one
 * GPS heartbeat and the next — and with it, between allowed and reversing.
 */
export const MIN_FORWARD_KM = 0.3

/**
 * Below this many minutes from his drop, a driver is not worth planning into.
 *
 * The stop would land during the drop-off itself, which is navigational noise at
 * exactly the moment he is pulling over and settling up with a rider.
 */
export const NEARLY_DONE_MIN = 3

/**
 * Bookings a single vehicle may carry at once.
 *
 * TWO IS LOAD-BEARING, not a placeholder. At two, the legal stop orders number
 * four and this file enumerates them by hand; the stop sequence is fully
 * described by two integers on each booking; and the driver app can render a
 * fixed list. At three the orders grow past what hand-enumeration is honest
 * about and the Booking/Trip/Waypoint split becomes the right model instead.
 * Raising this number is a schema decision, not a constant change.
 */
export const MAX_BOOKINGS_PER_VEHICLE = 2

/** Statuses in which a driver is carrying work that a joiner would share. */
export const HOST_ACTIVE_STATUSES = ['assigned', 'en_route', 'reached', 'started']

/**
 * The statuses a host may be pooled into.
 *
 * `reached` is absent on purpose and is the one exclusion worth stating out
 * loud: the car is at the kerb and the rider is walking to it. Re-planning a
 * route at that instant is how a driver misses the turn he is already making,
 * and it is the moment a rider is least able to understand why the car moved.
 */
export const POOLABLE_HOST_STATUSES = ['assigned', 'en_route', 'started']

const pointOf = (b, which) =>
  which === 'pickup' ? { lat: b.pickupLat, lng: b.pickupLng } : { lat: b.dropLat, lng: b.dropLng }

/**
 * The one booking a driver is carrying that a joiner could share, or null.
 *
 * Null when he is carrying nothing, when he is already full at
 * MAX_BOOKINGS_PER_VEHICLE, or when the ride he has is solo — a solo rider paid
 * for the whole car. That last case is currently also excluded by the seat
 * arithmetic (solo zeroes vehicleCapacity), but that is the capacity rule doing
 * it as a side effect; this says it as the matching rule, which is where a
 * reader will look for it.
 */
export function hostBookingOf(driver) {
  const active = (driver.bookings ?? []).filter((b) => HOST_ACTIVE_STATUSES.includes(b.status))
  if (active.length === 0 || active.length >= MAX_BOOKINGS_PER_VEHICLE) return null

  const [host] = active
  if (!host.sharing) return null
  if (!POOLABLE_HOST_STATUSES.includes(host.status)) return null
  return host
}

/**
 * The geometric half of eligibility — everything decidable without spending a
 * routing call.
 *
 * Returns `{ eligible, reversing, reason }`. `reversing` is what the caller
 * carries into the constraint pipeline: it selects whether the C → P2 leg has to
 * satisfy MAX_REVERSAL_LEG_MIN.
 *
 * The two entry rules (Sharing-Design.md §3):
 *
 *   A. The joiner's pickup is at campus. That is the whole condition — it says
 *      nothing about where the driver is, so a car that left ten minutes ago
 *      qualifies and may be turned around. Campus is the hub nearly every ride
 *      starts from. It needs no distance bound of its own: a driver 40 km down
 *      the expressway satisfies it too and is then rejected by the delay cap.
 *
 *   B. The pickup is ON the host's route, and — once the host is aboard — ahead
 *      of the car on it.
 *
 * WHY THE DIRECTION TEST IS GATED ON `started`. It compares how far along the
 * stored P1 → D1 path the car and the pickup each project. That comparison is
 * only meaningful once the car is actually somewhere on that path. While the
 * host is `assigned` or `en_route` the driver is approaching P1 from an
 * arbitrary direction and has not joined the route yet, so projecting him onto
 * it would rank him against a road he is not on. In that state there is no
 * journey under way to reverse, and the delay and wait caps are the whole
 * control. The on-route test still applies, because "is P2 on the way from P1 to
 * D1" is a fair question whether or not the car has set off.
 */
export function poolGeometry({ driverPos, host, joiner }) {
  const P2 = pointOf(joiner, 'pickup')

  // Rule A. No route reasoning at all, and no reversal condition.
  if (isNearCampus(P2)) return { eligible: true, reversing: false }

  // Rule B needs a road to measure against. A booking priced from the zone
  // table with no Routes call behind it has no polyline, and cannot host.
  const path = host.routePolyline ? decodePolyline(host.routePolyline) : []
  if (path.length < 2) return { eligible: false, reversing: false, reason: 'host_route_unknown' }

  const pickupAt = projectOntoPath(P2, path)
  if (pickupAt.offRouteKm > ON_ROUTE_TOLERANCE_KM)
    return { eligible: false, reversing: false, reason: 'pickup_off_route' }

  // Not yet aboard: nothing to be behind. See the note above.
  if (host.status !== 'started') return { eligible: true, reversing: false }

  const carAt = projectOntoPath(driverPos, path)
  return { eligible: true, reversing: pickupAt.alongKm <= carAt.alongKm + MIN_FORWARD_KM }
}

/**
 * Every legal stop order for this pair, as `{ stops, order }`.
 *
 * Legal means each rider is collected before being set down. Orders that drop
 * one rider before collecting the other are excluded even though they satisfy
 * that: those are two trips back to back rather than a pool, and neither the
 * seat arithmetic nor the fare represents them.
 *
 * Two shapes, and which one applies is decided by whether the host is aboard:
 * once he is, P1 is behind the driver and only the three remaining stops are in
 * play. Four orders at most, two at least — small enough to enumerate honestly.
 */
export function sequencesFor({ host, joiner }) {
  const P1 = pointOf(host, 'pickup')
  const D1 = pointOf(host, 'drop')
  const P2 = pointOf(joiner, 'pickup')
  const D2 = pointOf(joiner, 'drop')

  const at = { P1, D1, P2, D2 }
  const build = (order) => ({ order, stops: order.map((name) => at[name]) })

  if (host.status === 'started') {
    return [build(['P2', 'D1', 'D2']), build(['P2', 'D2', 'D1'])]
  }

  return [
    build(['P1', 'P2', 'D1', 'D2']),
    build(['P1', 'P2', 'D2', 'D1']),
    build(['P2', 'P1', 'D1', 'D2']),
    build(['P2', 'P1', 'D2', 'D1']),
  ]
}

/** Cumulative minutes from the origin to a named stop in a routed sequence. */
function minutesTo(order, legs, name) {
  const index = order.indexOf(name)
  if (index < 0) return 0
  let total = 0
  for (let i = 0; i <= index; i++) total += legs[i]?.min ?? 0
  return total
}

/**
 * The 1-or-2 ordering each booking carries once a sequence is chosen.
 *
 * A host who is already aboard is not in `order` at all — he was collected
 * before this sequence began — so he is pickup 1 by definition and the joiner
 * is 2. Everything else is read straight off the chosen order, which is what
 * makes the drop numbers free to disagree with the pickup numbers: that
 * disagreement IS nearest-drop-first.
 */
export function ordersFrom(order) {
  // A host already aboard is absent from `order` entirely, and the fix is to put
  // him back at the FRONT rather than to give either rider a default. Reading
  // the joiner's number straight out of a list the host is missing from makes
  // him pickup 1 — the man who was collected first would be recorded second,
  // and the driver app would send the car to the wrong stop.
  const pickups = order.includes('P1')
    ? order.filter((name) => name === 'P1' || name === 'P2')
    : ['P1', ...order.filter((name) => name === 'P2')]

  // Both drops are in every sequence by construction, so these need no such care.
  const drops = order.filter((name) => name === 'D1' || name === 'D2')

  const rank = (list, name) => list.indexOf(name) + 1

  return {
    host: { pickupOrder: rank(pickups, 'P1'), dropOrder: rank(drops, 'D1') },
    joiner: { pickupOrder: rank(pickups, 'P2'), dropOrder: rank(drops, 'D2') },
  }
}

/**
 * Can this joiner be added to this host, and if so how should the car be driven?
 *
 * Constraints first, optimisation second, and that ordering is not incidental.
 * Choosing the fastest sequence and then checking it would happily pick a route
 * that saves three minutes of driving by making the joiner wait nine extra ones.
 * Every surviving sequence is one both riders can live with; only then does
 * total time break the tie, and only then is it fair to optimise for the
 * operator.
 *
 * Costs one routing call for the baseline plus one per candidate sequence — at
 * most five. Deliberately not approximated with straight lines: the entire
 * reason these caps are in minutes is that a drop 2 km away can be twenty
 * minutes away, and no geometry sees a divided carriageway or a one-way system.
 *
 * @returns {Promise<{ ok: true, order: string[], legs: object[], totalMin: number,
 *                     hostDelayMin: number, joinerWaitMin: number,
 *                     orders: ReturnType<typeof ordersFrom> }
 *                 | { ok: false, reason: string }>}
 */
export async function evaluatePool({ driverPos, host, joiner }) {
  const geometry = poolGeometry({ driverPos, host, joiner })
  if (!geometry.eligible) return { ok: false, reason: geometry.reason }

  const D1 = pointOf(host, 'drop')
  const P1 = pointOf(host, 'pickup')

  // What the host's remaining trip costs with nobody added — the number every
  // delay is measured against. Both terms of the subtraction start at C, which
  // is why the trip's own stored durationMin cannot stand in for it: that
  // describes P1 → D1 from an origin the car left some time ago.
  const baseline = host.status === 'started'
    ? await routeSequence([driverPos, D1])
    : await routeSequence([driverPos, P1, D1])

  // He is seconds from setting a rider down. Adding a stop here lands in the
  // middle of the drop-off itself.
  if (baseline.totalMin < NEARLY_DONE_MIN) return { ok: false, reason: 'host_nearly_done' }

  const scored = []
  for (const candidate of sequencesFor({ host, joiner })) {
    let routed
    try {
      routed = await routeSequence([driverPos, ...candidate.stops])
    } catch (err) {
      // One unroutable ordering is not a verdict on the others.
      console.error('pool sequence could not be routed:', err.message)
      continue
    }

    const hostDelayMin = minutesTo(candidate.order, routed.legs, 'D1') - baseline.totalMin
    const joinerWaitMin = minutesTo(candidate.order, routed.legs, 'P2')

    // The turn itself, and only when there is one. Both `started` sequences open
    // with C → P2, so when the car is reversing that leg is unambiguously the
    // first — no attributing minutes between the turn, the service road and
    // getting back up to speed, which is not a division a routing API can make.
    if (geometry.reversing && candidate.order[0] === 'P2' && routed.legs[0].min > MAX_REVERSAL_LEG_MIN)
      continue

    if (hostDelayMin > MAX_HOST_DELAY_MIN) continue
    if (joinerWaitMin > MAX_JOINER_WAIT_MIN) continue

    scored.push({ ...candidate, ...routed, hostDelayMin, joinerWaitMin })
  }

  if (scored.length === 0) return { ok: false, reason: 'no_acceptable_sequence' }

  scored.sort((a, b) => a.totalMin - b.totalMin)
  const best = scored[0]

  return {
    ok: true,
    order: best.order,
    legs: best.legs,
    totalMin: best.totalMin,
    hostDelayMin: best.hostDelayMin,
    joinerWaitMin: best.joinerWaitMin,
    orders: ordersFrom(best.order),
  }
}
