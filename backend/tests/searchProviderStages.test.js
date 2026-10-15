import assert from 'node:assert/strict'
import { test } from 'node:test'
import { groundingRoles, providerStageStatus } from '../benchmarks/search/providerStages.js'
import { createSearchGroundingService } from '../services/search/locations/service.ts'

const unspecified = { state: 'UNSPECIFIED' }
const candidate = { state: 'RESOLVED', value: { kind: 'QUERY_CANDIDATE', candidateId: 'source' } }
const selection = { state: 'RESOLVED', value: { kind: 'USER_SELECTION', selectionId: 'explicit' } }
const parsed = (queryType, pickup = candidate, drop = candidate) => ({ fallbackRequired: false,
  draft: { queryType, pickup, drop, locationSearch: candidate } })
const baseline = { validationFailed: false, otherProviderPending: false, lunaRequired: false,
  placesRequired: false, placesAvailable: false, groundingComplete: false }

test('grounding requirements follow accepted source-owned roles and explicit standalone target', () => {
  assert.deepEqual(groundingRoles(parsed('BOOKING_REQUEST'), null), ['pickup', 'drop'])
  assert.deepEqual(groundingRoles(parsed('BOOKING_REQUEST', candidate, unspecified), null), ['pickup'])
  assert.deepEqual(groundingRoles(parsed('BOOKING_REQUEST', unspecified, candidate), null), ['drop'])
  assert.deepEqual(groundingRoles(parsed('BOOKING_REQUEST', selection, unspecified), null), [])
  assert.deepEqual(groundingRoles(parsed('BOOKING_REQUEST', unspecified, unspecified), null), [])
  assert.deepEqual(groundingRoles(parsed('LOCATION_SEARCH'), 'pickup'), ['pickup'])
  assert.deepEqual(groundingRoles(parsed('LOCATION_SEARCH'), 'drop'), ['drop'])
  assert.deepEqual(groundingRoles(parsed('LOCATION_SEARCH'), null), [])
  assert.deepEqual(groundingRoles({ ...parsed('LOCATION_SEARCH'), draft: { ...parsed('LOCATION_SEARCH').draft, locationSearch: unspecified } }, 'drop'), [])
  assert.deepEqual(groundingRoles({ ...parsed('BOOKING_REQUEST'), fallbackRequired: true }, null), [])
  assert.deepEqual(groundingRoles({ fallbackRequired: false }, null), [])
  assert.deepEqual(groundingRoles(parsed('UNCLEAR_OR_UNRELATED'), null), [])
})

test('provider-stage statuses keep unavailable grounding separate from interpretation', () => {
  assert.equal(providerStageStatus(baseline), 'COMPLETE')
  assert.equal(providerStageStatus({ ...baseline, placesRequired: true }), 'PLACES_PENDING')
  assert.equal(providerStageStatus({ ...baseline, placesRequired: true, placesAvailable: true }), 'PLACES_PENDING')
  assert.equal(providerStageStatus({ ...baseline, placesRequired: true, groundingComplete: true }), 'COMPLETE')
  assert.equal(providerStageStatus({ ...baseline, lunaRequired: true }), 'LUNA_PENDING')
  assert.equal(providerStageStatus({ ...baseline, lunaRequired: true, placesAvailable: true }), 'LUNA_PENDING')
  assert.equal(providerStageStatus({ ...baseline, lunaRequired: true, placesRequired: true }), 'LUNA_AND_PLACES_PENDING')
  assert.equal(providerStageStatus({ ...baseline, lunaRequired: true, placesRequired: true, placesAvailable: true }), 'LUNA_PENDING')
  assert.equal(providerStageStatus({ ...baseline, otherProviderPending: true, lunaRequired: true }), 'OTHER_PROVIDER_PENDING')
  assert.equal(providerStageStatus({ ...baseline, validationFailed: true, otherProviderPending: true }), 'VALIDATION_FAILURE')
  assert.equal(providerStageStatus({ ...baseline, otherProviderPending: true }), 'OTHER_PROVIDER_PENDING')
  assert.equal(providerStageStatus({ ...baseline, validationFailed: true }), 'VALIDATION_FAILURE')
})

test('partial or mistyped stage state never becomes a successful evaluation', () => {
  for (const key of Object.keys(baseline)) {
    for (const value of [undefined, null, 0, 1, '', 'false']) {
      assert.throws(() => providerStageStatus({ ...baseline, [key]: value }), /PROVIDER_STAGE_STATE_INVALID/)
    }
  }
})

test('observed grounding roles match the existing application service without external calls', async () => {
  const requested = []
  const source = { candidateId: 'source', queryId: 'case', queryRevision: 1, exactText: 'Delta 2',
    normalizedText: 'Delta 2', start: 0, end: 7, method: 'WHOLE_LOCATION_QUERY', generatorVersion: 'test' }
  const sourceParsed = { ...parsed('LOCATION_SEARCH'), route: 'LOCATION_SEARCH', issues: [],
    draft: { ...parsed('LOCATION_SEARCH').draft, query: { id: 'case', revision: 1, text: 'Delta 2' }, candidates: [source] } }
  const service = createSearchGroundingService({ decide: async () => { throw new Error('NO_INTERPRETATION_RETRY') } },
    { searchAutocomplete: async request => { requested.push(request); return [] } })
  for (const activeField of ['pickup', 'drop', null]) {
    const result = await service.groundParsed(sourceParsed, { activeField, formRevision: 0 })
    assert.deepEqual(result.locations.map(location => location.target), groundingRoles(sourceParsed, activeField))
  }
  assert.equal(requested.length, 2)
})
