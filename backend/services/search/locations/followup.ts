import type { BookingDraft } from '../contracts.ts';
import type { ParseIssue } from '../fields.ts';
import { missingFields } from '../validation.ts';
import { issue } from '../fields.ts';

type DraftField = BookingDraft['pickup'] | BookingDraft['vehicleClass'] | BookingDraft['passengers'] |
  BookingDraft['sharing'] | BookingDraft['timing']['date'] | BookingDraft['timing']['time'];

// Compatibility name: entries describe form controls, never AI questions or another inference turn.
export type ResolutionRequirement = { priority: number; category: 'conflict' | 'grounding' | 'required' | 'temporalambiguity' | 'unsupported/policy' | 'review'; field: string; code: string };
export type Followup = ResolutionRequirement;
const order: Followup['category'][] = ['conflict', 'grounding', 'required', 'temporalambiguity', 'unsupported/policy', 'review'];

function category(issue: ParseIssue): Followup['category'] {
  if (issue.code.includes('CONFLICT') || issue.code === 'SAME_GROUNDED_ENDPOINTS') return 'conflict';
  if (issue.field.includes('location') || issue.code.includes('CANDIDATE') || issue.code.includes('GROUND') || issue.code.includes('PLACE')) return 'grounding';
  if (issue.category === 'MISSING') return 'required';
  if (issue.field.startsWith('timing') && issue.category === 'AMBIGUOUS') return 'temporalambiguity';
  if (issue.category === 'UNSUPPORTED' || issue.category === 'POLICY') return 'unsupported/policy';
  return 'review';
}

export function resolutionRequirements(effectiveDraft: BookingDraft, groundingIssues: ParseIssue[] = [], scheduleIssues: ParseIssue[] = [], groundedRoles: ReadonlySet<'pickup' | 'drop'> = new Set()): ResolutionRequirement[] {
  const ambiguous: ParseIssue[] = [];
  const fields: Array<[string, DraftField]> = [
    ['locationSearch', effectiveDraft.locationSearch], ['pickup', effectiveDraft.pickup], ['drop', effectiveDraft.drop], ['vehicleClass', effectiveDraft.vehicleClass], ['passengers', effectiveDraft.passengers], ['sharing', effectiveDraft.sharing], ['isOutstation', effectiveDraft.isOutstation], ['preferSafeRoute', effectiveDraft.preferSafeRoute], ['needsCarrier', effectiveDraft.needsCarrier], ['timing.date', effectiveDraft.timing.date], ['timing.time', effectiveDraft.timing.time],
  ];
  fields.forEach(([field, value]) => { if (value.state === 'AMBIGUOUS') ambiguous.push(issue('FIELD_AMBIGUOUS', field, 'AMBIGUOUS', value.refs)); });
  if (effectiveDraft.timing.mode === 'AMBIGUOUS') ambiguous.push(issue('TIMING_AMBIGUOUS', 'timing', 'AMBIGUOUS', effectiveDraft.timing.refs));
  // A missing concrete booking class differs from an unresolved user preference.
  // Explicit ANY/exclusion constraints do not require the user to pick a class.
  const constraintOnly = ['EXPLICIT_ANY', 'EXCLUDED'].includes(effectiveDraft.vehicleClass.state);
  const required = missingFields(effectiveDraft);
  const unsupported = effectiveDraft.unsupportedRequests.map(request => issue('UNSUPPORTED_REQUEST', request.kind, 'UNSUPPORTED', request.refs));
  const all = [...groundingIssues, ...required, ...ambiguous, ...scheduleIssues, ...unsupported];
  const issues = all.filter(issue => {
    if (constraintOnly && issue.code === 'VEHICLE_SELECTION_REQUIRED') return false;
    if (issue.field !== 'pickup' && issue.field !== 'drop') return true;
    if (!groundedRoles.has(issue.field)) return true;
    if (issue.code === 'PLACES_GROUNDING_REQUIRED') return false;
    const value = effectiveDraft[issue.field];
    const selected = value.state === 'RESOLVED' && value.value.kind === 'USER_SELECTION';
    return !(selected && (issue.code.startsWith('PLACE_') || issue.code.startsWith('PLACES_')));
  });
  return issues.map(issue => ({ category: category(issue), priority: order.indexOf(category(issue)), field: issue.field, code: issue.code }))
    .filter((value, index, values) => values.findIndex(other => other.field === value.field && other.code === value.code) === index)
    .sort((left, right) => left.priority - right.priority || left.field.localeCompare(right.field) || left.code.localeCompare(right.code));
}

export const followups = resolutionRequirements;
