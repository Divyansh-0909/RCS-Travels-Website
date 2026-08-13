import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  classifyRoutes,
  campusGateFor,
  anyEndpointInShadyZone,
  inAnyShadyZone,
  metresInsideShadyZones,
  hasShadyZones,
  SHADY_MIN_METRES,
  SHADY_ZONES_VERSION,
} from '../services/safeRoute.js'
import { verdictKey } from '../services/safeRouteCache.js'

// These run against the REAL backend/data/shady-zones.geojson rather than a
// fixture, because the polygon is the thing being reasoned about — a test that
// invented its own zones would keep passing after somebody redrew the corridor
// into the wrong place. The two probes below assert only that the file still
// has a usable interior and exterior, so redrawing a zone fails loudly here
// instead of silently changing what every other case in this file means.

// Reverse-geocodes to Fairway Apartment, Megapolis — deep inside the corridor.
const INSIDE_A = { lat: 28.4971, lng: 77.58279 }
// Beel Akbarpur, ~2.3 km up the same corridor.
const INSIDE_B = { lat: 28.5171, lng: 77.59079 }
// Campus, and the two gates. All three must stay outside every polygon.
const SNU = { lat: 28.527202, lng: 77.575486 }
const GATE_OUT = { lat: 28.520718, lng: 77.600243 }
const GATE_IN = { lat: 28.518866, lng: 77.594022 }
// Central Delhi, nowhere near anything drawn.
const FAR_A = { lat: 28.60, lng: 77.20 }
const FAR_B = { lat: 28.61, lng: 77.21 }

const route = (points, extra = {}) => ({ distanceKm: 10, durationMin: 20, points, ...extra })

describe('shady-zones.geojson still describes what these tests assume', () => {
  test('there is at least one zone drawn', () => {
    assert.equal(hasShadyZones(), true)
  })

  test('the interior probes are inside and the exterior ones are not', () => {
    assert.equal(inAnyShadyZone(INSIDE_A), true, 'INSIDE_A fell outside — corridor moved?')
    assert.equal(inAnyShadyZone(INSIDE_B), true, 'INSIDE_B fell outside — corridor moved?')
    assert.equal(inAnyShadyZone(FAR_A), false)
  })

  test('campus and both gates sit outside every polygon', () => {
    // A gate inside a zone would force the driver into the exact stretch the
    // detour exists to avoid, and fetchRouteOptions would reject the result and
    // silently stop offering the option.
    assert.equal(inAnyShadyZone(SNU), false, 'campus is inside a shady zone')
    assert.equal(inAnyShadyZone(GATE_OUT), false, 'outbound gate is inside a shady zone')
    assert.equal(inAnyShadyZone(GATE_IN), false, 'inbound gate is inside a shady zone')
  })

  test('a run between the interior probes clears the offering threshold', () => {
    assert.ok(metresInsideShadyZones([INSIDE_A, INSIDE_B]) > SHADY_MIN_METRES)
  })
})

describe('classifyRoutes separates "already clean" from "nothing clean offered"', () => {
  // The regression this guards: `safe: null` is returned for BOTH, so a caller
  // that forces a waypoint whenever `!safe` will detour trips whose default
  // road never touched a zone. That shipped briefly and turned the 4 km campus
  // run to Dadri into an 11 km one with a ₹150 fee on it.

  test('a clean primary reports primaryShady false and offers nothing', () => {
    const r = classifyRoutes([route([FAR_A, FAR_B])])
    assert.equal(r.primaryShady, false)
    assert.equal(r.safe, null)
    assert.equal(r.fallback, null)
  })

  test('a shady primary with no clean alternative reports primaryShady true', () => {
    const r = classifyRoutes([route([INSIDE_A, INSIDE_B])])
    assert.equal(r.primaryShady, true)
    assert.equal(r.safe, null)
  })

  test('a shady primary with a clean alternative returns that alternative', () => {
    const r = classifyRoutes([
      route([INSIDE_A, INSIDE_B]),
      route([FAR_A, FAR_B], { durationMin: 25 }),
    ])
    assert.equal(r.primaryShady, true)
    assert.ok(r.safe, 'clean alternative should have been picked')
    assert.equal(r.safe.durationMin, 25)
  })

  test('the fastest clean alternative wins, not the shortest', () => {
    const r = classifyRoutes([
      route([INSIDE_A, INSIDE_B]),
      route([FAR_A, FAR_B], { durationMin: 40, distanceKm: 5 }),
      route([FAR_A, FAR_B], { durationMin: 25, distanceKm: 30 }),
    ])
    assert.equal(r.safe.durationMin, 25)
  })

  test('the primary is never reordered, however shady it is', () => {
    const r = classifyRoutes([
      route([INSIDE_A, INSIDE_B], { distanceKm: 99 }),
      route([FAR_A, FAR_B]),
    ])
    // Quoting the default fare on anything but routes[0] would reprice every
    // ride on the page.
    assert.equal(r.primary.distanceKm, 99)
  })
})

describe('campusGateFor is directional', () => {
  // Measured Aug 2026: forcing an outbound trip through the inbound gate returns
  // 42 km / 60 min and still crosses the zone. The direction is not cosmetic.
  test('pickup on campus takes the outbound gate', () => {
    assert.deepEqual(campusGateFor(true, false), GATE_OUT)
  })

  test('drop on campus takes the inbound gate', () => {
    assert.deepEqual(campusGateFor(false, true), GATE_IN)
  })

  test('neither end on campus has no gate', () => {
    assert.equal(campusGateFor(false, false), null)
  })

  test('both ends on campus resolves to outbound rather than throwing', () => {
    // Campus-to-campus and, later, round trips. A round trip wants one gate per
    // leg; until legs exist this at least picks a real road.
    assert.deepEqual(campusGateFor(true, true), GATE_OUT)
  })
})

describe('verdictKey', () => {
  const A = { lat: 28.527202, lng: 77.575486 }
  const B = { lat: 28.489890, lng: 77.520390 }
  const W = { lat: 28.520718, lng: 77.600243 }

  test('rounds to ~111 m so the same trip re-pinned still hits', () => {
    // The saving only exists if two bookings to the same place agree on a key.
    const nudged = { lat: A.lat + 0.0002, lng: A.lng - 0.0003 }
    assert.equal(verdictKey(A, B, W), verdictKey(nudged, B, W))
  })

  test('a genuinely different destination gets a different key', () => {
    assert.notEqual(verdictKey(A, B, W), verdictKey(A, { lat: 28.6, lng: 77.2 }, W))
  })

  test('direction is part of the key', () => {
    // The two gates are 642 m apart and produce very different routes; a key
    // that ignored the waypoint would serve the outbound verdict to an inbound
    // trip, which is the one mistake that returns a still-shady road.
    const inbound = { lat: 28.518866, lng: 77.594022 }
    assert.notEqual(verdictKey(A, B, W), verdictKey(A, B, inbound))
  })

  test('reversing the trip gets a different key', () => {
    assert.notEqual(verdictKey(A, B, W), verdictKey(B, A, W))
  })

  test('missing coords produce no key rather than a wrong one', () => {
    // Hand-typed addresses arrive without coords. Keying them on whatever is
    // left would file every such trip under the same verdict.
    assert.equal(verdictKey(null, B, W), null)
    assert.equal(verdictKey(A, null, W), null)
    assert.equal(verdictKey(A, B, null), null)
  })
})

describe('SHADY_ZONES_VERSION', () => {
  test('is a stable short hash, not the fallback', () => {
    // Verdicts are filed under this. If it ever read "unavailable" in
    // production, every cached answer would silently belong to a set of
    // polygons that failed to load.
    assert.match(SHADY_ZONES_VERSION, /^[0-9a-f]{12}$/)
  })
})

describe('anyEndpointInShadyZone', () => {
  test('true when either endpoint is inside', () => {
    assert.equal(anyEndpointInShadyZone(INSIDE_A, FAR_A), true)
    assert.equal(anyEndpointInShadyZone(FAR_A, INSIDE_A), true)
  })

  test('false when both are outside', () => {
    assert.equal(anyEndpointInShadyZone(FAR_A, FAR_B), false)
  })

  test('missing coords are not endpoints', () => {
    // Hand-typed addresses arrive without coords; they must not read as "inside".
    assert.equal(anyEndpointInShadyZone(null, undefined), false)
    assert.equal(anyEndpointInShadyZone(null, FAR_A), false)
  })
})
