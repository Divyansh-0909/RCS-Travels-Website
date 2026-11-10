import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { collectObservations } from '../services/search/observations.ts';
import { conditionalVehicleAfter } from '../services/search/negation.ts';
import { extractVehicle } from '../services/search/extractor.ts';
import { validateLunaEvidence } from '../services/search/complex/evidence.ts';
import { validateDraftProvenance } from '../services/search/provenance.ts';
import { emptyDraft } from '../services/search/contracts.ts';
import { createRideSearchParser } from '../services/search/parser.ts';
import { createLocationReview, applyTrustedLocation } from '../services/search/locations/review.ts';
import { formResolution } from '../services/search/locations/formResolution.ts';
import { createTestClock } from './helpers/testClock.js';
import { decisionFake, bookingRouting, inputFor, candidateFor } from './helpers/rideSearchFake.js';
import { replayDevelopmentCase } from '../benchmarks/search/postV6Offline.js';
import { verifySources } from '../benchmarks/search/decisionComparison/executorRegistration.js';
import { fileURLToPath } from 'node:url';

const root = new URL('../../', import.meta.url);
const load = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const terminal = await load('output/search-v1-v6-retry-2026-11-03/comparison-live-results-v6-complete.json');
const inputs = await load('output/search-v1-v6-readiness-2026-11-02/pilot-inputs-v6.json');
const fixture = id => replayDevelopmentCase(inputs.find(row => row.caseId === id), terminal, 'COUNTERFACTUAL_SAVED_ANSWER_FIXTURE');
const clock = createTestClock('2026-10-04T12:00:00+05:30');
const observed = text => collectObservations(inputFor(text).query, []);
const preferred = strength => ({ vehicle_class: 'sedan', vehicle_strength: strength, vehicle_any: 'NOT_STATED' });

test('Hindi preferred vehicle saved-answer fixture preserves strength, SUV exclusions and unresolved availability', async () => {
  const row = await fixture('hh-v1-added-004'), draft = row.parsed.draft;
  assert.equal(row.compatible, false);
  assert.equal(draft.complexity, 'SIMPLE');
  assert.deepEqual([draft.vehicleClass.state, draft.vehicleClass.value, draft.vehicleClass.strength], ['RESOLVED', 'sedan', 'PREFERRED']);
  assert.deepEqual(draft.vehicleClass.excluded, ['suv', 'suv_premium']);
  assert.deepEqual(draft.unsupportedRequests.map(value => value.kind), ['CONDITIONAL_PREFERENCE']);
  assert.equal(row.parsed.route, 'SIMPLE_INCOMPLETE');
  assert.deepEqual(row.fallbackEligibility, []);
  assert.equal(row.form.submissionAllowed, false);
  assert.ok(row.form.resolutionRequirements.some(value => value.field === 'CONDITIONAL_PREFERENCE'));
  assert.equal(draft.pickup.state, 'UNSPECIFIED'); assert.equal(draft.drop.state, 'UNSPECIFIED');
  assert.deepEqual(row.provenance, []);
});

test('Hindi rental saved-answer fixture retains unsupported source and all form requirements without interpretation fallback', async () => {
  const row = await fixture('hh-v1-added-007'), draft = row.parsed.draft;
  assert.equal(draft.complexity, 'SIMPLE');
  assert.equal(row.parsed.route, 'SIMPLE_INCOMPLETE');
  assert.deepEqual(row.fallbackEligibility, []);
  assert.equal(draft.unsupportedRequests[0].kind, 'RENTAL');
  const ref = draft.unsupportedRequests[0].refs[0];
  assert.equal(draft.query.text.slice(ref.start, ref.end), 'गाड़ी किराये पर चाहिए');
  assert.deepEqual(row.provenance, []);
  assert.equal(row.form.submissionAllowed, false);
  for (const field of ['RENTAL', 'pickup', 'drop', 'vehicleClass', 'timing']) {
    assert.ok(row.form.resolutionRequirements.some(value => value.field === field));
  }
  assert.equal(draft.timing.mode, 'UNSPECIFIED');
  assert.equal(Object.hasOwn(draft, 'rentalDuration'), false);
});

test('English and Hindi availability suffixes bind PREFERRED in both simple and Luna evidence guards', async () => {
  for (const text of ['sedan mile toh theek hai', 'सेडान मिले तो ठीक है', 'sedan mile to theek hai']) {
    const input = inputFor(text);
    const fake = decisionFake([bookingRouting, preferred('PREFERRED')]);
    const parsed = await createRideSearchParser(fake, clock).parse(input);
    assert.equal(parsed.draft.vehicleClass.strength, 'PREFERRED');
    assert.equal(parsed.fallbackRequired, false);
    assert.ok(!validateLunaEvidence(structuredClone(parsed.draft)).some(value => value.code === 'LUNA_UNSUPPORTED_FACT'));
    const wrong = structuredClone(parsed.draft); wrong.vehicleClass.strength = 'REQUIRED';
    assert.ok(validateLunaEvidence(wrong).some(value => value.code === 'LUNA_UNSUPPORTED_FACT'));
    const wrongProvider = decisionFake([bookingRouting, preferred('REQUIRED')]);
    const rejected = await createRideSearchParser(wrongProvider, clock).parse(input);
    assert.ok(rejected.fallbackReasons.includes('JEV_INVALID_RESPONSE'));
  }
});

test('availability assertions are bounded, do not select alternatives and respect quotation', () => {
  for (const text of ['sedan मिले तो ठीक है', 'sedan mile toh theek hai']) {
    assert.equal(conditionalVehicleAfter(text, 5), true);
  }
  for (const text of ['sedan मिले तो ठीक हैनगर', 'sedan मिले तो ठीक नहीं है', 'sedan नहीं मिले तो ठीक है', 'sedan maybe available']) {
    assert.equal(conditionalVehicleAfter(text, 5), false);
  }
  assert.equal(conditionalVehicleAfter('"sedan mile toh theek hai"', 6), false);
  assert.deepEqual(observed('"सेडान मिले तो ठीक है"').unsupported, []);
});

test('Hindi rental recognition requires an affirmative bounded phrase outside protected names', () => {
  for (const text of ['कार किराए पर चाहिए', 'कैब किराये पर चाहिए', 'गाड़ी किराये पर चाहिए।']) {
    assert.deepEqual(observed(text).unsupported.map(value => value.kind), ['RENTAL']);
  }
  for (const text of ['गाड़ी किराये पर नहीं चाहिए', 'गाड़ी किराये पर चाहिएनगर', 'किराये नगर से घर', '"गाड़ी किराये पर चाहिए"']) {
    assert.deepEqual(observed(text).unsupported, []);
  }
  const input = inputFor('from गाड़ी किराये पर चाहिए to सेडान मिले तो ठीक है');
  const locations = ['गाड़ी किराये पर चाहिए', 'सेडान मिले तो ठीक है'].map((name, i) => candidateFor(input, name, `protected-${i}`));
  assert.deepEqual(collectObservations(input.query, locations).unsupported, []);
});

test('new unsupported source refs retain original UTF-16 positions and never synthesize endpoints', async () => {
  for (const text of ['😀 सेडान मिले तो ठीक है', '😀 गाड़ी किराये पर चाहिए']) {
    const input = inputFor(text), obs = collectObservations(input.query, []), draft = emptyDraft(input.query);
    assert.ok(obs.unsupported[0].ref.start >= 3);
    for (const entry of obs.unsupported) {
      assert.ok(text.slice(entry.ref.start, entry.ref.end).length > 0);
      assert.equal(entry.ref.queryId, input.query.id); assert.equal(entry.ref.revision, input.query.revision);
    }
    draft.unsupportedRequests = obs.unsupported.map(value => ({ kind: value.kind, refs: [value.ref], candidateIds: [], reasonCode: 'BACKEND_CAPABILITY_UNSUPPORTED' }));
    assert.deepEqual(validateDraftProvenance(draft), []);
    assert.equal(draft.pickup.state, 'UNSPECIFIED'); assert.equal(draft.drop.state, 'UNSPECIFIED');
  }
});

test('saved vehicle mistakes remain observable rather than being deterministically overwritten', async () => {
  for (const id of ['hh-v1-seed-007', 'hh-v1-added-033']) {
    const row = await fixture(id);
    assert.equal(row.parsed.draft.vehicleClass.state, 'AMBIGUOUS');
    assert.ok(row.parsed.issues.some(value => value.code === 'VEHICLE_CONFLICT'));
    assert.equal(row.form.submissionAllowed, false);
  }
  const row = await fixture('hh-v1-added-030');
  assert.ok(row.fallbackEligibility.includes('EXTRACTION_BINDING_UNRESOLVED'));
  assert.equal(row.parsed.draft.vehicleClass.state, 'EXCLUDED');
  assert.deepEqual(row.parsed.draft.vehicleClass.excluded, ['sedan']);
});

test('changed v6 wire requests are refused by exact replay and all other parser outcomes reproduce', async () => {
  const incompatible = [];
  for (const row of inputs) {
    const replay = await replayDevelopmentCase(row, terminal);
    if (!replay.compatible) incompatible.push(row.caseId);
    else assert.equal(replay.originalParseReproduced, true, row.caseId);
  }
  assert.deepEqual(incompatible.sort(), ['hh-v1-added-004', 'hh-v1-added-007', 'hh-v1-added-033']);
});

test('historical executor source fence rejects post-v6 sources without consuming any activation claim', async () => {
  const amendment = await load('output/search-v1-v6-retry-2026-11-03/execution-amendment-v2.json');
  await assert.rejects(verifySources(fileURLToPath(root), amendment.sourceManifest), error => error.category === 'SOURCE_DRIFT');
});

test('saved source-role and candidate-generation failures remain contained without role repair', async () => {
  const reversed = await fixture('hh-v1-added-003');
  assert.ok(reversed.fallbackEligibility.includes('ROLE_CONFLICT'));
  assert.equal(reversed.reviewRejection, 'INVALID_PARSE_RESULT');
  const correction = await fixture('hh-v1-added-032');
  assert.ok(correction.fallbackEligibility.includes('LOCATION_CANDIDATE_MISSING'));
  assert.equal(correction.parsed.draft.drop.state, 'UNSPECIFIED');
  const prefix = await fixture('hh-v1-added-018');
  const selected = prefix.parsed.draft.candidates.find(value => value.candidateId === prefix.parsed.draft.pickup.value.candidateId);
  assert.equal(selected.exactText, 'लंदन के समय पर एयरपोर्ट');
  assert.deepEqual(prefix.provenance, []); // valid source is distinct from a correct endpoint span
});

test('negation and explicit required strength survive the preferred-phrase extension', async () => {
  for (const text of ['SUV नहीं चाहिए, सेडान मिले तो ठीक है', 'SUV nahi chahiye, sedan mile toh theek hai']) {
    const fake = decisionFake([bookingRouting, { ...preferred('PREFERRED'), exclude_suv: 'EXCLUDED', exclude_suv_premium: 'EXCLUDED' }]);
    const parsed = await createRideSearchParser(fake, clock).parse(inputFor(text));
    assert.deepEqual(parsed.draft.vehicleClass.excluded, ['suv', 'suv_premium']);
    assert.equal(parsed.draft.vehicleClass.value, 'sedan');
    assert.equal(parsed.draft.vehicleClass.strength, 'PREFERRED');
  }
  const draft = emptyDraft(inputFor('only sedan').query);
  const batch = await decisionFake([preferred('REQUIRED')]).decide({ state: '{}', questions: Object.fromEntries([
    ...['hatchback', 'sedan', 'suv', 'suv_premium'].map(value => [`exclude_${value}`, { kind: 'choice', instructions: 'exclusion' }]),
    ...['vehicle_class', 'vehicle_any', 'vehicle_strength'].map(value => [value, { kind: 'choice', instructions: 'vehicle' }]),
  ]) });
  assert.equal(extractVehicle(draft, batch, collectObservations(draft.query, []), []).strength, 'REQUIRED');
});

test('unsupported rental remains submission-blocking even after all ordinary booking controls are supplied', async () => {
  for (const [text, kind, strength] of [
    ['सेडान अभी, गाड़ी किराये पर चाहिए', 'RENTAL', 'REQUIRED'],
    ['सेडान मिले तो ठीक है अभी', 'CONDITIONAL_PREFERENCE', 'PREFERRED'],
  ]) {
    const input = inputFor(text);
    const parsed = await createRideSearchParser(decisionFake([bookingRouting, {
      ...preferred(strength), unsupported_service: kind, timing_mode: 'IMMEDIATE',
    }]), clock).parse(input);
    let review = createLocationReview(parsed, clock.now(), input.timeZone);
    // Exercise the existing explicit user-selection APIs. No model creates or
    // confirms these synthetic selections; no Places or booking service is used.
    for (const role of ['pickup', 'drop']) {
      review = applyTrustedLocation(review, role, { selectionId: role, source: 'USER_SELECTED_SAVED_PLACE',
        lat: 28, lng: role === 'pickup' ? 77 : 78, displayText: role,
        confirmedByUser: 'selection', confirmedAt: clock.now().toISOString() });
    }
    review.derived = { fareQuote: 'fake-fare', route: 'fake-route', locationConfirmation: 'fake-locations', reviewConfirmation: 'fake-review' };
    const form = formResolution(review, clock);
    assert.equal(form.submissionAllowed, false);
    assert.deepEqual(form.resolutionRequirements.map(value => value.field), [kind]);
  }
});
