import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import googleRouter from '../routes/googleAPI.js'

async function withServer(app, run) {
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening))
  })
  try {
    return await run(`http://127.0.0.1:${server.address().port}`)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

test('S3 session proxy calls forward tokens, bypass legacy caches, and verify details IDs', async (t) => {
  const app = express()
  app.use('/api/googleAPI', googleRouter)
  const originalFetch = globalThis.fetch
  const calls = []
  let now = 1_700_000_000_000
  t.mock.method(Date, 'now', () => now)
  t.mock.method(globalThis, 'fetch', (url, options) => {
    const target = new URL(typeof url === 'string' ? url : url.toString())
    if (target.origin !== 'https://places.googleapis.com' && target.origin !== 'https://maps.googleapis.com') return originalFetch(url, options)
    calls.push({ url: target, options })
    if (target.pathname === '/v1/places:autocomplete') {
      const input = JSON.parse(options.body).input
      if (input === 'network error') return Promise.reject(new Error('provider unavailable'))
      if (input === 'upstream error') return Promise.resolve(new Response(JSON.stringify({ error: { message: 'sensitive address' } }), { status: 503 }))
      return Promise.resolve(new Response(JSON.stringify({ suggestions: [] }), { status: 200 }))
    }
    if (target.pathname === '/maps/api/geocode/json') {
      if (target.searchParams.get('latlng') === '1,1') return Promise.resolve(new Response(JSON.stringify({ status: 'ZERO_RESULTS', results: [] }), { status: 200 }))
      if (target.searchParams.get('latlng') === '2,2') return Promise.resolve(new Response(JSON.stringify({ status: 'OVER_QUERY_LIMIT' }), { status: 200 }))
      if (target.searchParams.get('latlng') === '4,4') return Promise.reject(new Error('provider unavailable'))
      if (target.searchParams.get('latlng') === '5,5') return Promise.resolve(new Response(JSON.stringify({ status: 'OK' }), { status: 200 }))
      if (target.searchParams.get('latlng') === '6,6') return Promise.resolve(new Response(JSON.stringify({ status: 'OK', results: [{ formatted_address: 'Address without types' }] }), { status: 200 }))
      return Promise.resolve(new Response(JSON.stringify({ status: 'OK', results: [
        { types: ['plus_code'], formatted_address: 'Hidden' }, { types: ['street_address'], formatted_address: 'Verified address' },
      ] }), { status: 200 }))
    }
    const placeId = target.pathname.split('/').at(-1)
    if (placeId === 'network-id') return Promise.reject(new Error('provider unavailable'))
    if (placeId === 'upstream-id') return Promise.resolve(new Response(JSON.stringify({ error: { message: 'sensitive address' } }), { status: 503 }))
    if (placeId === 'no-fields-id') return Promise.resolve(new Response(JSON.stringify({ id: placeId }), { status: 200 }))
    if (placeId === 'canonical-request' || placeId === 'moved-request') return Promise.resolve(new Response(JSON.stringify({
      id: 'canonical-response', name: 'places/canonical-response', formattedAddress: 'Public fixture address',
      location: { latitude: 25, longitude: 85 }, ...(placeId === 'moved-request' ? { movedPlaceId: 'elsewhere' } : {}),
    }), { status: 200 }))
    const returnedId = placeId === 'wrong-id' ? 'different-id' : placeId === 'missing-id' ? undefined : placeId
    return Promise.resolve(new Response(JSON.stringify({ id: returnedId, location: { latitude: 25, longitude: 85 }, formattedAddress: 'Verified address' }), { status: 200 }))
  })

  await withServer(app, async (base) => {
    const request = (path) => fetch(`${base}${path}`, { signal: AbortSignal.timeout(3_000) })

    assert.equal((await request('/api/googleAPI/autocomplete?input=session%20address&sessionToken=session_1')).status, 200)
    assert.equal((await request('/api/googleAPI/autocomplete?input=session%20address&sessionToken=session_1')).status, 200)
    assert.equal(calls.filter((call) => call.url.pathname.endsWith('autocomplete')).length, 2)
    const sessionAutocomplete = calls[0]
    assert.deepEqual(JSON.parse(sessionAutocomplete.options.body), { input: 'session address', regionCode: 'IN', sessionToken: 'session_1' })
    assert.equal(sessionAutocomplete.options.method, 'POST')
    assert.equal(sessionAutocomplete.options.headers['Content-Type'], 'application/json')
    assert.ok(Object.hasOwn(sessionAutocomplete.options.headers, 'X-Goog-Api-Key'))
    const legacySessionAutocomplete = '/api/googleAPI/autocomplete?input=session%20address'
    assert.equal((await request(legacySessionAutocomplete)).status, 200)
    assert.equal((await request(legacySessionAutocomplete)).status, 200)
    assert.equal(calls.filter((call) => call.url.pathname.endsWith('autocomplete') && JSON.parse(call.options.body).input === 'session address').length, 3)
    assert.equal((await request('/api/googleAPI/autocomplete?input=session%20address&sessionToken=session_1')).status, 200)
    assert.equal(calls.filter((call) => call.url.pathname.endsWith('autocomplete') && JSON.parse(call.options.body).input === 'session address').length, 4)
    assert.deepEqual(JSON.parse(calls.at(-1).options.body), { input: 'session address', regionCode: 'IN', sessionToken: 'session_1' })

    const detail = await request('/api/googleAPI/details/session-id?sessionToken=session_1')
    assert.deepEqual(await detail.json(), { lat: 25, lng: 85, formattedAddress: 'Verified address', placeId: 'session-id' })
    await request('/api/googleAPI/details/session-id?sessionToken=session_1')
    assert.equal(calls.filter((call) => call.url.pathname.endsWith('/session-id')).length, 2)
    assert.equal(calls.find((call) => call.url.pathname.endsWith('/session-id')).url.searchParams.get('sessionToken'), 'session_1')
    assert.equal(calls.find((call) => call.url.pathname.endsWith('/session-id')).options.headers['X-Goog-FieldMask'], 'id,name,location,formattedAddress,movedPlaceId')
    assert.deepEqual(await (await request('/api/googleAPI/details/session-id')).json(), { lat: 25, lng: 85, formattedAddress: 'Verified address' })
    assert.deepEqual(await (await request('/api/googleAPI/details/session-id')).json(), { lat: 25, lng: 85, formattedAddress: 'Verified address' })
    assert.equal(calls.filter((call) => call.url.pathname.endsWith('/session-id')).length, 3)
    assert.deepEqual(await (await request('/api/googleAPI/details/session-id?sessionToken=session_1')).json(), { lat: 25, lng: 85, formattedAddress: 'Verified address', placeId: 'session-id' })
    assert.equal(calls.filter((call) => call.url.pathname.endsWith('/session-id')).length, 4)

    const wrongId = await request('/api/googleAPI/details/wrong-id?sessionToken=session_1')
    const refresh = await request('/api/googleAPI/details/canonical-request?sessionToken=session_1')
    assert.equal(refresh.status, 409)
    assert.deepEqual(await refresh.json(), { error: 'PLACE_ID_REFRESH_SELECTION_REQUIRED', requestedPlaceId: 'canonical-request',
      replacement: { placeId: 'canonical-response', displayText: 'Public fixture address' }, source: 'GOOGLE_DETAILS_ID_REFRESH' })
    assert.equal((await request('/api/googleAPI/details/moved-request?sessionToken=session_1')).status, 502)
    assert.equal(wrongId.status, 502)
    assert.deepEqual(await wrongId.json(), { error: 'Place details failed' })
    const missingId = await request('/api/googleAPI/details/missing-id?sessionToken=session_1')
    assert.equal(missingId.status, 502)
    assert.deepEqual(await missingId.json(), { error: 'Place details failed' })

    const legacyAutocomplete = '/api/googleAPI/autocomplete?input=legacy%20address'
    assert.equal((await request(legacyAutocomplete)).status, 200)
    assert.equal((await request(legacyAutocomplete)).status, 200)
    assert.equal(calls.filter((call) => call.url.pathname.endsWith('autocomplete') && JSON.parse(call.options.body).input === 'legacy address' && JSON.parse(call.options.body).sessionToken === undefined).length, 1)
    const legacyDetails = '/api/googleAPI/details/legacy-id'
    assert.deepEqual(await (await request(legacyDetails)).json(), { lat: 25, lng: 85, formattedAddress: 'Verified address' })
    assert.deepEqual(await (await request(legacyDetails)).json(), { lat: 25, lng: 85, formattedAddress: 'Verified address' })
    assert.equal(calls.filter((call) => call.url.pathname.endsWith('/legacy-id')).length, 1)
    assert.equal(calls.find((call) => call.url.pathname.endsWith('/legacy-id')).url.search, '')

    const invalidAutocompleteToken = await request('/api/googleAPI/autocomplete?input=invalid%20address&sessionToken=invalid!')
    assert.equal(invalidAutocompleteToken.status, 400)
    assert.deepEqual(await invalidAutocompleteToken.json(), { error: 'sessionToken is invalid' })
    assert.equal((await request('/api/googleAPI/autocomplete?input=valid%20address&sessionToken=!valid')).status, 400)
    assert.equal((await request('/api/googleAPI/autocomplete?input=valid%20address&sessionToken=one&sessionToken=two')).status, 400)
    assert.equal((await request('/api/googleAPI/details/session-id?sessionToken=one&sessionToken=two')).status, 400)
    assert.equal((await request('/api/googleAPI/autocomplete')).status, 400)
    assert.equal((await request('/api/googleAPI/autocomplete?input=ab')).status, 400)
    assert.deepEqual(await (await request('/api/googleAPI/autocomplete?input=upstream%20error')).json(), { error: 'Autocomplete failed' })
    assert.deepEqual(await (await request('/api/googleAPI/autocomplete?input=network%20error')).json(), { message: 'Failed to fetch autocomplete results' })
    const invalidDetailsToken = await request('/api/googleAPI/details/session-id?sessionToken=invalid!')
    assert.equal(invalidDetailsToken.status, 400)
    assert.deepEqual(await invalidDetailsToken.json(), { error: 'sessionToken is invalid' })
    assert.equal((await request('/api/googleAPI/details/network-id')).status, 500)
    assert.equal((await request('/api/googleAPI/details/upstream-id')).status, 503)
    assert.deepEqual(await (await request('/api/googleAPI/details/no-fields-id')).json(), { lat: null, lng: null, formattedAddress: null })

    const expiringAutocomplete = '/api/googleAPI/autocomplete?input=expiring%20address'
    await request(expiringAutocomplete)
    await request(expiringAutocomplete)
    now += 1
    await request(expiringAutocomplete)
    now += 5 * 60 * 1000
    await request(expiringAutocomplete)
    assert.equal(calls.filter((call) => call.url.pathname.endsWith('autocomplete') && JSON.parse(call.options.body).input === 'expiring address').length, 2)
    const exactAutocompleteBoundary = '/api/googleAPI/autocomplete?input=exact%20boundary'
    await request(exactAutocompleteBoundary)
    now += 5 * 60 * 1000
    await request(exactAutocompleteBoundary)
    assert.equal(calls.filter((call) => call.url.pathname.endsWith('autocomplete') && JSON.parse(call.options.body).input === 'exact boundary').length, 2)
    const expiringDetails = '/api/googleAPI/details/expiring-id'
    await request(expiringDetails)
    await request(expiringDetails)
    now += 1
    await request(expiringDetails)
    now += 24 * 60 * 60 * 1000
    await request(expiringDetails)
    assert.equal(calls.filter((call) => call.url.pathname.endsWith('/expiring-id')).length, 2)
    const exactDetailsBoundary = '/api/googleAPI/details/exact-boundary-id'
    await request(exactDetailsBoundary)
    now += 24 * 60 * 60 * 1000
    await request(exactDetailsBoundary)
    assert.equal(calls.filter((call) => call.url.pathname.endsWith('/exact-boundary-id')).length, 2)

    for (let index = 0; index <= 500; index += 1) await request(`/api/googleAPI/details/lru-detail-${index}`)
    await request('/api/googleAPI/details/lru-detail-500')
    await request('/api/googleAPI/details/lru-detail-499')
    await request('/api/googleAPI/details/lru-detail-0')
    assert.equal(calls.filter((call) => call.url.pathname.endsWith('/lru-detail-500')).length, 1)
    assert.equal(calls.filter((call) => call.url.pathname.endsWith('/lru-detail-499')).length, 1)
    assert.equal(calls.filter((call) => call.url.pathname.endsWith('/lru-detail-0')).length, 2)

    for (let index = 0; index <= 500; index += 1) await request(`/api/googleAPI/autocomplete?input=lru-${index}`)
    await request('/api/googleAPI/autocomplete?input=lru-500')
    await request('/api/googleAPI/autocomplete?input=lru-499')
    await request('/api/googleAPI/autocomplete?input=lru-0')
    assert.equal(calls.filter((call) => call.url.pathname.endsWith('autocomplete') && JSON.parse(call.options.body).input === 'lru-500').length, 1)
    assert.equal(calls.filter((call) => call.url.pathname.endsWith('autocomplete') && JSON.parse(call.options.body).input === 'lru-499').length, 1)
    assert.equal(calls.filter((call) => call.url.pathname.endsWith('autocomplete') && JSON.parse(call.options.body).input === 'lru-0').length, 2)

    assert.equal((await request('/api/googleAPI/reverse-geocode?lat=bad&lng=1')).status, 400)
    assert.deepEqual(await (await request('/api/googleAPI/reverse-geocode?lat=1&lng=1')).json(), { formattedAddress: null })
    assert.equal((await request('/api/googleAPI/reverse-geocode?lat=2&lng=2')).status, 502)
    assert.equal((await request('/api/googleAPI/reverse-geocode?lat=4&lng=4')).status, 500)
    assert.deepEqual(await (await request('/api/googleAPI/reverse-geocode?lat=5&lng=5')).json(), { formattedAddress: null })
    assert.deepEqual(await (await request('/api/googleAPI/reverse-geocode?lat=6&lng=6')).json(), { formattedAddress: 'Address without types' })
    assert.equal((await request('/api/googleAPI/reverse-geocode?lat=90&lng=180')).status, 200)
    assert.deepEqual(await (await request('/api/googleAPI/reverse-geocode?lat=3&lng=3')).json(), { formattedAddress: 'Verified address' })
    assert.deepEqual(await (await request('/api/googleAPI/reverse-geocode?lat=3&lng=3')).json(), { formattedAddress: 'Verified address' })
    for (let index = 0; index <= 500; index += 1) await request(`/api/googleAPI/reverse-geocode?lat=${index / 10}&lng=9`)
    await request('/api/googleAPI/reverse-geocode?lat=0&lng=9')
    assert.equal(calls.filter((call) => call.url.pathname === '/maps/api/geocode/json' && call.url.searchParams.get('latlng') === '0,9').length, 2)
  })
})
