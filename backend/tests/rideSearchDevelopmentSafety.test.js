import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { frozenSearchDevelopment } from '../benchmarks/search/freeze.js';
import { emptyDraft } from '../services/search/contracts.ts';
import { preserveOwnerConflicts } from '../services/search/complex/ownerConflicts.ts';
import { collectObservations } from '../services/search/observations.ts';
import { extractVehicle } from '../services/search/extractor.ts';
import { resolutionRequirements } from '../services/search/locations/followup.ts';
import { issue } from '../services/search/fields.ts';
import { sourceTimeZone, timeZoneTokens } from '../services/search/timezonePolicy.ts';
import { generateLocationCandidates } from '../services/search/locations/candidates.ts';

test('a self-consistent attacker checksum cannot replace the frozen owner-approved model input', () => {
  const path = process.env.RCS_SEARCH_FROZEN_DATASET_PATH ?? new URL('../../docs/search/benchmark-v1/frozen-v1/dataset.json', import.meta.url);
  const snapshot = JSON.parse(readFileSync(path));
  assert.equal(frozenSearchDevelopment(snapshot).length, 222);
  const corrupt = structuredClone(snapshot);
  corrupt.records[0].modelInput.context.clock = '2026-10-04T13:00:00+05:30';
  corrupt.datasetHash = createHash('sha256').update(JSON.stringify(corrupt.records)).digest('hex');
  assert.throws(() => frozenSearchDevelopment(corrupt), /FROZEN_SEARCH_CHANGED/);
});

test('conditional alternatives retain precise repeated and overlapping spans, distinct IDs and explicit destination requirement', () => {
  const text = 'from X to Airport, but if my flight changes take me to Airport';
  const draft = emptyDraft({ id: 'conditional-source', revision: 1, text });
  const result = preserveOwnerConflicts(draft, collectObservations(draft.query, []));
  const starts = [text.indexOf('Airport'), text.lastIndexOf('Airport')];
  assert.deepEqual(draft.drop.refs.map(ref => ref.start), starts);
  assert.equal(new Set(draft.drop.alternatives.map(value => value.candidateId)).size, 2);
  assert.deepEqual(result[0], issue('DESTINATION_SELECTION_REQUIRED', 'drop', 'AMBIGUOUS', draft.drop.refs));
  assert.equal(draft.drop.reasonCode, 'DESTINATION_SELECTION_REQUIRED');
  for (const candidate of draft.candidates) {
    assert.match(candidate.candidateId, /^owner-span:[a-f0-9]{64}$/);
    assert.equal(candidate.generatorVersion, 'owner-conditional-source-v1');
    assert.equal(candidate.method, 'LUNA_SOURCE_SPAN');
    assert.equal(candidate.exactText, text.slice(candidate.start, candidate.end));
  }
  const overlapping = emptyDraft({ id: 'overlap', revision: 1, text: 'from X to Airport Gate 3, but if my flight changes take me to Library' });
  overlapping.candidates = [{ candidateId: 'short-overlap', queryId: 'overlap', queryRevision: 1, start: 10, end: 17,
    exactText: 'Airport', method: 'OVERLAPPING_ALTERNATIVE', generatorVersion: 'fixture' }];
  preserveOwnerConflicts(overlapping, collectObservations(overlapping.query, []));
  assert.equal(overlapping.drop.refs[0].end, 24);
  assert.notEqual(overlapping.drop.alternatives[0].candidateId, 'short-overlap');
});

test('exactly four competing times remain ambiguous with complete provenance and no silent choice', () => {
  const text = 'at 6:30PM   and   at 8:45PM and at 10PM and at 11PM';
  const draft = emptyDraft({ id: 'times', revision: 1, text });
  const result = preserveOwnerConflicts(draft, collectObservations(draft.query, []));
  assert.equal(draft.timing.time.state, 'AMBIGUOUS');
  assert.equal(draft.timing.time.alternatives.length, 4);
  assert.equal(draft.timing.time.reasonCode, 'TIME_SELECTION_REQUIRED');
  assert.equal(draft.timing.time.refs.length, 4);
  assert.deepEqual(result[0], issue('TIME_SELECTION_REQUIRED', 'timing.time', 'AMBIGUOUS', draft.timing.time.refs));
  assert.equal(draft.timing.time.alternatives.every(time => time.kind === 'CLOCK'), true);
  const one = emptyDraft({ id: 'one', revision: 1, text: 'at 6PM or tomorrow' });
  assert.deepEqual(preserveOwnerConflicts(one, collectObservations(one.query, [])), []);
  const repeated = emptyDraft({ id: 'same-time', revision: 1, text: 'at 6PM and at 6PM' });
  assert.deepEqual(preserveOwnerConflicts(repeated, collectObservations(repeated.query, [])), []);
});

const batch = choices => ({ choices: Object.fromEntries(Object.entries({ exclude_hatchback: 'NOT_EXCLUDED', exclude_sedan: 'NOT_EXCLUDED',
  exclude_suv: 'NOT_EXCLUDED', exclude_suv_premium: 'NOT_EXCLUDED', ...choices }).map(([key, choice]) => [key, { choice, confidence: 0.9 }])) });
test('categorical uncertainty and inconsistent ANY strength remain a vehicle conflict, without invented preference', () => {
  for (const changes of [{ vehicle_class: 'UNCLEAR' }, { vehicle_strength: 'UNCLEAR' }, { vehicle_any: 'UNCLEAR' },
    { vehicle_any: 'EXPLICIT_ANY' }]) {
    const draft = emptyDraft({ id: 'vehicle', revision: 1, text: 'SUV' }); const issues = [];
    const value = extractVehicle(draft, batch({ vehicle_class: 'suv', vehicle_strength: 'REQUIRED', vehicle_any: 'NOT_STATED', exclude_suv: 'NOT_EXCLUDED', ...changes }), collectObservations(draft.query, []), issues);
    assert.equal(value.state, 'AMBIGUOUS'); assert.equal(value.reasonCode, 'VEHICLE_CONFLICT');
    assert.equal(issues[0].code, 'VEHICLE_CONFLICT');
  }
  const draft = emptyDraft({ id: 'any', revision: 1, text: 'sedan' });
  assert.throws(() => extractVehicle(draft, batch({ vehicle_class: 'suv', vehicle_strength: 'REQUIRED', vehicle_any: 'NOT_STATED' }),
    collectObservations(draft.query, []), []), error => error.code === 'JEV_INVALID_RESPONSE');
});

test('a class request cannot be silently softened and a stated preference cannot become a requirement', () => {
  for (const [text, vehicle] of [['hatchback', 'hatchback'], ['outstation sedan from campus to airport', 'sedan'], ['SUV tomorrow', 'suv']]) {
    const draft = emptyDraft({ id: 'required-class', revision: 1, text });
    const observed = collectObservations(draft.query, []);
    const choices = { vehicle_class: vehicle, vehicle_strength: 'PREFERRED', vehicle_any: 'NOT_STATED' };
    assert.throws(() => extractVehicle(draft, batch(choices), observed, []), error => error.code === 'JEV_INVALID_RESPONSE');
    assert.equal(extractVehicle(draft, batch({ ...choices, vehicle_strength: 'REQUIRED' }), observed, []).strength, 'REQUIRED');
  }
  for (const text of ['prefer sedan', 'sedan preferred', 'ideally sedan', 'sedan if available', 'sedan if possible',
    'PREFER sedan', 'SEDAN PREFERRED', 'IDEALLY sedan', 'sedan IF AVAILABLE',
    'prefer   sedan', 'sedan  preferred', 'sedan if  available', 'only prefer sedan']) {
    const draft = emptyDraft({ id: 'preferred-class', revision: 1, text });
    const observed = collectObservations(draft.query, []);
    const choices = { vehicle_class: 'sedan', vehicle_strength: 'REQUIRED', vehicle_any: 'NOT_STATED' };
    assert.throws(() => extractVehicle(draft, batch(choices), observed, []), error => error.code === 'JEV_INVALID_RESPONSE');
    assert.equal(extractVehicle(draft, batch({ ...choices, vehicle_strength: 'PREFERRED' }), observed, []).strength, 'PREFERRED');
  }
  for (const text of ['prefer sedan  only', 'only  sedan preferred']) {
    const draft = emptyDraft({ id: 'explicit-only', revision: 1, text });
    const observed = collectObservations(draft.query, []);
    assert.throws(() => extractVehicle(draft, batch({ vehicle_class: 'sedan', vehicle_strength: 'PREFERRED', vehicle_any: 'NOT_STATED' }),
      observed, []), error => error.code === 'JEV_INVALID_RESPONSE');
  }
});

test('unit phrases with repeated whitespace cannot become pickup clocks merely because tomorrow is mentioned', () => {
  for (const unit of ['people', 'hours', 'minutes', 'km']) {
    const query = { id: 'units', revision: 1, text: `tomorrow 7   ${unit}` };
    assert.deepEqual(collectObservations(query, []).times, []);
  }
});

test('a grounded role does not erase a stale Places issue when the effective endpoint is missing', () => {
  const draft = emptyDraft({ id: 'missing-endpoint', revision: 1, text: 'cab' });
  const result = resolutionRequirements(draft, [issue('PLACES_TIMEOUT', 'pickup', 'DEPENDENCY')], [], new Set(['pickup']));
  assert.equal(result.some(entry => entry.code === 'PLACES_TIMEOUT'), true);
});

test('timezone masking uses half-open source spans; three-segment IANA identifiers remain whole', () => {
  assert.equal(sourceTimeZone('Campus UTC', 'Asia/Kolkata', [{ start: 0, end: 7 }]), 'UTC');
  assert.equal(sourceTimeZone('UTC Campus', 'Asia/Kolkata', [{ start: 3, end: 10 }]), 'UTC');
  const zone = 'America/Argentina/Buenos_Aires';
  assert.deepEqual(timeZoneTokens(zone), [{ start: 0, end: zone.length, text: zone }]);
  assert.equal(sourceTimeZone(zone, 'Asia/Kolkata'), new Intl.DateTimeFormat('en', { timeZone: zone }).resolvedOptions().timeZone);
  assert.equal(sourceTimeZone('', 'EST5EDT'), new Intl.DateTimeFormat('en', { timeZone: 'EST5EDT' }).resolvedOptions().timeZone);
  assert.equal(sourceTimeZone('', 'Australia/West'), new Intl.DateTimeFormat('en', { timeZone: 'Australia/West' }).resolvedOptions().timeZone);
});

test('a zone-like token followed by location words cannot strip the remaining endpoint phrase', () => {
  const text = 'from campus to Airport tomorrow at 7 UTC terminal';
  const result = generateLocationCandidates({ id: 'zone-suffix', revision: 1, text }, 'BOOKING_REQUEST');
  assert.equal(result.candidates.some(candidate => candidate.exactText === 'Airport tomorrow at 7 UTC terminal'), true);
  assert.equal(result.candidates.some(candidate => candidate.exactText === 'Airport'), false);
});
