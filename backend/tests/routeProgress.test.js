import test from 'node:test'
import assert from 'node:assert/strict'
import { remainingRoadPath } from '../../frontend/src/lib/routeMotion.js'
import { remainingRoutePoints } from '../../driver-app/src/lib/polyline.ts'
import { navigationRouteNeedsRefresh } from '../services/rideEstimate.js'

const webPath = [
  { lat: 28.6000, lng: 77.2000 },
  { lat: 28.6000, lng: 77.2100 },
  { lat: 28.6000, lng: 77.2200 },
]

const encodePolyline = (points) => {
  const chunk = (value) => {
    let encoded = value < 0 ? ~(value << 1) : value << 1
    let output = ''
    while (encoded >= 0x20) {
      output += String.fromCharCode((0x20 | (encoded & 0x1f)) + 63)
      encoded >>= 5
    }
    return output + String.fromCharCode(encoded + 63)
  }
  let previousLat = 0
  let previousLng = 0
  return points.map(({ lat, lng }) => {
    const latitude = Math.round(lat * 1e5)
    const longitude = Math.round(lng * 1e5)
    const encoded = chunk(latitude - previousLat) + chunk(longitude - previousLng)
    previousLat = latitude
    previousLng = longitude
    return encoded
  }).join('')
}

test('customer remaining route removes road already driven', () => {
  const remaining = remainingRoadPath(webPath, { lat: 28.6000, lng: 77.2150 })

  assert.ok(remaining)
  assert.ok(Math.abs(remaining[0].lng - 77.2150) < 0.00001)
  assert.deepEqual(remaining.at(-1), webPath.at(-1))
  assert.ok(remaining.every((point) => point.lng >= 77.2150))
})

test('customer remaining route refuses to snap a wrong-turn fix onto the old road', () => {
  assert.equal(remainingRoadPath(webPath, { lat: 28.6100, lng: 77.2150 }), null)
})

test('captain remaining route removes road already driven', () => {
  const nativePath = webPath.map(({ lat, lng }) => ({ latitude: lat, longitude: lng }))
  const remaining = remainingRoutePoints(nativePath, { latitude: 28.6000, longitude: 77.2150 })

  assert.ok(remaining)
  assert.ok(Math.abs(remaining[0].longitude - 77.2150) < 0.00001)
  assert.deepEqual(remaining.at(-1), nativePath.at(-1))
  assert.ok(remaining.every((point) => point.longitude >= 77.2150))
})

test('captain remaining route waits for recalculation after a wrong turn', () => {
  const nativePath = webPath.map(({ lat, lng }) => ({ latitude: lat, longitude: lng }))
  assert.equal(remainingRoutePoints(nativePath, { latitude: 28.6100, longitude: 77.2150 }), null)
})

test('live navigation cache is kept on-route and invalidated after a wrong turn', () => {
  const route = { polyline: encodePolyline(webPath) }

  assert.equal(navigationRouteNeedsRefresh(route, { lat: 28.6001, lng: 77.2150 }), false)
  assert.equal(navigationRouteNeedsRefresh(route, { lat: 28.6100, lng: 77.2150 }), true)
})
