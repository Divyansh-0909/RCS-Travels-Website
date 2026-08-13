import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { decodePolyline, projectOntoPath } from '../services/geo.js'
import {
  poolGeometry,
  sequencesFor,
  ordersFrom,
  hostBookingOf,
  ON_ROUTE_TOLERANCE_KM,
  MIN_FORWARD_KM,
  MAX_BOOKINGS_PER_VEHICLE,
} from '../services/ridePooling.js'

// Whether a second rider may be added to a trip already under way, and in what
// order the driver should then make his stops.
//
// Everything here is pure — no database, no routing API. That is the half of the
// decision worth testing hardest, because it is the half that fails SILENTLY: a
// direction test with its comparison inverted does not throw, it quietly sends
// drivers backwards. evaluatePool itself is not covered here; it is one baseline
// call plus one per sequence against Google, and what it adds on top of these
// functions is arithmetic on times only a live route can produce.

// Google's own algorithm, inverted. The matcher reads routes as encoded
// polylines because that is how they are stored, so a test that fed it decoded
// vertices would exercise a path production never takes.
function encodePolyline(points) {
  const chunk = (value) => {
    let v = value < 0 ? ~(value << 1) : value << 1
    let out = ''
    while (v >= 0x20) {
      out += String.fromCharCode((0x20 | (v & 0x1f)) + 63)
      v >>= 5
    }
    return out + String.fromCharCode(v + 63)
  }

  let lastLat = 0
  let lastLng = 0
  let encoded = ''
  for (const p of points) {
    const lat = Math.round(p.lat * 1e5)
    const lng = Math.round(p.lng * 1e5)
    encoded += chunk(lat - lastLat) + chunk(lng - lastLng)
    lastLat = lat
    lastLng = lng
  }
  return encoded
}

// SNU, and a road running due west from it toward Delhi. Longitude falls as the
// car drives, so "further along" means a smaller lng — the direction test has to
// get that from the path rather than from a sign convention.
const SNU = { lat: 28.527202, lng: 77.575486 }
const ROUTE_POINTS = [
  { lat: 28.5272, lng: 77.5755 },
  { lat: 28.5300, lng: 77.5000 },
  { lat: 28.5350, lng: 77.4500 },
  { lat: 28.5400, lng: 77.4000 },
  { lat: 28.5450, lng: 77.3500 },
]
const ROUTE = encodePolyline(ROUTE_POINTS)

/** A host booking on that road. `status` is what gates the direction test. */
const hostOn = (status, extra = {}) => ({
  id: 'host-1',
  status,
  sharing: true,
  pickupLat: SNU.lat, pickupLng: SNU.lng,
  dropLat: 28.5450, dropLng: 77.3500,
  routePolyline: ROUTE,
  ...extra,
})

/** A joiner wanting collecting at `pickup`, dropping further west. */
const joinerAt = (pickup) => ({
  id: 'joiner-1',
  pickupLat: pickup.lat, pickupLng: pickup.lng,
  dropLat: 28.5460, dropLng: 77.3400,
})

// Roughly where the car is when it is a third of the way along.
const MID_ROUTE = { lat: 28.5350, lng: 77.4500 }

describe('the polyline round trip', () => {
  test('encodes and decodes back to the same road', () => {
    const back = decodePolyline(ROUTE)
    assert.equal(back.length, ROUTE_POINTS.length)
    back.forEach((p, i) => {
      assert.ok(Math.abs(p.lat - ROUTE_POINTS[i].lat) < 1e-5)
      assert.ok(Math.abs(p.lng - ROUTE_POINTS[i].lng) < 1e-5)
    })
  })
})

describe('projecting a point onto a road', () => {
  test('reports how far along it lands, increasing down the path', () => {
    const near = projectOntoPath({ lat: 28.5300, lng: 77.5000 }, ROUTE_POINTS)
    const far = projectOntoPath({ lat: 28.5400, lng: 77.4000 }, ROUTE_POINTS)
    assert.ok(far.alongKm > near.alongKm)
  })

  test('a point beside the road is off it by the perpendicular, not by a vertex', () => {
    // Deliberately mid-segment, where the nearest VERTEX is kilometres away: the
    // whole reason the projection exists rather than a nearest-point scan.
    const beside = projectOntoPath({ lat: 28.5325, lng: 77.4750 }, ROUTE_POINTS)
    assert.ok(beside.offRouteKm < 1, `expected to sit on the road, was ${beside.offRouteKm} km off`)
  })

  test('a path with nothing to project onto cannot answer', () => {
    assert.equal(projectOntoPath(SNU, []).offRouteKm, Infinity)
    assert.equal(projectOntoPath(SNU, [SNU]).offRouteKm, Infinity)
  })
})

describe('rule A — the joiner is at campus', () => {
  test('admits him with no reference to the road at all', () => {
    // Started, and the pickup is far BEHIND the car — campus is east, the car is
    // most of the way to Delhi. Rule A still takes it, because campus is the hub
    // nearly every ride leaves from and a driver who has just pulled out is worth
    // turning round.
    const verdict = poolGeometry({
      driverPos: MID_ROUTE,
      host: hostOn('started'),
      joiner: joinerAt(SNU),
    })

    assert.equal(verdict.eligible, true)
    assert.equal(verdict.reversing, false, 'a campus pickup carries no reversal condition')
  })

  test('admits him even when the host has no stored route', () => {
    // A zone-priced booking never called Routes and has no polyline. Rule A asks
    // nothing of the road, so it must still work.
    const verdict = poolGeometry({
      driverPos: MID_ROUTE,
      host: hostOn('started', { routePolyline: null }),
      joiner: joinerAt(SNU),
    })
    assert.equal(verdict.eligible, true)
  })
})

describe('rule B — on the road, and ahead on it', () => {
  const OFF_ROUTE = { lat: 28.5600, lng: 77.4500 } // ~2.8 km north of the road
  const AHEAD = { lat: 28.5400, lng: 77.4000 }
  const BEHIND = { lat: 28.5300, lng: 77.5000 }

  test('rejects a pickup that is merely in the same direction', () => {
    const verdict = poolGeometry({
      driverPos: MID_ROUTE,
      host: hostOn('started'),
      joiner: joinerAt(OFF_ROUTE),
    })

    assert.equal(verdict.eligible, false)
    assert.equal(verdict.reason, 'pickup_off_route')

    // And confirm the fixture is actually outside the tolerance, so this test
    // cannot start passing for the wrong reason if the constant moves.
    const off = projectOntoPath(OFF_ROUTE, ROUTE_POINTS).offRouteKm
    assert.ok(off > ON_ROUTE_TOLERANCE_KM, `fixture is only ${off} km off the road`)
  })

  test('a pickup ahead of the car is not a reversal', () => {
    const verdict = poolGeometry({
      driverPos: MID_ROUTE,
      host: hostOn('started'),
      joiner: joinerAt(AHEAD),
    })
    assert.equal(verdict.eligible, true)
    assert.equal(verdict.reversing, false)
  })

  test('a pickup behind the car is a reversal, not a rejection', () => {
    // The distinction the whole design turns on: this candidate survives, and
    // carries a flag that puts its C -> P2 leg under a tighter cap later. It is
    // not thrown out here.
    const verdict = poolGeometry({
      driverPos: MID_ROUTE,
      host: hostOn('started'),
      joiner: joinerAt(BEHIND),
    })
    assert.equal(verdict.eligible, true)
    assert.equal(verdict.reversing, true)
  })

  test('a pickup level with the car counts as behind it', () => {
    // Inside MIN_FORWARD_KM of the car, so GPS noise alone could otherwise flip
    // it between allowed and reversing between two heartbeats.
    const carAt = projectOntoPath(MID_ROUTE, ROUTE_POINTS).alongKm
    const verdict = poolGeometry({
      driverPos: MID_ROUTE,
      host: hostOn('started'),
      joiner: joinerAt(MID_ROUTE),
    })

    assert.equal(verdict.reversing, true)
    const pickupAt = projectOntoPath(MID_ROUTE, ROUTE_POINTS).alongKm
    assert.ok(pickupAt <= carAt + MIN_FORWARD_KM)
  })

  test('the direction test does not run before the host is aboard', () => {
    // While he is still driving TO his first rider the car is not on the P1->D1
    // road yet; projecting him onto it would rank him against a road he has not
    // joined. Same geography that reads as a reversal once he is started.
    for (const status of ['assigned', 'en_route']) {
      const verdict = poolGeometry({
        driverPos: MID_ROUTE,
        host: hostOn(status),
        joiner: joinerAt(BEHIND),
      })
      assert.equal(verdict.eligible, true, status)
      assert.equal(verdict.reversing, false, `${status}: nothing under way to reverse`)
    }
  })

  test('but the on-road test does — a pickup nowhere near is still refused', () => {
    const verdict = poolGeometry({
      driverPos: MID_ROUTE,
      host: hostOn('assigned'),
      joiner: joinerAt(OFF_ROUTE),
    })
    assert.equal(verdict.eligible, false)
    assert.equal(verdict.reason, 'pickup_off_route')
  })

  test('a host with no stored route cannot be judged, so cannot host', () => {
    const verdict = poolGeometry({
      driverPos: MID_ROUTE,
      host: hostOn('started', { routePolyline: null }),
      joiner: joinerAt(AHEAD),
    })
    assert.equal(verdict.eligible, false)
    assert.equal(verdict.reason, 'host_route_unknown')
  })
})

describe('the stop sequences', () => {
  const joiner = joinerAt({ lat: 28.5400, lng: 77.4000 })

  test('drop to three stops once the first rider is aboard', () => {
    const seqs = sequencesFor({ host: hostOn('started'), joiner })
    assert.equal(seqs.length, 2)
    for (const s of seqs) {
      assert.equal(s.order.length, 3)
      assert.ok(!s.order.includes('P1'), 'he is already in the car')
      assert.equal(s.order[0], 'P2', 'the reversal leg is the first, unambiguously')
    }
  })

  test('are all four orders while nobody is aboard', () => {
    const seqs = sequencesFor({ host: hostOn('assigned'), joiner })
    assert.equal(seqs.length, 4)
    assert.equal(new Set(seqs.map((s) => s.order.join('>'))).size, 4, 'no duplicates')
  })

  test('never set a rider down before collecting them', () => {
    for (const status of ['assigned', 'started']) {
      for (const { order } of sequencesFor({ host: hostOn(status), joiner })) {
        const p2 = order.indexOf('P2')
        const d2 = order.indexOf('D2')
        assert.ok(p2 >= 0 && d2 > p2, `${order.join('>')} drops the joiner before collecting him`)

        const p1 = order.indexOf('P1')
        if (p1 >= 0) assert.ok(order.indexOf('D1') > p1, `${order.join('>')} drops the host too early`)
      }
    }
  })

  test('carry one stop per point, in the order named', () => {
    const [first] = sequencesFor({ host: hostOn('started'), joiner })
    assert.equal(first.stops.length, first.order.length)
    assert.deepEqual(first.stops[0], { lat: joiner.pickupLat, lng: joiner.pickupLng })
  })
})

describe('turning a sequence into the two order columns', () => {
  test('lets the drop order disagree with the pickup order', () => {
    // Collected first, set down second — the whole point of nearest-drop-first,
    // and the thing a single pickupOrder column could never express.
    const { host, joiner } = ordersFrom(['P1', 'P2', 'D2', 'D1'])

    assert.deepEqual(host, { pickupOrder: 1, dropOrder: 2 })
    assert.deepEqual(joiner, { pickupOrder: 2, dropOrder: 1 })
  })

  test('keeps them agreeing when the geography says so', () => {
    const { host, joiner } = ordersFrom(['P1', 'P2', 'D1', 'D2'])
    assert.deepEqual(host, { pickupOrder: 1, dropOrder: 1 })
    assert.deepEqual(joiner, { pickupOrder: 2, dropOrder: 2 })
  })

  test('treats a host already aboard as the first pickup', () => {
    // P1 is not in the sequence at all — he was collected before it began — so
    // the numbers have to come from somewhere other than the list.
    const { host, joiner } = ordersFrom(['P2', 'D2', 'D1'])
    assert.equal(host.pickupOrder, 1)
    assert.equal(joiner.pickupOrder, 2)
    assert.equal(joiner.dropOrder, 1)
    assert.equal(host.dropOrder, 2)
  })
})

describe('which drivers can host at all', () => {
  const booking = (over = {}) => ({ id: 'b', status: 'started', sharing: true, ...over })
  const driverWith = (...bookings) => ({ bookings })

  test('a driver carrying one shared ride can', () => {
    assert.ok(hostBookingOf(driverWith(booking())))
  })

  test('an idle driver cannot — there is no trip to join', () => {
    assert.equal(hostBookingOf(driverWith()), null)
    assert.equal(hostBookingOf({}), null)
  })

  test('a driver on a solo ride cannot — that rider bought the whole car', () => {
    assert.equal(hostBookingOf(driverWith(booking({ sharing: false }))), null)
  })

  test('a driver at the kerb cannot', () => {
    // `reached` means the rider is walking to the car. Re-planning now is how a
    // driver misses the turn he is already making.
    assert.equal(hostBookingOf(driverWith(booking({ status: 'reached' }))), null)
  })

  test('a full car cannot', () => {
    const full = Array.from({ length: MAX_BOOKINGS_PER_VEHICLE }, (_, i) => booking({ id: `b${i}` }))
    assert.equal(hostBookingOf(driverWith(...full)), null)
  })

  test('finished rides do not count against him', () => {
    // Only the live statuses make a driver busy; a completed ride on the same
    // row set must not read as a seat still taken.
    const driver = driverWith(booking({ id: 'done', status: 'completed' }), booking({ id: 'live' }))
    assert.equal(hostBookingOf(driver)?.id, 'live')
  })
})
