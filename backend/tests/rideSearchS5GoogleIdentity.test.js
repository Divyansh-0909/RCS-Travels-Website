import test from 'node:test'
import assert from 'node:assert/strict'
import { placeIdentityRefresh } from '../services/googlePlaceIdentity.js'
import { createGooglePlacesProvider, PlaceIdentityRefreshError, PlaceSearchError } from '../services/search/locations/places.ts'
import { createLocationGrounder, groundingSelection, sameGroundedEndpoints } from '../services/search/locations/grounding.ts'
import { createTestClock } from './helpers/testClock.js'

const identity = () => ({ error: 'PLACE_ID_REFRESH_SELECTION_REQUIRED', requestedPlaceId: 'old',
  replacement: { placeId: 'canonical', displayText: 'Public fixture address' }, source: 'GOOGLE_DETAILS_ID_REFRESH' })
const context = { query: { id: 'q', revision: 1, text: 'Pari Chowk' }, candidate: {
  candidateId: 'c', queryId: 'q', queryRevision: 1, exactText: 'Pari Chowk', start: 0, end: 10,
  method: 'WHOLE_LOCATION_QUERY', generatorVersion: 'test' }, target: 'drop', formRevision: 1 }
test('Google ID refresh offers only a provider-bound replacement and never includes location coordinates', () => {
  const data = { id: 'canonical', name: 'places/canonical', formattedAddress: 'Public fixture address', location: { latitude: 28, longitude: 77 } }
  assert.deepEqual(placeIdentityRefresh('old', data), identity())
  for (const id of ['', 'old', 7]) {
    assert.equal(placeIdentityRefresh('old', { ...data, id, name: `places/${id}` }), null)
  }
  for (const edit of [value => { delete value.id }, value => { value.id = '' }, value => { value.id = 'old' },
    value => { value.name = 'places/another' }, value => { delete value.formattedAddress }, value => { value.formattedAddress = ' ' },
    value => { value.movedPlaceId = 'elsewhere' }, value => { value.movedPlace = 'places/elsewhere' }]) {
    const changed = structuredClone(data); edit(changed); assert.equal(placeIdentityRefresh('old', changed), null)
  }
})
test('adapter binds ID refresh to its requested ID and preserves the ordinary strict identity guard', async () => {
  let response = { status: 409, body: identity() }
  const provider = createGooglePlacesProvider({ transport: { async request() { return response } }, clock: createTestClock('2026-10-04T10:00:00Z') })
  await assert.rejects(provider.getPlaceDetails({ placeId: 'old', sessionToken: 's' }), error => {
    assert.ok(error instanceof PlaceIdentityRefreshError); assert.equal(error.requestedPlaceId, 'old')
    assert.equal(error.code, 'details')
    assert.deepEqual(error.replacement, identity().replacement); return true
  })
  for (const edit of [value => { value.requestedPlaceId = 'wrong' }, value => { value.replacement.placeId = 'old' },
    value => { value.source = 'UNTRUSTED' }, value => { delete value.replacement }, value => { value.replacement.lat = 28 }]) {
    const body = identity(); edit(body); response = { status: 409, body }
    await assert.rejects(provider.getPlaceDetails({ placeId: 'old' }), error => error instanceof PlaceSearchError
      && !(error instanceof PlaceIdentityRefreshError) && error.code === 'details')
  }
  response = { status: 200, body: { lat: 28, lng: 77, formattedAddress: 'Public fixture', placeId: 'wrong' } }
  await assert.rejects(provider.getPlaceDetails({ placeId: 'old', sessionToken: 's' }), /could not be confirmed/)
})
test('endpoint sameness requires both coordinate axes, or the same authoritative ID', () => {
  const point = { selectionId: 'map-a', displayText: 'Public fixture', lat: 28, lng: 77, source: 'USER_CONFIRMED_MAP_PIN',
    confirmedByUser: 'selection', confirmedAt: '2026-10-04T10:00:00.000Z' }
  assert.deepEqual(sameGroundedEndpoints(point, { ...point, selectionId: 'map-b', lat: 29 }), [])
  assert.deepEqual(sameGroundedEndpoints(point, { ...point, selectionId: 'map-c', lng: 78 }), [])
  assert.equal(sameGroundedEndpoints(point, { ...point, selectionId: 'map-d' })[0].code, 'SAME_GROUNDED_ENDPOINTS')
  assert.deepEqual(sameGroundedEndpoints(), [])
  assert.deepEqual(sameGroundedEndpoints(point), [])
  assert.deepEqual(sameGroundedEndpoints(undefined, point), [])
  assert.throws(() => sameGroundedEndpoints({ ...point, lat: 91 }, point))
  assert.throws(() => sameGroundedEndpoints(point, { ...point, lng: 181 }))
  const sameId = sameGroundedEndpoints({ ...point, placeId: 'public-id' }, { ...point, placeId: 'public-id', lat: 29, lng: 78 })
  assert.equal(sameId[0].code, 'SAME_GROUNDED_ENDPOINTS')
  assert.equal(sameId[0].field, 'locations'); assert.equal(sameId[0].category, 'AMBIGUOUS')
  assert.deepEqual(sameGroundedEndpoints({ ...point, placeId: 'public-id' }, { ...point, placeId: 'another-public-id', lat: 29, lng: 78 }), [])
})
test('changed ID requires a second explicit selection; canonical lookup must itself pass the original identity guard', async () => {
  const calls = []
  const provider = createGooglePlacesProvider({ transport: { async request(request) {
    calls.push(request)
    if (request.endpoint === 'autocomplete') return { status: 200, body: { suggestions: [{ placePrediction: { placeId: 'old', text: { text: 'Pari Chowk' } } }] } }
    if (request.placeId === 'old') return { status: 409, body: identity() }
    return { status: 200, body: { placeId: 'canonical', lat: 28, lng: 77, formattedAddress: 'Public fixture address' } }
  } }, clock: createTestClock('2026-10-04T10:00:00Z') })
  const grounder = createLocationGrounder(provider)
  const suggestions = await grounder.search(context)
  const refresh = await grounder.select(suggestions, 'old', 1)
  assert.equal(refresh.status, 'USER_SELECTION_REQUIRED'); assert.equal(refresh.confirmed, undefined)
  assert.deepEqual(refresh.matches, [identity().replacement]); assert.equal(refresh.issues[0].code, 'PLACE_ID_REFRESH_SELECTION_REQUIRED')
  assert.equal(refresh.issues[0].category, 'DEPENDENCY')
  assert.equal(calls.length, 2); assert.throws(() => groundingSelection(refresh, 1), /NOT_RESOLVED/)
  const confirmed = await grounder.select(refresh, 'canonical', 1)
  assert.equal(confirmed.status, 'RESOLVED'); assert.equal(groundingSelection(confirmed, 1).placeId, 'canonical')
  assert.equal(calls.length, 3); assert.equal(calls[1].sessionToken, calls[2].sessionToken)
  await assert.rejects(grounder.select(refresh, 'old', 1), /NOT_OFFERED/)
})
test('forged, unbound, invalid and repeatedly changing refresh suggestions fail closed', async () => {
  const detail = { source: 'GOOGLE_PLACES', placeId: 'old', displayText: 'public', lat: 28, lng: 77, confirmedByUser: 'selection', confirmedAt: '2026-10-04T10:00:00Z' }
  const provider = { async searchAutocomplete() { return [{ placeId: 'old', displayText: 'public' }] }, async getPlaceDetails() { return detail } }
  const grounder = createLocationGrounder(provider)
  const suggestions = await grounder.search(context)
  for (const error of [new PlaceIdentityRefreshError('wrong', identity().replacement), new PlaceIdentityRefreshError('old', { placeId: '', displayText: 'x' }),
    new PlaceIdentityRefreshError('old', { placeId: 'old', displayText: 'x' }), 'non-error']) {
    provider.getPlaceDetails = async () => { throw error }
    assert.equal((await grounder.select(suggestions, 'old', 1)).status, 'FAILED')
  }
  provider.getPlaceDetails = async () => { throw new PlaceIdentityRefreshError('old', identity().replacement) }
  const refreshed = await grounder.select(suggestions, 'old', 1)
  provider.getPlaceDetails = async () => { throw new PlaceIdentityRefreshError('canonical', { placeId: 'third', displayText: 'x' }) }
  assert.equal((await grounder.select(refreshed, 'canonical', 1)).status, 'FAILED')
  const mixed = { ...refreshed, issues: [...refreshed.issues, { code: 'ANOTHER_DEPENDENCY', category: 'DEPENDENCY', field: 'drop', refs: [] }] }
  assert.equal((await grounder.select(mixed, 'canonical', 1)).status, 'FAILED')
})
