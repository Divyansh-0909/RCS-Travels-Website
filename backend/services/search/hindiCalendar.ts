import type { DateExpression, LocationCandidate } from './contracts.ts';
import { observe, type QueryIdentity, type Observed } from './observations.ts';
import { resolved, unspecified } from './fields.ts';

const weekdays: Record<string, Extract<DateExpression, { kind: 'WEEKDAY' }>['weekday']> = {
  'सोमवार': 'MONDAY', 'मंगलवार': 'TUESDAY', 'बुधवार': 'WEDNESDAY', 'गुरुवार': 'THURSDAY',
  'शुक्रवार': 'FRIDAY', 'शनिवार': 'SATURDAY', 'रविवार': 'SUNDAY', shukravar: 'FRIDAY', shukravaar: 'FRIDAY',
};
const wordBoundary = '[\\p{L}\\p{M}\\p{N}_]';
const weekdayPattern = new RegExp(`(?<!${wordBoundary})(?:(अगले|इस|agle|iss)\\s+)?(${Object.keys(weekdays).join('|')})(?!${wordBoundary})`, 'giu');
const december = /(?<![\p{L}\p{M}\p{N}_])([0-9०-९]{1,2})\s+(दिसंबर|दिसम्बर)(?:\s+([0-9०-९]{4}))?(?![\p{L}\p{M}\p{N}_])/giu;
const numeral = (value: string) => Number(value.replace(/[०-९]/g, digit => String(digit.charCodeAt(0) - 0x0966)));

// Calendar resolution and booking-window validation remain in the shared resolver.
export function observeHindiCalendar(query: QueryIdentity, locations: LocationCandidate[]): Observed<DateExpression>[] {
  const days = observe<DateExpression>(query, weekdayPattern, match => ({ kind: 'WEEKDAY', weekday: weekdays[match[2].toLowerCase()],
    qualifier: match[1] === undefined ? 'BARE' : ['अगले', 'agle'].includes(match[1].toLowerCase()) ? 'NEXT' : 'THIS' }), locations);
  const absolute = observe<DateExpression>(query, december, (match, ref) => ({ kind: 'ABSOLUTE',
    day: resolved(numeral(match[1]), [ref]), month: resolved(12, [ref]),
    year: match[3] === undefined ? unspecified() : resolved(numeral(match[3]), [ref]) }), locations);
  return [...days, ...absolute];
}
