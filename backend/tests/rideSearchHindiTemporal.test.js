import test from 'node:test';
import assert from 'node:assert/strict';
import { collectObservations, observeDates, observeTimes } from '../services/search/observations.ts';
import { observeHindiDates, observeHindiTimes, observeHindiNow, hindiTemporalPrefixEnd, hindiTemporalSuffixStart } from '../services/search/hindiTemporal.ts';
import { observeHindiCalendar } from '../services/search/hindiCalendar.ts';
import { locationPrefixEnd } from '../services/search/locations/requestPrefix.ts';
import { generateLocationCandidates } from '../services/search/locations/candidates.ts';
import { emptyDraft } from '../services/search/contracts.ts';
import { resolved } from '../services/search/fields.ts';
import { resolveTemporal } from '../services/search/temporal.ts';
import { validateDraftProvenance } from '../services/search/provenance.ts';
const query = text => ({ id: 'hindi-source-fixture', revision: 2, text });
const times = text => observeHindiTimes(query(text), []);
const dates = text => observeHindiDates(query(text), []);
const value = text => times(text)[0].value;
const candidate = (text, needle) => ({ candidateId: 'location-fixture', queryId: 'hindi-source-fixture', queryRevision: 2,
  start: text.indexOf(needle), end: text.indexOf(needle) + needle.length, exactText: needle, normalizedText: needle,
  generatorVersion: 'fixture', method: 'LABELLED_FIELD' });

test('bounded Hindi date lexicon preserves original text, case, punctuation and UTF-16 offsets', () => {
  for (const [word, anchor] of [['kal', 'TOMORROW'], ['कल', 'TOMORROW'], ['aaj', 'TODAY'], ['आज', 'TODAY'],
    ['parso', 'DAY_AFTER_TOMORROW'], ['parson', 'DAY_AFTER_TOMORROW'], ['परसों', 'DAY_AFTER_TOMORROW'], ['KAL', 'TOMORROW']]) {
    const text = `🚕 ${word}, campus se botanical jaana hai`, found = dates(text);
    assert.equal(found.length, 1);
    assert.deepEqual(found[0].value, { kind: 'RELATIVE', anchor });
    assert.equal(found[0].text, word);
    assert.equal(found[0].ref.start, 3);
    assert.equal(found[0].ref.end, 3 + word.length);
    assert.equal(found[0].id, `span:3:${word.length}`);
    assert.equal(found[0].ref.queryId, 'hindi-source-fixture');
    assert.equal(found[0].ref.revision, 2);
  }
});
test('kal past and genuinely unresolved contexts cannot acquire a tomorrow date', () => {
  for (const text of ['kal ride li thi', 'कल सवारी ली थी', 'kal I went from campus to home', 'kal hum gaye the', 'kal?', 'kal']) assert.equal(dates(text).length, 0);
  assert.equal(dates('kal subah').length, 1);
  assert.equal(dates('kal shaam').length, 1);
  assert.equal(dates('kal 7 baje').length, 1);
  assert.equal(dates('kal campus se botanical jaana hai')[0].value.anchor, 'TOMORROW');
  assert.equal(dates('kal campus se the airport jaana hai')[0].value.anchor, 'TOMORROW');
  assert.equal(dates('aaj')[0].value.anchor, 'TODAY');
  assert.equal(dates('parso ride li thi').length, 0);
  assert.equal(dates('parso?').length, 0);
  assert.equal(hindiTemporalPrefixEnd('kal ride li thi'), 0);
  assert.equal(hindiTemporalPrefixEnd('kal'), 0);
});
test('all supported dayparts preserve a daypart without inventing a clock', () => {
  for (const [word, expected] of [['subah', 'MORNING'], ['subha', 'MORNING'], ['सुबह', 'MORNING'], ['shaam', 'EVENING'],
    ['sham', 'EVENING'], ['शाम', 'EVENING'], ['raat', 'NIGHT'], ['rat', 'NIGHT'], ['रात', 'NIGHT'],
    ['dopahar', 'AFTERNOON'], ['dopehar', 'AFTERNOON'], ['दोपहर', 'AFTERNOON']]) {
    assert.deepEqual(value(word), { kind: 'DAYPART', value: expected });
    const clock = value(`${word} 7 baje`);
    assert.equal(clock.period.value, expected === 'MORNING' ? 'AM' : 'PM');
    assert.equal(clock.notation, 'H12');
    assert.equal(clock.hour, 7);
    assert.equal(clock.minute.state, 'UNSPECIFIED');
  }
});
test('clock context preserves explicit components, omission, approximation and conflicts', () => {
  for (const text of ['subah 7 baje', 'subha 7 bajey', 'सुबह ७ बजे', '7 baje subah']) assert.equal(value(text).period.value, 'AM');
  for (const text of ['shaam 7 baje', 'शाम 7 बजे', '7 baje shaam']) assert.equal(value(text).period.value, 'PM');
  assert.equal(value('7 baje').period.state, 'UNSPECIFIED');
  assert.equal(value('7 baje').notation, 'H12');
  assert.equal(value('19 baje').notation, 'H24');
  assert.equal(value('19 baje').period.state, 'UNSPECIFIED');
  assert.equal(value('सुबह ७:३० बजे').minute.value, 30);
  assert.equal(value('subah 7:15 baje').minute.value, 15);
  for (const text of ['subah 7 PM', 'subah shaam 7 baje', 'subah 7 baje shaam']) {
    assert.equal(value(text).period.state, 'AMBIGUOUS');
    assert.deepEqual(value(text).period.alternatives, ['AM', 'PM']);
    assert.equal(value(text).period.reasonCode, 'TEMPORAL_CONFLICT');
  }
  assert.equal(value('shaam 7 PM').period.value, 'PM');
  assert.equal(value('7 am baje').period.value, 'AM');
  for (const marker of ['karib', 'kareeb', 'करीब', 'लगभग']) assert.equal(value(`subah ${marker} 7 baje`).precision, 'APPROXIMATE');
  for (const marker of ['saadhe', 'sadhe', 'साढ़े', 'साढे']) {
    const found = times(`सुबह ${marker} आठ बजे`)[0];
    assert.equal(found.value.minute.value, 30);
    assert.deepEqual(found.value.minute.refs, [found.ref]);
  }
  assert.equal(value('subah 13 baje').notation, 'H12');
  assert.equal(value('13 am baje').notation, 'H12');
  assert.equal(value('12 baje').notation, 'H12');
  for (const [word, hour] of [['एक', 1], ['दो', 2], ['तीन', 3], ['चार', 4], ['पाँच', 5], ['पांच', 5],
    ['छह', 6], ['छः', 6], ['सात', 7], ['आठ', 8], ['नौ', 9], ['दस', 10], ['ग्यारह', 11], ['बारह', 12]]) assert.equal(value(`${word} बजे`).hour, hour);
});
test('temporal words cannot steal supplied location spans or named landmarks', () => {
  for (const text of ['Kalindi Kunj', 'Subhash Nagar', 'Shyam Nagar', 'Kal Cafe se home', 'Subah Park', 'Sham Nagar',
    'कल नगर', 'सुबह पार्क', 'from kal', 'pickup: subah', 'xkal', 'kalx', 'subahx', '7 baje Road']) {
    assert.equal(dates(text).length, 0, text);
    assert.equal(times(text).length, 0, text);
  }
  for (const text of ['kal subah 7 baje', 'shaam', 'abhi']) {
    const locations = [candidate(text, text)];
    assert.equal(observeHindiDates(query(text), locations).length, 0);
    assert.equal(observeHindiTimes(query(text), locations).length, 0);
    assert.equal(observeHindiNow(query(text), locations).length, 0);
  }
  assert.equal(times('there are 7 passengers').length, 0);
  assert.equal(times('7').length, 0);
  assert.equal(times('subah 7 baje and shaam').length, 2);
  assert.equal(times('shaam and subah 7 baje').length, 2);
  assert.equal(dates('kal  campus se a road jaana hai').length, 1);
  assert.equal(times('subah   Park').length, 0);
  assert.equal(times('from campus subah 7 baje').length, 1);
  assert.equal(times('fromage subah 7 baje').length, 1);
  assert.equal(times('pickup:subah').length, 0);
  assert.equal(times('from   subah').length, 0);
});
test('normal parser observations expose recognized facts while keeping English behavior intact', () => {
  const found = collectObservations(query('kal subah 7 baje campus se botanical jaana hai'), []);
  assert.equal(found.dates[0].value.anchor, 'TOMORROW');
  assert.equal(found.times.length, 1);
  assert.equal(found.times[0].text, 'subah 7 baje');
  assert.equal(observeTimes(query('subah 7 PM'), []).length, 1);
  assert.equal(observeTimes(query('tomorrow at 7 PM'), [])[0].value.period.value, 'PM');
  assert.equal(observeTimes(query('at 8 PM and subah 7 baje'), []).length, 2);
  assert.equal(observeTimes(query('subah 7 baje and at 8 PM'), []).length, 2);
  assert.equal(observeTimes(query('subah 7 baje shaam'), []).length, 1);
  assert.equal(observeDates(query('tomorrow'), [])[0].value.anchor, 'TOMORROW');
  for (const text of ['abhi', 'अभी', 'ABHI']) assert.deepEqual(collectObservations(query(text), []).now,
    [{ kind: 'QUERY_SPAN', queryId: 'hindi-source-fixture', revision: 2, start: 0, end: text.length }]);
  assert.equal(observeHindiNow(query('abhi Cafe'), []).length, 0);
});
test('candidate prefix boundaries retain locations and stop at the first non-temporal clause', () => {
  for (const prefix of ['kal', 'kal subah', 'kal subah 7 baje', 'कल सुबह ७ बजे']) {
    const text = `${prefix} campus se botanical jaana hai`;
    assert.equal(hindiTemporalPrefixEnd(text), prefix.length);
  }
  assert.equal(hindiTemporalPrefixEnd('campus se botanical kal subah jaana hai'), 0);
  assert.equal(hindiTemporalPrefixEnd('Kal Cafe se botanical'), 0);
  assert.equal(hindiTemporalPrefixEnd('subah 7 baje ride li thi'), 0);
  assert.equal(hindiTemporalPrefixEnd('subah 7'), 0);
  assert.equal(hindiTemporalPrefixEnd('subah aaj 7 baje campus se botanical'), 'subah aaj 7 baje'.length);
  const text = 'kal subah 7 baje campus se botanical jaana hai';
  const candidates = generateLocationCandidates(query(text), 'BOOKING_REQUEST').candidates;
  assert.ok(candidates.some(item => item.exactText === 'campus'));
  assert.ok(candidates.every(item => !item.exactText.includes('kal')));
});
test('shared booking-window resolver preserves incomplete/approximate clocks and bare-hour PM policy', () => {
  for (const text of ['kal subah', 'kal subah 7 baje', 'kal subah kareeb 7:30 baje', 'kal subah 7:30 PM']) {
    const observed = collectObservations(query(text), []), draft = emptyDraft(query(text));
    draft.queryType = 'BOOKING_REQUEST'; draft.complexity = 'SIMPLE';
    draft.timing = { mode: 'SCHEDULED', date: resolved(observed.dates[0].value, [observed.dates[0].ref]),
      time: resolved(observed.times[0].value, [observed.times[0].ref]), refs: [observed.dates[0].ref, observed.times[0].ref] };
    assert.equal(validateDraftProvenance(draft).length, 0);
    assert.equal(resolveTemporal(draft, new Date('2026-10-04T06:30:00Z'), 'Asia/Kolkata').scheduledAt, undefined);
  }
  const observed = collectObservations(query('kal 7:00 baje'), []), draft = emptyDraft(query('kal 7:00 baje'));
  draft.timing = { mode: 'SCHEDULED', date: resolved(observed.dates[0].value, [observed.dates[0].ref]),
    time: resolved(observed.times[0].value, [observed.times[0].ref]), refs: [observed.dates[0].ref, observed.times[0].ref] };
  assert.equal(resolveTemporal(draft, new Date('2026-10-04T06:30:00Z'), 'Asia/Kolkata').localTime, '19:00');
});

test('observed weekday/month failures use the existing calendar vocabulary and exact source refs', () => {
  for (const [word, weekday] of [['सोमवार', 'MONDAY'], ['मंगलवार', 'TUESDAY'], ['बुधवार', 'WEDNESDAY'],
    ['गुरुवार', 'THURSDAY'], ['शुक्रवार', 'FRIDAY'], ['शनिवार', 'SATURDAY'], ['रविवार', 'SUNDAY'],
    ['shukravar', 'FRIDAY'], ['shukravaar', 'FRIDAY']]) {
    for (const [prefix, qualifier] of [['', 'BARE'], ['अगले ', 'NEXT'], ['agle ', 'NEXT'], ['इस ', 'THIS'], ['iss ', 'THIS']]) {
      const text = prefix + word;
      const found = observeHindiCalendar(query(text), [])[0];
      assert.deepEqual(found.value, { kind: 'WEEKDAY', weekday, qualifier });
      assert.equal(found.text, text);
    }
  }
  for (const text of ['5 दिसंबर', '५ दिसम्बर', '5 दिसंबर 2026', '५ दिसम्बर २०२६']) {
    const found = observeHindiCalendar(query(text), [])[0];
    assert.equal(found.value.day.value, 5);
    assert.equal(found.value.month.value, 12);
    assert.deepEqual(found.value.day.refs, [found.ref]);
    assert.deepEqual(found.value.month.refs, [found.ref]);
    assert.equal(found.value.year.state, text.includes('2026') || text.includes('२०२६') ? 'RESOLVED' : 'UNSPECIFIED');
    if (found.value.year.state === 'RESOLVED') {
      assert.equal(found.value.year.value, 2026);
      assert.deepEqual(found.value.year.refs, [found.ref]);
    }
  }
  assert.equal(observeHindiCalendar(query('21 ديسمبر'), []).length, 0);
  assert.equal(dates('शुक्रवार Cafe se home').length, 0);
  const text = 'शुक्रवार Cafe';
  assert.equal(observeHindiCalendar(query(text), [candidate(text, text)]).length, 0);
});
test('courtesy and suffix failures recover source-owned temporal facts without changing place names', () => {
  for (const text of ['kripya kal saat baje campus se hospital', 'Please: kal 7 baje campus se hospital',
    'कृपया कल सुबह 7 बजे campus se hospital', 'mujhe shaam ko pari chowk se hostel']) {
    const generated = generateLocationCandidates(query(text), 'BOOKING_REQUEST');
    assert.ok(generated.candidates.some(value => value.exactText === (text.startsWith('mujhe') ? 'pari chowk' : 'campus')), text);
    assert.ok(collectObservations(query(text), generated.candidates).dates.length + collectObservations(query(text), generated.candidates).times.length > 0, text);
  }
  const text = 'metro se hostel kal';
  assert.equal(hindiTemporalSuffixStart(text, 9, text.length), text.indexOf('kal'));
  assert.equal(generateLocationCandidates(query(text), 'BOOKING_REQUEST').candidates.find(value => value.exactText === 'hostel').end, 15);
  assert.equal(hindiTemporalSuffixStart('from Kal to home', 0, 8), undefined);
  assert.equal(hindiTemporalSuffixStart('campus se hostel', 0, 16), undefined);
  assert.equal(hindiTemporalSuffixStart('campus se hostel kal extra', 0, 26), undefined);
  assert.equal(hindiTemporalSuffixStart('campus se hostel kal subah 7 baje', 10, 18), undefined);
  assert.equal(locationPrefixEnd('mujhe shaam ko campus se home', false), 0);
  assert.equal(value('saat baje').hour, 7);
  assert.equal(value('SAAT BAJE').hour, 7);
  assert.equal(value('SuBaH SaaT BaJe').period.value, 'AM');
});
test('explicit negated immediate clauses do not compete with the final future date', () => {
  for (const text of ['abhi nhi, parso college se bazaar jana h', 'abhi nahi, parso college se bazaar jana h', 'अभी नहीं, परसों college से बाजार']) {
    const generated = generateLocationCandidates(query(text), 'BOOKING_REQUEST');
    const found = collectObservations(query(text), generated.candidates);
    assert.equal(found.now.length, 0);
    assert.equal(found.dates[0].value.anchor, 'DAY_AFTER_TOMORROW');
  }
  assert.equal(hindiTemporalPrefixEnd('abhi nahi, campus se home'), 0);
  assert.equal(observeHindiNow(query('abhi nahix'), []).length, 1);
  assert.equal(observeHindiNow(query('अभी नहीं'), []).length, 0);
});

test('calendar, courtesy and suffix boundaries cover separated words and exact range edges', () => {
  for (const text of ['ride 15  दिसंबर  2026, please', 'ride १५  दिसम्बर  २०२६; please']) {
    const found = dates(text)[0];
    assert.equal(found.value.kind, 'ABSOLUTE');
    assert.equal(found.value.day.value, 15);
    assert.equal(found.value.year.value, 2026);
    assert.equal(found.text, text.slice(found.ref.start, found.ref.end));
  }
  assert.equal(dates('x15 दिसंबर2026x').length, 0);
  assert.equal(dates('अगले शुक्रवार कैब')[0].value.weekday, 'FRIDAY');
  assert.equal(observeDates(query('5 December'), [])[0].value.year.state, 'UNSPECIFIED');
  assert.equal(observeDates(query('Friday'), [])[0].value.qualifier, 'BARE');
  assert.equal(observeTimes(query('at 19:30'), [])[0].value.period.state, 'UNSPECIFIED');
  assert.equal(observeTimes(query('at 8 AM'), [])[0].value.period.value, 'AM');
  for (const text of ['  abhi  nhi  ,parso campus se home', 'abhi nahi,parso campus se home', 'abhi nahi,   parso campus se home']) {
    assert.equal(hindiTemporalPrefixEnd(text), text.indexOf('parso') + 5, text);
  }
  assert.equal(hindiTemporalPrefixEnd('x abhi nhi, parso campus se home'), 0);
  assert.equal(hindiTemporalPrefixEnd('  abhi nhi, parso campus se home'), '  abhi nhi, parso'.length);
  for (const text of ['kal  ko campus se home', 'kal ko,campus se home', 'kal ko   campus se home']) {
    assert.equal(hindiTemporalPrefixEnd(text), text.indexOf('ko') + 2 + (text.includes('ko   ') ? 3 : text.includes('ko ') ? 1 : 0), text);
  }
  assert.equal(hindiTemporalPrefixEnd('kal campus ko home se'), 3);
  assert.equal(observeHindiNow(query('abhi  nahi'), []).length, 0);
  assert.equal(observeHindiNow(query('abhi campus nahi'), []).length, 1);
  for (const prefix of ['  mujhe:', 'mujhe:   ', 'mujhe   ', 'kripya  :  ']) {
    assert.equal(locationPrefixEnd(`${prefix}kal campus se home`, true), prefix.length + 3, prefix);
  }
  assert.equal(locationPrefixEnd('xmujhe:kal campus se home', true), 0);
  assert.equal(locationPrefixEnd('mujheX:kal campus se home', true), 0);
  assert.equal(locationPrefixEnd('campus mujhe kal se home', true), 0);
  assert.equal(locationPrefixEnd('mujhe:campus se home', true), 'mujhe:'.length);
  assert.equal(locationPrefixEnd('mujhe   campus se home', true), 'mujhe   '.length);
  for (const separator of [' ', '   ', ', ', ';']) {
    const text = `hostel kal${separator}subah 7 baje from campus`;
    const end = text.indexOf(' from');
    assert.equal(hindiTemporalSuffixStart(text, 7, end), 7);
    assert.equal(hindiTemporalSuffixStart(text, 8, end), text.indexOf('subah'));
  }
  const text = 'campus se hostel kal subah 7 baje';
  assert.equal(hindiTemporalSuffixStart(text, 10, text.length), text.indexOf('kal'));
  for (const [input, expected] of [['from Campus to Hostel, no sedan', ['Campus', 'Hostel']],
    ['from Campus to Hostel tomorrow at 7 PM IST', ['Campus', 'Hostel']]]) {
    assert.deepEqual(generateLocationCandidates(query(input), 'BOOKING_REQUEST').candidates.map(value => value.exactText), expected);
  }
});
