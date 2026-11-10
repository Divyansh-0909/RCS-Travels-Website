import { formatRecordDate, recordEntryHeading, recordScalar } from './responsibilityPresentation.js';
import { responsibilityInspectionModel } from './responsibilityInspection.js';

const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const list = value => Array.isArray(value) ? value : [];
const text = (...values) => values.find(value => typeof value === 'string' && value.trim())?.trim() ?? '';
export function storyRole(value) {
  if (typeof value !== 'string') return null;
  const role = value.toLowerCase().split(':')[0];
  return ['driver', 'captain'].includes(role) ? 'Driver' : ['rider', 'customer'].includes(role) ? 'Rider' : null;
}
function entryRole(entry) {
  const value = object(entry.value);
  return storyRole(entry.actor) || storyRole(value.initiator) || storyRole(value.actor) || storyRole(value.actorRole);
}
function narrative(value) {
  if (typeof value === 'string') return value;
  const record = object(value);
  return text(record.statement, record.summary, record.description, record.reason, record.note, record.text);
}
function statement(value) {
  if (typeof value === 'string') return value.trim();
  const record = object(value);
  return text(record.statement, record.reason, record.text);
}
const eventNames = {
  ride_accepted: 'Ride accepted',
  driver_cancellation_recorded: 'Cancellation recorded',
  committed_customer_transition: 'Rider update recorded',
};
export function responsibilityStory(context) {
  const evidence = object(context?.evidence), record = object(context?.case);
  const rawEvents = [evidence.timeline, evidence.chronology, evidence.events].find(Array.isArray) ?? [];
  const timeline = rawEvents.map((raw, index) => {
    const entry = object(raw), heading = recordEntryHeading(entry, index, 'timeline');
    const date = heading?.timeKey ? formatRecordDate(entry[heading.timeKey], heading.timeKey) : null;
    return { raw, id: text(entry.id) || `event-${index}`, title: eventNames[entry.kind] || heading?.title || `Saved event ${index + 1}`,
      body: narrative(entry) || narrative(entry.value) || (entry.availability && entry.availability !== 'available'
        ? 'This information was unavailable when the record was saved.' : 'Open the saved record to see its details.'),
      by: entryRole(entry) || 'Booking record', at: date?.dateTime, date: date?.date,
      time: date?.time?.replace(/:\d{2}(?:\.\d+)? (?=[AP]M)/, ' ').replace(/ IST$/, '') || 'Time not recorded' };
  });
  const statements = [];
  function addStatement(role, value, id) {
    const body = statement(value);
    if (body && !statements.some(item => item.role === role && item.body === body)) statements.push({role, body, id});
  }
  addStatement('Driver', evidence.driverStatement, 'driver-statement');
  addStatement('Rider', evidence.riderStatement, 'rider-statement');
  for (const [index, entry] of rawEvents.entries()) {
    const role = entryRole(object(entry));
    if (role) addStatement(role, statement(entry) || object(entry.value), `statement-${index}`);
  }
  const completeness = object(evidence.completeness);
  const missing = [...list(completeness.missing), ...list(completeness.unavailable)];
  const hasGaps = completeness.complete === false || missing.length > 0;
  const model = responsibilityInspectionModel(context || {});
  const envelope = object(model.envelope);
  const decisions = [['Human review', context?.adminReview], ['Appeal review', context?.appealReview]]
    .filter(([, value]) => value).map(([title, value]) => ({title, value,
      outcome: recordScalar(value.decision ?? value.outcome ?? value.classification, value.decision || value.outcome ? 'outcome' : 'classification'),
      reason: text(value.reason), date: formatRecordDate(value.reviewedAt ?? value.createdAt ?? value.decidedAt, 'reviewedAt')}));
  return {record, evidence, timeline, statements, missing, hasGaps, completenessKnown: typeof completeness.complete === 'boolean',
    conflicts: list(evidence.contradictions), decisions, model,
    issue: recordScalar(record.caseType, 'caseType'),
    reason: text(evidence.reportedReason) || rawEvents.map(entry => narrative(object(entry).value)).find(Boolean) || '',
    scheduled: formatRecordDate(record.scheduledAt ?? evidence.scheduledAt, 'scheduledAt'),
    opened: formatRecordDate(record.createdAt ?? record.occurredAt, 'createdAt'),
    aiOutcome: model.envelope ? (envelope.recommendation === 'NEEDS_REVIEW' ? 'A human review is needed.' : envelope.recommendation ? recordScalar(envelope.recommendation, 'recommendation') : 'Suggestion recorded') : 'No AI suggestion saved',
    aiSummary: text(envelope.summary) || (model.envelope ? 'Open the saved assessment for more details.' : 'Review the available records and make your own decision.'),
  };
}
