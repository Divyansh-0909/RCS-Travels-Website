import { isDeepStrictEqual } from 'node:util';
import {
  bookingDraftSchema,
  parseInputSchema,
  type BookingDraft,
  type Field,
  type ParseInput,
  type SourceRef,
  type TimeExpression,
} from './contracts.ts';

export type ProvenanceIssue = { code: string; field: string };
export type TrustedLocationSelection = { selectionId: string; displayText: string };

type DraftField = 'locationSearch' | 'pickup' | 'drop' | 'vehicleClass' | 'timing' | 'passengers' | 'sharing' | 'isOutstation' | 'preferSafeRoute' | 'needsCarrier' | 'unsupportedRequests';
type UserFieldPolicy = 'STRICT_OUTPUT' | 'AUTHORITATIVE_SNAPSHOT';

function hasSurrogateSplit(text: string, offset: number): boolean {
  return offset > 0 && offset < text.length && /[\uD800-\uDBFF]/.test(text[offset - 1]) && /[\uDC00-\uDFFF]/.test(text[offset]);
}

function sameTrustedValue(left: object, right: object): boolean {
  const withoutRefs = (key: string, value: object): object | undefined => key === 'refs' ? undefined : value;
  return isDeepStrictEqual(JSON.parse(JSON.stringify(left, withoutRefs)), JSON.parse(JSON.stringify(right, withoutRefs)));
}

function addRefs(
  issues: ProvenanceIssue[], refs: SourceRef[], field: DraftField, draft: BookingDraft, formDraft: BookingDraft | undefined, policy: UserFieldPolicy, sourceValue?: object,
): void {
  refs.forEach((ref) => {
    if (ref.kind === 'QUERY_SPAN') {
      const validSpan = ref.queryId === draft.query.id && ref.revision === draft.query.revision
        && ref.end > ref.start && ref.end <= draft.query.text.length
        && !hasSurrogateSplit(draft.query.text, ref.start) && !hasSurrogateSplit(draft.query.text, ref.end);
      if (!validSpan) issues.push({ code: 'INVALID_QUERY_SPAN', field });
      return;
    }
    const trustedField = ref.field as DraftField;
    const matchesField = policy === 'AUTHORITATIVE_SNAPSHOT'
      ? trustedField === field && ref.revision <= draft.query.revision
      : trustedField === field && ref.revision === formDraft?.query.revision;
    const currentValue = formDraft?.[trustedField];
    const sourceMatches = field === 'unsupportedRequests' && sourceValue !== undefined
      ? formDraft?.unsupportedRequests.some((request) => sameTrustedValue(sourceValue, request)) === true
      : currentValue !== undefined && sameTrustedValue(draft[field], currentValue);
    if (!matchesField || (policy === 'STRICT_OUTPUT' && !sourceMatches)) {
      issues.push({ code: 'UNTRUSTED_USER_FIELD', field });
    }
  });
}

function addFieldRefs<T>(issues: ProvenanceIssue[], value: Field<T>, field: DraftField, draft: BookingDraft, formDraft: BookingDraft | undefined, policy: UserFieldPolicy): void {
  if (value.state !== 'UNSPECIFIED') addRefs(issues, value.refs, field, draft, formDraft, policy);
}

function addTimeRefs(issues: ProvenanceIssue[], expression: TimeExpression, draft: BookingDraft, formDraft: BookingDraft | undefined, policy: UserFieldPolicy): void {
  if (expression.kind !== 'CLOCK') return;
  addFieldRefs(issues, expression.minute, 'timing', draft, formDraft, policy);
  addFieldRefs(issues, expression.period, 'timing', draft, formDraft, policy);
}

function addTimingRefs(issues: ProvenanceIssue[], draft: BookingDraft, formDraft: BookingDraft | undefined, policy: UserFieldPolicy): void {
  addRefs(issues, draft.timing.refs, 'timing', draft, formDraft, policy);
  addFieldRefs(issues, draft.timing.date, 'timing', draft, formDraft, policy);
  if (draft.timing.date.state !== 'UNSPECIFIED') {
    const date = draft.timing.date.state === 'RESOLVED' ? draft.timing.date.value : draft.timing.date.alternatives;
    const expressions = Array.isArray(date) ? date : [date];
    expressions.forEach((expression) => {
      if (expression.kind === 'ABSOLUTE') {
        addFieldRefs(issues, expression.day, 'timing', draft, formDraft, policy);
        addFieldRefs(issues, expression.month, 'timing', draft, formDraft, policy);
        addFieldRefs(issues, expression.year, 'timing', draft, formDraft, policy);
      }
    });
  }
  addFieldRefs(issues, draft.timing.time, 'timing', draft, formDraft, policy);
  if (draft.timing.time.state !== 'UNSPECIFIED') {
    const time = draft.timing.time.state === 'RESOLVED' ? draft.timing.time.value : draft.timing.time.alternatives;
    (Array.isArray(time) ? time : [time]).forEach((expression) => addTimeRefs(issues, expression, draft, formDraft, policy));
  }
}

function addLocationRefIssues(issues: ProvenanceIssue[], draft: BookingDraft, selections: TrustedLocationSelection[]): void {
  const candidateIds = new Set(draft.candidates.map((candidate) => candidate.candidateId));
  const selectionIds = new Set(selections.map((selection) => selection.selectionId));
  const fields: Array<['locationSearch' | 'pickup' | 'drop', typeof draft.pickup]> = [
    ['locationSearch', draft.locationSearch], ['pickup', draft.pickup], ['drop', draft.drop],
  ];
  fields.forEach(([field, value]) => {
    const refs = value.state === 'RESOLVED' ? [value.value] : value.state === 'AMBIGUOUS' ? value.alternatives : [];
    refs.forEach((ref) => {
      if (ref.kind === 'QUERY_CANDIDATE' && !candidateIds.has(ref.candidateId)) issues.push({ code: 'UNKNOWN_CANDIDATE', field });
      if (ref.kind === 'USER_SELECTION' && !selectionIds.has(ref.selectionId)) issues.push({ code: 'UNTRUSTED_LOCATION_SELECTION', field });
    });
  });
}

function validateProvenance(
  draft: BookingDraft,
  trustedSelections: TrustedLocationSelection[] = [],
  formDraft?: BookingDraft,
  policy: UserFieldPolicy = 'STRICT_OUTPUT',
): ProvenanceIssue[] {
  const issues: ProvenanceIssue[] = [];
  if (!bookingDraftSchema.safeParse(draft).success) issues.push({ code: 'INVALID_DRAFT', field: 'draft' });
  if (!parseInputSchema.safeParse({ query: draft.query, candidates: draft.candidates, timeZone: 'validated-context', trustedLocationSelections: trustedSelections, formDraft }).success) {
    issues.push({ code: 'INVALID_CANDIDATE_INPUT', field: 'candidates' });
  }
  addLocationRefIssues(issues, draft, trustedSelections);
  addFieldRefs(issues, draft.locationSearch, 'locationSearch', draft, formDraft, policy);
  addFieldRefs(issues, draft.pickup, 'pickup', draft, formDraft, policy);
  addFieldRefs(issues, draft.drop, 'drop', draft, formDraft, policy);
  if (draft.vehicleClass.state !== 'UNSPECIFIED') addRefs(issues, draft.vehicleClass.refs, 'vehicleClass', draft, formDraft, policy);
  addTimingRefs(issues, draft, formDraft, policy);
  addFieldRefs(issues, draft.passengers, 'passengers', draft, formDraft, policy);
  addFieldRefs(issues, draft.sharing, 'sharing', draft, formDraft, policy);
  addFieldRefs(issues, draft.isOutstation, 'isOutstation', draft, formDraft, policy);
  addFieldRefs(issues, draft.preferSafeRoute, 'preferSafeRoute', draft, formDraft, policy);
  addFieldRefs(issues, draft.needsCarrier, 'needsCarrier', draft, formDraft, policy);
  draft.unsupportedRequests.forEach((request) => {
    addRefs(issues, request.refs, 'unsupportedRequests', draft, formDraft, policy, request);
    request.candidateIds.forEach((candidateId) => {
      if (!draft.candidates.some((candidate) => candidate.candidateId === candidateId)) issues.push({ code: 'UNKNOWN_CANDIDATE', field: 'unsupportedRequests' });
    });
  });
  return issues;
}

export function validateDraftProvenance(
  draft: BookingDraft,
  trustedSelections: TrustedLocationSelection[] = [],
  formDraft?: BookingDraft,
): ProvenanceIssue[] {
  return validateProvenance(draft, trustedSelections, formDraft);
}

// This accepts only application-trusted explicit form context, never a caller-created draft.
export function validateParseInputProvenance(input: ParseInput): ProvenanceIssue[] {
  return input.formDraft === undefined
    ? []
    : validateProvenance(input.formDraft, input.trustedLocationSelections, undefined, 'AUTHORITATIVE_SNAPSHOT');
}
