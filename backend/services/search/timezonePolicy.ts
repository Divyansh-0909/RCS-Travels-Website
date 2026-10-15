import { Temporal } from '@js-temporal/polyfill';
import type { BookingDraft } from './contracts.ts';

export const BOOKING_TIME_ZONE = 'Asia/Kolkata';
const aliases: Record<string, string> = { ist: BOOKING_TIME_ZONE, utc: 'UTC', gmt: 'UTC', 'london time': 'Europe/London' };

export function timeZoneTokens(text: string): Array<{ start: number; end: number; text: string }> {
  return [...text.matchAll(/\b(?:[A-Za-z_]+\/[A-Za-z_]+(?:\/[A-Za-z_]+)?|London time|IST|UTC|GMT|CST|EST|PST|BST)\b/gi)]
    .map(match => ({ start: match.index, end: match.index + match[0].length, text: match[0] }));
}

export function sourceTimeZone(text: string, context: string, locationSpans: readonly { start: number; end: number }[] = []): string | undefined {
  const expressions = timeZoneTokens(text)
    .filter(match => !locationSpans.some(span => match.start < span.end && match.end > span.start))
    .map(match => aliases[match.text.toLowerCase()] ?? match.text);
  const zones = [...new Set(expressions)];
  if (zones.length > 1) return undefined;
  const zone = zones[0] ?? context;
  if (/^(CST|EST|PST|BST)$/i.test(zone)) return undefined;
  try { return new Intl.DateTimeFormat('en', { timeZone: zone }).resolvedOptions().timeZone; }
  catch { return undefined; }
}

export function draftSourceTimeZone(draft: BookingDraft, context: string): string | undefined {
  const locations = draft.candidates.filter(candidate => candidate.queryId === draft.query.id
    && candidate.queryRevision === draft.query.revision && draft.query.text.slice(candidate.start, candidate.end) === candidate.exactText);
  return sourceTimeZone(draft.query.text, context, locations);
}

export function zonedNow(now: Date, zone: string): Temporal.ZonedDateTime {
  return Temporal.Instant.from(now.toISOString()).toZonedDateTimeISO(zone);
}

export function convertToBookingZone(date: string, time: string, zone: string) {
  // Reject nonexistent spring-forward times and repeated fall-back times; form selection resolves them.
  const instant = Temporal.PlainDateTime.from(`${date}T${time}`).toZonedDateTime(zone, { disambiguation: 'reject' });
  const booking = instant.withTimeZone(BOOKING_TIME_ZONE);
  return { localDate: booking.toPlainDate().toString(), localTime: booking.toPlainTime().toString().slice(0, 5),
    sourceDate: date, sourceTime: time, sourceTimeZone: zone, instant: instant.toInstant().toString() };
}
