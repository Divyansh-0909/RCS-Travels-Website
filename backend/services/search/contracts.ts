import { z } from 'zod';

export const SEARCH_LIMITS = {
  queryLength: 2_000,
  candidates: 24,
  ambiguousAlternatives: 4,
  observedTemporalCandidates: 8,
  observedPassengerCandidates: 8,
  aggregateCandidateText: 8_000,
  providerContext: 12_000,
  questionsPerBatch: 48,
} as const;

const strictObject = z.strictObject;
const nonEmptyText = z.string().min(1);
const revisionSchema = z.number().int().nonnegative();
const reservedCandidateIds = new Set(['NONE_OR_UNCLEAR', 'NONE', 'UNCLEAR']);

export const querySchema = strictObject({
  id: nonEmptyText,
  revision: revisionSchema,
  text: z.string().max(SEARCH_LIMITS.queryLength),
});

export const sourceRefSchema = z.discriminatedUnion('kind', [
  strictObject({ kind: z.literal('QUERY_SPAN'), queryId: nonEmptyText, revision: revisionSchema, start: z.number().int().nonnegative(), end: z.number().int().nonnegative() }),
  strictObject({ kind: z.literal('USER_FIELD'), field: nonEmptyText, revision: revisionSchema }),
]);

export const locationRefSchema = z.discriminatedUnion('kind', [
  strictObject({ kind: z.literal('QUERY_CANDIDATE'), candidateId: nonEmptyText }),
  strictObject({ kind: z.literal('USER_SELECTION'), selectionId: nonEmptyText }),
]);

function distinctAlternatives<T extends z.ZodType>(values: z.infer<T>[]): boolean {
  return new Set(values.map((value) => JSON.stringify(value))).size === values.length;
}

export function fieldSchema<T extends z.ZodType>(valueSchema: T) {
  return z.discriminatedUnion('state', [
    strictObject({ state: z.literal('UNSPECIFIED') }),
    strictObject({ state: z.literal('RESOLVED'), value: valueSchema, refs: z.array(sourceRefSchema).min(1) }),
    strictObject({
      state: z.literal('AMBIGUOUS'),
      alternatives: z.array(valueSchema).min(1).max(SEARCH_LIMITS.ambiguousAlternatives)
        .refine(distinctAlternatives, 'Alternatives must be distinct'),
      reasonCode: nonEmptyText,
      refs: z.array(sourceRefSchema).min(1),
    }),
  ]);
}

export const locationCandidateSchema = strictObject({
  candidateId: nonEmptyText.refine((value) => !reservedCandidateIds.has(value), 'Candidate ID is reserved'),
  queryId: nonEmptyText,
  queryRevision: revisionSchema,
  exactText: nonEmptyText,
  normalizedText: z.string().optional(),
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
  method: z.enum(['WHOLE_LOCATION_QUERY', 'DIRECTIONAL_CLAUSE', 'LABELLED_FIELD', 'OVERLAPPING_ALTERNATIVE', 'LUNA_SOURCE_SPAN']),
  alsoDetectedBy: z.array(z.enum(['WHOLE_LOCATION_QUERY', 'DIRECTIONAL_CLAUSE', 'LABELLED_FIELD', 'OVERLAPPING_ALTERNATIVE', 'LUNA_SOURCE_SPAN'])).optional(),
  generatorVersion: nonEmptyText,
});

export const vehicleClassSchema = z.enum(['hatchback', 'sedan', 'suv', 'suv_premium']);
const refsSchema = z.array(sourceRefSchema).min(1);
const exclusionsSchema = z.array(vehicleClassSchema).refine(distinctAlternatives, 'Exclusions must be distinct');

export const vehiclePreferenceSchema = z.discriminatedUnion('state', [
  strictObject({ state: z.literal('UNSPECIFIED') }),
  strictObject({ state: z.literal('EXPLICIT_ANY'), excluded: exclusionsSchema, refs: refsSchema }),
  strictObject({ state: z.literal('EXCLUDED'), excluded: exclusionsSchema.min(1), refs: refsSchema }),
  strictObject({ state: z.literal('RESOLVED'), value: vehicleClassSchema, strength: z.enum(['REQUIRED', 'PREFERRED']), excluded: exclusionsSchema, refs: refsSchema }),
  strictObject({ state: z.literal('AMBIGUOUS'), alternatives: z.array(vehicleClassSchema).min(1).max(SEARCH_LIMITS.ambiguousAlternatives).refine(distinctAlternatives, 'Alternatives must be distinct'), excluded: exclusionsSchema.nullable().optional(), reasonCode: nonEmptyText, refs: refsSchema }),
]).superRefine((value, context) => {
  if (value.state === 'RESOLVED' && value.excluded.includes(value.value)) {
    context.addIssue({ code: 'custom', path: ['excluded'], message: 'Resolved vehicle cannot exclude itself' });
  }
});

const weekdaySchema = z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']);
const dateExpressionSchema = z.discriminatedUnion('kind', [
  strictObject({ kind: z.literal('ABSOLUTE'), day: fieldSchema(z.number().int().min(1).max(31)), month: fieldSchema(z.number().int().min(1).max(12)), year: fieldSchema(z.number().int().min(1).max(9_999)) }),
  strictObject({ kind: z.literal('RELATIVE'), anchor: z.enum(['TODAY', 'TOMORROW', 'DAY_AFTER_TOMORROW']) }),
  strictObject({ kind: z.literal('WEEKDAY'), weekday: weekdaySchema, qualifier: z.enum(['BARE', 'THIS', 'NEXT']) }),
]);

export const timeExpressionSchema = z.discriminatedUnion('kind', [
  strictObject({ kind: z.literal('CLOCK'), hour: z.number().int(), minute: fieldSchema(z.number().int().min(0).max(59)), notation: z.enum(['H12', 'H24']), period: fieldSchema(z.enum(['AM', 'PM'])), precision: z.enum(['EXACT', 'APPROXIMATE']) })
    .superRefine((value, context) => {
      if (value.notation === 'H12' && (value.hour < 1 || value.hour > 12)) context.addIssue({ code: 'custom', path: ['hour'], message: 'H12 hour must be 1 through 12' });
      if (value.notation === 'H24' && (value.hour < 0 || value.hour > 23)) context.addIssue({ code: 'custom', path: ['hour'], message: 'H24 hour must be 0 through 23' });
      if (value.notation === 'H24' && value.period.state !== 'UNSPECIFIED') context.addIssue({ code: 'custom', path: ['period'], message: 'H24 period must be unspecified' });
    }),
  strictObject({ kind: z.literal('DAYPART'), value: z.enum(['MORNING', 'AFTERNOON', 'EVENING', 'NIGHT']) }),
]);

const timingIntentSchema = strictObject({
  mode: z.enum(['IMMEDIATE', 'SCHEDULED', 'UNSPECIFIED', 'AMBIGUOUS']),
  refs: z.array(sourceRefSchema),
  date: fieldSchema(dateExpressionSchema),
  time: fieldSchema(timeExpressionSchema),
}).superRefine((value, context) => {
  if (value.mode !== 'UNSPECIFIED' && value.refs.length === 0) context.addIssue({ code: 'custom', path: ['refs'], message: 'Stated timing mode needs source evidence' });
});

const unsupportedRequestSchema = strictObject({
  kind: z.enum(['PASSENGER_COUNT', 'STOP', 'RETURN_JOURNEY', 'RENTAL', 'AC_PREFERENCE', 'CONDITIONAL_PREFERENCE', 'OTHER']),
  refs: refsSchema,
  candidateIds: z.array(nonEmptyText),
  reasonCode: nonEmptyText,
});

export const bookingDraftSchema = strictObject({
  schemaVersion: z.literal('ride-search-draft-v1'),
  query: querySchema,
  queryType: z.enum(['LOCATION_SEARCH', 'BOOKING_REQUEST', 'UNCLEAR_OR_UNRELATED']),
  complexity: z.enum(['SIMPLE', 'COMPLEX', 'NOT_APPLICABLE']),
  candidates: z.array(locationCandidateSchema).max(SEARCH_LIMITS.candidates),
  locationSearch: fieldSchema(locationRefSchema),
  pickup: fieldSchema(locationRefSchema),
  drop: fieldSchema(locationRefSchema),
  vehicleClass: vehiclePreferenceSchema,
  timing: timingIntentSchema,
  passengers: fieldSchema(z.number().int().positive()),
  sharing: fieldSchema(z.boolean()),
  isOutstation: fieldSchema(z.boolean()),
  preferSafeRoute: fieldSchema(z.boolean()),
  needsCarrier: fieldSchema(z.boolean()),
  unsupportedRequests: z.array(unsupportedRequestSchema),
}).superRefine((value, context) => {
  addAggregateCandidateIssues(value.candidates, context);
  const nonBooking = value.queryType !== 'BOOKING_REQUEST';
  if ((nonBooking && value.complexity !== 'NOT_APPLICABLE') || (!nonBooking && value.complexity === 'NOT_APPLICABLE')) {
    context.addIssue({ code: 'custom', path: ['complexity'], message: 'Query type and complexity are inconsistent' });
  }
});

function isSurrogatePairSplit(text: string, offset: number): boolean {
  return offset > 0 && offset < text.length && /[\uD800-\uDBFF]/.test(text[offset - 1]) && /[\uDC00-\uDFFF]/.test(text[offset]);
}

function addCandidateIssues(candidates: LocationCandidate[], query: Query, context: z.RefinementCtx): void {
  const seen = new Set<string>();
  candidates.forEach((candidate, index) => {
    const path = ['candidates', index] as (string | number)[];
    if (seen.has(candidate.candidateId)) context.addIssue({ code: 'custom', path: [...path, 'candidateId'], message: 'Candidate IDs must be unique' });
    seen.add(candidate.candidateId);
    if (candidate.queryId !== query.id || candidate.queryRevision !== query.revision) context.addIssue({ code: 'custom', path, message: 'Candidate query identity must match input query' });
    if (candidate.end <= candidate.start || candidate.end > query.text.length || isSurrogatePairSplit(query.text, candidate.start) || isSurrogatePairSplit(query.text, candidate.end)) context.addIssue({ code: 'custom', path, message: 'Candidate span is not a valid UTF-16 range' });
    else if (candidate.exactText !== query.text.slice(candidate.start, candidate.end)) context.addIssue({ code: 'custom', path: [...path, 'exactText'], message: 'Candidate exact text must match its query span' });
  });
}

function addAggregateCandidateIssues(candidates: LocationCandidate[], context: z.RefinementCtx): void {
  if (candidates.reduce((total, candidate) => total + candidate.exactText.length, 0) > SEARCH_LIMITS.aggregateCandidateText) {
    context.addIssue({ code: 'too_big', origin: 'string', maximum: SEARCH_LIMITS.aggregateCandidateText,
      inclusive: true, path: ['candidates'], message: 'Candidate text exceeds the aggregate limit' });
  }
}

export const parseInputSchema = strictObject({
  query: querySchema,
  candidates: z.array(locationCandidateSchema).max(SEARCH_LIMITS.candidates).default([]),
  timeZone: nonEmptyText,
  trustedLocationSelections: z.array(strictObject({ selectionId: nonEmptyText, displayText: nonEmptyText })).default([]),
  formDraft: bookingDraftSchema.optional(),
}).superRefine((value, context) => {
  addCandidateIssues(value.candidates, value.query, context);
  addAggregateCandidateIssues(value.candidates, context);
  const selectionIds = new Set<string>();
  value.trustedLocationSelections.forEach((selection, index) => {
    if (selectionIds.has(selection.selectionId)) context.addIssue({ code: 'custom', path: ['trustedLocationSelections', index, 'selectionId'], message: 'Trusted selection IDs must be unique' });
    selectionIds.add(selection.selectionId);
  });
});

export function emptyDraft(query: Query): BookingDraft {
  return {
    schemaVersion: 'ride-search-draft-v1', query, queryType: 'UNCLEAR_OR_UNRELATED', complexity: 'NOT_APPLICABLE', candidates: [],
    locationSearch: { state: 'UNSPECIFIED' }, pickup: { state: 'UNSPECIFIED' }, drop: { state: 'UNSPECIFIED' }, vehicleClass: { state: 'UNSPECIFIED' },
    timing: { mode: 'UNSPECIFIED', refs: [], date: { state: 'UNSPECIFIED' }, time: { state: 'UNSPECIFIED' } },
    passengers: { state: 'UNSPECIFIED' }, sharing: { state: 'UNSPECIFIED' }, isOutstation: { state: 'UNSPECIFIED' }, preferSafeRoute: { state: 'UNSPECIFIED' }, needsCarrier: { state: 'UNSPECIFIED' }, unsupportedRequests: [],
  };
}

export type BookingDraft = z.infer<typeof bookingDraftSchema>;
export type QueryIdentity = z.infer<typeof querySchema>;
export type SourceRef =
  | { kind: 'QUERY_SPAN'; queryId: string; revision: number; start: number; end: number }
  | { kind: 'USER_FIELD'; field: string; revision: number };
export type LocationCandidate = z.infer<typeof locationCandidateSchema>;
export type LocationRef = z.infer<typeof locationRefSchema>;
export type Field<T> =
  | { state: 'UNSPECIFIED' }
  | { state: 'RESOLVED'; value: T; refs: SourceRef[] }
  | { state: 'AMBIGUOUS'; alternatives: T[]; reasonCode: string; refs: SourceRef[] };
export type VehiclePreference = z.infer<typeof vehiclePreferenceSchema>;
export type DateExpression = z.infer<typeof dateExpressionSchema>;
export type TimeExpression = z.infer<typeof timeExpressionSchema>;
export type Query = z.infer<typeof querySchema>;
export type ParseInput = z.infer<typeof parseInputSchema>;
