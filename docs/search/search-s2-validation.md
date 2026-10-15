> Current owner policy override (2026-10-06): see [Search owner decisions](search-owner-decisions-2026-10-06.md). Historical unresolved-year/weekday/timezone/SUV statements below are superseded. ?Follow-up?, ?ask? and ?clarification? mean deterministic form resolution, never a conversational AI loop. Stops are a planned product feature, currently blocked at submission.

# Search S2 implementation and signoff

## A. Architecture

Immutable query identity -> Jev routing -> simple bounded extraction -> deterministic
schema/source/role/temporal validation -> BookingDraft or future-fallback-required.
Complex requests stop after routing. Missing fields never cause complexity in code.
No parser endpoint, customer frontend or production job is wired in S2.

## B. Files changed

Production additions under `backend/services/search/`: `contracts.ts`, `provenance.ts`,
`fields.ts`, `observations.ts`, `questions.ts`, `extractor.ts`, `validation.ts`,
`temporal.ts`, `provider.ts`, and `parser.ts`.

`backend/lib/scheduling.js` extracts the existing pure scheduling rule;
`backend/services/whatsappParsing.js` delegates its existing schedule-time function
to that helper. No other production file is changed by S2.

Tests: the twelve `backend/tests/rideSearch*.test.js` files, two
`backend/tests/helpers/rideSearch*.js` helpers, and three
`backend/tests/quality/*search-s2*` configurations/measurement scripts.
Documentation: `search-s2-implementation.md`, this report, three scoped mutation
audits, and `search-s2-mutation-signoff.md`. Coverage/measurement artifacts are in
the existing ignored `backend/coverage/` directory.

Exact test filenames: `rideSearchAdapterIntegration.test.js`,
`rideSearchAdversarial.test.js`, `rideSearchArchitecture.test.js`,
`rideSearchConsistencyMutations.test.js`, `rideSearchContractMutations.test.js`,
`rideSearchContracts.test.js`, `rideSearchFinalMutationRegressions.test.js`,
`rideSearchObservationMutations.test.js`, `rideSearchParser.test.js`,
`rideSearchProvider.test.js`, `rideSearchProviderMutations.test.js`, and
`rideSearchTemporal.test.js`. Helpers: `rideSearchFake.js`, `rideSearchAssertions.js`.
Quality files: `eslint.search-s2.config.mjs`, `measure.search-s2.cjs`, and
`stryker.search-s2.config.mjs`. Scoped audits: `search-s2-contract-mutation-audit.md`,
`search-s2-provider-mutation-audit.md`, and `search-s2-observation-mutation-audit.md`.

## C. BookingDraft

[contracts.ts](../../backend/services/search/contracts.ts) implements S1's shared
strict schema, with SourceRef, LocationCandidate, field/vehicle/date/time unions,
source ownership, actual vehicle classes and resource limits. Query identity is
`id`, `revision`, `text`. There is no invented BookingType, groundable place ID,
coordinate, financial field or booking submission in this contract.

UNSPECIFIED, RESOLVED and AMBIGUOUS are generic field states; EXPLICIT_ANY,
EXCLUDED and REQUIRED/PREFERRED are explicit vehicle semantics. Boolean false
does not become unspecified, and absence does not become a booking default.

## D–E. Provider abstraction and actual SDK

SearchDecisionProvider.decide accepts provider-independent bounded questions and
returns normalized choices, raw probability diagnostics and safe metadata.
The real adapter uses installed `@typesafe-ai/sdk@0.6.0`, TypeSafeClient.systemOne,
choice and noul. No score or probability threshold is used.

Configuration is explicit factory options: injected SDK client, model, clock and
timeout. Defaults are jev-latest, existing system clock, 10,000 ms and zero retries
per call. SDK credentials use its existing TYPESAFE_API_KEY handling; no secrets
are captured in results. Live preflight: NOT RUN. Offline SDK contract: PASS.

Expected requests per revision: empty/invalid 0; unrelated/complex 1;
location-without-candidates 1; location-with-candidates/simple-booking at most 2.
Independent questions receive the original context and cannot depend on another
answer in the batch. Usage tokens are preserved where returned; no cost is invented.

## F. Routing fixtures

| Query | Tested result with deterministic provider |
| --- | --- |
| Pari Chowk | LOCATION_SEARCH; separate locationSearch, no pickup/drop default |
| SUV tomorrow | BOOKING_REQUEST / SIMPLE / SIMPLE_INCOMPLETE; no fallback |
| campus to airport | SIMPLE; supplied candidates preserve pickup/drop roles |
| tomorrow at 7 PM | SIMPLE scheduled intent |
| cab now | IMMEDIATE |
| conditional multiple-stop journey | COMPLEX_FALLBACK_REQUIRED; no simple extraction |

These verify application behavior around bounded answers. They do not measure
the real model's classification accuracy; that is Search S5 work.

## G. Extraction coverage

| Field | Implemented | Ownership | Remaining gap |
| --- | --- | --- | --- |
| queryType / complexity | YES | Jev choices + code consistency | Search-specific live evaluation |
| vehicleClass / strength / any / exclusions | YES | Source observations + choices + code guards | Generic SUV-family exclusion policy |
| timing mode | YES | Choice + source consistency | None for supported expressions |
| date | YES | Code extracts components; Jev selects observed ID; code resolves | Omitted-year/weekday policy; anchored follow-up merge |
| time | YES | Observed clock/daypart candidate + choice + code | User clarification for vague/approximate/period ambiguity |
| passengers | YES, advisory | Observed numeric candidate + bounded choice | Authoritative passenger allocation unsupported |
| sharing / isOutstation / preferSafeRoute / needsCarrier | YES | Source-bound categorical choices + code | Existing service/quote checks happen later |
| pickup / drop / locationSearch | YES, mechanics only | Supplied candidate selection + provenance/direction guards | Generator, Places and frontend policy in S3 |
| unsupportedRequests | YES | Exact source clauses + bounded indicators | Backend capability enforcement remains unsupported |

## H–I. Vehicle and temporal semantics

All actual classes are verified against repository constants: hatchback, sedan,
suv, suv_premium. Any, unspecified, excluded, required, preferred and ambiguous
remain distinct. A generic SUV exclusion does not exclude suv_premium by inference.
Contradictory class/exclusion/strength decisions are rejected or retained ambiguous.

No timing mention means UNSPECIFIED, never immediate. Relative TODAY/TOMORROW/
DAY_AFTER_TOMORROW use the injected existing controlled clock and explicit IST
context. Absolute components retain missing year; weekdays retain BARE/THIS/NEXT
without adopting a product policy. Non-IST timezone resolution remains a policy issue.
DAYPART and approximate clocks never become invented exact times. H12 requires
AM/PM; H24 forbids it. Calendar overflow is rejected.

Scheduling reuses the existing backend rule: strictly more than 30 minutes and
at most 168 continuous hours ahead. Whole-field trusted context may carry forward;
granular new-time/prior-date follow-up merge is still S3 work. Carried relative
dates cannot be silently re-anchored to a later current day.

## J. Locations

Caller-supplied IDs are checked against exact query/revision and UTF-16 slice,
with exclusive ends and intact surrogate pairs. Unknown IDs, same/overlapping
endpoint choices, explicit reversal, contradictory presence and role consistency
fail closed. Validation never rewrites a selected role silently.

Production candidate generation: NOT IMPLEMENTED — S3.
Google Places grounding: NOT IMPLEMENTED — S3.
Standalone locations remain separate until the UI field policy is decided.
Old ungrounded candidates cannot attach to a new revision; S3 must retain lineage
or use confirmed selections rather than repair spans.

## K–M. Unsupported requests, fallback and failure

PASSENGER_COUNT, STOP, RETURN_JOURNEY, RENTAL, AC_PREFERENCE,
CONDITIONAL_PREFERENCE and OTHER remain explicit requests with provenance.
Supported boolean options do not invent enforcement for those capabilities.
Supplied candidate links to unsupported stops are retained in source order.

Future fallback reasons include complex query, provider timeout/error/invalid
response/schema error, role conflict, missing expected candidate, temporal conflict
and unresolved extraction binding. Missing user information and known policy
clarification alone do not trigger fallback. Unsupported warnings remain visible.
Luna calls in S2: 0. Terra and translation: NOT IMPLEMENTED.

Malformed/missing/invalid enum answers and unknown bounded candidate IDs cannot
fabricate values. On extraction failure the parser preserves validated routing
but clears untrusted fields. Errors are sanitized; raw provider messages are absent.

## N. Tests and regression

- Focused search: **141/141 PASS**; normal tests make no live provider requests.
- Full backend: **1,018/1,018 PASS**, 68 suites, no failed/cancelled/skipped tests.
- WhatsApp plus temporal scheduling regression: **32/32 PASS**.
- Backend typecheck: PASS. Scoped production lint: PASS.
- Architectural tests guard no booking/Places/Luna/responsibility imports,
  provider-independent contracts and unwired legacy/new parser composition roots.

Fixtures cover S1 taxonomy, valid/invalid provenance, cap boundaries, source-bound
choices, required/preferred/excluded/any vehicles, flags, unsupported clauses,
partial requests, revision carry, explicit role reversal and controlled temporal
midnight/month/year/leap/scheduling boundaries.

## O–Q. Coverage, mutation and quality

New production scope (ten search modules and scheduling helper) has **100%
statements, branches, functions and lines**. The modified WhatsApp wrapper was
also separately measured: 100% statements, five executions, CC/CRAP 2,
cognitive 0 and Halstead difficulty 1.

Mutation results and individual survivor proofs are in
[the signoff audit](search-s2-mutation-signoff.md):
2,572 unique mutants; **2,437 killed; 135 survived; 0 timeouts; 0 uncovered;
0 errors; 0 meaningful survivors**. Same-source targeted reruns are reconciled
by exact mutation identity, not counted twice. No suppressions or exclusions.

| Gate | Measured result |
| --- | --- |
| Cyclomatic <22 | Maximum 21 |
| Cognitive <22 | Maximum 19 |
| Halstead difficulty <80 | Maximum 32.053 |
| Source file <500 LOC | Maximum 218 |
| CRAP <25 | Maximum 21 |
| Duplicate clones/lines | 0 / 0 |
| Explicit any / unknown | 0 / 0, scoped TS lint |
| Type/lint errors | 0 / 0 |
| Dead/unused additions | No unused production locals reported; reviewed module/export graph contains no introduced unused implementation. Public unwired service is the intended S2 boundary. |
| Redundant additions | No duplicate clones; reviewed implementations reuse schema, source and schedule validation rather than competing copies. Defensive equivalent guards are explicitly retained in the mutant audit. |
| Whitespace | git diff --check PASS; new/untracked files separately checked |

Artifacts: `coverage/search-s2/coverage-final.json`, `metrics.json`,
`coverage/search-s2-duplicates/jscpd-report.json`, mutation reports/manifest and
the signoff regression/typecheck/lint logs. No schema or migration changes;
Docker, Prisma migration testing and live-model benchmarking are not S2 gates.

## R–U. Prototype, production behavior and unresolved decisions

The existing `backend/services/AI/bookingParser.ts` remains legacy/unwired and
unchanged by S2. It is not adapted or deleted. Composition tests prevent it from
becoming a competing production parser. Customer-facing search remains unchanged.
Parser can create bookings: NO. User review/confirmation remains a later mandatory
handoff to the existing creation flow.

Unresolved decisions: standalone active location field, omitted year, weekday
qualifiers, timezone outside established IST context and generic SUV-family scope.
No new responsibility code, benchmark or production model selection is changed.
Phase 8 responsibility benchmark remains INCOMPLETE; it blocks responsibility
dual-shadow/auto-adjudication and blocks neither Search S2 nor S3.

## V. Remaining blockers/dependencies

| Remaining item | Blocks S3 | Blocks S4 | Blocks full search benchmark | Blocks search production rollout |
| --- | --- | --- | --- | --- |
| Candidate generation, Places, provenance-preserving follow-up and UI integration | NO | NO | YES | YES |
| Standalone location UI target decision | YES | NO | NO | YES |
| Omitted-year/weekday/non-IST/SUV-family policy | NO | NO | NO | NO |
| Live Jev access/adapter preflight and calibrated search accuracy not measured | NO | NO | YES | YES |
| Luna fallback implementation (S4) | NO | NO | YES | YES |
| Unsupported backend stops/returns/rental/AC/passenger enforcement | NO | NO | NO | NO |
| Responsibility Phase 8 blockers | NO | NO | NO | NO for this separate search track |

Policy gaps can remain unresolved only with mandatory clarification; guessing is
prohibited. Unsupported capabilities must be disclosed and cannot be promised or
submitted as if enforced. The standalone-location decision blocks completion of
that S3 UX. Benchmark/rollout columns describe the full intended search surface.

S3 may begin; it has not been started automatically. S4/S5 remain separate.

## W. Readiness

```text
SEARCH PHASE S2 JEV ROUTER + SIMPLE EXTRACTION: COMPLETE
BOOKINGDRAFT IMPLEMENTED: YES
PROVIDER-INDEPENDENT CONTRACT: YES
QUERY TYPE ROUTING IMPLEMENTED: YES
SIMPLE/COMPLEX ROUTING IMPLEMENTED: YES
INCOMPLETE REQUEST AUTOMATICALLY COMPLEX: NO
"SUV TOMORROW" REMAINS SIMPLE: YES
MISSING TIMING MEANS IMMEDIATE: NO
EXPLICIT ANY DISTINCT FROM UNSPECIFIED: YES
NEGATION/EXCLUSIONS PRESERVED: YES
QUERY SOURCE PROVENANCE VALIDATED: YES
CALLER-SUPPLIED LOCATION CANDIDATES SUPPORTED: YES
JEV GENERATES ARBITRARY LOCATION TEXT: NO
PRODUCTION LOCATION CANDIDATE GENERATION: NOT IMPLEMENTED
GOOGLE PLACES GROUNDING: NOT IMPLEMENTED
GPT-6 LUNA FALLBACK: NOT IMPLEMENTED
TERRA: NOT IMPLEMENTED
TRANSLATION: NOT IMPLEMENTED
PARSER CAN CREATE BOOKING: NO
NORMAL TESTS REQUIRE LIVE JEV: NO
SCOPED COVERAGE 100%: YES
MEANINGFUL SURVIVING S2 MUTANTS: 0
PHASE 8 RESPONSIBILITY CODE CHANGED: NO
READY FOR SEARCH S3: YES
```
