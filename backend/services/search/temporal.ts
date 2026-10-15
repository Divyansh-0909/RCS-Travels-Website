import { timeExpressionSchema, type BookingDraft, type SourceRef, type TimeExpression } from './contracts.ts';
import { parseScheduleTime } from '../../lib/scheduling.js';
import { issue, type ParseIssue } from './fields.ts';
import { calendarDate } from './calendarPolicy.ts';
import { convertToBookingZone, draftSourceTimeZone, zonedNow } from './timezonePolicy.ts';

export type TemporalResolution = { localDate?: string; localTime?: string; scheduledAt?: string;
  sourceDate?: string; sourceTime?: string; sourceTimeZone?: string; sourceExpression?: string; issues: ParseIssue[] };
const pad = (value: number) => String(value).padStart(2, '0');

function resolveTime(expression: TimeExpression, refs: SourceRef[], issues: ParseIssue[]): string | undefined {
  if (!timeExpressionSchema.safeParse(expression).success) {
    issues.push(issue('TEMPORAL_CONFLICT', 'timing.time', 'INVALID', refs)); return undefined;
  }
  if (expression.kind === 'DAYPART') {
    issues.push(issue('EXACT_TIME_REQUIRED', 'timing.time', 'AMBIGUOUS', refs)); return undefined;
  }
  if (expression.minute.state !== 'RESOLVED') {
    issues.push(issue('TIME_MINUTE_REQUIRED', 'timing.time', 'AMBIGUOUS', refs)); return undefined;
  }
  if (expression.period.state === 'AMBIGUOUS') {
    issues.push(issue('TIME_SELECTION_REQUIRED', 'timing.time', 'AMBIGUOUS', refs)); return undefined;
  }
  const period = expression.period.state === 'RESOLVED' ? expression.period.value : 'PM';
  const hour = expression.notation === 'H12' ? expression.hour % 12 + (period === 'PM' ? 12 : 0) : expression.hour;
  if (expression.precision === 'APPROXIMATE') {
    issues.push(issue('EXACT_TIME_CONFIRMATION_REQUIRED', 'timing.time', 'AMBIGUOUS', refs)); return undefined;
  }
  return `${pad(hour)}:${pad(expression.minute.value)}`;
}

export function resolveTemporal(draft: BookingDraft, now: Date, timeZone: string): TemporalResolution {
  const result: TemporalResolution = { issues: [] };
  if (draft.timing.mode !== 'SCHEDULED') return result;
  const zone = draftSourceTimeZone(draft, timeZone);
  if (zone === undefined) {
    result.issues.push(issue('TIMEZONE_SELECTION_REQUIRED', 'timing', 'POLICY', draft.timing.refs)); return result;
  }
  result.sourceTimeZone = zone; result.sourceExpression = draft.query.text;
  const date = draft.timing.date; const time = draft.timing.time;
  const timeIssues: ParseIssue[] = [];
  if (time.state === 'RESOLVED') result.sourceTime = resolveTime(time.value, time.refs, timeIssues);
  if (date.state === 'RESOLVED') {
    if (date.value.kind === 'RELATIVE' && date.refs.some(ref => ref.kind === 'USER_FIELD')) {
      result.issues.push(issue('DATE_ANCHOR_CONTEXT_REQUIRED', 'timing.date', 'POLICY', date.refs)); return result;
    }
    try {
      const localNow = zonedNow(now, zone);
      result.sourceDate = calendarDate(date.value, localNow.toPlainDate(), result.sourceTime, localNow.toPlainTime().toString());
      if (result.sourceDate === undefined) result.issues.push(issue('DATE_COMPONENT_REQUIRED', 'timing.date', 'AMBIGUOUS', date.refs));
    } catch { result.issues.push(issue('TEMPORAL_CONFLICT', 'timing.date', 'INVALID', date.refs)); }
  }
  result.issues.push(...timeIssues);
  // Partial components stay in their source zone until both are present.
  if (['Asia/Calcutta', 'Asia/Kolkata'].includes(zone)) {
    result.localDate = result.sourceDate; result.localTime = result.sourceTime;
  }
  if (result.sourceDate === undefined || result.sourceTime === undefined) return result;
  try {
    const converted = convertToBookingZone(result.sourceDate, result.sourceTime, zone);
    result.localDate = converted.localDate; result.localTime = converted.localTime;
  } catch { result.issues.push(issue('TIMEZONE_LOCAL_TIME_SELECTION_REQUIRED', 'timing', 'AMBIGUOUS', draft.timing.refs)); return result; }
  // Temporal conversion guarantees valid HH:mm; the shared helper's lexical-rejection null is unreachable here.
  const schedule = parseScheduleTime(result.localDate, result.localTime, now)!;
  if (schedule.error !== undefined) result.issues.push(issue(`SCHEDULE_${schedule.error.toUpperCase()}`, 'timing', 'INVALID', draft.timing.refs));
  else result.scheduledAt = schedule.value;
  return result;
}
