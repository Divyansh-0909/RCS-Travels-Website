import type { DateExpression, LocationCandidate, SourceRef, TimeExpression, VehiclePreference } from './contracts.ts';
import { queryRef, resolved, unspecified } from './fields.ts';
import { observeHindiDates, observeHindiTimes, observeHindiNow } from './hindiTemporal.ts';

export type QueryIdentity = { id: string; revision: number; text: string };
export type Observed<T> = { id: string; value: T; ref: Extract<SourceRef, { kind: 'QUERY_SPAN' }>; text: string };
export type VehicleClass = Extract<VehiclePreference, { state: 'RESOLVED' }>['value'];
export type Flag = 'sharing' | 'isOutstation' | 'preferSafeRoute' | 'needsCarrier';
export type UnsupportedKind = 'STOP' | 'RETURN_JOURNEY' | 'RENTAL' | 'AC_PREFERENCE' |
  'CONDITIONAL_PREFERENCE' | 'OTHER';
export type Observations = {
  vehicles: Observed<VehicleClass>[];
  dates: Observed<DateExpression>[];
  times: Observed<TimeExpression>[];
  passengers: Observed<number>[];
  flags: Record<Flag, Observed<boolean>[]>;
  unsupported: { kind: UnsupportedKind; ref: SourceRef }[];
  now: SourceRef[];
  anyVehicle: SourceRef[];
};

export function observe<T>(query: QueryIdentity, pattern: RegExp,
  convert: (match: RegExpExecArray, ref: SourceRef) => T, locations: LocationCandidate[] = []): Observed<T>[] {
  return [...query.text.matchAll(pattern)].filter(match => !locations.some(candidate =>
    match.index >= candidate.start && match.index + match[0].length <= candidate.end))
    .map(match => {
      const ref = queryRef(query, match.index, match.index + match[0].length);
      return { id: `span:${match.index}:${match[0].length}`, value: convert(match, ref), ref, text: match[0] };
    });
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const WEEKDAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] as const;
const MONTH_PATTERN = '(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)';

function absolute(day: string, month: number, year: string | undefined, ref: SourceRef): DateExpression {
  return { kind: 'ABSOLUTE', day: resolved(Number(day), [ref]), month: resolved(month, [ref]),
    year: year === undefined ? unspecified() : resolved(Number(year), [ref]) };
}

export function observeDates(query: QueryIdentity, locations: LocationCandidate[]): Observed<DateExpression>[] {
  const numeric = observe(query, /\b(\d{4})-(\d{2})-(\d{2})\b/g,
    (m, ref) => absolute(m[3], Number(m[2]), m[1], ref), locations);
  const slashed = observe(query, /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g,
    (m, ref) => absolute(m[1], Number(m[2]), m[3], ref), locations);
  const dayFirst = observe(query, new RegExp(`\\b(\\d{1,2})\\s+${MONTH_PATTERN}(?:\\s+(\\d{4}))?\\b`, 'gi'),
    (m, ref) => absolute(m[1], MONTHS.indexOf(m[2].toLowerCase().slice(0, 3)) + 1, m[3], ref), locations);
  const monthFirst = observe(query, new RegExp(`\\b${MONTH_PATTERN}\\s+(\\d{1,2})(?:,?\\s+(\\d{4}))?\\b`, 'gi'),
    (m, ref) => absolute(m[2], MONTHS.indexOf(m[1].toLowerCase().slice(0, 3)) + 1, m[3], ref), locations);
  const relative = observe<DateExpression>(query, /\b(day after tomorrow|tomorrow|today|tonight)\b/gi, m => {
    const anchors = { 'day after tomorrow': 'DAY_AFTER_TOMORROW', tomorrow: 'TOMORROW', today: 'TODAY', tonight: 'TODAY' } as const;
    return { kind: 'RELATIVE', anchor: anchors[m[0].toLowerCase() as keyof typeof anchors] };
  }, locations);
  const weekdays = observe<DateExpression>(query, /\b(?:(this|next)\s+)?(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/gi,
    m => ({ kind: 'WEEKDAY', weekday: WEEKDAYS.find(day => day === m[2].toUpperCase())!,
      qualifier: m[1] === undefined ? 'BARE' : m[1].toUpperCase() as 'THIS' | 'NEXT' }), locations);
  return [...numeric, ...slashed, ...dayFirst, ...monthFirst, ...relative, ...weekdays, ...observeHindiDates(query, locations)];
}

function clockExpression(m: RegExpExecArray, ref: SourceRef): TimeExpression {
  const hour = Number(m[2]);
  const period = m[4]?.toLowerCase();
  const pm = ['pm', 'in the afternoon', 'in the evening', 'tonight'];
  const notation = period !== undefined ? 'H12' : m[3] !== undefined || hour > 12 ? 'H24' : 'H12';
  return { kind: 'CLOCK', hour, minute: resolved(m[3] === undefined ? 0 : Number(m[3]), [ref]), notation,
    period: period === undefined
      ? notation === 'H24' ? unspecified() : resolved('PM', [ref])
      : resolved(pm.includes(period) ? 'PM' : 'AM', [ref]),
    precision: /^(around|about)$/i.test(m[1]) ? 'APPROXIMATE' : 'EXACT' };
}

export function observeTimes(query: QueryIdentity, locations: LocationCandidate[]): Observed<TimeExpression>[] {
  const clocks = observe<TimeExpression>(query,
    /\b(?:(at|around|about)\s+)?(\d{1,2})(?::(\d{2}))?(?:\s*(am|pm|in the morning|in the afternoon|in the evening|tonight))?\b/gi,
    clockExpression, locations).filter(candidate => {
      const text = candidate.text.trim();
      const before = query.text.slice(0, candidate.ref.start);
      const after = query.text.slice(candidate.ref.end);
      const relativeClock = !/^\s*(?:people|passengers|seats|hours?|hrs?|minutes?|mins?|km|miles)\b/i.test(after)
        && (/\b(?:today|tomorrow)\s*$/i.test(before) || /^\s*(?:today|tomorrow)\b/i.test(after));
      return /^(at|around|about)\b|:|am\b|pm\b|in the |tonight/i.test(text) || query.text.trim() === text || relativeClock;
    });
  const dayparts = observe<TimeExpression>(query, /\b(morning|afternoon|evening|night|tonight)\b/gi,
    m => ({ kind: 'DAYPART', value: m[0].toLowerCase() === 'tonight' ? 'NIGHT'
      : m[0].toUpperCase() as Extract<TimeExpression, { kind: 'DAYPART' }>['value'] }), locations)
    .filter(candidate => !clocks.some(clock => clock.ref.kind === 'QUERY_SPAN' && candidate.ref.kind === 'QUERY_SPAN'
      && candidate.ref.start >= clock.ref.start && candidate.ref.end <= clock.ref.end));
  const hindi = observeHindiTimes(query, locations);
  return [...clocks, ...dayparts].filter(value => !hindi.some(other => value.ref.start >= other.ref.start && value.ref.end <= other.ref.end)).concat(hindi);
}

const FLAG_PATTERNS: Record<Flag, RegExp> = {
  sharing: /\b(?:(no|not)\s+)?(sharing|shared|pooling|solo|private)\b/gi,
  isOutstation: /\b(?:(no|not)\s+)?(outstation|local)\b/gi,
  preferSafeRoute: /\b(?:(no|not)\s+)?(safer? route|fastest route|standard route)\b/gi,
  needsCarrier: /\b(?:(no|not|without)\s+)?(?:(?:roof|luggage)\s+)?(carrier)\b/gi,
};
const NEGATIVE_FLAGS = /^(solo|private|local|fastest route|standard route)$/i;
const UNSUPPORTED_PATTERNS: [UnsupportedKind, RegExp][] = [
  ['STOP', /\b(?:via|stop\s+(?:at|by)|pick\s+(?:up\s+)?(?:my|a)\s+friend)[^,;.]*/gi],
  ['RETURN_JOURNEY', /\b(?:return|round\s+trip|come\s+back)[^,;.]*/gi],
  ['RENTAL', /\b(?:rent|rental)\b[^,;.]*/gi],
  ['AC_PREFERENCE', /\bAC(?:\s+car)?\b/g],
  ['CONDITIONAL_PREFERENCE', /\b(?:if|unless|provided|depending)\b[^,;.]*/gi],
];

export function collectObservations(query: QueryIdentity, locations: LocationCandidate[]): Observations {
  const vehicles = observe<VehicleClass>(query, /\b(premium\s+suv|suv_premium|regular\s+suv|hatchback|sedan|suv|XL)\b/gi,
    m => /^(premium\s+suv|suv_premium)$/i.test(m[0]) ? 'suv_premium' : /^(regular\s+suv|XL)$/i.test(m[0]) ? 'suv' : m[0].toLowerCase() as VehicleClass, locations);
  const flags = Object.fromEntries(Object.entries(FLAG_PATTERNS).map(([field, pattern]) =>
    [field, observe(query, pattern, m => m[1] === undefined && !NEGATIVE_FLAGS.test(m[2]), locations)])) as Observations['flags'];
  return { vehicles, dates: observeDates(query, locations), times: observeTimes(query, locations), flags,
    passengers: observe(query, /(?<![\w.,])(-?\d+(?:\.\d+)?)\s+(?:people|passengers?|persons?)\b/gi, m => Number(m[1]), locations),
    unsupported: UNSUPPORTED_PATTERNS.flatMap(([kind, pattern]) => observe(query, pattern, () => kind, locations)
      .map(candidate => ({ kind, ref: candidate.ref }))),
    now: observe(query, /\b(?:now|right now|immediately|asap)\b/gi, () => true, locations).map(candidate => candidate.ref).concat(observeHindiNow(query, locations)),
    anyVehicle: observe(query, /\b(?:any\s+(?:car|cab|vehicle)|anything(?:\s+except)?)\b/gi,
      () => true, locations).map(candidate => candidate.ref) };
}
