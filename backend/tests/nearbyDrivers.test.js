import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { nearbyDriverAvailability, nearbyDriverEta, NEARBY_DRIVER_LIMIT, NEARBY_DRIVER_RADIUS_KM } from '../services/nearbyDrivers.js'

describe('the customer nearby-vehicle query', () => {
  test('uses dispatch eligibility and keeps public map points anonymous', async () => {
    let query
    const db = {
      async $queryRaw(strings, ...values) {
        query = { text: strings.join('?'), values }
        return [{
          driverId: 'private-driver-id',
          driverLat: 28.631543,
          driverLng: 77.216743,
          lat: 28.6315,
          lng: 77.2167,
        }]
      },
    }

    const availability = await nearbyDriverAvailability({
      lat: 28.63,
      lng: 77.22,
      vehicleClass: 'hatchback',
    }, db)

    assert.deepEqual(availability.vehicles, [{ lat: 28.6315, lng: 77.2167 }])
    assert.deepEqual(Object.keys(availability.vehicles[0]).sort(), ['lat', 'lng'])
    assert.deepEqual(availability.nearest, {
      driverId: 'private-driver-id',
      lat: 28.631543,
      lng: 77.216743,
    })
    assert.match(query.text, /ST_DWithin/)
    assert.match(query.text, /d\."is_online"/)
    assert.match(query.text, /d\."is_active"/)
    assert.match(query.text, /d\."verification_status" = 'approved'/)
    assert.match(query.text, /d\."suspended_at" IS NULL/)
    assert.match(query.text, /d\."vehicle_class"/)
    assert.match(query.text, /NOT EXISTS/)
    assert.match(query.text, /b\."status" IN/)
    assert.ok(query.values.includes(NEARBY_DRIVER_RADIUS_KM * 1000))
    assert.ok(query.values.includes(NEARBY_DRIVER_LIMIT))
    assert.equal(NEARBY_DRIVER_RADIUS_KM, 5)
  })

  test('returns no nearest driver when the five-kilometre search is empty', async () => {
    const db = { async $queryRaw() { return [] } }
    const availability = await nearbyDriverAvailability({
      lat: 28.63,
      lng: 77.22,
      vehicleClass: 'sedan',
    }, db)

    assert.deepEqual(availability, { vehicles: [], nearest: null })
  })

  test('calculates ETA from the nearest driver actual position to pickup', async () => {
    let request
    const eta = await nearbyDriverEta({
      nearest: { driverId: 'driver-1', lat: 28.61234, lng: 77.22345 },
      pickup: { lat: 28.63154, lng: 77.21674 },
      vehicleClass: 'suv',
    }, async (args) => {
      request = args
      return 7
    })

    assert.equal(eta, 7)
    assert.deepEqual(request.origin, { lat: 28.61234, lng: 77.22345 })
    assert.deepEqual(request.destination, { lat: 28.63154, lng: 77.21674 })
    assert.match(request.cacheKey, /^nearby:driver-1:suv:/)
  })

  test('does not request an ETA when no driver is nearby', async () => {
    let called = false
    const eta = await nearbyDriverEta({
      nearest: null,
      pickup: { lat: 28.63, lng: 77.22 },
      vehicleClass: 'hatchback',
    }, async () => { called = true })

    assert.equal(eta, null)
    assert.equal(called, false)
  })
})
