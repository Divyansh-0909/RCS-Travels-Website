import type { DateExpression, LocationCandidate, SourceRef, TimeExpression } from './contracts.ts';
import { resolved, unspecified, ambiguous } from './fields.ts';
import { observe, type QueryIdentity, type Observed } from './observations.ts';
import { observeHindiCalendar } from './hindiCalendar.ts';

const dates: Record<string, Extract<DateExpression, { kind: 'RELATIVE' }>['anchor']> = {
  kal: 'TOMORROW', 'कल': 'TOMORROW', aaj: 'TODAY', 'आज': 'TODAY',
  parso: 'DAY_AFTER_TOMORROW', parson: 'DAY_AFTER_TOMORROW', 'परसों': 'DAY_AFTER_TOMORROW',
};
const parts: Record<string, Extract<TimeExpression, { kind: 'DAYPART' }>['value']> = {
  subah: 'MORNING', subha: 'MORNING', 'सुबह': 'MORNING', shaam: 'EVENING', sham: 'EVENING', 'शाम': 'EVENING',
  raat: 'NIGHT', rat: 'NIGHT', 'रात': 'NIGHT', dopahar: 'AFTERNOON', dopehar: 'AFTERNOON', 'दोपहर': 'AFTERNOON',
};
const hours: Record<string, number> = { 'एक': 1, 'दो': 2, 'तीन': 3, 'चार': 4, 'पाँच': 5, 'पांच': 5,
  'छह': 6, 'छः': 6, 'सात': 7, saat: 7, 'आठ': 8, 'नौ': 9, 'दस': 10, 'ग्यारह': 11, 'बारह': 12 };
const boundary = '[\\p{L}\\p{M}\\p{N}_]';
const bounded = (pattern: string) => new RegExp(`(?<!${boundary})(?:${pattern})(?!${boundary})`, 'giu');
const partPattern = Object.keys(parts).join('|');
const datePattern = bounded(Object.keys(dates).join('|'));
const daypartPattern = bounded(partPattern);
const clockCue = bounded('baje|bajey|बजे');
const past = bounded('yesterday|went|rode|took|tha|thi|gaye\\s+the|बीता|था|थी|थे');
const future = bounded('jaana|jana|jaunga|chahiye|chahie|book|booking|need|se|from|to|baje|जाना|चाहिए|जाऊँगा|बुक|से|बजे');
const namedPlace = /^\s+(?:nagar|kunj|cafe|park|road|store|stores|chowk|नगर|कुंज|कैफे|पार्क|रोड|चौक)(?![\p{L}\p{M}\p{N}_])/iu;
const numberPattern = `[0-9०-९]{1,2}|${Object.keys(hours).join('|')}`;
const approximate = 'karib|kareeb|करीब|लगभग';
const half = 'saadhe|sadhe|साढ़े|साढे';
const clockPattern = bounded(`((?:(?:${partPattern})[\\s,]+)*)(?:(${approximate})\\s+)?(?:(${half})\\s+)?(${numberPattern})(?::([0-9०-९]{2}))?\\s*(am|pm)?(?:\\s*(baje|bajey|बजे))?(?:[\\s,]+(${partPattern}))?`);

function number(value: string): number {
  return hours[value.toLowerCase()] ?? Number(value.replace(/[०-९]/g, digit => String(digit.charCodeAt(0) - 0x0966)));
}
function has(pattern: RegExp, text: string): boolean { return [...text.matchAll(pattern)].length > 0; }
function temporalPlace(query: QueryIdentity, start: number, end: number): boolean {
  return namedPlace.test(query.text.slice(end)) || /(?:from|pickup|pick up|से)\s*[:=-]?\s*$/iu.test(query.text.slice(0, start));
}
export function observeHindiDates(query: QueryIdentity, locations: LocationCandidate[]): Observed<DateExpression>[] {
  const relative = observe<Extract<DateExpression, { kind: 'RELATIVE' }>>(query, datePattern, m => ({ kind: 'RELATIVE', anchor: dates[m[0].toLowerCase()] }), locations)
    .filter(value => !temporalPlace(query, value.ref.start, value.ref.end)
      && (value.value.anchor === 'TODAY'
        || (!has(past, query.text) && (has(future, query.text) || has(daypartPattern, query.text)))));
  return [...relative, ...observeHindiCalendar(query, locations)
    .filter(value => !temporalPlace(query, value.ref.start, value.ref.end))];
}
function period(markers: string[], explicit: string | undefined, ref: SourceRef): Extract<TimeExpression, { kind: 'CLOCK' }>['period'] {
  const values = [...new Set(markers.map(marker => parts[marker.toLowerCase()] === 'MORNING' ? 'AM' : 'PM'))] as ('AM' | 'PM')[];
  if (explicit !== undefined) values.push(explicit.toUpperCase() as 'AM' | 'PM');
  const distinct = [...new Set(values)];
  if (distinct.length > 1) return ambiguous(distinct, 'TEMPORAL_CONFLICT', [ref]);
  return distinct.length ? resolved(distinct[0], [ref]) : unspecified();
}
function hindiClock(m: RegExpExecArray, ref: SourceRef): TimeExpression {
  const markers = [...(m[1] + (m[8] ?? '')).matchAll(daypartPattern)].map(value => value[0]);
  const hour = number(m[4]);
  const minute = m[5] !== undefined ? resolved(number(m[5]), [ref])
    : m[3] !== undefined ? resolved(30, [ref]) : unspecified();
  const notation = markers.length || m[6] !== undefined || hour <= 12 ? 'H12' : 'H24';
  return { kind: 'CLOCK', hour, minute, notation, period: period(markers, m[6], ref),
    precision: m[2] === undefined ? 'EXACT' : 'APPROXIMATE' };
}
export function observeHindiTimes(query: QueryIdentity, locations: LocationCandidate[]): Observed<TimeExpression>[] {
  const clocks = observe<TimeExpression>(query, clockPattern, hindiClock, locations)
    .filter(value => (has(daypartPattern, value.text) || has(clockCue, value.text))
      && !temporalPlace(query, value.ref.start, value.ref.end));
  const dayparts = observe<TimeExpression>(query, daypartPattern,
    m => ({ kind: 'DAYPART', value: parts[m[0].toLowerCase()] }), locations)
    .filter(value => !temporalPlace(query, value.ref.start, value.ref.end)
      && !clocks.some(clock => value.ref.start >= clock.ref.start && value.ref.end <= clock.ref.end));
  return [...clocks, ...dayparts];
}

// Candidate generation consumes a boundary in original text, never a translation.
// Trim only a contiguous, recognized temporal prefix before a journey clause.
export function hindiTemporalPrefixEnd(text: string): number {
  const query = { id: 'hindi-prefix-view', revision: 0, text };
  if (has(past, text) || !has(future, text)) return 0;
  const values = [...observeHindiDates(query, []), ...observeHindiTimes(query, [])]
    .sort((left, right) => left.ref.start - right.ref.start);
  const superseded = /^\s*(?:abhi|अभी)\s+(?:nhi|nahi|नहीं)\s*[,;]\s*/iu.exec(text)?.[0].length ?? 0;
  let end = superseded;
  for (const value of values) {
    if (!/^[\s,;:]*$/.test(text.slice(end, value.ref.start))) break;
    end = value.ref.end;
  }
  if (end === superseded) return 0;
  const postposition = /^\s+(?:ko|को)(?![\p{L}\p{M}\p{N}_])\s*/iu.exec(text.slice(end));
  return end + (postposition?.[0].length ?? 0);
}

export function observeHindiNow(query: QueryIdentity, locations: LocationCandidate[]): Extract<SourceRef, { kind: 'QUERY_SPAN' }>[] {
  return observe(query, bounded('abhi|अभी'), () => true, locations)
    .filter(value => !temporalPlace(query, value.ref.start, value.ref.end)
      && !/^\s+(?:nhi|nahi|नहीं)(?![\p{L}\p{M}\p{N}_])/iu.test(query.text.slice(value.ref.end))).map(value => value.ref);
}

export function hindiTemporalSuffixStart(text: string, start: number, end: number): number | undefined {
  const query = { id: 'hindi-suffix-view', revision: 0, text };
  const values = [...observeHindiDates(query, []), ...observeHindiTimes(query, [])]
    .filter(value => value.ref.start >= start && value.ref.end <= end).sort((left, right) => right.ref.end - left.ref.end);
  let boundary = end;
  for (const value of values) {
    if (!/^[\s,;:]*$/.test(text.slice(value.ref.end, boundary))) break;
    boundary = value.ref.start;
  }
  return boundary === end ? undefined : boundary;
}
