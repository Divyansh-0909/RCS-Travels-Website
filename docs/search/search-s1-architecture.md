> Current owner policy override (2026-10-06): see [Search owner decisions](search-owner-decisions-2026-10-06.md). Historical unresolved-year/weekday/timezone/SUV statements below are superseded. ?Follow-up?, ?ask? and ?clarification? mean deterministic form resolution, never a conversational AI loop. Stops are a planned product feature, currently blocked at submission.

# Search S1: architecture, contracts and verification design

Status: S1 design complete; S2 implementation not started. Inspected working tree: 2026-10-02.
This document freezes interfaces and safety rules, not unresolved product interpretations.
All TypeScript below is specification text, not executable or production-wired code.

## A. Current repository behavior and evidence

| Source | Observed behavior |
| --- | --- |
| `frontend/src/components/hero/LandingHero.jsx:24`, `components/ui/NavBar.jsx:479` | Destination and Now are buttons, not a working natural-language text parser. They clear the route, set Schedule/Now and open `/book`. |
| `frontend/src/pages/BookingFlow.jsx:19` | `/book` owns route, timing and vehicle stages. Its old comment says the landing bar supplies a drop; current buttons do not. |
| `frontend/src/pages/OnBoarding.jsx:58` | Separate pickup/drop autocomplete, saved places, recents, current-location selection and map selection. Typed queries of at least three characters use a 300 ms debounce. Editing clears coordinates. |
| `frontend/src/pages/OnBoarding.jsx:257`, `backend/routes/googleAPI.js:18` | Autocomplete provides place IDs; Details returns coordinates/address. The form retains label/coordinates but does not retain the selected Google place ID. |
| `frontend/src/pages/OnBoarding.jsx:939`, `:1007` | Schedule enters the timing step. Fare/account checks precede vehicle selection. Routes over 200 km redirect to the outstation contact page. A hatchback is initially selected. |
| `frontend/src/pages/VehicleSelect.jsx:747`, `:842` | Vehicle selection, pin confirmation and explicit booking submission; signed server fare quote determines price. Creation still substitutes fixed coordinates when coordinates are missing. |
| `frontend/src/pages/Outstation.jsx:64` | Outstation booking is assisted via phone/WhatsApp; it is not the ordinary automated checkout. |
| `backend/services/AI/bookingParser.ts:21` | Existing, unwired Jev prototype has two query classes, a complexity score that includes incompleteness, and urgency. It conflicts with S1 and must not be reused unchanged. |
| `backend/services/AI/bookingParser.ts:52` | Existing OpenAI extraction accepts a caller-selected model, nullable fields and model-produced ISO scheduling. No customer frontend caller was found in the inspected API/UI/route wiring. |
| `backend/services/whatsappParsing.js:20`, `:64`, `:152` | Separate deterministic WhatsApp parser supports full numeric dates, today/tomorrow, explicit times, route phrases and options. It is not the customer search parser. Preserve its channel behavior. |
| `backend/routes/bookings.js:182`, `services/bookingCreation.js:40` | Authenticated creation checks addresses, coordinates, class, signed quote, schedule and overlapping bookings. No dedicated creation Zod schema or BookingType enum. |

`CONTEXT.md` and the relevant `ROADMAP.txt:836` booking-mode section were checked.
They contain historical statements; current code controls these findings. For example,
scheduled creation normally starts `payment_pending`, rather than the older roadmap's `confirmed`.
No responsibility implementation, provider configuration, schema, job or benchmark is changed by S1.

## B. Actual source-of-truth terminology

Wire vehicle classes are exactly `hatchback`, `sedan`, `suv`, `suv_premium`:
`backend/prisma/schema.prisma:210` and `backend/constants/vehicles.js:10`.
The mirrored frontend display groups are **Cab Economy** (hatchback/sedan) and
**Cab XL** (suv/suv_premium). Class capacities in the constants are 4, 4, 6, 6.
Do not send display group names as API vehicle values. Vehicle-onboarding classification
also examines actual vehicle seats/price; it is not passenger-request extraction.

There is **no BookingType enum**. The existing booking representations are:

- `scheduledAt: DateTime?`: null is immediate at the creation boundary; non-null is scheduled.
- `sharing: boolean`: solo/sharing pricing and assignment behavior.
- `isOutstation: boolean`: persisted flag; not a complete outstation checkout/pricing contract.
- `preferSafeRoute`, `needsCarrier`: supported options priced through the signed estimate.

BookingStatus is exactly `pending`, `payment_pending`, `confirmed`, `assigned`, `en_route`,
`reached`, `started`, `completed`, `cancelled`, `no_driver`.
BookingSource is exactly `website`, `whatsapp`, `admin` (`schema.prisma:9`, `:22`).
Parser query/field-state enums below are new interface vocabulary, not new product booking types.

## C. Routing and provider boundaries

```text
original query + explicit form context + clock/timezone
  -> BookingIntentClassifier (Jev bounded adapter)
     LOCATION_SEARCH -> candidate selection -> Places -> target-field confirmation
     BOOKING_REQUEST / SIMPLE -> SimpleBookingExtractor (Jev + code)
     BOOKING_REQUEST / COMPLEX or unsafe extraction -> ComplexBookingInterpreter (GPT-6 Luna)
     UNCLEAR_OR_UNRELATED -> clarification / normal location form
  -> ONE BookingDraft
  -> BookingValidator + Places grounding + missing/ambiguous/unsupported issues
  -> user reviews/corrects and confirms
  -> existing fare and authenticated booking creation flow
```

`LOCATION_SEARCH`: place-name/address lookup without affirmative ride intent, route, timing,
vehicle or passenger instruction. A business called "Tomorrow Cafe" is not a date request.
`BOOKING_REQUEST`: affirmative ride request or ride-form shorthand expressing a route,
vehicle, ride time or passenger requirement. In this customer ride-search context,
"SUV tomorrow", "campus to airport" and "3 people tomorrow 7 PM" qualify.
`UNCLEAR_OR_UNRELATED`: unrelated, empty, uninterpretable, or genuinely uncertain intent;
do not force every input into a booking or a location.

`SIMPLE`: one interpretable pickup/drop journey; any stated fields can be represented by
bounded selection and code. Missing fields and poor grammar alone do not change this.
`COMPLEX`: multiple stops, dependent/conditional instructions, conflicting clauses,
unresolved corrections, several plausible journeys, or semantics beyond safe bounded extraction.
`NOT_APPLICABLE`: only for non-booking classifications. Reject inconsistent combinations.
Unsupported service requests are not automatically complex: "rent a cab for two hours"
can be simple but unsupported. Luna cannot make an unsupported service bookable.

Jev provides decisions, not arbitrary location strings. GPT-6 Luna is the future complex
interpreter. GPT-6.1 Sol is for offline design/review, not runtime routing. No Terra escalation.
Model names here express the requested architecture; runtime provider access must be verified
in the implementation phase. Responsibility evaluation is not evidence of search accuracy.

## D. One shared BookingDraft contract (proposed TypeScript shape)

```ts
type VehicleClass = 'hatchback' | 'sedan' | 'suv' | 'suv_premium';
type QueryType = 'LOCATION_SEARCH' | 'BOOKING_REQUEST' | 'UNCLEAR_OR_UNRELATED';
type Complexity = 'SIMPLE' | 'COMPLEX' | 'NOT_APPLICABLE';
type CandidateId = string;
type LocationRef =
  | { kind: 'QUERY_CANDIDATE'; candidateId: CandidateId }
  | { kind: 'USER_SELECTION'; selectionId: string };
type SourceRef =
  | { kind: 'QUERY_SPAN'; queryId: string; revision: number; start: number; end: number }
  | { kind: 'USER_FIELD'; field: string; revision: number };
type Field<T> =
  | { state: 'UNSPECIFIED' }
  | { state: 'RESOLVED'; value: T; refs: SourceRef[] }
  | { state: 'AMBIGUOUS'; alternatives: T[]; reasonCode: string; refs: SourceRef[] };
type VehiclePreference =
  | { state: 'UNSPECIFIED' }
  | { state: 'EXPLICIT_ANY'; excluded: VehicleClass[]; refs: SourceRef[] }
  | { state: 'EXCLUDED'; excluded: VehicleClass[]; refs: SourceRef[] }
  | { state: 'RESOLVED'; value: VehicleClass; strength: 'REQUIRED' | 'PREFERRED';
      excluded: VehicleClass[]; refs: SourceRef[] }
  | { state: 'AMBIGUOUS'; alternatives: VehicleClass[]; reasonCode: string;
      refs: SourceRef[] };
type Weekday = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' |
  'FRIDAY' | 'SATURDAY' | 'SUNDAY';
type DateExpression =
  | { kind: 'ABSOLUTE'; day: Field<number>; month: Field<number>; year: Field<number> }
  | { kind: 'RELATIVE'; anchor: 'TODAY' | 'TOMORROW' | 'DAY_AFTER_TOMORROW' }
  | { kind: 'WEEKDAY'; weekday: Weekday; qualifier: 'BARE' | 'THIS' | 'NEXT' };
type TimeExpression =
  | { kind: 'CLOCK'; hour: number; minute: Field<number>;
      notation: 'H12' | 'H24'; period: Field<'AM' | 'PM'>;
      precision: 'EXACT' | 'APPROXIMATE' }
  | { kind: 'DAYPART'; value: 'MORNING' | 'AFTERNOON' | 'EVENING' | 'NIGHT' };
type TimingIntent = {
  mode: 'IMMEDIATE' | 'SCHEDULED' | 'UNSPECIFIED' | 'AMBIGUOUS';
  refs: SourceRef[];
  date: Field<DateExpression>;
  time: Field<TimeExpression>;
};
type LocationCandidate = {
  candidateId: CandidateId;
  queryId: string;
  queryRevision: number;
  exactText: string;
  normalizedText?: string;
  start: number;
  end: number;
  method: 'WHOLE_LOCATION_QUERY' | 'DIRECTIONAL_CLAUSE' | 'LABELLED_FIELD' |
    'OVERLAPPING_ALTERNATIVE' | 'LUNA_SOURCE_SPAN';
  alsoDetectedBy?: LocationCandidate['method'][];
  generatorVersion: string;
};
type UnsupportedRequest = {
  kind: 'PASSENGER_COUNT' | 'STOP' | 'RETURN_JOURNEY' | 'RENTAL' |
    'AC_PREFERENCE' | 'CONDITIONAL_PREFERENCE' | 'OTHER';
  refs: SourceRef[];
  candidateIds: CandidateId[]; // e.g. requested extra pickup; ordered by source
  reasonCode: string; // observation of a gap, never a new booking product enum
};
type BookingDraft = {
  schemaVersion: 'ride-search-draft-v1';
  query: { id: string; revision: number; text: string };
  queryType: QueryType;
  complexity: Complexity;
  candidates: LocationCandidate[];
  locationSearch: Field<LocationRef>;
  pickup: Field<LocationRef>;
  drop: Field<LocationRef>;
  vehicleClass: VehiclePreference;
  timing: TimingIntent;
  passengers: Field<number>; // advisory only; NOT a creation-payload field
  sharing: Field<boolean>;
  isOutstation: Field<boolean>;
  preferSafeRoute: Field<boolean>;
  needsCarrier: Field<boolean>;
  unsupportedRequests: UnsupportedRequest[];
};
type ParseContext = {
  queryId: string; queryRevision: number; originalText: string;
  nowIso: string; timeZone: string; // trusted application inputs
  activeLocationField: 'pickup' | 'drop' | null;
  formDraft?: BookingDraft; // explicit existing user choices, not guessed defaults
  trustedLocationSelections: { selectionId: string; displayText: string }[];
  vehicleClasses: VehicleClass[];
  serviceCapabilityVersion: string;
};
type ConfirmedLocation = {
  lat: number; lng: number; displayText: string; confirmedAt: string;
} & (
  | { source: 'GOOGLE_PLACES'; placeId: string }
  | { source: 'USER_CONFIRMED_MAP_PIN' | 'USER_SELECTED_SAVED_PLACE' |
      'USER_SELECTED_CURRENT_LOCATION';
      selectionId: string; placeId?: string }
);
type PlaceMatch = { placeId: string; displayText: string };
type GroundedLocation = { ref: LocationRef } & (
  | { status: 'UNRESOLVED' }
  | { status: 'MATCHES' | 'NEEDS_CONFIRMATION';
      matches: [PlaceMatch, ...PlaceMatch[]] }
  | { status: 'CONFIRMED'; confirmed: ConfirmedLocation }
  | { status: 'FAILED'; errorCode: string }
);
type ValidationIssue = {
  field: string;
  kind: 'MISSING' | 'AMBIGUOUS' | 'INVALID' | 'UNSUPPORTED' | 'UNRESOLVED_LOCATION';
  code: string;
};
type ValidatedDraft = {
  draft: BookingDraft;
  locations: GroundedLocation[]; // trusted enrichment, never parser output
  schedule: { status: 'UNRESOLVED' | 'IMMEDIATE' | 'RESOLVED' | 'AMBIGUOUS';
    localDate?: string; localTime?: string; // partial resolution remains useful
    scheduledAt?: string; timeZone: string; resolverVersion: string };
  issues: ValidationIssue[];
  reviewReady: boolean;
  // Never implies user confirmation or permission to submit a booking.
};
type ConfirmedBookingReview = {
  validated: ValidatedDraft;
  confirmation: { draftRevision: number; draftDigest: string;
    groundedLocationsDigest: string; fareQuoteDigest: string; confirmedAt: string };
};
type SearchParseResult =
  | { status: 'DRAFT'; draft: BookingDraft }
  | { status: 'LUNA_REQUIRED'; reasons: string[]; partialDraft?: BookingDraft }
  | { status: 'CLARIFICATION_REQUIRED'; code: 'LIMIT_EXCEEDED' | 'PROVIDER_UNAVAILABLE' |
      'INVALID_OUTPUT'; partialDraft?: BookingDraft };
```

The future Zod implementation must use strict objects and discriminated unions, finite
numbers, bounded integer ranges, nonempty resolved refs/exclusion sets, distinct alternatives,
unique candidate IDs and validated query-span references. `RESOLVED` means extraction is
resolved; pickup/drop IDs still require Places/user grounding. No ISO time, place ID,
coordinate, fare or final booking status is writable by either parser. Selection IDs can only
reference trusted user selections supplied in context; their coordinates remain outside model
output. Unmentioned roles preserve explicit form selections without fake original-query spans.
USER_FIELD refs must match trusted form context, not arbitrary field names invented by a model.
For stated scalar components, adapter code must link the selected value to recognized source
evidence or an offered observed candidate; a valid numeric range alone is not grounding.
Unrecognized wording cannot create a resolved value by attaching an unrelated valid span.
Derived calendar arithmetic is recorded by the resolver, separately from stated components.
CONFIRMED grounding requires its confirmed value; Google provenance requires a real place ID.
MATCHES/NEEDS_CONFIRMATION require nonempty match lists. Successful empty Places results
remain UNRESOLVED with a no-matches validation issue; they cannot become confirmed by status alone.
H12 clocks require hour 1..12; AM/PM must be resolved before instant resolution. H24 clocks
require hour 0..23 and an unspecified AM/PM field. Reject contradictory notation/period tuples.
Minutes are integers 0..59; missing minutes are resolved to zero only by explicit whole-hour
syntax such as "6 PM", never by a vague daypart. Approximation still requires confirmation.

ConfirmedBookingReview is created by a separate explicit user-review action, never a parser
response. Its mapper requires reviewReady, zero operative issues, confirmed endpoints and an
unchanged revision/location/quote digest. The confirmation handler derives time and authenticated
identity from trusted context, validates the reviewed signed quote and all current booking rules;
caller-supplied flags/IDs are not authority. Edits or expired quotes invalidate confirmation.
This is a contract for the future parser handoff, not a new deployed confirmation endpoint or
a claim that legacy booking APIs currently validate such a record. Existing UI confirmation remains.

`UNSPECIFIED` is not `EXPLICIT_ANY`. "Anything except sedan" is `EXCLUDED` with sedan;
"any car" is `EXPLICIT_ANY`; "SUV only" is resolved suv/REQUIRED. Soft preference and
exclusions can coexist. "Don't send an SUV" preserves negation; whether it excludes premium
SUV too is a scope ambiguity to clarify, not an assumed class-family rule.
"AC car if available" is preserved as unsupported/conditional source evidence; there is
no AC preference enforcement API. Empty or contradictory allowed-vehicle sets block review.
Explicit-any/exclusions filter review options; the user must still choose an actual priced
vehicle class before creation. Do not invent automatic cheapest/nearest selection.

Passenger count is preserved because the existing parser already represents it, but flagged
as unsupported for booking enforcement. Shared rides currently decrement one capacity slot
per booking (`driverAssignment.js:93`); do not promise three sharing seats for "3 people".
No operational stop, returnAt or rentalDuration fields are introduced. Their source spans
remain unsupported requests, so fallback cannot silently discard them and book one-way.

## E. Location candidates and conservative generation

Offsets are JavaScript UTF-16 code-unit offsets, zero-based, half-open `[start,end)` in the
unchanged original query revision. Require `exactText === query.text.slice(start,end)`;
reject invalid bounds and surrogate-pair splits. Normalization never changes exactText/offsets.
ID derives from query ID/revision, offsets and generator version; identical wording at two
positions has two IDs. Multiple methods detecting the same span merge provenance rather
than duplicating the candidate. Changes create a new query revision; stale results cannot apply.

1. For location-only input, propose the whole trimmed phrase with original offsets.
2. For explicit `from ... to ...`, `pick ... at ...`, `drop ... at ...`, labelled fields,
   capture maximal useful clauses. Recognized delimiters propose boundaries, not final roles.
3. Strip clearly delimited timing/vehicle instructions only when outside the location clause.
   Preserve "Tomorrow Cafe", "Sector 6", "Gate 3", "hostel gate near the tea stall".
4. If a boundary is uncertain, emit overlapping longer/shorter possibilities with provenance.
   Do not split into token-sized locations or implement general semantic journey reasoning.
5. No valid phrase despite explicit expected-location evidence is extraction failure.
   A location that was never provided is simply UNSPECIFIED.
6. V1 engineering limits: query 2,000 UTF-16 code units; 24 location candidates; four alternatives
   per ambiguous field; eight observed temporal candidates per role; eight observed passenger
   candidates; aggregate candidate text 8,000 units; serialized provider context 12,000 units;
   48 questions per batch. At most two Jev requests and one Luna fallback per query revision;
   no hidden automatic provider retries. These are resource bounds, not confidence thresholds.
   Exceeding a bound returns CLARIFICATION_REQUIRED/LIMIT_EXCEEDED without truncating meaning,
   generating a new revision or calling another provider to bypass the bound. Only explicit user
   revision/retry may start another bounded parse. Test cap-1, cap, cap+1 and timeout/cancellation.

Hindi/Hinglish examples belong to a separately scored exploratory dataset. No translation
or promised language coverage is introduced. Source text such as "X se Y" remains intact;
future native parsing must prove roles, including inverted word order, before rollout.

## F. Ownership of extraction/enrichment

| Draft field | Code / candidates | Jev bounded decision | Places / shared validation |
| --- | --- | --- | --- |
| queryType, complexity | Input limits, contextual consistency | Choice classes; missing != complex | Reject incompatible classes |
| locationSearch, pickup, drop | Conservative exact-span candidates | Select candidate ID or NONE_OR_UNCLEAR | Google lookup/details, explicit target and confirmation |
| vehicleClass | Lexical class aliases and source spans | Class/preference choices, per-class negation | Actual four classes; constraints preserved, user chooses priced class |
| timing.mode | Explicit now and temporal markers | Choice IMMEDIATE/SCHEDULED/UNSPECIFIED/AMBIGUOUS | No marker -> UNSPECIFIED, never now |
| timing.date | Literal dates/year candidates and provenance | Component choices; choose temporal candidate where needed | Calendar/timezone resolution, ambiguity and booking horizon |
| timing.time | Literal numeric time candidates | Hour/minute/period/daypart/precision choices | No arbitrary rounding/default clock time |
| passengers | Positive integer spans, distinguish gate/sector numbers | Candidate ID or not mentioned/unclear | Advisory; not persisted/enforced; capacity gap blocks false promises |
| sharing | Explicit solo/shared markers | Boolean choice with UNSPECIFIED/UNCLEAR | Existing solo/shared quote and capacity semantics |
| isOutstation | Explicit service wording; route distance later | Boolean choice with UNSPECIFIED/UNCLEAR | Flag != completed outstation product; assisted flow |
| preferSafeRoute, needsCarrier | Explicit option markers | Boolean choice with UNSPECIFIED/UNCLEAR | Estimate availability/signed quote decides applied option |
| unsupportedRequests | Preserve source clauses and location refs | Bounded detection, not imaginary products | Stops/returns/rental/AC cannot reach ordinary creation |

Do not derive the draft from frontend default hatchback, default Schedule, geolocation
permission or a date picker's initially selected time. Existing explicitly selected user
fields may be carried forward with USER_FIELD provenance. Contradictory new instructions
produce alternatives; a clear correction updates the draft with provenance, not history erasure.

## G. Proposed Jev questions

Every question sees original query/revision, relevant explicit form context, allowed choices,
candidate IDs with exact phrases/offsets, and trusted date/timezone when needed. Query text
is untrusted data, never instructions to change schemas or create a booking. The following
are adapter instructions/choices, not calls or calibrated confidence thresholds.

| Question | Primitive and choices | Instructions / purpose |
| --- | --- | --- |
| query_type | choice LOCATION_SEARCH / BOOKING_REQUEST / UNCLEAR_OR_UNRELATED | Classify actual intent in ride-search context; ride shorthand qualifies; proper names alone do not imply timing. |
| booking_complexity | choice SIMPLE / COMPLEX / NOT_APPLICABLE | Independently inspect intent. Missing fields or grammar do not imply complexity. Conditions, multiple stops, conflicts or several journeys do. N/A for non-booking. |
| pickup_candidate | choice offered IDs / NONE_OR_UNCLEAR | Select phrase describing origin, never destination. None may mean absent or uncertain; separate expectation question distinguishes them. |
| drop_candidate | choice offered IDs / NONE_OR_UNCLEAR | Select final destination, never origin; use semantic direction, not word order. |
| location_search_candidate | choice offered IDs / NONE_OR_UNCLEAR | Select standalone phrase, without assigning a booking role. |
| pickup_mentioned, drop_mentioned | separate noul questions | Does text actually contain a location for this role? Detect generation failure, not missing requirements. Probabilities remain raw until calibrated. |
| role_consistency | choice CONSISTENT / REVERSAL_RISK / CONFLICT / NO_ROLES | Judge directional clauses against supplied candidates independently; do not assume other question outputs. Post-batch code compares actual selections. |
| vehicle_class | choice four exact classes / NOT_MENTIONED / UNCLEAR | Positive preferred/required class only; negated class is not a positive selection. |
| vehicle_strength | choice REQUIRED / PREFERRED / NOT_APPLICABLE / UNCLEAR | Preserve "only" versus preference. No automatic class upgrade. |
| vehicle_any | choice EXPLICIT_ANY / NOT_STATED / UNCLEAR | Detect affirmative any; "anything except sedan" must also preserve exclusion. |
| exclude_<class> | one choice EXCLUDED / NOT_EXCLUDED / UNCLEAR per actual class | Preserve explicit negative requirements. Do not infer premium scope from the word SUV. |
| timing_mode | choice IMMEDIATE / SCHEDULED / UNSPECIFIED / AMBIGUOUS | Explicit now is immediate; date/time mention is scheduled intent even when incomplete; no mention is unspecified. |
| date_mode | choice ABSOLUTE / RELATIVE / NONE / UNCLEAR | Read pickup date, not an unrelated friend's flight date. |
| date_month | choice January..December / NONE / UNCLEAR | Read stated month only. |
| date_day | choice 1..31 / NONE / UNCLEAR | Read stated day only; code checks actual date. |
| date_year | choice observed year candidates / NONE / OUT_OF_RANGE / UNCLEAR | Code extracts literal year candidates; no broad arbitrary year generation or model year inference. |
| date_day_anchor | choice TODAY / TOMORROW / DAY_AFTER_TOMORROW / WEEKDAY / NONE / UNCLEAR | Read relative expression, never calendar arithmetic. |
| date_weekday | choice Monday..Sunday / NONE / UNCLEAR | Preserve named weekday separately from its date. |
| date_week_qualifier | choice THIS / NEXT / BARE / NONE / UNCLEAR | Read stated qualifier; code/product policy resolves ambiguity. |
| time_hour | choice 0..23 / NONE / UNCLEAR | Select stated clock component; words can be supported with validated phrase spans. |
| time_minute | choice 0..59 / NONE / UNCLEAR | Explicit literal `6 PM` means whole hour through code's syntax rule; daypart alone has no minute. |
| time_notation | choice H12 / H24 / NONE / UNCLEAR | Do not treat bare "6" as unambiguous 06:00. |
| time_period | choice AM / PM / NONE / UNCLEAR | Read explicit period or linguistic equivalent such as "in the evening" attached to an hour. |
| time_daypart | choice MORNING / AFTERNOON / EVENING / NIGHT / NONE / UNCLEAR | Preserve vague expressions, never choose an exact clock time. |
| time_precision | choice EXACT / APPROXIMATE / NONE / UNCLEAR | "Around 7" needs exact-time confirmation for current booking API. |
| passenger_candidate | choice observed count IDs / NOT_MENTIONED / UNCLEAR | Select actual passenger count, not location/date numbers. |
| sharing, is_outstation, safe_route, carrier | separate choice YES / NO / NOT_MENTIONED / UNCLEAR | Preserve affirmative, negative, missing and uncertain service options; each uses original context. |
| unsupported_service | separate noul for stops/return/rental/AC/conditional clauses | Detection only. Preserve source refs and block unsupported booking submission. |

Choice is the categorical primitive. Noul is a yes probability, not a Boolean and not a
separate confidence. Score is an ordered probabilistic position, potentially fractional;
it must not be rounded to extract a categorical complexity, integer hour or passenger count.
These semantics were checked against SDK 0.6.0 and official
[Choice](https://docs.typesafe.ai/primitives/choice),
[Noul](https://docs.typesafe.ai/primitives/noul),
[Score](https://docs.typesafe.ai/primitives/score) documentation.

Batch 1: query type/complexity and independent intent flags. Batch 2: location role choices,
vehicle constraints, date/time parts and supported options, once code has supplied candidates.
Component questions independently state the pickup-time role and original clause; they cannot
read another answer. Multiple temporal clauses require bounded temporal candidate selection
or fallback; never mix one clause's hour with another clause's AM/PM. Post-batch deterministic
checks compare the actual selected values. Record per-question probabilities, failure category,
model/config/prompt versions, request count, latency and authoritative usage, without secrets.

## H. Date/time extraction and deterministic resolution

Use the [TypeSafe date extraction cookbook](https://docs.typesafe.ai/cookbooks/date_extraction_cookbook)
pattern: bounded date components followed by application calendar arithmetic. Its demonstration
thresholds, year window and omitted-year/weekday policies are examples, not RCS product rules.

Trusted parse context uses injected `systemClock`/`createTestClock` (`backend/lib/clock.js`,
`backend/tests/helpers/testClock.js`) and explicit IANA timezone. Recommend `Asia/Kolkata`
for service-local booking, consistent with WhatsApp; product must confirm behavior for customers
in another timezone. Browser-local Date arithmetic must not silently change query meaning.

- Now -> IMMEDIATE only from explicit request or a previously explicit user choice.
- Tomorrow -> SCHEDULED; resolve the local calendar date, leave clock time UNSPECIFIED.
- Time alone -> SCHEDULED intent, date missing; never infer today or next day.
- No temporal wording -> UNSPECIFIED. Ask Now/Schedule without erasing other fields.
- Full date -> validate day/month/year before converting. Reject JS overflow such as Feb 30.
- Omitted year (Dec 5) -> preserve missing year; current parser has no established named-date
  policy. Offer an explicit date/year clarification; do not silently roll to next year.
- Weekday -> preserve qualifier. Bare Friday on Friday and "next Friday" can have different
  interpretations; clarify until a versioned product rule is approved. Never assume cookbook
  same-day/calendar-week semantics are frozen RCS policy.
- Exact `6 PM` -> code resolves 18:00. `18:00` -> 18:00. `6 in the evening` -> 18:00 if
  the period is explicitly bound to that hour. Bare `6` retains AM/PM ambiguity.
- Evening alone remains DAYPART, no 18:00 default. Tonight preserves local date anchor and
  NIGHT, with exact time missing. Approximate times remain approximate until confirmed.
- Calendar date plus exact clock time -> code resolves an instant with timezone and resolver
  version. Reject ambiguous/nonexistent local times rather than choosing silently if timezone
  support later extends beyond IST. Revalidate against current server time at confirmation.

Current server rule (`bookings.js:251`): scheduled time must be **strictly later than now +
30 minutes**, and **no later than now + 7 * 24 hours**. Frontend guards allow exactly 30
minutes and use calendar/end-of-day logic; its picker offers today through day +6. These
are existing inconsistencies, not authority to invent an S1 scheduling change. Until reconciled,
shared validation mirrors server bounds and makes rejected times visible, without clamping.

## I. Location grounding and reversal safeguards

```text
unchanged original text -> conservative candidate spans -> bounded role IDs
  -> deterministic span/membership/directional consistency checks
  -> existing Google Autocomplete -> user selects match -> Details
  -> user confirms location/pin -> validated draft -> fresh quote -> booking review
```

Require match selection for parser-generated phrases, even if Google returns one match;
AI role confidence is not geographic certainty. Preserve place ID plus coordinates/address
and provenance in draft enrichment. Validated current-location/map/saved-place selection
remains available as an existing explicit user action; do not fabricate a Google ID for it.
Neither Jev nor Luna may supply authoritative IDs, addresses or coordinates. Google API
failure means unresolved location; no fixed coordinate fallback in the future parser adapter.

Standalone location recommendation: populate an explicitly active pickup/drop field. If
there is no active field (landing natural-language entry), ask "Pickup or destination?" before
applying it. Current landing copy says destination but does not assign a place. Treat this
as a UX recommendation awaiting product approval, not a hidden destination default.

From/to/at markers supply independent directional evidence. Reject membership failures,
incompatible overlapping selections and unexpected same-candidate roles. Same-location
journeys and explicit returns require clarification, not an automatic assertion of reversal.
Do not sort pickup/drop by source order; reversed word order can still be valid. S5 scores
pickup, drop and reversal separately, including duplicate wording at distinct offsets.
Each async Places response is keyed to query revision, candidate and role so stale results
cannot overwrite a user correction. Editing a grounded phrase invalidates its grounding/quote.

## J. Future Luna contract and deterministic fallback plan

`ComplexBookingInterpreter.interpret({context: ParseContext, originalQuery, candidates,
trustedPartialDraft, supportedCapabilities, fallbackReasons}) -> BookingDraft`.
It receives the exact same schema and actual class list, not a Jev-specific response object.
Include component/source evidence, now/timezone and current explicit form choices. Do not
forward credentials or unrelated customer data. Model version/config are implementation inputs.

Luna may return source-span candidates not found by code, but every exact phrase must be a
validated slice of original text (method LUNA_SOURCE_SPAN). It may not invent pickup, drop,
time, passenger count, class, service capability or Places data. Missing stays UNSPECIFIED;
uncertain stays AMBIGUOUS; exclusions and unsupported clauses survive. The same validator
rejects it. Failure falls back to clarification/manual form, never booking or escalation to Terra.

Deterministic fallback reasons:

- COMPLEX request; Jev timeout/provider/schema failure; answer not in offered candidate set.
- A location is actually expressed but no usable candidate exists (not merely missing pickup).
- Pickup/drop inconsistency, unexplained same candidate or directional conflict/reversal risk.
- Conflicting date/time components, cross-clause component mixing, unresolved binding.
- Incompatible service instructions, negation or corrections that the simple adapter cannot preserve.
- Any violated schema/span/cross-field invariant. Confidence gates may be added only after S5 calibration.

Absent fields, unsupported backend service by itself, vague daypart awaiting user input and
an omitted AM/PM/year that only the user can supply are follow-up issues, not mandatory Luna
calls. A semantically unclear binding can separately justify fallback. Preserve trusted partial
fields; fallback cannot recover information the customer never supplied.

## K. Shared validation and actual requirement matrix

Order: strict schema -> source refs/candidate membership -> cross-field and preference checks
-> temporal resolution/bounds -> location grounding -> service capability and field requirements
-> missing/ambiguous/unsupported issue list -> review. Rules are code/config, never model output.
No creation-payload mapper may accept a raw BookingDraft or just reviewReady; it requires the
separate ConfirmedBookingReview after all operative issues are resolved and the user confirms.

These rows describe current modes/flags, **not invented BookingType enum values**:

| Current mode / flag | Pickup / drop | Timing | Vehicle | Return / duration / stops | Other requirements |
| --- | --- | --- | --- | --- | --- |
| Ride Now / solo | Both required; addresses + authoritative coordinates | Explicit immediate choice; scheduledAt null | One actual priced class | Unsupported | Authenticated customer, fresh signed quote, server conflict checks; sharing false confirmed in form |
| Scheduled / solo | Both required | Date + exact time + timezone; valid scheduledAt | One actual priced class | Unsupported | Same quote/auth checks; existing advance/payment lifecycle, not parser-owned |
| sharing=true overlay, immediate or scheduled | Same two endpoints | Same mode rule | One actual priced class | Unsupported | Sharing fare available; current implementation allocates one seat; multi-passenger support gap |
| isOutstation=true | Flag exists; ordinary creation requires both endpoints | Same server rule if API used | Existing four classes | No self-service return/duration contract | Website uses assisted contact for long routes; no assumed automatic outstation booking |
| rental / return journey / multi-stop | No supported creation mode | No established operational requirements | Do not invent new enum | Unsupported | Preserve request; offer assisted support. Round-trip UI control is not backend support |

Passenger count is not currently required or accepted by creation. AC, preferred/excluded
vehicle sets and conditional preferences are not creation fields. Preserve/filter these in
draft/review; do not claim enforcement if not fully satisfied by one explicitly chosen class.
Safe-route/carrier are optional requests; their availability/application must be shown from
the authoritative estimate. Airport is a location context, not a separate BookingType.
User/account IDs and phone come from existing authenticated flow, never AI extraction.

## L. Follow-up and review behavior

"SUV tomorrow" remains BOOKING_REQUEST/SIMPLE: suv resolved, tomorrow date resolved in
local timezone, pickup/drop/time unspecified. Preserve these while asking for endpoints and
exact time. Ask sharing/unsupported passenger questions only if relevant to the actual request.
"SUV" leaves timing unspecified; ask Now/Schedule rather than adopting the store default.
"Anything except sedan" filters/selects among remaining supported classes at review, not
auto-selecting one. A count/stop/return request cannot be silently dropped to finish booking.

Missing issues ask only missing required values; ambiguity asks only disputed interpretation;
Places issues ask for location confirmation; unsupported requests explain capability/support.
Explicit corrections apply to a new revision and preserve unrelated resolved fields. Review
shows the actual selected class, confirmed endpoints, immediate or exact local schedule,
applied options and current server fare. **Parsing never submits a booking**, even if complete.
Re-price after any relevant change. The existing final user action/authenticated creation flow
is the only submission path; no parser endpoint imports booking creation/payment/dispatch writers.

## M. Search Benchmark V1 design (before S2)

Specification only: no live calls, dataset accuracy, latency or cost results exist in S1.
Minimum proposed cohort: **320 distinct inputs** below, plus **40 exploratory Hindi/Hinglish**
inputs scored separately, never described as translation or supported-language readiness.

| Primary cohort | Minimum distinct records |
| --- | --- |
| Standalone locations (proper names, numbers, landmarks) | 30 |
| Complete simple one-way requests | 30 |
| Partial bookings, including SUV tomorrow | 30 |
| Explicit immediate requests | 15 |
| Scheduled complete requests | 20 |
| Date-only / time-only partials | 20 / 15 |
| Explicit any / preference / exclusion and negation | 30 |
| Pickup/drop order variants and repeated wording | 35 |
| Multiple stops | 15 |
| Return/rental/assisted outstation requests | 20 |
| Conditional/dependent requests | 15 |
| Conflicts, corrections, ambiguous date/time | 25 |
| Unclear/unrelated/noisy inputs | 20 |

Secondary tags overlap: at least 50 direction-sensitive cases, 12 repeated-token cases,
15 candidate-generation failures/overlaps, 40 genuinely missing-field simple cases,
25 negation cases, 20 year/weekday/daypart ambiguities, 30 necessary semantic fallbacks,
and 20 unsupported-service cases. Language exploratory examples include "campus se delta 2
kal 6 baje" and "pari chowk jaana hai campus se" with adjudicated spans and uncertainty.
Natural named locations are not fixed Google matches. Do not label multiple Airports as IGI
or college as a particular campus without explicit supplied context/user confirmation.

```ts
type Expected<T> =
  | { status: 'LABELLED'; value: T }
  | { status: 'NOT_LABELLED'; reason: string };
type SearchBenchmarkRecord = {
  id: string; familyId: string; split: 'DEVELOPMENT' | 'HELD_OUT'; tags: string[];
  modelInput: { query: string; context: ParseContext };
  // labels are not passed to classifier/extractor/interpreter
  truth: {
    provenance: 'HUMAN_REVIEWED_SYNTHETIC' | 'USER_CONFIRMED';
    reviewerIds: string[]; disagreementResolved: boolean;
    queryType: Expected<QueryType>; complexity: Expected<Complexity>;
    pickupSpans: Expected<{ start: number; end: number }[]>;
    dropSpans: Expected<{ start: number; end: number }[]>;
    stopSpans: Expected<{ start: number; end: number }[]>; // unsupported intent only
    vehicle: Expected<VehiclePreference>;
    serviceFlags: Expected<{ sharing: Field<boolean>; isOutstation: Field<boolean> }>;
    unsupportedRequests: Expected<UnsupportedRequest[]>;
    date: Expected<Field<DateExpression>>; time: Expected<Field<TimeExpression>>;
    timingMode: Expected<TimingIntent['mode']>; passengers: Expected<Field<number>>;
    missingFields: Expected<string[]>; ambiguities: Expected<string[]>;
    routing: Expected<'LOCATION' | 'JEV_SIMPLE' | 'LUNA_REQUIRED' | 'CLARIFY'>;
    resolvedDate: Expected<string>; resolvedTime: Expected<string>;
  };
};
```

Labels have their own expected-reference namespace, never production candidate IDs or
invented geography. Reviewers label explicit source wording and accepted equivalent spans;
disputed product semantics are NOT_LABELLED or labelled clarification, not guessed dates.
Separate adversarial family variants between development and heldout; use a seeded,
stratified family split with cohort checks in both. Freeze hashes, clock context, capability
version, questions, prompt/config and scoring rules before heldout. Tune probabilities only
on development; later rollout is a separately approved S5 decision.

Metrics and denominators:

- Query-type and simple/complex routing accuracy/confusion matrices on labelled applicable cases.
- Pickup/drop exact accepted-span accuracy separately; normalized text overlap is secondary.
- **Reversal rate**: complete gold-origin/destination cases where predicted origin matches gold
  destination AND predicted destination matches gold origin, divided by distinct two-role gold
  cases. Report role coverage/abstentions and partial-role swaps too; never hide abstention as accuracy.
- Vehicle class, exclusions/strength/explicit-any, service flags, date parts/resolution, exact time,
  timing mode and passenger accuracy on labelled fields. Missing/ambiguous preservation scored too.
- Missing-field recall and ambiguity recall against deterministic requirement labels; report false
  missing/false ambiguity rates, not just recall. Unsupported-service loss is a safety error.
- Necessary fallback recall = correctly fallback-routed / gold LUNA_REQUIRED. Unnecessary fallback
  = Luna calls / gold safely JEV_SIMPLE (report partial-simple cohort separately).
- Candidate recall/boundary accuracy, invented-span/ID rate, invented date/time/count rate, geography
  invention rate, review bypass/book-submit attempts and exclusion loss; never count a clean schema
  as proof of semantic correctness. Provider-failure forced fallback reported separately from intent.
- Jev request count, Luna frequency, per-provider and end-to-end p50/p95 latency, timeouts/failures,
  safe token usage where reported. Cost/query only with authoritative pricing/version/currency;
  otherwise NOT_AUTHORITATIVELY_AVAILABLE. No responsibility performance reuse.

Controlled clock tests pin at least `2026-10-02T12:00:00+05:30` (Friday), local midnight,
year boundary, leap/non-leap February, today/tomorrow and bare/this/next weekday. Include
server scheduling edges: exactly +30 minutes rejected, just later accepted, exactly +168 hours
accepted, just later rejected. Clarification labels cover undecided semantics. Fake Jev/Luna,
Places and clocks are deterministic; normal tests never depend on live paid calls.
Architecture tests forbid parser creation/payment/dispatch imports and assert review requirement;
provider failures preserve the manual form. Real Places/provider evaluation is opt-in and measured
in S5, with no booking submissions. No database migrations are planned for parsing drafts.
Test trusted existing/saved/map/current selections without manufacturing query spans, CONFIRMED
grounding missing its value, empty match lists, unconfirmed/digest-stale submission, all extraction caps and invalid
H12/H24/period combinations. Candidate IDs and trusted selection IDs have separate namespaces.

## N. Gaps and decisions (no fixes in S1)

| Kind | Finding | Future action |
| --- | --- | --- |
| Engineering | Jev prototype treats incomplete as complex; no unclear class; score is unsuitable for categorical complexity | S2 isolated bounded adapter and contract validation; don't wire old prototype unchanged |
| Engineering | Nullable legacy schema loses explicit-any/negation; model ISO treated as extraction | S2 shared discriminated states and component resolver |
| Engineering | No customer natural-language input or parser API | S2 backend interface; S3 deliberate UI integration, preserving manual form |
| Engineering | Form loses place IDs; coordinates can fall back to fixed anchors at submission | S3 provenance/grounding and prevent unresolved parser draft entering creation |
| Engineering | Scheduling bounds/picker defaults differ, browser-local versus IST | S2 resolver preserves ambiguity; reconcile shared validation before rollout, no default time inference |
| Product decision | Standalone landing location target | Recommend active field, otherwise ask role; approval needed before S3 UX signoff |
| Product decision | Omitted year; bare/this/next weekday; customer versus service timezone | Clarify until explicit versioned policy; no cookbook default adoption |
| Product decision | SUV class versus SUV-family exclusion; soft preferences/exact-any selection | Preserve scope ambiguity; user chooses supported class; no silent upgrade |
| Unsupported backend | Passenger count/multi-seat shared bookings | Preserve advisory value, disclose unsupported enforcement; cannot promise group allocation |
| Unsupported backend | Stops, return timing, rental duration | Preserve source/assisted request; no invented self-service fields |
| Unsupported backend | AC and conditional preferences | Preserve source and explain unsupported condition; don't promise enforcement |
| Existing inconsistency | Outstation flag accepted; website uses contact flow; estimate lacks outstation-specific input | Keep assisted flow; do not invent rental/day/return pricing |
| Documentation | BookingFlow landing-drop comment and older roadmap states disagree with current flow | Treat verified current code as source; optional cleanup belongs to implementation review |

These decisions do not block implementing safe S2 interfaces/extraction with clarification.
They block silently resolving their respective ambiguous cases or claiming S3/S5 rollout readiness.
No claim is made that a new validator retroactively fixes every legacy booking endpoint.

## O. Implementation sequence and P. likely future files

- **S2**: Jev router, simple bounded extraction, shared strict contract/component validation,
  injectable clock/provider/candidate ports and deterministic tests. Candidate-role extraction
  can use supplied/fake candidates; no location grounding is production-complete until S3.
- **S3**: conservative candidate generator, role/Places grounding, place provenance,
  deliberate search UI, clarification/follow-up and confirmed-draft handoff. No changes to Google
  authority. Until S4, complex/failed queries can safely offer the manual form without an AI claim.
- **S4**: GPT-6 Luna bounded complex interpreter returning exactly BookingDraft; validated source
  spans and invariant-driven fallback; no Terra or translation architecture.
- **S5**: independent adversarial search benchmark, threshold/fallback calibration, opt-in provider
  tests, privacy/cost/rate controls, visual and end-to-end verification and controlled rollout.

Likely new isolated modules: `backend/services/search/{contracts,classifier,simpleExtractor,
locationCandidates,timingResolver,validator,lunaInterpreter}.ts`, a read-only
`backend/routes/rideSearch.ts`, deterministic `backend/tests/rideSearch*.test.js`,
and `backend/benchmarks/search/` after dataset review. Names are proposed, not created in S1.
Reuse actual class constants and clock; don't build a parallel booking writer.
Future minimal wiring may affect `backend/index.js`, `frontend/src/api/api.js`,
`hooks/useApi.js`, `hooks/useData.js`, `components/hero/LandingHero.jsx`,
`components/ui/NavBar.jsx`, `pages/BookingFlow.jsx`, `pages/OnBoarding.jsx`,
`pages/VehicleSelect.jsx` and `components/ui/DateTimeSelector.jsx` as relevant.
Retain existing Google routes, quote/booking APIs and responsibility modules; any future
Google session/bias refinements must be separately tested in S3, not assumed necessary here.
Never store provider credentials in clients. Future anonymous parser endpoints need bounded
input, server-held keys and spend/rate limits. Untrusted queries never alter model/config.

## Q. Responsibility separation and R. S1 acceptance

```text
PHASE 8 RESPONSIBILITY BENCHMARK: INCOMPLETE
BLOCKS SEARCH S1: NO
BLOCKS SEARCH S2: NO
BLOCKS RESPONSIBILITY JEV DUAL-SHADOW: YES
BLOCKS RESPONSIBILITY AUTO-ADJUDICATION: YES
```

S1 changed only this design document. No live Jev/Luna/Places call, booking, parser
implementation, threshold calibration, model switch, translation or production UI change.
Two bounded read-only explorer reviews checked booking sources and TypeSafe/date semantics.
S1 validation is repository/source cross-check plus independent document/invariant review,
in-memory typechecking of the specification's TypeScript blocks and diff/whitespace checking;
backend tests, typecheck, coverage, mutation, browser and DB tests are not claimed for a doc-only
change. Their mandatory implementation gates apply in S2 onward. Ready for S2: YES.
