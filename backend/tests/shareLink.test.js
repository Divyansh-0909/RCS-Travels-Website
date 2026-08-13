import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  newShareToken,
  shareIsLive,
  shareUrlFor,
  sharedTripView,
  SHARE_TTL_MS,
} from '../lib/shareLink.js'

// The share link is the only way to read a booking without an account, so these
// are about what it refuses to do. No database: everything here is pure, which is
// why sharedTripView was separated from the route in the first place.

const future = (ms = 60_000) => new Date(Date.now() + ms)
const past = (ms = 60_000) => new Date(Date.now() - ms)

// A booking carrying every secret the payload must not leak, so the assertions
// below fail loudly rather than passing because the field was simply absent.
const bookingWith = (overrides = {}) => ({
  id: 'booking-uuid-0001',
  reference: 'RCS4831902',
  userId: 'user-uuid-0001',
  customerPhone: '9810000001',
  fare: 1150,
  rideFare: 1000,
  commissionAmt: 50,
  cancellationCharge: 0,
  status: 'en_route',
  pickupAddress: 'Connaught Place, New Delhi',
  dropAddress: 'Noida Sector 18, Noida',
  pickupLat: 28.6315, pickupLng: 77.2167,
  dropLat: 28.5708, dropLng: 77.3260,
  vehicleNumber: 'DL01AB1234',
  vehicleModel: 'Maruti Swift Dzire',
  scheduledAt: null,
  shareToken: 'a'.repeat(22),
  shareExpiresAt: future(),
  user: { name: 'Divyansh Singh', phone: '9876543210', bookingCode: '4242' },
  driver: {
    id: 'driver-uuid-0001',
    name: 'Ramesh Kumar',
    phone: '9810000002',
    vehicleNumber: 'DL09OLD99',
    vehicleModel: 'Honda City',
    location: { latitude: 28.61, longitude: 77.22, bearing: 90, speedKmh: 30 },
  },
  ...overrides,
})

describe('share tokens', () => {
  test('are 128 bits of base64url, and do not repeat', () => {
    const token = newShareToken()
    assert.match(token, /^[A-Za-z0-9_-]{22}$/)

    // Not a proof of randomness — just a tripwire for the token ever becoming
    // derived from something, which is the failure that would matter.
    const many = new Set(Array.from({ length: 500 }, newShareToken))
    assert.equal(many.size, 500)
  })

  test('the TTL is a real window, not zero or forever', () => {
    assert.ok(SHARE_TTL_MS > 60 * 60 * 1000)
    assert.ok(SHARE_TTL_MS <= 24 * 60 * 60 * 1000)
  })

  test('a link is live only with BOTH a token and a future expiry', () => {
    assert.equal(shareIsLive({ shareToken: 'x'.repeat(22), shareExpiresAt: future() }), true)
    assert.equal(shareIsLive({ shareToken: 'x'.repeat(22), shareExpiresAt: past() }), false)
    assert.equal(shareIsLive({ shareToken: null, shareExpiresAt: future() }), false)
    assert.equal(shareIsLive({ shareToken: 'x'.repeat(22), shareExpiresAt: null }), false)
  })

  test('the url points at the app, not the api, and survives a trailing slash', () => {
    const before = process.env.APP_ORIGIN
    process.env.APP_ORIGIN = 'https://rcstravels.example/'
    assert.equal(shareUrlFor('tok'), 'https://rcstravels.example/t/tok')
    process.env.APP_ORIGIN = before
  })
})

describe('what a shared trip reveals', () => {
  test('never the phone numbers, the OTP, the fare, or any id', () => {
    const json = JSON.stringify(sharedTripView(bookingWith(), 'https://signed/photo.jpg'))

    // Asserted against the serialised payload rather than field by field, so a
    // future field that nests a secret is caught too.
    for (const secret of [
      '9876543210',        // the rider's phone
      '9810000002',        // the driver's phone
      '9810000001',        // customerPhone on the booking
      '4242',              // bookingCode — the OTP that starts the ride
      'booking-uuid-0001', // the id the authenticated endpoints take
      'driver-uuid-0001',
      'user-uuid-0001',
      'RCS4831902',        // the reference support searches on
      '1150',              // the fare
    ]) {
      assert.equal(json.includes(secret), false, `share payload leaked ${secret}`)
    }
  })

  test('the rider is a first name only', () => {
    assert.equal(sharedTripView(bookingWith(), null).riderName, 'Divyansh')
    assert.equal(sharedTripView(bookingWith({ user: { name: null } }), null).riderName, null)
    assert.equal(sharedTripView(bookingWith({ user: null }), null).riderName, null)
  })

  test('a live ride carries the driver and his position', () => {
    const view = sharedTripView(bookingWith(), 'https://signed/photo.jpg')
    assert.equal(view.ended, false)
    assert.equal(view.driver.name, 'Ramesh Kumar')
    assert.equal(view.driver.latitude, 28.61)
    assert.equal(view.driver.photoUrl, 'https://signed/photo.jpg')
  })

  test('the plate and model are the booking snapshot, not the driver row', () => {
    const view = sharedTripView(bookingWith(), null)
    assert.equal(view.driver.vehicleNumber, 'DL01AB1234')
    assert.equal(view.driver.vehicleModel, 'Maruti Swift Dzire')
  })

  test('a completed ride keeps who drove but drops where he is now', () => {
    const view = sharedTripView(bookingWith({ status: 'completed' }), null)
    assert.equal(view.ended, true)
    assert.equal(view.driver.name, 'Ramesh Kumar')
    assert.equal(view.driver.latitude, null)
    assert.equal(view.driver.longitude, null)
  })

  test('a cancelled or driverless ride names nobody at all', () => {
    for (const status of ['cancelled', 'no_driver']) {
      const view = sharedTripView(bookingWith({ status }), null)
      assert.equal(view.ended, true)
      assert.equal(view.driver, null)
    }
  })

  test('a ride with no driver yet is live but has none to show', () => {
    const view = sharedTripView(bookingWith({ status: 'confirmed', driver: null }), null)
    assert.equal(view.ended, false)
    assert.equal(view.driver, null)
    // The route is still there — it is what the watcher is looking at.
    assert.equal(view.pickup.lat, 28.6315)
    assert.equal(view.drop.lng, 77.3260)
  })
})
