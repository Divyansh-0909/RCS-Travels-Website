import test from 'node:test'
import assert from 'node:assert/strict'
import { installPhase9PlacesProvider, syntheticPlaces } from './helpers/phase9PlacesProvider.js'

test('isolated Places and Routes transport keeps real DTOs and exact synthetic source inputs', async () => {
  const original = globalThis.fetch, localCalls = []
  globalThis.fetch = async (...args) => { localCalls.push(args); return Response.json({ local: true }) }
  const provider = installPhase9PlacesProvider()
  try {
    assert.deepEqual(await fetch('http://127.0.0.1:1234/health').then(r => r.json()), { local: true })
    assert.deepEqual(await fetch(new URL('http://localhost:1234/health')).then(r => r.json()), { local: true })
    assert.deepEqual(await fetch(new Request('http://[::1]:1234/health')).then(r => r.json()), { local: true })
    assert.equal(localCalls.length, 3)
    const route = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST', body: JSON.stringify({ origin: syntheticPlaces[0].id, destination: syntheticPlaces[1].id }) }).then(r => r.json())
    assert.equal(route.routes[0].distanceMeters, 4200)
    assert.equal(route.routes[0].duration, '1080s')
    assert.deepEqual(route, { routes: [{ distanceMeters: 4200, duration: '1080s', staticDuration: '1080s',
      polyline: { encodedPolyline: 'shsmDkakvMgwBnqA' }, legs: [{ duration: '1080s', distanceMeters: 4200 }] }] })
    const suggestions = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST', body: JSON.stringify({ input: 'SYNTHETIC DELHI PICKUP' }) }).then(r => r.json())
    assert.deepEqual(suggestions.suggestions.map(row => row.placePrediction.placeId), ['phase9-pickup'])
    assert.deepEqual(suggestions.suggestions[0], { placePrediction: { placeId: 'phase9-pickup',
      text: { text: 'Synthetic Delhi pickup' }, structuredFormat: { mainText: { text: 'Synthetic Delhi pickup' }, secondaryText: { text: 'Synthetic fixture' } } } })
    assert.equal(syntheticPlaces[1].address, 'Synthetic Delhi drop')
    for (const place of syntheticPlaces) {
      const details = await fetch(new Request('https://places.googleapis.com/v1/places/' + place.id)).then(r => r.json())
      assert.equal(details.formattedAddress, place.address)
      assert.deepEqual(details.location, { latitude: place.lat, longitude: place.lng })
    }
    assert.equal(provider.observations.length, 4)
    assert.equal(provider.observations[0].method, 'POST')
    assert.equal(provider.observations[2].method, 'GET')
    assert.equal(provider.observations[2].body, null)
    assert.deepEqual(provider.observations[0].body, { origin: 'phase9-pickup', destination: 'phase9-drop' })
  } finally { provider.restore(); globalThis.fetch = original }
})

test('isolated UI transport denies unsupported external products and unknown Places identities', async () => {
  const original = globalThis.fetch, provider = installPhase9PlacesProvider()
  try {
    for (const url of ['https://example.com', 'https://routes.googleapis.com/different',
      'https://routes.googleapis.com/directions/v2:computeRoutes?altered=1',
      'https://places.googleapis.com/v1/places/unknown', 'https://places.googleapis.com/other',
      'https://places.googleapis.com.evil.invalid/v1/places/phase9-pickup']) {
      await assert.rejects(fetch(url), { message: url.includes('/v1/places/unknown') ? 'Unknown synthetic place' : 'External UI provider transport denied' })
    }
    assert.equal(provider.observations.length, 0)
  } finally { provider.restore(); assert.equal(globalThis.fetch, original) }
})
