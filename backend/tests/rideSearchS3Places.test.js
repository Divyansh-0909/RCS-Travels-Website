import assert from 'node:assert/strict'
import test from 'node:test'
import { createGooglePlacesProvider, createRcsGooglePlacesHttpTransport, PlaceSearchError } from '../services/search/locations/places.ts'
import { createTestClock } from './helpers/testClock.js'

const suggestion = (placeId, displayText) => ({ placePrediction: { placeId, text: { text: displayText } } })

function fakeTransport(responses) {
  const calls = []
  return {
    calls,
    request: async (request) => {
      calls.push(request)
      const response = responses.shift()
      if (response instanceof Error) throw response
      return response
    },
  }
}

function expectCode(code) {
  return (error) => error instanceof PlaceSearchError && error.code === code
}

test('Google Places adapter returns every valid autocomplete match without selecting one', async () => {
  const transport = fakeTransport([{ status: 200, body: { suggestions: [
    { ...suggestion('first', 'First address'), place: 'places/first', types: ['locality'], structuredFormat: { mainText: { text: 'First' } } },
    { queryPrediction: { text: { text: 'search query' } } },
    suggestion('second', 'Second address'),
  ], providerMetadata: { ignored: true } } }])
  const provider = createGooglePlacesProvider({ transport })

  assert.deepEqual(await provider.searchAutocomplete({ input: 'station', sessionToken: 'session-1' }), [
    { placeId: 'first', displayText: 'First address' }, { placeId: 'second', displayText: 'Second address' },
  ])
  assert.deepEqual(transport.calls, [{ endpoint: 'autocomplete', input: 'station', sessionToken: 'session-1' }])
  assert.deepEqual(provider.getMetadata(), { provider: 'google_places', requestCount: 1, autocompleteRequests: 1, detailsRequests: 0 })
})

test('Google Places adapter preserves an empty result and only confirms an explicitly selected ID', async () => {
  const clock = createTestClock('2026-10-02T12:00:00.000Z')
  const transport = fakeTransport([
    { status: 200, body: {} },
    { status: 200, body: { lat: 25.6, lng: 85.1, formattedAddress: 'Selected address', placeId: 'selected-id' } },
  ])
  const provider = createGooglePlacesProvider({ transport, clock })

  assert.deepEqual(await provider.searchAutocomplete({ input: 'selected', sessionToken: 'session-2' }), [])
  assert.deepEqual(await provider.getPlaceDetails({ placeId: 'selected-id', sessionToken: 'session-2' }), {
    lat: 25.6, lng: 85.1, displayText: 'Selected address', confirmedAt: '2026-10-02T12:00:00.000Z',
    source: 'GOOGLE_PLACES', placeId: 'selected-id', confirmedByUser: 'selection',
  })
  assert.deepEqual(transport.calls, [
    { endpoint: 'autocomplete', input: 'selected', sessionToken: 'session-2' },
    { endpoint: 'details', placeId: 'selected-id', sessionToken: 'session-2' },
  ])
  assert.deepEqual(provider.getMetadata(), { provider: 'google_places', requestCount: 2, autocompleteRequests: 1, detailsRequests: 1 })
})

test('Google Places adapter classifies proxy failures without exposing payloads', async () => {
  for (const [response, code] of [
    [{ status: 408, body: { error: 'secret' } }, 'timeout'], [{ status: 429, body: { error: 'secret' } }, 'quota'],
    [{ status: 504, body: { error: 'secret' } }, 'timeout'], [{ status: 401, body: { error: 'secret' } }, 'config'],
    [{ status: 403, body: { error: 'secret' } }, 'config'], [{ status: 400, body: { error: 'secret' } }, 'provider'],
    [{ status: 300, body: { error: 'secret' } }, 'provider'], [{ status: 500, body: { error: 'secret' } }, 'provider'],
  ]) {
    const provider = createGooglePlacesProvider({ transport: fakeTransport([response]) })
    await assert.rejects(provider.searchAutocomplete({ input: 'station' }), expectCode(code))
  }
  const timeout = createGooglePlacesProvider({ transport: fakeTransport([Object.assign(new Error('token=secret'), { name: 'TimeoutError' })]) })
  await assert.rejects(timeout.searchAutocomplete({ input: 'station' }), expectCode('timeout'))
  const aborted = createGooglePlacesProvider({ transport: fakeTransport([Object.assign(new Error('token=secret'), { name: 'AbortError' })]) })
  await assert.rejects(aborted.searchAutocomplete({ input: 'station' }), expectCode('timeout'))
  const network = createGooglePlacesProvider({ transport: fakeTransport([new Error('token=secret')]) })
  await assert.rejects(network.searchAutocomplete({ input: 'station' }), expectCode('provider'))
  const nonError = createGooglePlacesProvider({ transport: { request: async () => { throw 'unsafe provider value' } } })
  await assert.rejects(nonError.searchAutocomplete({ input: 'station' }), expectCode('provider'))
  await assert.rejects(createGooglePlacesProvider().searchAutocomplete({ input: 'station' }), expectCode('config'))
})

test('Google Places adapter rejects malformed results, invalid coordinates, and detail failures', async () => {
  const malformedAutocomplete = createGooglePlacesProvider({ transport: fakeTransport([{ status: 200, body: { suggestions: [suggestion('', 'address')] } }]) })
  await assert.rejects(malformedAutocomplete.searchAutocomplete({ input: 'station' }), expectCode('invalid_result'))
  const invalidCoords = createGooglePlacesProvider({ transport: fakeTransport([{ status: 200, body: { lat: 91, lng: 85, formattedAddress: 'Address' } }]) })
  await assert.rejects(invalidCoords.getPlaceDetails({ placeId: 'selected' }), expectCode('invalid_result'))
  const failedDetails = createGooglePlacesProvider({ transport: fakeTransport([{ status: 502, body: { error: 'secret' } }]) })
  await assert.rejects(failedDetails.getPlaceDetails({ placeId: 'selected' }), expectCode('details'))
  const wrongId = createGooglePlacesProvider({ transport: fakeTransport([{ status: 200, body: { lat: 25, lng: 85, formattedAddress: 'Address', placeId: 'different' } }]) })
  await assert.rejects(wrongId.getPlaceDetails({ placeId: 'selected' }), expectCode('details'))
  for (const body of [
    { lat: -91, lng: 85, formattedAddress: 'Address' },
    { lat: 25, lng: -181, formattedAddress: 'Address' },
    { lat: 25, lng: 181, formattedAddress: 'Address' },
  ]) {
    const provider = createGooglePlacesProvider({ transport: fakeTransport([{ status: 200, body }]) })
    await assert.rejects(provider.getPlaceDetails({ placeId: 'selected' }), expectCode('invalid_result'))
  }
})

test('Google Places adapter requires an echoed details ID for a session-bound selection', async () => {
  const provider = createGooglePlacesProvider({
    transport: fakeTransport([{ status: 200, body: { lat: 25, lng: 85, formattedAddress: 'Address' } }]),
  })
  await assert.rejects(provider.getPlaceDetails({ placeId: 'selected', sessionToken: 'session-1' }), expectCode('details'))
})

test('Google Places accepts valid coordinate boundary values without treating zero as missing', async () => {
  for (const [lat, lng] of [[-90, -180], [90, 180], [0, 0]]) {
    const provider = createGooglePlacesProvider({ transport: fakeTransport([{ status: 200, body: { lat, lng, formattedAddress: 'Selected point', placeId: 'selected' } }]) })
    const selected = await provider.getPlaceDetails({ placeId: 'selected', sessionToken: 'session-1' })
    assert.equal(selected.lat, lat)
    assert.equal(selected.lng, lng)
  }
})

test('Google Places adapter rejects invalid selected IDs before dispatching details', async () => {
  const transport = fakeTransport([])
  const provider = createGooglePlacesProvider({ transport })
  await assert.rejects(provider.getPlaceDetails({ placeId: '  ' }), expectCode('details'))
  assert.deepEqual(transport.calls, [])
  assert.deepEqual(provider.getMetadata(), { provider: 'google_places', requestCount: 0, autocompleteRequests: 0, detailsRequests: 0 })
})

test('Google Places adapter bounds and validates requests before transport dispatch', async () => {
  const transport = fakeTransport([])
  const provider = createGooglePlacesProvider({ transport })
  await assert.rejects(provider.searchAutocomplete({ input: 'ab' }), expectCode('invalid_result'))
  await assert.rejects(provider.searchAutocomplete({ input: 'station', sessionToken: 'invalid!' }), expectCode('invalid_result'))
  await assert.rejects(provider.searchAutocomplete({ input: 'station', sessionToken: '!valid_token' }), expectCode('invalid_result'))
  await assert.rejects(provider.searchAutocomplete({ input: 'x'.repeat(2_001) }), expectCode('invalid_result'))
  assert.deepEqual(await createGooglePlacesProvider({ transport: fakeTransport([{ status: 200, body: {} }]) }).searchAutocomplete({ input: 'x'.repeat(2_000) }), [])
  await assert.rejects(provider.getPlaceDetails({ placeId: 'selected', sessionToken: 'invalid!' }), expectCode('details'))
  assert.deepEqual(transport.calls, [])
})

test('autocomplete normalizes boundary whitespace and rejects a prediction whose display text is absent', async () => {
  const transport = fakeTransport([{ status: 200, body: { suggestions: [] } }]);
  const provider = createGooglePlacesProvider({ transport });
  assert.deepEqual(await provider.searchAutocomplete({ input: '  station  ' }), []);
  assert.deepEqual(transport.calls, [{ endpoint: 'autocomplete', input: 'station' }]);
  for (const text of [{}, { text: '' }, { text: 42 }]) {
    const malformed = createGooglePlacesProvider({ transport: fakeTransport([{ status: 200, body: { suggestions: [{ placePrediction: { placeId: 'p', text } }] } }]) });
    await assert.rejects(malformed.searchAutocomplete({ input: 'station' }), expectCode('invalid_result'));
  }
});

test('RCS HTTP transport uses the existing proxy routes and forwards a supplied session token', async () => {
  const requests = []
  const transport = createRcsGooglePlacesHttpTransport({
    baseUrl: 'http://rcs.test/',
    fetch: async (url, init) => { requests.push({ url, init }); return { status: 200, json: async () => ({ suggestions: [] }) } },
  })
  await transport.request({ endpoint: 'autocomplete', input: 'A & B', sessionToken: 'session-3' })
  await transport.request({ endpoint: 'details', placeId: 'id/one' })
  await transport.request({ endpoint: 'details', placeId: 'id/two', sessionToken: 'session-3' })
  assert.deepEqual(requests, [
    { url: 'http://rcs.test/api/googleAPI/autocomplete?input=A+%26+B&sessionToken=session-3', init: { signal: requests[0].init.signal } },
    { url: 'http://rcs.test/api/googleAPI/details/id%2Fone', init: { signal: requests[1].init.signal } },
    { url: 'http://rcs.test/api/googleAPI/details/id%2Ftwo?sessionToken=session-3', init: { signal: requests[2].init.signal } },
  ])
})

test('RCS HTTP transport enforces its request deadline', async () => {
  let signal
  const transport = createRcsGooglePlacesHttpTransport({ baseUrl: 'http://rcs.test', timeoutMs: 5, fetch: async (_url, init) => { signal = init.signal; return new Promise(() => {}) } })
  await assert.rejects(transport.request({ endpoint: 'autocomplete', input: 'station' }), error => error instanceof Error && error.name === 'TimeoutError')
  assert.equal(signal.aborted, true, 'a timed-out upstream request is cancelled')
  const stalledBody = createRcsGooglePlacesHttpTransport({
    baseUrl: 'http://rcs.test', timeoutMs: 5,
    fetch: async () => ({ status: 200, json: async () => new Promise(() => {}) }),
  })
  await assert.rejects(stalledBody.request({ endpoint: 'autocomplete', input: 'station' }), error => error instanceof Error && error.name === 'TimeoutError')
})

test('RCS HTTP transport clears its deadline after a successful response', async (t) => {
  const timers = []
  const cleared = []
  t.mock.method(globalThis, 'setTimeout', (callback, timeoutMs) => {
    const timer = { callback, timeoutMs }
    timers.push(timer)
    return timer
  })
  t.mock.method(globalThis, 'clearTimeout', (timer) => { cleared.push(timer) })
  const transport = createRcsGooglePlacesHttpTransport({
    baseUrl: 'http://rcs.test',
    fetch: async () => ({ status: 200, json: async () => ({ suggestions: [] }) }),
  })
  assert.deepEqual(await transport.request({ endpoint: 'autocomplete', input: 'station' }), { status: 200, body: { suggestions: [] } })
  assert.equal(timers.length, 1)
  assert.deepEqual(cleared, timers)
})

test('RCS HTTP transport uses default fetch and rejects invalid transport configuration', async (t) => {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url, init })
    return new Response(JSON.stringify({ suggestions: [] }), { status: 200 })
  })
  const transport = createRcsGooglePlacesHttpTransport({ baseUrl: 'http://rcs.test' })
  assert.deepEqual(await transport.request({ endpoint: 'autocomplete', input: 'station' }), { status: 200, body: { suggestions: [] } })
  assert.equal(calls.length, 1)
  assert.throws(() => createRcsGooglePlacesHttpTransport({ baseUrl: '' }), expectCode('config'))
  assert.throws(() => createRcsGooglePlacesHttpTransport({ baseUrl: '   ' }), expectCode('config'))
  assert.throws(() => createRcsGooglePlacesHttpTransport({ baseUrl: null }), expectCode('config'))
  assert.throws(() => createRcsGooglePlacesHttpTransport({ baseUrl: 'http://rcs.test', timeoutMs: 0 }), expectCode('config'))
  assert.throws(() => createRcsGooglePlacesHttpTransport({ baseUrl: 'http://rcs.test', fetch: null }), expectCode('config'))
})

test('bounded HTTP transport failures become sanitized provider errors', async () => {
  const network = createGooglePlacesProvider({
    transport: createRcsGooglePlacesHttpTransport({ baseUrl: 'http://rcs.test', fetch: async () => { throw new Error('token=secret') } }),
  })
  await assert.rejects(network.searchAutocomplete({ input: 'station' }), error => expectCode('provider')(error) && error.message === 'Place search could not complete.')
  const status = createGooglePlacesProvider({
    transport: createRcsGooglePlacesHttpTransport({ baseUrl: 'http://rcs.test', fetch: async () => ({ status: 503, json: async () => ({ error: 'token=secret' }) }) }),
  })
  await assert.rejects(status.searchAutocomplete({ input: 'station' }), error => expectCode('provider')(error) && error.message === 'Place search could not complete.')
})

test('Google Places adapter rejects malformed details before confirmation', async () => {
  const provider = createGooglePlacesProvider({ transport: fakeTransport([{ status: 200, body: { lat: 25, lng: 85 } }]) })
  await assert.rejects(provider.getPlaceDetails({ placeId: 'selected' }), expectCode('invalid_result'))
})

test('Google Places adapter accepts inclusive coordinate bounds and rejects HTTP 300 details', async () => {
  const bounds = createGooglePlacesProvider({ transport: fakeTransport([{ status: 200, body: { lat: 90, lng: 180, formattedAddress: 'Boundary' } }]) })
  assert.equal((await bounds.getPlaceDetails({ placeId: 'boundary' })).lat, 90)
  const status = createGooglePlacesProvider({ transport: fakeTransport([{ status: 300, body: { error: 'secret' } }]) })
  await assert.rejects(status.getPlaceDetails({ placeId: 'selected' }), expectCode('details'))
  const informationalAutocomplete = createGooglePlacesProvider({ transport: fakeTransport([{ status: 199, body: { suggestions: [] } }]) })
  await assert.rejects(informationalAutocomplete.searchAutocomplete({ input: 'station' }), expectCode('provider'))
  const informationalDetails = createGooglePlacesProvider({ transport: fakeTransport([{ status: 199, body: { lat: 25, lng: 85, formattedAddress: 'Address' } }]) })
  await assert.rejects(informationalDetails.getPlaceDetails({ placeId: 'selected' }), expectCode('details'))
})
