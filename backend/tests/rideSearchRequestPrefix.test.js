import test from 'node:test';
import assert from 'node:assert/strict';
import { generateLocationCandidates } from '../services/search/locations/candidates.ts';
import { locationPrefixEnd } from '../services/search/locations/requestPrefix.ts';
import { bookingTailStart } from '../services/search/locations/bookingTail.ts';
import { explicitTemporalSuffixBoundary } from '../services/search/locations/temporalSuffix.ts';
import { collectObservations } from '../services/search/observations.ts';
import { createRideSearchParser } from '../services/search/parser.ts';
import { routingRequest, locationRequest, extractionRequest } from '../services/search/questions.ts';
import { sourceOnlyAnyPreference, statedAnyAcceptance } from '../services/search/vehiclePolicy.ts';
import { createTestClock } from './helpers/testClock.js';
import { decisionFake, bookingRouting, inputFor, expressionChoices, candidateFor } from './helpers/rideSearchFake.js';

const prefixes = ['Please:', 'please', 'Please', 'pls', 'cab please', 'I need', 'Can you', 'Could you', 'Book me'];
const clock = createTestClock('2026-10-05T10:00:00.000Z');

test('request prefixes clip only their original leading spans in bare routes', () => {
  for (const prefix of prefixes) {
    const query = inputFor(` \t${prefix} 🙂 Campus to Airport tomorrow at 6 PM`).query;
    const result = generateLocationCandidates(query, 'BOOKING_REQUEST');
    assert.deepEqual(result.candidates.map(c => c.exactText), ['🙂 Campus', 'Airport']);
    for (const candidate of result.candidates) {
      assert.equal(candidate.exactText, query.text.slice(candidate.start, candidate.end));
      assert.equal(candidate.queryId, query.id); assert.equal(candidate.queryRevision, query.revision);
    }
    assert.equal(result.candidates[0].start, query.text.indexOf('🙂'));
    assert.deepEqual(generateLocationCandidates(query, 'BOOKING_REQUEST'), result);
  }
});

test('prefixes do not erase vehicle or timing clauses, direction markers, or named landmarks', () => {
  for (const prefix of prefixes) {
    const query = inputFor(`${prefix} SUV tomorrow from Please Plaza to Airport at 6 PM`).query;
    const generated = generateLocationCandidates(query, 'BOOKING_REQUEST');
    assert.deepEqual(generated.candidates.map(c => c.exactText), ['Please Plaza', 'Airport']);
    const observed = collectObservations(query, generated.candidates);
    assert.equal(observed.vehicles[0].value, 'suv');
    assert.equal(observed.dates[0].value.anchor, 'TOMORROW');
    assert.equal(observed.times[0].value.hour, 6);
  }
  for (const text of ['Please: SUV only tomorrow to Airport', 'pls 3 people to Airport'])
    assert.deepEqual(generateLocationCandidates(inputFor(text).query, 'BOOKING_REQUEST').candidates.map(c => c.exactText), ['Airport']);
  for (const prefix of prefixes) {
    assert.deepEqual(generateLocationCandidates(inputFor(`${prefix} SUV only tomorrow to Airport`).query, 'BOOKING_REQUEST').candidates.map(c => c.exactText), ['Airport']);
    assert.deepEqual(generateLocationCandidates(inputFor(`${prefix} Campus se Airport`).query, 'BOOKING_REQUEST').candidates.map(c => c.exactText), ['Campus', 'Airport']);
  }
  assert.deepEqual(generateLocationCandidates(inputFor('from Pls Gallery to Please: Museum').query, 'BOOKING_REQUEST').candidates.map(c => c.exactText), ['Pls Gallery', 'Please: Museum']);
});

test('standalone courtesy remains location search and ride-request words are not equivalent to courtesy', () => {
  for (const prefix of ['Please:', 'please', 'Please', 'pls']) {
    const query = inputFor(`${prefix} Delta 2`).query;
    const result = generateLocationCandidates(query, 'LOCATION_SEARCH');
    assert.deepEqual(result.candidates.map(c => c.exactText), ['Delta 2']);
    assert.equal(result.candidates[0].start, query.text.indexOf('Delta'));
  }
  for (const prefix of ['cab please', 'I need', 'Can you', 'Could you', 'Book me'])
    assert.deepEqual(generateLocationCandidates(inputFor(`${prefix} Delta 2`).query, 'LOCATION_SEARCH').candidates.map(c => c.exactText), [`${prefix} Delta 2`]);
  assert.equal(locationPrefixEnd('Please:Campus', false), 7);
  assert.equal(locationPrefixEnd('Pleaseology Museum', true), 0);
  assert.deepEqual(generateLocationCandidates(inputFor('Please: ').query, 'LOCATION_SEARCH').candidates, []);
});

test('selected prefix-free source candidates retain pickup/drop, date and vehicle in the public draft', async () => {
  for (const prefix of prefixes) {
    const input = inputFor(`${prefix} Campus to Airport tomorrow at 6 PM`);
    const provider = decisionFake([bookingRouting, request => {
      const state = JSON.parse(request.state);
      return { ...expressionChoices(request), timing_mode: 'SCHEDULED', pickup_presence: 'PRESENT', drop_presence: 'PRESENT',
        role_consistency: 'CONSISTENT', pickup_candidate: state.candidates.find(c => c.exactText === 'Campus').candidateId,
        drop_candidate: state.candidates.find(c => c.exactText === 'Airport').candidateId };
    }]);
    const result = await createRideSearchParser(provider, clock, generateLocationCandidates).parse(input);
    assert.equal(result.draft.query.text, input.query.text);
    assert.equal(result.draft.queryType, 'BOOKING_REQUEST'); assert.equal(result.draft.complexity, 'SIMPLE');
    assert.equal(result.draft.timing.date.value.anchor, 'TOMORROW'); assert.equal(result.draft.timing.time.value.hour, 6);
    assert.equal(result.draft.pickup.refs[0].start, input.query.text.indexOf('Campus'));
    assert.equal(result.draft.drop.refs[0].start, input.query.text.indexOf('Airport'));
    assert.equal(result.fallbackRequired, false);
  }
});

test('routing preserves original identity/context and distinguishes numbered places from unrelated information', () => {
  const input = inputFor('Please: what is the weather near Delta 2?');
  const request = routingRequest(input, clock.now().toISOString());
  assert.deepEqual(JSON.parse(request.state).query, input.query);
  assert.deepEqual(Object.keys(request.questions.query_type.choices), ['LOCATION_SEARCH', 'BOOKING_REQUEST', 'UNCLEAR_OR_UNRELATED']);
  assert.match(request.questions.query_type.instructions, /numbered area/);
  assert.match(request.questions.query_type.instructions, /informational questions/);
  assert.match(request.questions.query_type.instructions, /Politeness does not turn an unrelated question/);
});

test('leading prefix boundaries include all original separator whitespace and remain case insensitive', () => {
  for (const text of ['Please  :  Campus', 'pLs\t:\tCampus', 'please   Campus', 'PLS\tCampus',
    'CAB  PLEASE  Campus', 'I  NEED\tCampus', 'CAN  YOU   Campus', 'COULD  YOU\tCampus', 'BOOK  ME  Campus',
    'Book me:Campus', 'Book me:   Campus', 'Can you   :   Campus', 'Could you:Campus', 'I need:Campus', 'cab please:Campus'])
    assert.equal(locationPrefixEnd(text, true), text.indexOf('Campus'));
  for (const text of ['Pleaseology: Gallery', 'Book meology: Gallery', 'Gallery I need Campus'])
    assert.equal(locationPrefixEnd(text, true), 0);
});

test('every generated bounded question has a nonempty independent instruction and usable choices', () => {
  const input = inputFor('SUV tomorrow from Campus to Airport at 6 PM for 3 people, sharing local safe route carrier');
  input.candidates = [candidateFor(input, 'Campus', 'origin'), candidateFor(input, 'Airport', 'destination')];
  const observed = collectObservations(input.query, input.candidates);
  for (const request of [routingRequest(input, clock.now().toISOString()), locationRequest(input, clock.now().toISOString()),
    extractionRequest(input, clock.now().toISOString(), observed)]) for (const question of Object.values(request.questions)) {
    assert.ok(question.instructions.trim().length > 0);
    assert.ok(['choice', 'noul', 'score'].includes(question.kind));
    if (question.kind === 'choice') {
      assert.ok(Object.keys(question.choices).length > 0);
      for (const [key, value] of Object.entries(question.choices)) assert.ok(key.length > 0 && value.trim().length > 0);
    }
  }
  const questions = extractionRequest(input, clock.now().toISOString(), observed).questions;
  const expected = {
    pickup_presence: ['PRESENT', 'ABSENT', 'UNCLEAR'], drop_presence: ['PRESENT', 'ABSENT', 'UNCLEAR'],
    role_consistency: ['CONSISTENT', 'REVERSAL_RISK', 'CONFLICT', 'NO_ROLES'],
    vehicle_class: ['hatchback', 'sedan', 'suv', 'suv_premium', 'NOT_MENTIONED', 'UNCLEAR'],
    vehicle_strength: ['REQUIRED', 'PREFERRED', 'NOT_APPLICABLE', 'UNCLEAR'], vehicle_any: ['EXPLICIT_ANY', 'NOT_STATED', 'UNCLEAR'],
    timing_mode: ['IMMEDIATE', 'SCHEDULED', 'UNSPECIFIED', 'AMBIGUOUS'],
    unsupported_service: ['NONE', 'PASSENGER_COUNT', 'STOP', 'RETURN_JOURNEY', 'RENTAL', 'AC_PREFERENCE', 'CONDITIONAL_PREFERENCE', 'OTHER', 'UNCLEAR'],
  };
  for (const [field, choices] of Object.entries(expected)) assert.deepEqual(Object.keys(questions[field].choices), choices);
  for (const field of ['sharing', 'isOutstation', 'preferSafeRoute', 'needsCarrier'])
    assert.deepEqual(Object.keys(questions[field].choices), ['YES', 'NO', 'NOT_MENTIONED', 'UNCLEAR']);
  for (const vehicle of ['hatchback', 'sedan', 'suv', 'suv_premium'])
    assert.deepEqual(Object.keys(questions[`exclude_${vehicle}`].choices), ['EXCLUDED', 'NOT_EXCLUDED', 'UNCLEAR']);
  for (const field of ['date_expression', 'time_expression', 'passenger_candidate']) {
    assert.ok(questions[field].choices.NONE); assert.ok(questions[field].choices.UNCLEAR);
  }
  assert.match(questions.date_expression.instructions, /date components/);
  assert.match(questions.time_expression.instructions, /clock\/daypart/);
  assert.match(questions.passenger_candidate.instructions, /passenger count/);
});

test('independent vehicle routing and exclusion prompts preserve partial bookings and source-only negatives', () => {
  for (const text of ['hatchback', 'please sedan', 'premium SUV', 'no SUV from campus to airport']) {
    const input = inputFor(text);
    const request = routingRequest(input, clock.now().toISOString());
    assert.equal(JSON.parse(request.state).query.text, text);
    assert.match(request.questions.booking_complexity.instructions, /other answers are unavailable/);
    assert.match(request.questions.booking_complexity.instructions, /Standalone vehicle requests.*are SIMPLE/);
    assert.match(request.questions.booking_complexity.instructions, /never because booking fields are missing/);
    assert.deepEqual(Object.keys(request.questions.booking_complexity.choices), ['SIMPLE', 'COMPLEX', 'NOT_APPLICABLE']);
  }
  for (const text of ['prefer sedan', 'SUV only', 'not regular SUV, prefer sedan']) {
    const input = inputFor(text);
    const request = extractionRequest(input, clock.now().toISOString(), collectObservations(input.query, []));
    assert.match(request.questions.vehicle_strength.instructions, /unqualified named class request means REQUIRED/);
    assert.match(request.questions.vehicle_strength.instructions, /PREFERRED only when the source explicitly softens/);
    assert.match(request.questions.vehicle_strength.instructions, /Missing timing or endpoints do not soften/);
    for (const vehicle of ['hatchback', 'sedan', 'suv', 'suv_premium']) {
      const question = request.questions[`exclude_${vehicle}`];
      assert.match(question.instructions, /EXCLUDED only for a source-supported negative vehicle clause/);
      assert.match(question.instructions, /NOT_EXCLUDED when this class is unmentioned/);
      assert.match(question.instructions, /positive request or preference does not invent exclusions/);
      assert.match(question.instructions, /generic not SUV\/except XL excludes both suv and suv_premium/);
      assert.deepEqual(Object.keys(question.choices), ['EXCLUDED', 'NOT_EXCLUDED', 'UNCLEAR']);
    }
  }
});

test('source-only exclusions omit unused positive vehicle questions without losing source constraints', () => {
  const input = inputFor('anything except sedan from Campus to Airport');
  const observed = collectObservations(input.query, []);
  const request = extractionRequest(input, clock.now().toISOString(), observed);
  for (const field of ['vehicle_class', 'vehicle_strength', 'vehicle_any', 'exclude_hatchback', 'exclude_sedan', 'exclude_suv', 'exclude_suv_premium'])
    assert.equal(Object.hasOwn(request.questions, field), false);
  for (const text of ['SUV only, no sedan']) {
    const input = inputFor(text);
    const questions = extractionRequest(input, clock.now().toISOString(), collectObservations(input.query, [])).questions;
    assert.ok(questions.vehicle_class); assert.ok(questions.vehicle_any);
  }
});

test('clear source-only ANY survives irrelevant model uncertainty and omits all vehicle questions', async () => {
  for (const phrase of ['any car', 'ANY CAB', 'any  vehicle', 'piano any car', 'knot any cab', 'no parking, any car', 'domynot any car']) {
    const input = inputFor(`Please: ${phrase} from Campus to Airport`);
    const observed = collectObservations(input.query, []);
    const preference = sourceOnlyAnyPreference(input, observed.vehicles, observed.anyVehicle);
    assert.equal(preference.state, 'EXPLICIT_ANY'); assert.deepEqual(preference.excluded, []);
    assert.deepEqual(preference.refs, observed.anyVehicle);
    const request = extractionRequest(input, clock.now().toISOString(), observed);
    for (const name of ['vehicle_class', 'vehicle_strength', 'vehicle_any', 'exclude_hatchback', 'exclude_sedan', 'exclude_suv', 'exclude_suv_premium'])
      assert.equal(Object.hasOwn(request.questions, name), false);
    const provider = decisionFake([bookingRouting, { vehicle_class: 'UNCLEAR', vehicle_strength: 'UNCLEAR', vehicle_any: 'UNCLEAR' }]);
    const result = await createRideSearchParser(provider, clock).parse(input);
    assert.equal(result.draft.vehicleClass.state, 'EXPLICIT_ANY');
    assert.equal(result.fallbackRequired, false);
  }
  for (const text of ['no any car', 'no  any car', 'NOT any cab', 'without any vehicle', 'do not any car', 'do  not any car', "don't any car", 'except any car',
    'any car except SUV', 'any car, prefer sedan', 'anything', 'any car and anything', 'any car and not any car']) {
    const input = inputFor(text); const observed = collectObservations(input.query, []);
    assert.equal(sourceOnlyAnyPreference(input, observed.vehicles, observed.anyVehicle), undefined, text);
  }
  const input = inputFor('any car'); const observed = collectObservations(input.query, []);
  assert.equal(sourceOnlyAnyPreference(input, [], []), undefined);
  assert.equal(sourceOnlyAnyPreference(input, [], [{ ...observed.anyVehicle[0], kind: 'USER_FIELD' }]), undefined);
  assert.equal(statedAnyAcceptance(input, [{ ...observed.anyVehicle[0], kind: 'USER_FIELD' }]), false);
  for (const text of ['anything', 'not any car', 'any car and anything']) {
    const generic = inputFor(text);
    const request = extractionRequest(generic, clock.now().toISOString(), collectObservations(generic.query, []));
    assert.ok(request.questions.vehicle_any, text);
    assert.ok(request.questions.vehicle_class, text);
  }
  for (const text of ['before any car', 'any car afterwards']) {
    const wider = inputFor(text);
    assert.equal(sourceOnlyAnyPreference(wider, [], [{ ...observed.anyVehicle[0], end: text.length }]), undefined);
  }
});

test('absent observations do not ask invented date/time/passenger or flag questions', () => {
  const input = inputFor('Campus to Airport');
  const questions = extractionRequest(input, clock.now().toISOString(), collectObservations(input.query, [])).questions;
  for (const field of ['vehicle_class', 'vehicle_any', 'vehicle_strength', 'date_expression', 'time_expression', 'passenger_candidate', 'sharing', 'isOutstation', 'preferSafeRoute', 'needsCarrier'])
    assert.equal(Object.hasOwn(questions, field), false);
});

test('a closed passenger/flag tail stays outside geography without dropping supplied date, time or flags', () => {
  for (const suffix of ['tomorrow at 6 PM for 3 people, sharing local safe route carrier',
    'tomorrow for 3 passengers', 'for 3 people', 'tomorrow at 6 PM and at 8 PM for 3 people']) {
    const query = inputFor(`Please: from Campus to Airport ${suffix}`).query;
    const candidates = generateLocationCandidates(query, 'BOOKING_REQUEST').candidates;
    assert.deepEqual(candidates.map(candidate => candidate.exactText), ['Campus', 'Airport']);
    const observed = collectObservations(query, candidates);
    assert.equal(observed.passengers[0].value, 3);
    if (suffix.includes('tomorrow')) assert.equal(observed.dates[0].value.anchor, 'TOMORROW');
    if (suffix.includes('6 PM')) assert.equal(observed.times[0].value.hour, 6);
    if (suffix.includes('8 PM')) assert.deepEqual(observed.times.map(time => time.value.hour), [6, 8]);
    if (suffix.includes('sharing')) for (const field of ['sharing', 'isOutstation', 'preferSafeRoute', 'needsCarrier'])
      assert.equal(observed.flags[field].length, 1);
  }
  assert.equal(bookingTailStart('Airport for 3 people, sharing local safe route carrier'), 8);
  assert.equal(bookingTailStart('Airport for 3 people near Gallery'), undefined);
  assert.equal(bookingTailStart('Airport for 3 people then stop at Library'), undefined);
  assert.equal(bookingTailStart('Airport for 3 persons'), undefined);
  assert.equal(bookingTailStart('Airport Sharing Garden'), undefined);
  assert.equal(bookingTailStart('Airport for  12  people'), 8);
  assert.equal(bookingTailStart('sharing Airport for 3 people'), 16);
  assert.equal(bookingTailStart('12 people Airport for 3 people'), 18);
  assert.equal(bookingTailStart('Airport for 3 people and at 6 PM'), undefined);
  assert.equal(bookingTailStart('no luggage carrier Airport for 3 people X'), undefined);
});

test('booking-tail temporal offsets retain leading whitespace and require an actual trailing date', () => {
  assert.equal(explicitTemporalSuffixBoundary('Airport tomorrow'), undefined);
  assert.equal(explicitTemporalSuffixBoundary('  Airport tomorrow at 6 PM for 3 people'), 10);
  assert.equal(explicitTemporalSuffixBoundary('Airport for 3 people'), 8);
  assert.equal(explicitTemporalSuffixBoundary('Airport tomorrow Museum for 3 people'), 24);
  assert.equal(explicitTemporalSuffixBoundary('Airport tomorrow   for 3 people'), 8);
});

test('closed trailing flag clauses stay outside destinations and preserve each supplied flag', () => {
  for (const separator of [', ', '; ', ',\t']) for (const carrier of ['carrier needed', 'roof carrier required', 'luggage carrier']) {
    const query = inputFor(`Please: outstation sedan from 🙂 Campus to Hostel gate near Gallery${separator}safe route, ${carrier}, no sharing`).query;
    const candidates = generateLocationCandidates(query, 'BOOKING_REQUEST').candidates;
    assert.deepEqual(candidates.map(candidate => candidate.exactText), ['🙂 Campus', 'Hostel gate', 'Hostel gate near Gallery']);
    for (const candidate of candidates) assert.equal(query.text.slice(candidate.start, candidate.end), candidate.exactText);
    const flags = collectObservations(query, candidates).flags;
    assert.equal(flags.sharing[0].value, false);
    for (const field of ['isOutstation', 'preferSafeRoute', 'needsCarrier']) assert.equal(flags[field][0].value, true);
  }
  assert.equal(bookingTailStart('Airport, no carrier needed, not sharing'), 7);
  assert.equal(bookingTailStart('safe route Airport, carrier needed'), 18);
  assert.equal(bookingTailStart('carrier needed Airport, sharing'), 22);
  assert.equal(bookingTailStart('Airport for 3 people, carrier needed'), 8);
  assert.equal(bookingTailStart('Airport, carrier needed, roof carrier required'), 7);
  assert.equal(bookingTailStart('Airport, carrier \t needed'), 7);
  assert.equal(bookingTailStart('Airport,sharing'), 7);
  assert.equal(bookingTailStart('Airport,   sharing'), 7);
  for (const text of ['Airport Carrier Lane', 'Airport, Carrier Gallery', 'Airport, safe route near Museum',
    'Airport, carrier needed tomorrow', 'Airport, carrier needed then stop at Library', 'Airport, safe route maybe',
    'carrier required Airport, solo X', 'Airport, carrier X carrier needed', 'Airport, 3 people sharing'])
    assert.equal(bookingTailStart(text), undefined);
});
