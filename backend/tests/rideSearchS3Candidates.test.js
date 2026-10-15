import test from 'node:test';
import assert from 'node:assert/strict';
import { SEARCH_LIMITS, parseInputSchema } from '../services/search/contracts.ts';
import { generateLocationCandidates } from '../services/search/locations/candidates.ts';
import { collectObservations } from '../services/search/observations.ts';

const query = (text, revision = 3) => ({ id: 'search-query', revision, text });
const phrases = result => result.candidates.map(candidate => candidate.exactText);

test('candidate normalization preserves original spacing and stable versioned identifier shape', () => {
  const input = query('from Jaypee\t  main gate to Airport');
  const generated = generateLocationCandidates(input, 'BOOKING_REQUEST');
  assert.deepEqual(phrases(generated), ['Jaypee\t  main gate', 'Airport']);
  assert.equal(generated.candidates[0].normalizedText, 'Jaypee main gate');
  for (const candidate of generated.candidates) {
    assert.match(candidate.candidateId, /^loc_[a-f0-9]{24}$/);
    assert.equal(candidate.generatorVersion, 'ride-search-location-candidates-v4');
    assert.equal(candidate.exactText, input.text.slice(candidate.start, candidate.end));
  }
});

test('bare route prefixes preserve vehicle and passenger clauses outside the location spans', () => {
  for (const prefix of ['SUV', 'SUV only', 'prefer SUV', 'SUV tomorrow', 'any car', 'anything except sedan', '3 people', 'SUV premium']) {
    const generated = generateLocationCandidates(query(`${prefix} to Airport`), 'BOOKING_REQUEST');
    assert.deepEqual(phrases(generated), ['Airport'], prefix);
    assert.deepEqual(generated.issues, [], prefix);
  }
  assert.deepEqual(phrases(generateLocationCandidates(query('from SUV Hotel to Airport'), 'BOOKING_REQUEST')), ['SUV Hotel', 'Airport']);
});

test('standalone location preserves trim, exact UTF-16 span, and revision-bound stable IDs', () => {
  const input = query('  😀 Pari Chowk  ');
  const first = generateLocationCandidates(input, 'LOCATION_SEARCH');
  const second = generateLocationCandidates(input, 'LOCATION_SEARCH');
  assert.deepEqual(phrases(first), ['😀 Pari Chowk']);
  assert.equal(first.candidates[0].start, 2);
  assert.equal(first.candidates[0].end, 15);
  assert.equal(first.candidates[0].exactText, input.text.slice(2, 15));
  assert.equal(first.candidates[0].method, 'WHOLE_LOCATION_QUERY');
  assert.equal(first.candidates[0].candidateId, second.candidates[0].candidateId);
  assert.notEqual(first.candidates[0].candidateId, generateLocationCandidates(query(input.text, 4), 'LOCATION_SEARCH').candidates[0].candidateId);
  assert.equal(parseInputSchema.safeParse({ query: input, candidates: first.candidates, timeZone: 'Asia/Kolkata' }).success, true);
  assert.deepEqual(generateLocationCandidates(query(' \t,; '), 'LOCATION_SEARCH'), { candidates: [], issues: [] });
});

test('deterministic route phrases retain useful landmark clauses and explicit stops', () => {
  const direct = generateLocationCandidates(query('from hostel gate near tea stall to IGI Airport tomorrow at 7 PM'), 'BOOKING_REQUEST');
  assert.deepEqual(phrases(direct), ['hostel gate', 'hostel gate near tea stall', 'IGI Airport']);
  assert.equal(direct.candidates[0].method, 'OVERLAPPING_ALTERNATIVE');
  const stops = generateLocationCandidates(query('Campus via Sector 18 to Airport'), 'BOOKING_REQUEST');
  assert.deepEqual(phrases(stops), ['Campus', 'Sector 18', 'Airport']);
  const labelled = generateLocationCandidates(query('pickup: Gate 3; drop: Tomorrow Cafe'), 'BOOKING_REQUEST');
  assert.deepEqual(phrases(labelled), ['Gate 3', 'Tomorrow Cafe']);
  assert.ok(labelled.candidates.every(candidate => candidate.method === 'LABELLED_FIELD'));
});

test('supported grammar variants return spans without assigning pickup or drop roles', () => {
  assert.deepEqual(phrases(generateLocationCandidates(query('pick me at Home drop at Railway Station'), 'BOOKING_REQUEST')), ['Home', 'Railway Station']);
  assert.deepEqual(phrases(generateLocationCandidates(query('drop me at Airport from Sector 62'), 'BOOKING_REQUEST')), ['Airport', 'Sector 62']);
  assert.deepEqual(phrases(generateLocationCandidates(query('Airport jaana hai Hostel se'), 'BOOKING_REQUEST')), ['Airport', 'Hostel']);
  assert.deepEqual(phrases(generateLocationCandidates(query('campus se Pari Chowk'), 'BOOKING_REQUEST')), ['campus', 'Pari Chowk']);
  assert.deepEqual(phrases(generateLocationCandidates(query('Noida to Delhi'), 'BOOKING_REQUEST')), ['Noida', 'Delhi']);
});

test('safe failures do not invent candidates or hide explicit generation failure', () => {
  assert.deepEqual(generateLocationCandidates(query('hello'), 'UNCLEAR_OR_UNRELATED'), { candidates: [], issues: [] });
  const failure = generateLocationCandidates(query('from   to   '), 'BOOKING_REQUEST');
  assert.deepEqual(failure.issues, [{ code: 'LOCATION_CANDIDATE_GENERATION_FAILED', field: 'candidates', category: 'DEPENDENCY', refs: [{ kind: 'QUERY_SPAN', queryId: 'search-query', revision: 3, start: 0, end: 12 }], values: undefined }]);
  const tooLong = generateLocationCandidates(query('x'.repeat(SEARCH_LIMITS.queryLength + 1)), 'LOCATION_SEARCH');
  assert.equal(tooLong.issues[0].code, 'LIMIT_EXCEEDED');
  assert.equal(tooLong.issues[0].category, 'INVALID');
  assert.equal(generateLocationCandidates({ id: '', revision: -1, text: 'Airport' }, 'LOCATION_SEARCH').issues[0].code, 'INVALID_QUERY');
  for (const invalid of [
    { id: 9, revision: 0, text: 'Airport' },
    { id: 'query', revision: 1.5, text: 'Airport' },
    { id: 'query', revision: 0, text: null },
  ]) assert.equal(generateLocationCandidates(invalid, 'LOCATION_SEARCH').issues[0].code, 'INVALID_QUERY');
});

test('resource boundaries retain valid values and return precise, redacted field errors', () => {
  const valid = generateLocationCandidates(query(`from ${'a'.repeat(500)} to Airport`), 'BOOKING_REQUEST');
  assert.equal(valid.issues.length, 0);
  assert.equal(valid.candidates[0].exactText.length, 500);
  assert.deepEqual(generateLocationCandidates(query('x'.repeat(SEARCH_LIMITS.queryLength)), 'UNCLEAR_OR_UNRELATED'), { candidates: [], issues: [] });
  assert.deepEqual(generateLocationCandidates(query('x'.repeat(SEARCH_LIMITS.queryLength + 1)), 'BOOKING_REQUEST').issues,
    [{ code: 'LIMIT_EXCEEDED', field: 'query', category: 'INVALID', refs: [], values: undefined }]);
  for (const malformed of [{ id: '', revision: 0, text: 'Airport' }, { id: 3, revision: 0, text: 'Airport' },
    { id: 'q', revision: -1, text: 'Airport' }, { id: 'q', revision: 1.5, text: 'Airport' }, { id: 'q', revision: 0, text: 5 }]) {
    assert.deepEqual(generateLocationCandidates(malformed, 'LOCATION_SEARCH'),
      { candidates: [], issues: [{ code: 'INVALID_QUERY', field: 'query', category: 'INVALID', refs: [], values: undefined }] });
  }
  assert.deepEqual(generateLocationCandidates(query('Airport', 0), 'LOCATION_SEARCH').issues, []);
});

test('pathological bounded inputs have deterministic unique IDs and no Luna spans', () => {
  const text = Array.from({ length: 40 }, (_, index) => `P${index} to D${index}`).join(' and ');
  const result = generateLocationCandidates(query(text), 'BOOKING_REQUEST');
  assert.ok(result.candidates.length <= SEARCH_LIMITS.candidates);
  assert.ok(result.candidates.every(candidate => candidate.method !== 'LUNA_SOURCE_SPAN'));
  assert.equal(new Set(result.candidates.map(candidate => candidate.candidateId)).size, result.candidates.length);
  assert.equal(result.candidates.reduce((sum, candidate) => sum + candidate.exactText.length, 0) <= SEARCH_LIMITS.aggregateCandidateText, true);
});

test('instruction boundaries preserve named landmarks and do not turn vehicle nouns into origins', () => {
  assert.deepEqual(phrases(generateLocationCandidates(query('from Gate 3 to Hotel Tomorrow Cafe'), 'BOOKING_REQUEST')), ['Gate 3', 'Hotel Tomorrow Cafe']);
  assert.deepEqual(phrases(generateLocationCandidates(query('from Jaypee sedan gate to Sector 6'), 'BOOKING_REQUEST')), ['Jaypee sedan gate', 'Sector 6']);
  assert.deepEqual(phrases(generateLocationCandidates(query('cab to Airport'), 'BOOKING_REQUEST')), ['Airport']);
  assert.deepEqual(phrases(generateLocationCandidates(query('pick me from hostel gate near the tea stall and go to botanical garden'), 'BOOKING_REQUEST')), ['hostel gate', 'hostel gate near the tea stall', 'botanical garden']);
  assert.deepEqual(phrases(generateLocationCandidates(query('pick me from campus and drop me at Pari Chowk'), 'BOOKING_REQUEST')), ['campus', 'Pari Chowk']);
});

test('near landmarks retain one useful overlapping alternative without hiding the full phrase', () => {
  const result = generateLocationCandidates(query('from Jaypee main gate near Gate 3 to Airport'), 'BOOKING_REQUEST');
  assert.deepEqual(phrases(result), ['Jaypee main gate', 'Jaypee main gate near Gate 3', 'Airport']);
  assert.equal(result.candidates[0].method, 'OVERLAPPING_ALTERNATIVE');
  assert.equal(result.candidates.filter(candidate => candidate.method === 'OVERLAPPING_ALTERNATIVE').length, 1);
});

test('directional alternatives preserve the complete source phrase for later bounded interpretation', () => {
  const input = query('Campus to Airport pick at Home');
  const generated = generateLocationCandidates(input, 'BOOKING_REQUEST');
  const alternative = generated.candidates.find(candidate => candidate.exactText === 'Airport pick at Home');
  assert.ok(alternative, 'the generator must preserve the full alternative rather than decide the journey');
  assert.equal(alternative.start, 10);
  assert.equal(alternative.end, input.text.length);
  assert.equal(input.text.slice(alternative.start, alternative.end), alternative.exactText);
  assert.ok(phrases(generated).includes('Airport'));
  assert.ok(phrases(generated).includes('Home'));
});

test('a clock suffix with repeated whitespace is still kept out of the location phrase', () => {
  const generated = generateLocationCandidates(query('from Delhi 7  pm'), 'BOOKING_REQUEST');
  assert.deepEqual(phrases(generated), ['Delhi']);
  assert.equal(generated.candidates[0].start, 5);
  assert.equal(generated.candidates[0].end, 10);
});

test('whole-route grammars do not silently reinterpret the last line of a multiline request', () => {
  const forward = generateLocationCandidates(query('Campus se Airport\nHostel se Delhi'), 'BOOKING_REQUEST');
  assert.deepEqual(forward.candidates, []);
  assert.equal(forward.issues[0].code, 'LOCATION_CANDIDATE_GENERATION_FAILED');
  const direct = generateLocationCandidates(query('Campus to Airport\nHostel to Delhi'), 'BOOKING_REQUEST');
  assert.deepEqual(phrases(direct), ['Delhi']);
  assert.equal(phrases(direct).includes('Hostel'), false);
});

test('each uncertain near phrase retains its own alternative until a resource cap fails closed', () => {
  const route = count => Array.from({ length: count }, (_, index) => `from O${index} near Gate ${index} to D${index}`).join(' ');
  const atCap = generateLocationCandidates(query(route(8)), 'BOOKING_REQUEST');
  assert.equal(atCap.issues.length, 0);
  assert.equal(atCap.candidates.length, SEARCH_LIMITS.candidates);
  assert.equal(atCap.candidates.filter(candidate => candidate.method === 'OVERLAPPING_ALTERNATIVE').length, 8);
  const overCap = generateLocationCandidates(query(route(9)), 'BOOKING_REQUEST');
  assert.deepEqual(overCap.candidates, []);
  assert.equal(overCap.issues[0].code, 'LIMIT_EXCEEDED');
});

test('candidate resource caps fail closed at the first excess without truncating meaning', () => {
  const route = count => Array.from({ length: count }, (_, index) => `from O${index} to D${index}`).join(' ');
  const atCap = generateLocationCandidates(query(route(12)), 'BOOKING_REQUEST');
  assert.equal(atCap.issues.length, 0);
  assert.equal(atCap.candidates.length, SEARCH_LIMITS.candidates);
  const aboveCap = generateLocationCandidates(query(route(13)), 'BOOKING_REQUEST');
  assert.deepEqual(aboveCap.candidates, []);
  assert.equal(aboveCap.issues[0].code, 'LIMIT_EXCEEDED');
  const tooWide = generateLocationCandidates(query(`from ${'a'.repeat(501)} to Airport`), 'BOOKING_REQUEST');
  assert.deepEqual(tooWide.candidates, []);
  assert.equal(tooWide.issues[0].field, 'candidates');
});

test('overlapping detector results enforce the aggregate text cap independently of count and single-span limits', () => {
  const segment = `from via pickup: L${'a'.repeat(462)} near Z to`;
  const input = query([segment, segment, segment].join(' '));
  assert.ok(input.text.length < SEARCH_LIMITS.queryLength);
  const exceeded = generateLocationCandidates(input, 'BOOKING_REQUEST');
  assert.deepEqual(exceeded.candidates, []);
  assert.deepEqual(exceeded.issues.map(value => [value.code, value.field]), [['LIMIT_EXCEEDED', 'candidates']]);

  const ordinary = `from via pickup: L${'a'.repeat(433)} near Z to`;
  const atLimit = query([`from via  pickup: L${'a'.repeat(433)} near ZZ to`, ordinary, ordinary].join(' '));
  const accepted = generateLocationCandidates(atLimit, 'BOOKING_REQUEST');
  assert.deepEqual(accepted.issues, []);
  assert.equal(accepted.candidates.length, 18);
  assert.equal(accepted.candidates.reduce((sum, candidate) => sum + candidate.exactText.length, 0), SEARCH_LIMITS.aggregateCandidateText);
  assert.ok(accepted.candidates.every(candidate => candidate.exactText.length <= 500 && candidate.exactText === atLimit.text.slice(candidate.start, candidate.end)));
});

test('candidate generation deduplicates repeated grammar matches and IDs cannot depend on concatenated field delimiters', () => {
  const input = query('Noida to Delhi');
  const first = generateLocationCandidates(input, 'BOOKING_REQUEST');
  const second = generateLocationCandidates({ ...input, id: 'search-query\u001f3\u001fride-search-location-candidates-v4\u001f0\u001f5' }, 'BOOKING_REQUEST');
  assert.equal(first.candidates.length, 2);
  assert.notEqual(first.candidates[0].candidateId, second.candidates[0].candidateId);
  assert.ok(first.candidates.every(candidate => candidate.exactText === input.text.slice(candidate.start, candidate.end)));
  assert.ok(first.candidates.every(candidate => candidate.alsoDetectedBy === undefined));
});

test('repeated location words retain distinct UTF-16 spans and revision-bound IDs', () => {
  const input = query('from 😀 Gate to 😀 Gate');
  const generated = generateLocationCandidates(input, 'BOOKING_REQUEST');
  assert.deepEqual(phrases(generated), ['😀 Gate', '😀 Gate']);
  assert.notEqual(generated.candidates[0].candidateId, generated.candidates[1].candidateId);
  assert.deepEqual(generated.candidates.map(candidate => [candidate.start, candidate.end]), [[5, 12], [16, 23]]);
  assert.ok(generated.candidates.every(candidate => candidate.exactText === input.text.slice(candidate.start, candidate.end)));
});

test('clear timing suffixes stay outside candidate spans for observation extraction', () => {
  const input = query('from campus to airport tomorrow at 6 PM');
  const generated = generateLocationCandidates(input, 'BOOKING_REQUEST');
  assert.deepEqual(phrases(generated), ['campus', 'airport']);
  const observations = collectObservations(input, generated.candidates);
  assert.equal(observations.dates.length, 1);
  assert.equal(observations.times.length, 1);
});

test('delimited instructions are stripped only outside locations and whitespace grammar stays exact', () => {
  const cases = [
    ['from Tomorrow Cafe, tomorrow to Sector 6; SUV premium only', ['Tomorrow Cafe', 'Sector 6']],
    ['from Gate 3 — please to Airport, call me', ['Gate 3', 'Airport']],
    ['pickup location =  Home Base  drop-off location:  Office Park', ['Home Base', 'Office Park']],
    ['pick up: Campus via Sector 18 to Airport', ['Campus', 'Sector 18', 'Airport']],
    ['from   Gate 3   to   Airport', ['Gate 3', 'Airport']],
  ];
  for (const [text, expected] of cases) {
    const generated = generateLocationCandidates(query(text), 'BOOKING_REQUEST');
    assert.deepEqual(phrases(generated), expected, text);
    assert.ok(generated.candidates.every(candidate => candidate.exactText === text.slice(candidate.start, candidate.end)), text);
  }
});

test('word-boundary grammar rejects operator-only and embedded marker false candidates', () => {
  for (const text of ['from to', 'cab from to', 'tomorrow', 'platform to', 'pickup:   ; drop:   ']) {
    const generated = generateLocationCandidates(query(text), 'BOOKING_REQUEST');
    assert.deepEqual(generated.candidates, [], text);
  }
  assert.deepEqual(phrases(generateLocationCandidates(query('from Gate 3 to Airport'), 'BOOKING_REQUEST')), ['Gate 3', 'Airport']);
});

test('booking command infinitives never become locations or mask partial vehicle observations', () => {
  for (const text of ['pick an SUV', 'go now', 'I want to book an SUV tomorrow', 'please reserve a sedan', 'hire a car']) {
    const generated = generateLocationCandidates(query(text), 'BOOKING_REQUEST');
    assert.deepEqual(generated, { candidates: [], issues: [] }, text);
  }
  const input = query('I want to book an SUV tomorrow');
  assert.equal(collectObservations(input, generateLocationCandidates(input, 'BOOKING_REQUEST').candidates).vehicles.length, 1);
  assert.deepEqual(phrases(generateLocationCandidates(query('to Airport'), 'BOOKING_REQUEST')), ['Airport']);
});

test('supported directional grammar accepts horizontal whitespace without changing the candidate spans', () => {
  const cases = [
    ['pick\tme\tfrom\tHome\tand\tgo\tto\tAirport', ['Home', 'Airport']],
    ['drop\tme\tat\tAirport\tfrom\tHome', ['Airport', 'Home']],
    ['go\tto\tAirport', ['Airport']],
    ['via\tSector 18\tto\tAirport', ['Sector 18', 'Airport']],
    ['Airport\tjaana\thai\tHostel\tse', ['Airport', 'Hostel']],
    ['campus\tse\tPari Chowk', ['campus', 'Pari Chowk']],
    ['Noida\tto\tDelhi', ['Noida', 'Delhi']],
    ['pickup\tlocation\t=\tHome\tdrop-off\tlocation:\tOffice', ['Home', 'Office']],
  ];
  for (const [text, expected] of cases) {
    const generated = generateLocationCandidates(query(text), 'BOOKING_REQUEST');
    assert.deepEqual(phrases(generated), expected, text);
    assert.ok(generated.candidates.every(candidate => candidate.exactText === text.slice(candidate.start, candidate.end)), text);
  }
});

test('incomplete directional markers surface the dependency issue across supported forms', () => {
  for (const text of ['pick at', 'pick\tme\tat', 'drop at', 'drop\tme\tat', 'go\tto', 'via', 'jaana hai', 'se']) {
    const result = generateLocationCandidates(query(text), 'BOOKING_REQUEST');
    assert.deepEqual(result.candidates, [], text);
    assert.deepEqual(result.issues.map(issue => issue.code), ['LOCATION_CANDIDATE_GENERATION_FAILED'], text);
    assert.deepEqual(result.issues[0].refs, [{ kind: 'QUERY_SPAN', queryId: 'search-query', revision: 3, start: 0, end: text.length }], text);
  }
});

test('suffix stripping handles delimiter-led passenger, vehicle, and clock instructions', () => {
  for (const [text, expected] of [
    ['from Gate 3 to Airport, now', ['Gate 3', 'Airport']],
    ['from Gate 3 to Airport; sedan', ['Gate 3', 'Airport']],
    ['from Gate 3 to Airport, with a child', ['Gate 3', 'Airport']],
    ['from Gate 3 to Airport tomorrow at 12:34 pm', ['Gate 3', 'Airport']],
  ]) assert.deepEqual(phrases(generateLocationCandidates(query(text), 'BOOKING_REQUEST')), expected, text);
});

test('location search keeps the complete user phrase instead of applying booking-route grammar', () => {
  const generated = generateLocationCandidates(query('from Gate 3 to Airport'), 'LOCATION_SEARCH');
  assert.deepEqual(phrases(generated), ['from Gate 3 to Airport']);
  assert.equal(generated.candidates[0].method, 'WHOLE_LOCATION_QUERY');
});

test('multiple horizontal spaces preserve directional landmarks and optional marker wording', () => {
  const cases = [
    ['pick  me  at  Home  and  drop at Airport', ['Home', 'Airport']],
    ['pick at Home', ['Home']],
    ['drop  me  at  Airport  and  from Home', ['Airport', 'Home']],
    ['go  to  Airport', ['Airport']],
    ['go  to  Airport  from Home', ['Airport', 'Home']],
    ['via  Sector 18  to Airport', ['Sector 18', 'Airport']],
    ['Campus  via  Sector 18 to Airport', ['Campus', 'Sector 18', 'Airport']],
    ['Airport  jaana  hai  Hostel  se', ['Airport', 'Hostel']],
    ['campus  se  Pari Chowk', ['campus', 'Pari Chowk']],
    ['Noida  to  Delhi', ['Noida', 'Delhi']],
    ['pickup :  Home Base', ['Home Base']],
    ['pick  up location = Home Base  drop  off location :  Office Park', ['Home Base', 'Office Park']],
    ['from Oscar to Airport', ['Oscar', 'Airport']],
    ['from Hotel SUV to Airport', ['Hotel SUV', 'Airport']],
    ['from SUV Hotel to Airport', ['SUV Hotel', 'Airport']],
    ['from cab near Cafe to Airport', ['cab near Cafe', 'Airport']],
  ];
  for (const [text, expected] of cases) assert.deepEqual(phrases(generateLocationCandidates(query(text), 'BOOKING_REQUEST')), expected, text);
});

test('explicit bounded preferences remain booking clauses across whitespace and supported class spellings', () => {
  for (const prefix of ['prefer  SUV', 'please  sedan', 'SUV  only', 'SUV  preferred', 'any  vehicle', 'anything  except  suv', 'anything except SUV  premium', '12  passengers']) {
    assert.deepEqual(phrases(generateLocationCandidates(query(`${prefix} to Airport`), 'BOOKING_REQUEST')), ['Airport'], prefix);
  }
});

test('delimited suffix instructions stay separate across vehicle, child and clock wording', () => {
  const suffixes = [',  SUV', ', SUV  premium', ', SUV  only', ',call  me', ',with baby', ',with  a  child', ' tomorrow  at  6:15  PM', ' tomorrow', ' tonight', ' at 6:15 PM', ' 6:15 PM'];
  for (const suffix of suffixes) assert.deepEqual(phrases(generateLocationCandidates(query(`from Home to Airport${suffix}`), 'BOOKING_REQUEST')), ['Home', 'Airport'], suffix);
});

test('generation failures retain an empty candidate list and unrelated routing never mines route-like prose', () => {
  for (const text of ['from', 'go  to', 'drop  me  at', 'jaana  hai', 'pickup :']) {
    const output = generateLocationCandidates(query(text), 'BOOKING_REQUEST');
    assert.deepEqual(output.candidates, []);
  }
  assert.deepEqual(generateLocationCandidates(query('from Home to Airport'), 'UNCLEAR_OR_UNRELATED'), { candidates: [], issues: [] });
  assert.deepEqual(generateLocationCandidates({ ...query('Airport'), id: null }, 'LOCATION_SEARCH').issues.map(value => value.code), ['INVALID_QUERY']);
});

test('incomplete multi-space direction markers are explicit generation failures, not missing user input', () => {
  for (const text of ['pick  me  at', 'pick  at', 'drop  me  at', 'drop  at', 'go  to', 'jaana  hai']) {
    const output = generateLocationCandidates(query(text), 'BOOKING_REQUEST');
    assert.deepEqual(output.candidates, [], text);
    assert.deepEqual(output.issues.map(value => value.code), ['LOCATION_CANDIDATE_GENERATION_FAILED'], text);
  }
});

test('landmark names containing class or command words are preserved when the whole phrase is a location candidate', () => {
  for (const name of ['Hotel SUV', 'SUV Hotel', 'Hotel book lounge']) {
    assert.deepEqual(phrases(generateLocationCandidates(query(`${name} to Airport`), 'BOOKING_REQUEST')), [name, 'Airport'], name);
  }
  assert.deepEqual(phrases(generateLocationCandidates(query('SUV  premium to Airport'), 'BOOKING_REQUEST')), ['Airport']);
  for (const text of ['goxxto Airport', 'go toXAirport']) assert.deepEqual(generateLocationCandidates(query(text), 'BOOKING_REQUEST').candidates, [], text);
});

test('date and clock suffixes preserve their absence of period and their original whitespace', () => {
  for (const suffix of ['  tomorrow', ' tomorrow at 6', ' at  6 PM', ' at 12 PM', ' at 6', ' 12 PM', ' 6 PM', ' at 6 PM  ']) {
    assert.deepEqual(phrases(generateLocationCandidates(query(`from Home to Airport${suffix}`), 'BOOKING_REQUEST')), ['Home', 'Airport'], suffix);
  }
  assert.deepEqual(phrases(generateLocationCandidates(query('via Sector 18'), 'BOOKING_REQUEST')), ['Sector 18']);
  const text = 'Airport jaana hai Home se\nOffice jaana hai campus se';
  const generated = generateLocationCandidates(query(text), 'BOOKING_REQUEST');
  for (const phrase of ['Airport', 'Home', 'Office', 'campus']) {
    const candidate = generated.candidates.find(value => value.exactText === phrase);
    assert.ok(candidate, phrase);
    assert.deepEqual([candidate.start, candidate.end], [text.indexOf(phrase), text.indexOf(phrase) + phrase.length]);
  }
});

test('candidate accounting counts phrase length rather than absolute source offsets', () => {
  const route = Array.from({ length: 12 }, (_, index) => `from O${index} to D${index}`).join(' ');
  const output = generateLocationCandidates(query(`${' '.repeat(600)}${route}`), 'BOOKING_REQUEST');
  assert.equal(output.candidates.length, 24);
  assert.deepEqual(output.issues, []);
  assert.deepEqual(generateLocationCandidates(query('x'.repeat(SEARCH_LIMITS.queryLength + 1)), 'LOCATION_SEARCH').candidates, []);
});

test('labels accept no space after punctuation and keep operational words inside named landmarks', () => {
  const cases = [
    ['pickup:Home drop:Office', ['Home', 'Office']],
    ['pick  up:Campus via Sector 18 to Airport', ['Campus', 'Sector 18', 'Airport']],
    ['pickup location:Campus via Sector 18 to Airport', ['Campus', 'Sector 18', 'Airport']],
    ['pickup location :Campus via Sector 18 to Airport', ['Campus', 'Sector 18', 'Airport']],
    ['from Home to Hotel book lounge', ['Home', 'Hotel book lounge']],
    ['campus to Hotel book lounge', ['campus', 'Hotel book lounge']],
    ['go  to Book Cafe', ['Book Cafe']],
  ];
  for (const [text, expected] of cases) assert.deepEqual(phrases(generateLocationCandidates(query(text), 'BOOKING_REQUEST')), expected, text);
  const overlap = generateLocationCandidates(query('drop:metro/from town'), 'BOOKING_REQUEST');
  assert.ok(phrases(overlap).includes('metro/from town'));
  const tooWide = generateLocationCandidates(query(`from ${'a'.repeat(501)} to Airport`), 'BOOKING_REQUEST');
  assert.equal(tooWide.issues[0].category, 'INVALID');
});
