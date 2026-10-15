import { Temporal } from '@js-temporal/polyfill';
import type { DateExpression } from './contracts.ts';

const weekdays = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

function weekdayDate(expression: Extract<DateExpression, { kind: 'WEEKDAY' }>, today: Temporal.PlainDate,
  localTime?: string, currentTime?: string): string | undefined {
  const target = weekdays.indexOf(expression.weekday) + 1;
  if (expression.qualifier !== 'BARE') {
    return today.subtract({ days: today.dayOfWeek - 1 }).add({ days: target - 1 + (expression.qualifier === 'NEXT' ? 7 : 0) }).toString();
  }
  let days = (target - today.dayOfWeek + 7) % 7;
  if (days === 0) {
    if (localTime === undefined || currentTime === undefined) return undefined;
    if (localTime <= currentTime) days = 7;
  }
  return today.add({ days }).toString();
}

export function calendarDate(expression: DateExpression, today: Temporal.PlainDate, localTime?: string,
  currentTime?: string): string | undefined {
  if (expression.kind === 'RELATIVE') {
    return today.add({ days: { TODAY: 0, TOMORROW: 1, DAY_AFTER_TOMORROW: 2 }[expression.anchor] }).toString();
  }
  if (expression.kind === 'WEEKDAY') {
    return weekdayDate(expression, today, localTime, currentTime);
  }
  if (expression.day.state !== 'RESOLVED' || expression.month.state !== 'RESOLVED') return undefined;
  const values = { day: expression.day.value, month: expression.month.value };
  if (expression.year.state === 'AMBIGUOUS') return undefined;
  if (expression.year.state === 'RESOLVED') return Temporal.PlainDate.from({ ...values, year: expression.year.value }, { overflow: 'reject' }).toString();
  // Eight years covers the leap-year exception around non-leap century years.
  for (let year = today.year; year <= today.year + 8; year++) {
    let date: Temporal.PlainDate;
    try { date = Temporal.PlainDate.from({ ...values, year }, { overflow: 'reject' }); }
    catch { continue; }
    if (Temporal.PlainDate.compare(date, today) >= 0) return date.toString();
  }
  throw new RangeError('INVALID_CALENDAR_DATE');
}
