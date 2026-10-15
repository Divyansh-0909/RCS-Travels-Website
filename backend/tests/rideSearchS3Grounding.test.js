import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocationGrounder, groundingSelection, sameGroundedEndpoints, standaloneTarget, trustedLocationSchema } from '../services/search/locations/grounding.ts';
import { PlaceSearchError } from '../services/search/locations/places.ts';
import { groundingOutcomeLabels } from './fixtures/rideSearchS3Locations.js';

const query = { id: 'q', revision: 2, text: '🙂 Pari Chowk' };
const candidate = { candidateId: 'c', queryId: 'q', queryRevision: 2, exactText: 'Pari Chowk', start: 3, end: 13, method: 'WHOLE_LOCATION_QUERY', generatorVersion: 'v1' };
const context = () => ({ query, candidate, target: 'drop', formRevision: 4 });
const selected = (placeId = 'p') => ({ placeId, lat: 28, lng: 77, displayText: 'Pari Chowk', source: 'GOOGLE_PLACES', confirmedAt: '2026-10-02T10:00:00.000Z', confirmedByUser: 'selection' });
function fake(matches = [{ placeId: 'p', displayText: 'Pari Chowk' }], detail = selected()) {
  return { calls: [], async searchAutocomplete(request) { this.calls.push(['search', request]); if (matches instanceof Error) throw matches; return matches; },
    async getPlaceDetails(request) { this.calls.push(['details', request]); if (detail instanceof Error) throw detail; return detail; } };
}

test('standalone target uses only explicit active field or explicit user choice', () => {
  assert.deepEqual(standaloneTarget('pickup'), { target: 'pickup', refs: [], issues: [] });
  assert.deepEqual(standaloneTarget('drop'), { target: 'drop', refs: [], issues: [] });
  assert.deepEqual(standaloneTarget(null), { refs: [], issues: [{ code: 'LOCATION_TARGET_REQUIRED', field: 'locationSearch', category: 'MISSING', refs: [], values: undefined }] });
  assert.equal(standaloneTarget('pickup').target, 'pickup');
  assert.equal(standaloneTarget('drop').target, 'drop');
  assert.equal(standaloneTarget(null).target, undefined);
  assert.equal(standaloneTarget(null).issues[0].code, 'LOCATION_TARGET_REQUIRED');
  assert.deepEqual(standaloneTarget(null, { target: 'pickup', revision: 5 }).refs, [{ kind: 'USER_FIELD', field: 'locationTarget', revision: 5 }]);
  assert.equal(standaloneTarget('pickup', { target: 'drop', revision: 6 }).target, 'drop');
  assert.throws(() => standaloneTarget('destination'));
  assert.throws(() => standaloneTarget(null, { target: 'destination', revision: 1 }));
  assert.throws(() => standaloneTarget(null, { target: 'drop', revision: -1 }));
});

test('the provider abstraction enforces runtime match shape and Google details provenance', async () => {
  for (const matches of [null, [{ placeId: '', displayText: 'x' }], [{ placeId: 'p', displayText: '' }], [{ placeId: 'p' }], [{ placeId: 'p', displayText: 'x', lat: 28 }]]) {
    const result = await createLocationGrounder(fake(matches), () => 's').search(context());
    assert.equal(result.status, 'FAILED');
    assert.equal(result.issues[0].code, 'PLACES_INVALID_RESULT');
    assert.equal(result.confirmed, undefined);
  }
  for (const source of ['USER_CONFIRMED_MAP_PIN', 'USER_SELECTED_SAVED_PLACE', 'USER_SELECTED_CURRENT_LOCATION']) {
    const grounder = createLocationGrounder(fake(undefined, { ...selected(), source }), () => 's');
    const result = await grounder.select(await grounder.search(context()), 'p', 4);
    assert.equal(result.status, 'FAILED');
    assert.equal(result.issues[0].code, 'PLACES_INVALID_RESULT');
  }
});

test('one and multiple matches require selection; no result preserves original candidate', async () => {
  for (const matches of [[], [{ placeId: 'p', displayText: 'Pari Chowk' }], [{ placeId: 'p', displayText: 'one' }, { placeId: 'p2', displayText: 'two' }]]) {
    const provider = fake(matches);
    const result = await createLocationGrounder(provider, () => 's').search(context());
    assert.equal(result.status, matches.length ? 'USER_SELECTION_REQUIRED' : 'NO_MATCH');
    assert.deepEqual(result.matches, matches);
    assert.deepEqual(result.candidate, candidate);
    assert.equal(result.issues[0].code, matches.length ? 'PLACE_SELECTION_REQUIRED' : 'PLACE_NO_MATCH');
    assert.deepEqual(provider.calls, [['search', { input: 'Pari Chowk', sessionToken: 's' }]]);
    assert.equal(result.confirmed, undefined);
    assert.deepEqual(result.ref, { kind: 'QUERY_CANDIDATE', candidateId: 'c' });
    assert.equal(result.sessionToken, 's');
    assert.deepEqual(result.issues, [{ code: matches.length ? 'PLACE_SELECTION_REQUIRED' : 'PLACE_NO_MATCH', field: 'drop', category: 'DEPENDENCY', refs: [], values: undefined }]);
    const labels = groundingOutcomeLabels[matches.length === 0 ? 'NO_MATCH' : matches.length === 1 ? 'ONE_MATCH' : 'MULTIPLE_MATCHES'];
    assert.equal(result.status === 'USER_SELECTION_REQUIRED', labels.selectionRequired);
  }
});

test('selected details are authoritative and session survives autocomplete to details only', async () => {
  const provider = fake();
  const grounder = createLocationGrounder(provider, () => 's');
  const found = await grounder.search(context());
  const result = await grounder.select(found, 'p', 4);
  assert.equal(found.status, 'USER_SELECTION_REQUIRED');
  assert.equal(result.status, 'RESOLVED');
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.confirmed, selected());
  assert.deepEqual(provider.calls[1], ['details', { placeId: 'p', sessionToken: 's' }]);
  const trusted = groundingSelection(result, 4);
  assert.equal(trusted.selectionId, 'places:q:2:c:p');
  assert.equal(trusted.lat, 28);
  assert.equal(trusted.lng, 77);
  assert.throws(() => groundingSelection(result, 5), /STALE/);
  assert.throws(() => groundingSelection(found, 4), /NOT_RESOLVED/);
  assert.throws(() => groundingSelection({ ...result, confirmed: undefined }, 4), /NOT_RESOLVED/);
  assert.throws(() => groundingSelection({ ...result, matches: [] }, 4), /NOT_OFFERED/);
});

test('a user can select a non-first match and only the selected identity is resolved', async () => {
  const provider = fake([{ placeId: 'p', displayText: 'nearby' }, { placeId: 'p2', displayText: 'chosen' }], selected('p2'));
  const grounder = createLocationGrounder(provider, () => 's');
  const result = await grounder.select(await grounder.search(context()), 'p2', 4);
  assert.equal(result.status, 'RESOLVED');
  assert.equal(groundingSelection(result, 4).placeId, 'p2');
  assert.deepEqual(provider.calls[1], ['details', { placeId: 'p2', sessionToken: 's' }]);
});

test('wrong identity, UTF16 split, stale revision and unoffered place fail before provider call', async () => {
  const provider = fake();
  const grounder = createLocationGrounder(provider, () => 's');
  for (const changed of [{ queryRevision: 1 }, { queryId: 'different' }, { exactText: 'fake' }, { start: 1, end: 2, exactText: query.text.slice(1, 2) }]) {
    await assert.rejects(grounder.search({ ...context(), candidate: { ...candidate, ...changed } }));
  }
  await assert.rejects(grounder.search({ ...context(), formRevision: -1 }));
  await assert.rejects(grounder.search({ ...context(), target: 'anything' }));
  assert.equal(provider.calls.length, 0);
  const found = await grounder.search(context());
  await assert.rejects(grounder.select(found, 'p', 3), /STALE/);
  await assert.rejects(grounder.select(found, 'invented', 4), /NOT_OFFERED/);
  await assert.rejects(grounder.select({ ...found, status: 'NO_MATCH' }, 'p', 4), /NOT_OFFERED/);
  await assert.rejects(grounder.select({ ...found, candidate: { ...candidate, queryRevision: 1 } }, 'p', 4));
  assert.throws(() => groundingSelection({ ...found, status: 'RESOLVED', confirmed: selected(), query: { ...query, revision: 3 } }, 4));
  assert.equal(provider.calls.length, 1);
});

test('Places failures, duplicate IDs and invalid details never invent geographic values', async () => {
  for (const error of [new PlaceSearchError('timeout'), new Error('secret'), 'bad provider']) {
    const provider = { ...fake(), async searchAutocomplete() { throw error; } };
    const result = await createLocationGrounder(provider, () => 's').search(context());
    assert.equal(result.status, 'FAILED');
    assert.equal(result.issues[0].code, error instanceof PlaceSearchError ? 'PLACES_TIMEOUT' : 'PLACES_PROVIDER');
    assert.equal(result.confirmed, undefined);
    assert.equal(JSON.stringify(result).includes('secret'), false);
    assert.deepEqual(result.matches, []);
    assert.equal(result.issues[0].category, 'DEPENDENCY');
  }
  const duplicate = await createLocationGrounder(fake([{ placeId: 'p', displayText: 'x' }, { placeId: 'p', displayText: 'y' }]), () => 's').search(context());
  assert.equal(duplicate.issues[0].code, 'PLACES_INVALID_RESULT');
  for (const detail of [selected('wrong'), { ...selected(), lat: NaN }, new PlaceSearchError('details')]) {
    const grounder = createLocationGrounder(fake(undefined, detail), () => 's');
    const result = await grounder.select(await grounder.search(context()), 'p', 4);
    assert.equal(result.status, 'FAILED');
    assert.equal(result.confirmed, undefined);
    assert.equal(result.issues[0].code, detail instanceof PlaceSearchError ? 'PLACES_DETAILS' : detail.placeId === 'wrong' ? 'PLACES_INVALID_RESULT' : 'PLACES_PROVIDER');
    assert.equal(result.issues[0].field, 'drop');
  }
  const badDetails = createLocationGrounder({ ...fake(), async getPlaceDetails() { throw 'secret'; } }, () => 's');
  assert.equal((await badDetails.select(await badDetails.search(context()), 'p', 4)).issues[0].code, 'PLACES_PROVIDER');
});

test('a claimed confirmation is insufficient without resolved state and the exact offered selection identity', async () => {
  const grounder = createLocationGrounder(fake(), () => 's');
  const resolved = await grounder.select(await grounder.search(context()), 'p', 4);
  assert.throws(() => groundingSelection({ ...resolved, status: 'USER_SELECTION_REQUIRED' }, 4), /LOCATION_NOT_RESOLVED/);
  assert.throws(() => groundingSelection({ ...resolved, matches: [{ placeId: 'p2', displayText: 'different' }] }, 4), /PLACE_SELECTION_NOT_OFFERED/);
  assert.deepEqual(standaloneTarget(null, { target: 'drop', revision: 2 }), { target: 'drop', refs: [{ kind: 'USER_FIELD', field: 'locationTarget', revision: 2 }], issues: [] });
  const point = { ...selected(), selectionId: 'p' };
  assert.deepEqual(sameGroundedEndpoints(point, point), [{ code: 'SAME_GROUNDED_ENDPOINTS', field: 'locations', category: 'AMBIGUOUS', refs: [], values: undefined }]);
});

test('trusted saved, current and map selections do not require Google IDs; identical endpoints need clarification', () => {
  const point = { ...selected(), selectionId: 'sel' };
  assert.equal(trustedLocationSchema.safeParse(point).success, true);
  assert.equal(trustedLocationSchema.safeParse({ ...point, placeId: undefined }).success, false);
  for (const source of ['USER_CONFIRMED_MAP_PIN', 'USER_SELECTED_SAVED_PLACE', 'USER_SELECTED_CURRENT_LOCATION']) {
    assert.equal(trustedLocationSchema.safeParse({ ...point, source, placeId: undefined }).success, true);
  }
  assert.deepEqual(sameGroundedEndpoints(), []);
  assert.deepEqual(sameGroundedEndpoints(point), []);
  assert.deepEqual(sameGroundedEndpoints(undefined, point), []);
  assert.deepEqual(sameGroundedEndpoints(point, { ...point, placeId: 'other', lat: 29 }), []);
  assert.equal(sameGroundedEndpoints(point, { ...point, lat: 29 })[0].code, 'SAME_GROUNDED_ENDPOINTS');
  assert.equal(sameGroundedEndpoints({ ...point, placeId: undefined, source: 'USER_CONFIRMED_MAP_PIN' }, { ...point, placeId: 'other' })[0].code, 'SAME_GROUNDED_ENDPOINTS');
  assert.throws(() => sameGroundedEndpoints({ ...point, lng: 181 }, point));
  assert.throws(() => sameGroundedEndpoints(point, { ...point, lat: 91 }));
  const mapPoint = { ...point, placeId: undefined, source: 'USER_CONFIRMED_MAP_PIN' };
  assert.deepEqual(sameGroundedEndpoints(mapPoint, { ...mapPoint, lat: 29, lng: 78 }), []);
  for (const field of ['selectionId', 'displayText', 'placeId']) assert.equal(trustedLocationSchema.safeParse({ ...point, [field]: '   ' }).success, false);
});
