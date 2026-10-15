import test from 'node:test';
import assert from 'node:assert/strict';
import { fallbackEligibility } from '../services/search/complex/eligibility.ts';
import { LUNA_MODEL, LUNA_SCHEMA_VERSION } from '../services/search/complex/contracts.ts';
import { createSearchInterpretationService } from '../services/search/complex/service.ts';
import { emptyDraft } from '../services/search/contracts.ts';
import { createSearchGroundingService } from '../services/search/locations/service.ts';
import { searchFake, placesFake } from './helpers/rideSearchS3Fake.js';
import { inputFor } from './helpers/rideSearchFake.js';
import { lunaFake, lunaOutput } from './helpers/rideSearchS4Fake.js';
import { createTestClock } from './helpers/testClock.js';

const clock = createTestClock('2026-10-02T10:00:00Z');
const routing = (reasons, codes = []) => ({ fallbackReasons: reasons, issues: codes.map(code => ({ code })) });
test('fallback allowlist and blocker precedence are explicit; missing, policy, credentials and Places are not language problems', () => {
  assert.equal(LUNA_MODEL, 'gpt-6-luna'); assert.equal(LUNA_SCHEMA_VERSION, 'ride-search-luna-v1');
  const allowed = ['COMPLEX_QUERY', 'JEV_TIMEOUT', 'JEV_PROVIDER_ERROR', 'JEV_INVALID_RESPONSE', 'JEV_SCHEMA_ERROR',
    'ROLE_CONFLICT', 'TEMPORAL_CONFLICT', 'EXTRACTION_BINDING_UNRESOLVED', 'LOCATION_CANDIDATE_MISSING'];
  for (const code of allowed) assert.deepEqual(fallbackEligibility(routing([code, code], [code])), [code]);
  for (const code of ['INVALID_INPUT_PROVENANCE', 'LIMIT_EXCEEDED', 'JEV_AUTH_ERROR']) {
    assert.deepEqual(fallbackEligibility(routing(['COMPLEX_QUERY'], [code])), []);
  }
  for (const code of ['FIELD_REQUIRED', 'TIME_REQUIRED', 'PRODUCT_POLICY_UNRESOLVED', 'DATE_POLICY_CLARIFICATION_REQUIRED', 'UNSUPPORTED_REQUEST', 'PLACES_PROVIDER', 'PLACE_NO_MATCH']) {
    assert.deepEqual(fallbackEligibility(routing([code], [code])), []);
  }
  assert.deepEqual(fallbackEligibility(routing([], ['ROLE_CONFLICT'])), ['ROLE_CONFLICT']);
});

test('semantic fallback keeps safe simple vehicle/date extraction even when Luna leaves those fields unspecified', async () => {
  const text = 'SUV tomorrow from campus to airport';
  const choices = { vehicle_class: 'suv', vehicle_strength: 'REQUIRED', timing_mode: 'SCHEDULED',
    pickup_candidate: 'NONE_OR_UNCLEAR', pickup_presence: 'PRESENT' };
  const decisions = searchFake(text, { drop: 'airport', choices });
  const luna = lunaFake(input => lunaOutput(input.query, { pickup: 'campus', drop: 'airport', candidates: input.candidates, modify(draft) {
    draft.timing = { mode: 'UNSPECIFIED', refs: [], date: { state: 'UNSPECIFIED' }, time: { state: 'UNSPECIFIED' } };
  } }));
  const result = await createSearchInterpretationService(decisions, placesFake(), luna, clock).parse(inputFor(text));
  assert.equal(result.evaluationRoute, 'LUNA_PROVIDER_FALLBACK'); assert.equal(result.draft.vehicleClass.value, 'suv');
  assert.equal(result.draft.timing.date.value.anchor, 'TOMORROW'); assert.equal(result.draft.timing.time.state, 'UNSPECIFIED');
  assert.equal(result.telemetry.newSourceSpans, 0); assert.equal(result.telemetry.recoveredMissingCandidates, false);
  assert.equal(result.telemetry.schemaFailures, 0); assert.equal(result.telemetry.trustedConflicts, 0);
  assert.deepEqual(result.telemetry.fallbackReasons, ['LOCATION_CANDIDATE_MISSING']);
});

test('S3 accepted-parse grounding seam preserves context and empty bookkeeping before target choice', async () => {
  const draft = emptyDraft(inputFor('hello').query);
  const parsed = { draft, route: 'UNCLEAR_OR_UNRELATED', fallbackRequired: false, fallbackReasons: [], issues: [], providerMetadata: {} };
  const service = createSearchGroundingService(searchFake('hello'), placesFake(), clock);
  const output = await service.groundParsed(parsed, { activeField: null, formRevision: 4 });
  assert.deepEqual(output, { parse: parsed, activeField: null, formRevision: 4, targetRefs: [], locations: [], issues: [] });
  await assert.rejects(service.groundParsed(parsed, { activeField: 'bad', formRevision: 4 }));
});
