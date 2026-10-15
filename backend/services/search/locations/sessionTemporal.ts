import { resolveTemporal, type TemporalResolution } from '../temporal.ts';
import { validateDraftSession, type DraftSession } from './session.ts';
import type { SourceRef, BookingDraft } from '../contracts.ts';
import { sourceRefs as refs } from './sessionRefs.ts';
import { parseScheduleTime } from '../../../lib/scheduling.js';
import { issue } from '../fields.ts';
import { systemClock } from '../../../lib/clock.js';

function anchor(session: DraftSession): { at: Date; timeZone: string; query: BookingDraft['query']; candidates: BookingDraft['candidates'] } | undefined {
  const date = session.effectiveDraft.timing.date;
  const source = refs(date).find(ref => ref.kind === 'QUERY_SPAN');
  if (source !== undefined) {
    const snapshot = session.snapshots.find(value => value.query.id === source.queryId && value.query.revision === source.revision)!;
    return { at: new Date(snapshot.anchorDate), timeZone: snapshot.timeZone, query: snapshot.query, candidates: snapshot.draft.candidates };
  }
  const user = refs(date).find((ref): ref is Extract<SourceRef, { kind: 'USER_FIELD' }> => ref.kind === 'USER_FIELD')!;
  const edit = session.edits.find(value => value.field === user.field && value.revision === user.revision)!;
  if (edit.editedAt === undefined) return undefined;
  return { at: new Date(edit.editedAt), timeZone: session.snapshots.at(-1)!.timeZone, query: session.effectiveDraft.query, candidates: session.effectiveDraft.candidates };
}

export function resolveSessionTemporal(session: DraftSession, clock = systemClock): TemporalResolution {
  validateDraftSession(session);
  if (session.effectiveDraft.timing.mode !== 'SCHEDULED') return { issues: [] };
  if (session.effectiveDraft.timing.date.state === 'UNSPECIFIED') return { issues: [] };
  if (session.effectiveDraft.timing.date.state !== 'RESOLVED' || session.effectiveDraft.timing.date.value.kind !== 'RELATIVE'
    && !refs(session.effectiveDraft.timing.date).some(ref => ref.kind === 'QUERY_SPAN')) {
    return resolveTemporal(session.effectiveDraft, clock.now(), session.snapshots.at(-1)!.timeZone);
  }
  const source = anchor(session);
  if (source === undefined) return { issues: [issue('DATE_ANCHOR_CONTEXT_REQUIRED', 'timing.date', 'POLICY', session.effectiveDraft.timing.date.refs)] };
  const draft = structuredClone(session.effectiveDraft);
  draft.query = structuredClone(source.query);
  draft.candidates = structuredClone(source.candidates);
  if (draft.timing.date.state === 'RESOLVED' && draft.timing.date.refs.some(ref => ref.kind === 'USER_FIELD')) draft.timing.date.refs = [];
  const anchored = resolveTemporal(draft, source.at, source.timeZone);
  const issues = anchored.issues.filter(value => !value.code.startsWith('SCHEDULE_'));
  if (anchored.localDate === undefined || anchored.localTime === undefined) return { ...anchored, issues };
  // The shared resolver has already validated and formatted HH:mm. Re-check
  // the authoritative booking bounds against current time, not the date anchor.
  const schedule = parseScheduleTime(anchored.localDate, anchored.localTime, clock.now())!;
  if (schedule.error !== undefined) issues.push(issue(`SCHEDULE_${schedule.error.toUpperCase()}`, 'timing', 'INVALID', session.effectiveDraft.timing.refs));
  else return { ...anchored, scheduledAt: schedule.value, issues };
  return { ...anchored, scheduledAt: undefined, issues };
}
