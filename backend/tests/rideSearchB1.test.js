import test from 'node:test';
import assert from 'node:assert/strict';
import { generateLocationCandidates } from '../services/search/locations/candidates.ts';
import { sourceHindiRole } from '../services/search/locations/hindiRoutes.ts';
import { collectObservations } from '../services/search/observations.ts';
import { statedVehicleExclusions } from '../services/search/vehiclePolicy.ts';
import { emptyDraft, parseInputSchema } from '../services/search/contracts.ts';
import { validateDirection } from '../services/search/validation.ts';
import { extractVehicle } from '../services/search/extractor.ts';
import { negativeRequirementAfter } from '../services/search/negation.ts';

const query = text => ({ id: 'b1-source', revision: 3, text });
const generate = text => generateLocationCandidates(query(text), 'BOOKING_REQUEST');
const phrases = text => generate(text).candidates.map(candidate => candidate.exactText);
const observations = text => collectObservations(query(text), []);

test('B1 source grammar covers forward, reverse, partial and mixed-script routes with exact spans', () => {
  for (const [text, expected] of [
    ['SNU se Botanical Garden jaana hai', ['SNU', 'Botanical Garden']],
    ['Kal subah campus se Botanical ki cab chahiye', ['campus', 'Botanical']],
    ['बोटैनिकल से SNU जाना है', ['बोटैनिकल', 'SNU']],
    ['Noida se Delhi ke liye cab', ['Noida', 'Delhi']],
    ['Mujhe kal shaam SNU se Delta 2 jaana hai', ['SNU', 'Delta 2']],
    ['Campus se Botanical kal 9 baje', ['Campus', 'Botanical']],
    ['Kal shaam Botanical se campus wapas jaana hai', ['Botanical', 'campus']],
    ['airport jaana hai subah', ['airport']],
    ['return cab delta 2 se', ['delta 2']],
    ['SUV only kal campus se', ['campus']],
    ['airport drop chahiye hostel se', ['airport', 'hostel']],
    ['Airport jaana hai Hostel se', ['Airport', 'Hostel']],
    ['5 December ko Delhi jaana hai', ['Delhi']],
    ['beta 1 jaana hai alpha 2 se, subah 9 baje', ['beta 1', 'alpha 2']],
    ['Delta 2 jaana hai campus se tomorrow at 8 PM', ['Delta 2', 'campus']],
    ['airport se hotel tomorrow 6 PM London time', ['airport', 'hotel']],
    ['campus se Gate 3 tomorrow', ['campus', 'Gate 3']],
    ['कल सेडान चाहिए, स्टेशन से होटल; हम तीन लोग हैं', ['स्टेशन', 'होटल']],
  ]) {
    const result = generate(text);
    assert.deepEqual(result.candidates.map(candidate => candidate.exactText), expected, text);
    assert.equal(parseInputSchema.safeParse({ query: query(text), candidates: result.candidates, timeZone: 'Asia/Kolkata' }).success, true);
    for (const candidate of result.candidates) assert.equal(text.slice(candidate.start, candidate.end), candidate.exactText);
  }
});

test('B1 quoted separators, temporal place names and UTF-16 offsets stay original', () => {
  assert.deepEqual(phrases('"Lake se Park" se "Kal Nagar" jaana hai'), ['Lake se Park', 'Kal Nagar']);
  assert.deepEqual(phrases('Kal Nagar se Subah Cafe jaana hai'), ['Kal Nagar', 'Subah Cafe']);
  assert.deepEqual(phrases('Tomorrow Cafe se Morning Park jaana hai'), ['Tomorrow Cafe', 'Morning Park']);
  const text = '😀 कैंपस से "Se Cafe" जाना है';
  const result = generate(text);
  assert.deepEqual(result.candidates.map(candidate => candidate.exactText), ['😀 कैंपस', 'Se Cafe']);
  assert.equal(result.candidates[1].start, text.indexOf('Se Cafe'));
  assert.equal(observations('from Kal Nagar to Subah Cafe').dates.length, 0);
  assert.deepEqual(generateLocationCandidates(query('Se Cafe'), 'LOCATION_SEARCH').candidates.map(value => value.exactText), ['Se Cafe']);
  assert.deepEqual(phrases('from Se Cafe to Delhi'), ['Se Cafe', 'Delhi']);
  assert.deepEqual(phrases('"campus se botanical"'), []);
  assert.deepEqual(phrases('"campus se botanical'), []);
  assert.deepEqual(phrases('Lake se Park se Delhi jaana hai'), []);
  assert.deepEqual(phrases('Noida ko Delhi'), []);
});

test('B1 role guard rejects opposite roles without assigning a model role or geography', () => {
  for (const text of ['कैंपस से स्टेशन जाना है', 'Campus se Botanical kal 9 baje', 'Airport jaana hai Hostel se']) {
    for (const candidate of generate(text).candidates) {
      const role = sourceHindiRole(text, candidate.start, candidate.end);
      assert.ok(role);
      const draft = emptyDraft(query(text)); draft.candidates = [candidate];
      draft[role === 'pickup' ? 'drop' : 'pickup'] = { state: 'RESOLVED', value: { kind: 'QUERY_CANDIDATE', candidateId: candidate.candidateId }, refs: [] };
      const issues = []; validateDirection(draft, issues);
      assert.ok(issues.some(value => value.code === 'ROLE_CONFLICT'));
      assert.equal('placeId' in candidate, false);
    }
  }
});

test('B1 Hindi exclusion scopes preserve generic SUV semantics and positive alternatives', () => {
  for (const [text, expected] of [
    ['SUV nahi chahiye', ['suv', 'suv_premium']], ['SUV नहीं चाहिए', ['suv', 'suv_premium']],
    ['Sedan chahiye, SUV nahi', ['suv', 'suv_premium']], ['SUV nahi, sedan chahiye', ['suv', 'suv_premium']],
    ['suv chahiye par sedan nahi', ['sedan']], ['sedan mat bhejna', ['sedan']],
    ['premium SUV nahi chahiye', ['suv_premium']], ['regular SUV nahi chahiye', ['suv']],
    ['SUV Hotel', []], ['"SUV nahi" Cafe', []], ['SUV nahi toh sedan', []],
  ]) assert.deepEqual(statedVehicleExclusions({ query: query(text) }, observations(text).vehicles), expected, text);
  assert.equal(negativeRequirementAfter('SUV nahinagar', 3), false);
});

test('B1 apostrophes in English contractions do not quote vehicle exclusions', () => {
  const text = "don't send SUV, don't send sedan";
  assert.deepEqual(statedVehicleExclusions({ query: query(text) }, observations(text).vehicles), ['suv', 'suv_premium', 'sedan']);
  assert.deepEqual(statedVehicleExclusions({ query: query("'SUV nahi' Cafe") }, observations("'SUV nahi' Cafe").vehicles), []);
  assert.deepEqual(phrases("O'Hare se Delhi jaana hai"), ["O'Hare", 'Delhi']);
});

test('B1 negative sharing binds the whole original phrase and conflicts stay explicit', () => {
  for (const text of ['Sharing nahi karni', 'shared cab nahi chahiye', 'साझा कैब नहीं चाहिए']) {
    const flags = observations(text).flags.sharing;
    assert.equal(flags.length, 1); assert.equal(flags[0].value, false);
    assert.equal(text.slice(flags[0].ref.start, flags[0].ref.end), flags[0].text);
  }
  assert.deepEqual(observations('sharing nahi, sharing chahiye').flags.sharing.map(value => value.value), [false, true]);
});

test('B1 AC polarity and return wording stay unsupported instead of becoming booking flags', () => {
  for (const text of ['AC car mat dena', 'Non AC chahiye', 'AC car nahi chahiye']) {
    const found = observations(text);
    assert.ok(found.unsupported.some(value => value.kind === 'AC_PREFERENCE'));
    assert.equal('ac' in found.flags, false);
  }
  assert.ok(observations('Botanical se campus wapas jaana hai').unsupported.some(value => value.kind === 'RETURN_JOURNEY'));
  assert.ok(observations('SUV nahi toh sedan').unsupported.some(value => value.kind === 'CONDITIONAL_PREFERENCE'));
});

test('B1 conditional preference uses source evidence and cannot default an excluded class', () => {
  const text = 'SUV nahi chahiye, sedan mile toh theek hai from office to hotel';
  const observed = observations(text), draft = emptyDraft(query(text));
  const choices = Object.fromEntries(Object.entries({ exclude_hatchback: 'NOT_EXCLUDED', exclude_sedan: 'NOT_EXCLUDED',
    exclude_suv: 'EXCLUDED', exclude_suv_premium: 'EXCLUDED', vehicle_class: 'sedan', vehicle_any: 'NOT_STATED',
    vehicle_strength: 'PREFERRED' }).map(([key, choice]) => [key, { choice, confidence: 1 }]));
  const field = extractVehicle(draft, { choices, diagnostics: {}, metadata: {} }, observed, []);
  assert.equal(field.state, 'RESOLVED'); assert.equal(field.value, 'sedan');
  assert.equal(field.strength, 'PREFERRED'); assert.deepEqual(field.excluded, ['suv', 'suv_premium']);
});

test('B1 candidate grammar retains query and aggregate resource limits', () => {
  assert.equal(generate(`${'x'.repeat(501)} से Delhi`).issues[0].code, 'LIMIT_EXCEEDED');
  assert.equal(generate(`${'x'.repeat(2001)} से Delhi`).issues[0].code, 'LIMIT_EXCEEDED');
});
