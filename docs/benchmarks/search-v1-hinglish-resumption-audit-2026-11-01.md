# Search V1 and Hindi/Hinglish resumption audit — 1 November 2026

Audit only. No implementation, provider evaluation, frozen-trace execution, rollout, or deployment was performed. Dates in this report use IST where a local date matters. Evidence timestamps retain their original UTC representation.

## I. Executive summary

**Search has substantial backend implementation, but customers cannot use natural-language booking end to end through the current website.** The landing destination/Now controls open the ordinary booking form; no production route or customer frontend imports the Search parser, grounding service, or Luna composition service. Backend form-resolution contracts exist; their integration into the customer form does not.

The latest accessible Search implementation is shared by both checkouts. All **36 Search service files, 14 Search benchmark modules, 61 Search documents/data files, and 54 Search test files** compared are byte-identical. The original checkout is the authoritative accessible **execution-evidence location**: its ignored `output/` contains the Search receipts, caches, and Hindi diagnostics. The Proofloop checkout lacks the two requested final-output directories. Its newer commit concerns Proofloop and supplies no newer Search implementation.

The audit independently reconciled **222 unique development records: 172 provider-stage-complete and 50 awaiting Luna; no outstanding pre-Luna Places stages or unattempted development records.** This is not 172 completed bookings or 172 fully grounded, user-confirmed drafts. The 48 resumed Places cases made 96 autocomplete calls and **zero Details calls, selections, or submissions**. All 50 Luna cases may require Places after accepted interpretation; “Places pending: zero” does not pre-complete those future stages.

Hindi temporal recognition remains **`hindi-temporal-lexicon-v2.1`**, with all 36 current source hashes matching the final continuation manifest. Recounting the saved 80 development outputs exactly reproduces **67/80 schema-stage-valid**, raw query type **74/80**, raw complexity **56/80**, exact pickup **28/51**, and exact drop **24/51**. Fifty incorrect endpoint observations lack the expected exact candidate span. Hindi negation, role/candidate coverage, missing-field accuracy, and complex semantics remain open. No general translation layer is implemented or wired.

**S5 and S6 remain incomplete; the execution contract is not frozen; S7 is not started.** The 98-case Search held-out and separate 18-case language challenge remain **NOT RUN in accessible evidence**. No later Search execution receipt was found. The original 32-trace S6 package still hashes to `e85d9dec14d137a37600b4a412cce6d5c74bdd507151128e642d50ec144af01a`; its independent API verifier has not executed. The historical 429 window expired before this audit, but current provider availability is **UNKNOWN**, because no probe was made.

Source-level customer Search remains unwired, with no shadow/rollout integration found. The actual hosted revision and runtime deployment configuration are **UNKNOWN**: no cloud or production inspection was performed. Responsibility Phase 8 completion is separate evidence and does not complete any Search gate.

### Checkout authority and preservation

| Checkout | Branch / HEAD | Observed state and relevance |
| --- | --- | --- |
| `D:\Downloads\Repos\RCS-Travels-Website` | `codex/proofloop-evidence-migration-20261016` / `2ff51e7d9dade932cd21dfe5d836488d4b9a700a` | Original source and accessible ignored Search execution artifacts. Initially 177 status entries: 23 staged additions, 96 unstaged paths, 58 untracked entries. No Search service/document content changes appeared in status. |
| `D:\Downloads\Repos\RCS-proofloop-local-20261016` | `codex/phase9d1-custody-local-20261016` / `8cb24fd359ecd17573897fab5fb702daa7e3aef3` | 1,719 status entries: 0 staged, 1,582 unstaged, 137 untracked entries. Status reports many Search paths modified, but the scoped content diff is empty and the files match the original checkout byte for byte. Do not treat these status markers as newer Search behavior. |

Git history identifies `5a46690` (15 October 2026), “wip: checkpoint Search RAG providers and benchmark work,” as the Search source/document checkpoint. The branch-to-branch diff for `backend/services/search`, `backend/benchmarks/search`, and `docs/search` is empty. The later `8cb24fd` adds Proofloop continuation work. The current landing/form files differ between working trees; the identical Search services and benchmark evidence do not establish equivalent manual-UI behavior. The original checkout’s current UI was the principal inspected surface. The Google proxy and identity-refresh helper match between checkouts.

Both root `AGENTS.md` files were read. Relevant Search passages in `CONTEXT.md:161` and `ROADMAP.txt:168` were checked against code and receipts. No captain-app changes were made.

## II. Implementation map

Paths below are relative to the original checkout. Regression-test names identify existing coverage, not a claim that every listed test was rerun today. Only the four files marked † were run during this audit.

| Feature / boundary | Exact source area | Current functionality / limit | Existing regression evidence |
| --- | --- | --- | --- |
| Landing input and booking entry | `frontend/src/components/hero/LandingHero.jsx:24`, `frontend/src/components/ui/NavBar.jsx`, `frontend/src/pages/BookingFlow.jsx:19` | Buttons clear route/timing state and navigate to `/book`. No natural-language request or Search draft adoption. | No customer NL integration test found. Backend composition-root tests confirm non-wiring. |
| Query/schema/field states | `backend/services/search/contracts.ts:3`, `:115`, `:144` | Strict `ride-search-draft-v1`; query type, complexity, candidate/selection refs, scalar states, exclusions, supported flags and unsupported requests; incompatible pairs rejected. | `rideSearchContracts.test.js`, `rideSearchContractMutations.test.js`, `rideSearchArchitecture.test.js` † |
| Jev transport | `backend/services/search/provider.ts:70`, `:128`, `:193` | Bounded categorical/noul SDK requests, strict response validation, usage/latency metadata, zero retries. | `rideSearchProvider.test.js`, `rideSearchProviderMutations.test.js`, `rideSearchAdapterIntegration.test.js` |
| Routing/extraction | `backend/services/search/parser.ts:107`, `questions.ts`, `extractor.ts:14`, `validation.ts:6` | Routing then bounded extraction; candidate-ID membership, observed source assertions, role/conflict checks; missing fields become form requirements. | `rideSearchAdversarial.test.js`, `rideSearchExtractorWitnesses.test.js`, `rideSearchDevelopmentSafety.test.js` |
| Source provenance | `backend/services/search/provenance.ts:98`, `contracts.ts:140` | Original query ID/revision, exact UTF-16 slices, surrogate boundaries, candidate membership and trusted user-field evidence. | `rideSearchContracts.test.js`, `rideSearchHindiTemporal.test.js` † |
| Hindi temporal observations | `backend/services/search/hindiTemporal.ts:6`, `hindiCalendar.ts:5`, `observations.ts:22` | Bounded relative dates, dayparts, certain clocks/weekdays/December forms; original-source offsets and protected location spans. No general linguistic normalization. | `rideSearchHindiTemporal.test.js` †, saved V2.1 quality closure |
| Date/time policy | `backend/services/search/temporal.ts:11`, `calendarPolicy.ts`, `timezonePolicy.ts`, `backend/lib/scheduling.js` | Owner-approved year/weekday/PM/timezone arithmetic; omitted minutes/dayparts/approximation remain unresolved; shared scheduling eligibility. | `rideSearchTemporal.test.js`, `rideSearchOwnerDecisions.test.js`, `rideSearchOwnerDecisionSafety.test.js` |
| Vehicle/passenger/flags | `backend/services/search/observations.ts:92`, `vehiclePolicy.ts:17`, `extractor.ts:34`, `validation.ts:57` | Four wire classes; generic negative SUV includes both SUV classes; passengers advisory; source-bound booleans/exclusions. Recognition is still strongly English-oriented. | `rideSearchOwnerDecisionSafety.test.js`, `rideSearchDevelopmentClosure.test.js`, `rideSearchExtractorWitnesses.test.js` |
| Candidate generation | `backend/services/search/locations/candidates.ts:9`, `:78`, `:100`, `requestPrefix.ts`, `bookingTail.ts`, `temporalSuffix.ts` | `ride-search-location-candidates-v4`; English and bounded Romanized `se`/`jaana hai` grammar, original-span prefix/suffix trimming; incomplete Devanagari/role coverage. | `rideSearchS3Candidates.test.js`, `rideSearchRequestPrefix.test.js`, `rideSearchDevelopmentWitnesses.test.js` |
| Places suggestions/selection | `backend/services/search/locations/grounding.ts:46`, `places.ts:175`, `service.ts:40` | Application-owned autocomplete; even one suggestion requires user selection; offered-ID membership and revision checks precede Details. | `rideSearchS3Grounding.test.js` †, `rideSearchS3Places.test.js`, `rideSearchS3Service.test.js` |
| Place ID refresh | `backend/routes/googleAPI.js:88`, `backend/services/googlePlaceIdentity.js:2`, `locations/grounding.ts:77` | A provider-bound replacement is offered for a second explicit selection; mismatched IDs cannot silently become confirmed coordinates. | `rideSearchS5GoogleIdentity.test.js`, `rideSearchS3GoogleProxy.test.js` |
| Review and edits | `backend/services/search/locations/session.ts`, `sessionRefs.ts`, `sessionTemporal.ts`, `review.ts:45`, `formResolution.ts:12` | Immutable query lineage/trusted selections; edits invalidate fare/final review and dependent route/location confirmation; submission projection needs grounded locations and explicit review. | `rideSearchS3Followup.test.js`, `rideSearchOwnerDecisions.test.js`, `rideSearchOwnerDecisionSafety.test.js` |
| Luna eligibility/adapter | `backend/services/search/complex/eligibility.ts:3`, `contracts.ts:4`, `luna.ts:125` | One eligible direct API Luna interpretation; strict source/schema validation; no arbitrary Places/booking tools. | `rideSearchS4Luna.test.js`, `rideSearchS4AdapterFinal.test.js`, `rideSearchS4AdapterMutations.test.js` |
| Luna adoption | `backend/services/search/complex/service.ts:61`, `locations.ts`, `evidence.ts`, `trusted.ts`, `ownerConflicts.ts` | Validates spans, scalar evidence, alternatives and trusted-field conflicts; preserves partial/trusted state; reuses grounding/review contracts; stale results rejected. | `rideSearchS4Trusted.test.js`, `rideSearchS4BoundaryFinal.test.js`, `rideSearchS4Architecture.test.js` † |
| Benchmark identities/metrics | `backend/benchmarks/search/freeze.js:6`, `providerStages.js:13`, `prediction.js:32`, `metrics.js:58`, `backend/benchmarks/common/cache.js:5` | Frozen dataset/split; separated stage state; strict cache identity; raw/intermediate/adoption metrics require separate interpretation. | `searchProviderStages.test.js`, `rideSearchS5Dataset.test.js`, `rideSearchS5Metrics.test.js` |
| S6 packet/review boundary | `backend/benchmarks/search/toolAudit.js:13`, `backend/scripts/search-s6-verifier-package.mjs` | Development-only packet, capability inventory and bounded reviewer schema/package. Independent verifier output absent. | `rideSearchToolAudit.test.js`; historical engineering review |
| Booking submission | `frontend/src/pages/VehicleSelect.jsx:681`, `:860`, `backend/services/bookingCreation.js`, `backend/routes/bookings.js` | Existing manual fare/pin/authenticated booking path. No Search confirmation projection is connected to it. Fixed-coordinate fallback expressions remain in the manual creation payload. | Existing manual booking tests are separate; no NL-to-confirmed-booking browser test found. |

### Actual user journey

The connected journey is landing button → `/book` → `OnBoarding` manual pickup/drop/schedule controls → vehicle/fare and pin confirmation → explicit `api.createBooking`. `OnBoarding.jsx:127` reads autocomplete IDs, and its selection handler obtains Details and stores label/coordinates. It does not preserve the Search service’s query/candidate/role/selection lineage.

The implemented but unwired Search journey is original query/context → Jev routing → bounded extraction or eligible single Luna fallback → validated `BookingDraft` → application-controlled candidate autocomplete → explicit selection/Details → immutable review/session → `formResolution` → **missing customer integration**. There is no conversational AI follow-up executor. The legacy `backend/services/AI/bookingParser.ts` remains a separate unwired prototype, not the authoritative Search contract.

## III. S1–S7 status

“VERIFIED” here means verified for the stated scope. It never upgrades offline adapter tests into live quality or deployment verification.

| Phase / subphase | Status | Evidence and remaining scope |
| --- | --- | --- |
| S1 architecture/contracts | VERIFIED | `search-s1-architecture.md`, current contracts and dependency boundaries; owner policy supersedes historical unresolved-policy prose. |
| S2 bounded Jev parser, strict schema/provenance | VERIFIED | Implemented source, archived S2 validation/mutation signoff, current focused architecture checks. Live language/model quality remains S5 work. |
| S3 candidate/grounding/session/review primitives, originally approved offline scope | VERIFIED | `search-s3-validation.md`, mutation audit, current grounding tests. Hindi expansion and live selection coverage remain incomplete. |
| S3 customer form integration | NOT_STARTED | Service contract exists; no endpoint/frontend adopter found. Do not infer a working website feature from backend signoff. |
| S4 Luna fallback adapter and deterministic adoption, offline scope | VERIFIED | Source and archived S4 validation/signoff; current dependency firewall passed. |
| S4 production-equivalent development quality | IMPLEMENTED_NOT_VERIFIED | Adapter exists, historical preflight exists, but the 50 Search development Luna cases have no results. |
| S5 owner decisions, labels, dataset and split freeze | VERIFIED | Owner-approved V3 → frozen V1; current dataset/split hashes and zero family leakage verified. |
| S5 Jev development stage | VERIFIED | All 222 attempted; cached routing available; includes rejected schema/semantic results, not a quality pass. |
| S5 pre-Luna Places development continuation | VERIFIED | 48/48 resumed autocomplete stages, 96 calls, original parse hashes verified. Details/selection not covered. |
| S5 Luna stage | BLOCKED | Historical provider 429; 50 original-order pending stages. Current availability UNKNOWN. |
| S5 full development safety, accuracy, calibration, latency/cost closure | PARTIAL | Partial cohorts and offline guards only; full fallback/selection/complex outcomes absent. |
| S5 execution-contract freeze | NOT_STARTED | Explicitly unfrozen in current continuation/S6 artifacts. Dataset freeze is distinct. |
| S5 98-case held-out execution | NOT_STARTED | NOT RUN in accessible receipts; gates not complete. |
| S6 inventory, packet and historical static review | VERIFIED | 12 capabilities; 32 traces; historical static PASS for known boundaries; hashes reproduced. |
| S6 temporal extension/current-source coverage | PARTIAL | Separate V2.1 annex and source-bound closure; historical packet is not silently rewritten or treated as a current-source full audit. |
| S6 independent AI verifier | BLOCKED | `verifierExecuted: false`; no independent assessment output located. Provider block historical, availability now UNKNOWN. |
| S6 overall/final execution signoff | PARTIAL | Static preparation is complete for its recorded scope; independent review and full development evidence remain missing. |
| S7 controlled customer rollout | NOT_STARTED | No Search composition root, customer adoption flow, shadow wiring, or rollout execution evidence found. |
| Hindi 80-case development diagnostics | VERIFIED | Cached metric recount exactly matches final report; this is diagnostic completion, not robustness acceptance. |
| Hindi full production-equivalent robustness gate | PARTIAL | 0 Luna cases, 0 Places/selection/submission evaluations for this cohort. |
| B1 bounded Hindi roles/negation experiment | NOT_STARTED | Prepared A/B plan; current code retains documented recognition gaps. |
| B2 auxiliary translation experiment | NOT_STARTED | Conditional proposed extension, not a required or deployed architectural layer. |
| Independent 18-case construction challenge | NOT_STARTED | Dataset prepared/hash verified; approach lock pending; NOT RUN. |

The approved core remains one interpretation followed by form resolution. Owner P1–P11 policy, including bare-hour PM and planned stops, is recorded in `docs/search/search-owner-decisions-2026-10-06.md` and the approved dataset. Full multi-stop booking is a separate planned product workstream (`multi-stop-product-backlog.md`); S4 must preserve its meaning and block unsafe flattening, not implement it implicitly. Paid translation is a conditional experiment, not an outstanding mandatory dependency. New multilingual diagnostic/challenge gates supplement rather than replace the Search V1 split.

## IV. Jev and Luna status

### Observed configuration

| Item | Source/configuration verified |
| --- | --- |
| Jev requested model | Factory default `jev-latest`; actual saved development responses report `jev-1.13.0`. The alias is not an immutable model-version freeze. |
| Jev SDK | Installed `@typesafe-ai/sdk` 0.6.0; package declaration `^0.6.0`. `systemOne` categorical choice/noul interface. |
| Jev timeout/retry | Factory default 10,000 ms, explicit per-request retry `maxRetries: 0`. Timeout is injectable; Hindi diagnostic scripts used 60,000 ms. Benchmark identities must retain these differences. |
| Jev validation | Exact answer and probability keys; choice membership; finite confidence/probabilities in [0,1]; sum tolerance `0.000001`; finite nonnegative integer token counts. No confidence threshold or calibrated necessary/unnecessary fallback threshold is applied. |
| Luna backend | Direct OpenAI Responses `parse`, exact `gpt-6-luna`, installed `openai` 7.10.0, strict Zod structured output `ride-search-luna-v1`, reasoning `low`, maximum output 4,096 tokens, maximum 15,000 ms, zero SDK retries, cancellation/staleness guards. |
| Luna configuration | Factory reads `OPENAI_API_KEY`; absent configuration returns `LUNA_CONFIG_ERROR`. No key value or credential file was read. There is no production Search caller configuring the factory today. |
| Input bounds | Query 2,000 UTF-16 units; 24 candidates; 4 ambiguity alternatives; 8 temporal/passenger candidates per respective bound; 8,000 aggregate candidate text; 12,000 serialized context; 48 questions/batch. |
| Other dependencies | Zod 4.4.3, Temporal polyfill 0.5.1, application Google proxy; no translator or additional runtime Search model found. Native Codex Luna/Responsibility comparators are separate evaluation identities. |

Jev normally makes routing plus extraction/location-selection requests. “One interpretation” does not mean one Jev API request. Missing fields, daypart-only input, or poor grammar alone do not trigger another AI conversation. Eligible fallback reasons are `COMPLEX_QUERY`, Jev timeout/provider/invalid/schema failures, role/temporal conflicts, extraction binding unresolved, and location-candidate missing. Invalid input provenance, resource limits and Jev authentication failures block fallback. Code does not retry or escalate to another model family.

Luna outputs span aliases and a draft without authoritative geography. Application code reconstructs/validates candidate IDs and original spans, source assertions, alternatives and trusted-field conflicts. It cannot create user confirmations, fare quotes, bookings, payments or dispatches. The service attempts Luna at most once and returns deterministic resolution requirements on failure.

### Actual execution accounting

The source rows are the **131** saved records in `output/search-s5-authorized-development/live-development-source-any-strength-guard/rows.json` plus **91** new separated-stage records in `output/provider-resume-2026-10-07/rows.json`. They contain 222 distinct development IDs. The 48 later Places overlay rows retain the original parse hashes.

| Layer / event | Verified count | Interpretation |
| --- | --- | --- |
| Development Jev attempted cases | 222/222 | Zero unattempted cases. |
| Jev request attempts / completed validated batches in those 222 rows | 428 / 421 | Request counts, not case counts. Seven attempts lack a completed normalized batch; these must not automatically be called seven network failures. |
| Raw routing query-type accuracy | 222/222 | Saved aggregate’s raw choice metric. It does not validate pair compatibility. |
| Raw routing complexity accuracy | 207/222 | Saved raw metric; intermediate guarded complexity differs. |
| Validated intermediate query-type metric | 221/222 | Reproduced from cached predictions; one incompatible routing pair remains rejected. |
| `JEV_SCHEMA_ERROR` / `JEV_INVALID_RESPONSE` cases in parse issues | 1 / 14 | Normalization/schema/source-extraction failures; `JEV_INVALID_RESPONSE` is broader than malformed probability distributions. |
| Jev transport/auth error diagnostics in these retained parses | 0/222 | No `JEV_PROVIDER_ERROR`, `JEV_TIMEOUT` or `JEV_AUTH_ERROR` entries; the 91 separated-stage raw SDK failure arrays are also empty. This does not enumerate every historical preflight/run failure. |
| Cases recorded with raw validation/binding diagnostics | 24 | Saved `caughtRawValidationCases`: the 15 cases above plus 9 cases with extraction-binding diagnostics; not 24 authoritative unsafe outputs. |
| `EXTRACTION_BINDING_UNRESOLVED` issue entries | 14 | Across 9 cases; distinguish entries from cases. |
| Wrong endpoint-role observations / role-conflict cases | 8 / 10 | Saved aggregate diagnostics; guarded/pending, no authoritative selected-location adoption. |
| Original provider-stage partition after separated Jev resume | 124 complete + 50 Luna pending + 48 Places pending | Combined-provider pending and unattempted counts were zero in that saved partition. |
| Places continuation | 48/48 cases complete | 96 autocomplete calls plus 1 preflight; no Details/selection. |
| Current provider-stage partition | 172 complete + 50 Luna pending | Exact partition independently checked against all 222 IDs. |
| Luna development stage results | 0/50 pending cases executed | No Search development Luna completion receipt found. Earlier adapter/preflight results are not these stages. |
| Remaining Places stages before Luna | 0 | All 50 Luna rows retain `CONDITIONAL_AFTER_ACCEPTED_INTERPRETATION` for Places. Future actual calls UNKNOWN. |
| Offline adoption diagnostic | 174 accepted / 48 rejected | Saved guard diagnostic, distinct from 172 provider-stage completions. Neither number counts customer form adoptions. |
| Authoritative customer selections/submissions in reconciled cohort | 0 / 0 | No measured customer end-to-end safety pass. |
| Observed authoritative safety violations | 0 | Zero observed actions is limited evidence; does not prove complete selection/submission safety. |

The eight intermediate “location inventions” in the metric are **wrong-role assignments of source text to a role labeled absent**, not fabricated Google coordinates. All eight are retained in the raw/intermediate layer. The saved adoption layer reports zero adopted inventions, reversals, silent conflicting selections, canonical-ID bypasses or parser-created bookings; its selection/submission scope is nevertheless empty.

The `Delta 2` record is still `core-standalone-003`: raw `LOCATION_SEARCH` plus `SIMPLE` violates the contract requiring `NOT_APPLICABLE` for non-booking classifications. Current code rejects it as `JEV_SCHEMA_ERROR` and it remains in the Luna queue. It has not been fixed or reevaluated.

Historical direct Search Luna preflight `output/search-provider-continuation-2026-10-08/api-preflight.json` records one call, HTTP 429, zero retries, immediate stop, and retry-at `2026-10-10T21:47:09.558Z` / **11 October 2026 03:17:09.558 IST**. This is an expired historical wait, not evidence that the API works today. Older evidence also records a 6 October failed Search Luna preflight; an earlier S5 adapter preflight passed. None substitutes for the 50 pending development cases. Native Codex pilot/comparator success is not direct-API Search success.

### Cache and source identity

Cache identity requires `domain`, `datasetHash`, `caseId`, `inputHash`, `provider`, `model`, `configHash`, and `runNumber`; the key hashes ordered pairs of these values. Historical source/config variants are not interchangeable merely because their questions look similar.

The audit checked **1,685** combined `typesafe-ai+google_places` cache entries and **91** separated Jev-stage entries: all 1,776 stored keys/filenames match identity hashes, every case belongs to Search V1 development, and none belongs to held-out. These are historical cache entries across versions, not 1,776 current-case completions. All **50** pending input/parse hashes match the retained original inputs/results; all **48** Places previous-parse hashes match. The original Luna queue order is unchanged. Current Search sources match **36/36** final manifest hashes.

Useful execution identities: original source-any configuration `f4290b70c05e2efab1dde06021328e09ae576db38c0bb2a8862af08327dc6b34`; separated-stage configuration `651384d01918dfd64f46bd4906e165e1676fc73661f0c343e0ee4826c1081a9c`; historical source-manifest identity `c77064288ede005d600d446b628271d9699e66e94ea43e2073e20ba071ba423c`. The current V2.1 pending state hash is `3d0b5eb365897abad8a714b72bcb698d51f93a29642b5ad3df414eee6e226841`. These identify different layers; none is a final execution-contract freeze.

## V. Hindi/Hinglish status

The implemented lexicon recognizes `kal/कल`, `aaj/आज`, `parso/parson/परसों`; `subah/subha/सुबह`, `shaam/sham/शाम`, afternoon/night forms; `baje/bajey/बजे`; bounded numeral/Devanagari-digit clock forms, `saadhe` half-hours, approximate markers, and `abhi/अभी` with limited immediate-negation handling. Calendar support includes all seven named Devanagari weekdays, selected Romanized Friday forms, `agle/iss` qualifiers, and observed Hindi December spellings. It is not a full Hindi calendar or grammatical parser.

Unicode letter/mark/number boundaries, original JavaScript indices, protected candidate spans, named-place checks and context predicates prevent recognized temporal words from automatically replacing location evidence. `kal` is interpreted as future tomorrow only under the bounded supported context; past/uncertain context is not generalized. Case folding changes dictionary lookup, not original source text. The current tests include emoji/surrogate offsets and mixed-case temporal regressions.

Temporal meaning and booking readiness remain separate. A daypart does not invent a clock. `6 baje` can have a PM policy interpretation but lacks minutes; `TIME_MINUTE_REQUIRED` remains a form requirement. Conflicting AM/PM markers stay ambiguous; approximation needs confirmation. Calendar/year/timezone arithmetic and booking windows remain in the shared policies.

Remaining diagnostics are accessible at **`output/hindi-temporal-v2-2026-10-08/remaining-diagnostics.json`**, not the suggested casefold-directory path, which does not exist. The final report points to this earlier diagnostic lineage; the saved V2.1 replay proves unchanged derived metrics. The audit verified the saved metrics again without replaying inference.

| Remaining invalid/schema category | Cases |
| --- | --- |
| Malformed probability distributions | 4 |
| Temporal source binding | 1 (`hh-v1-added-040`) |
| Negative-vehicle source binding | 2 |
| Negative-sharing source binding | 1 |
| Incompatible query-type/complexity pairs | 5 |
| Total schema-stage-invalid | 13/80 |

There are **five additional local candidate grammar/resource failures**, distinct from those 13 invalid/schema cases. The sole temporal-binding failure is an English `tomorrow` plus conditional AC/passenger request whose simple route lets location text absorb temporal evidence; adding another Hindi time word would not address it.

The saved 50 endpoint errors comprise **23 pickup and 27 drop observations**. All 50 diagnostic entries have a nonempty expected original span and classify as `CANDIDATE_SPAN_COVERAGE_GAP`: the exact expected location was absent from the supplied candidate set. This supports prioritizing deterministic candidate coverage. It does not demonstrate that Jev would select the correct candidate if supplied, or that live Places would resolve it. Returned-draft provenance violations are zero; semantic errors still count.

No general translation/normalization layer is deployed. The prepared [A/B plan](../search/hindi-hinglish-normalization-ab-plan-2026-10-09.md) proposes B1 bounded original-source roles/negation first, then B2 auxiliary English rendering only if residual semantic deficits justify it. Both remain unimplemented. Translation would require a separately frozen original-span alignment contract and could never become authoritative original evidence.

The 20 purposive original/English semantic controls made 40 historical Jev requests. Original/English validity is **16/20 vs 15/20**, raw query type **19/20 vs 20/20**, and raw complexity **12/20 vs 12/20**, with identical complexity correctness by pair. On 12 SIMPLE controls, vehicle and exclusions improve **10/12 → 12/12**, pickup changes **11/12 → 10/12**, drop remains **9/12**, missing-field exactness changes **9/12 → 8/12**. This is mixed diagnostic evidence, not a general translation-quality gain or causal population result.

## VI. Booking-field accuracy

These tables describe different cohorts and scoring contracts. Search V1 uses labeled-field/state comparisons and endpoint denominators only where a role has a labeled nonempty span. Hindi reports exact endpoint/field behavior across **all 51 expected SIMPLE cases**, including provider/schema failures and roles expected absent. Its unsupported denominator is 52 noncomplex cases. The two benchmark percentages cannot be pooled.

### Search V1 development: cached intermediate versus provider-stage-complete subset

The all-222 metrics and the 172-subset metrics below were recalculated using the repository’s `searchPrediction` and `scoreSearchBenchmark`, exclusively from cached results and development labels.

| Field / metric | All 222 intermediate records | 172 provider-stage-complete subset |
| --- | --- | --- |
| Query type | 221/222 | 172/172 |
| Complexity | 208/222 | 172/172 |
| Exact pickup span | 149/177 | 130/130 |
| Exact drop span | 134/160 | 123/123 |
| Vehicle field | 216/222 | 172/172 |
| Timing mode | 209/222 | 172/172 |
| Source date representation | 210/222 | 172/172 |
| Source time representation | 214/222 | 172/172 |
| Passenger field | 222/222 | 172/172 |
| All flag fields | 222/222 | 172/172 |
| Positive vehicle-exclusion cohort | 25/31 | 23/23 |
| Resolved vehicle-strength cohort | 52/52 | 51/51 |
| Explicit-any vehicle cohort | 6/6 | 6/6 |
| Missing-field set recall | 280/334 required entries; 8 false positives | 238/238; 0 false positives |
| Ambiguity recall | 10/15; 19 false positives | 4/4; 0 false positives |
| Unsupported-request recall | 28/35; 0 false positives | 21/21; 0 false positives |
| Role reversals | 0/159 eligible pairs | 0/123 eligible pairs |
| Intermediate invention counts | 8 location-role, 0 timing, 0 passenger | 0 / 0 / 0 |

The 172-subset’s perfect labeled-field results are conditional on cases that completed without pending Luna; they do not estimate accuracy on all 222 or on production traffic. The previous 124-complete subset is superseded for completion counts, while its original metrics remain historical evidence. Offline adoption’s 174 accepted predictions are a separate diagnostic cohort.

Actual fallback invocation is **0/222**, including **0/24** labeled necessary fallbacks; the missing Luna execution makes fallback quality **UNMEASURED**, not a successful zero unnecessary-fallback rate. Candidate-recovery telemetry likewise cannot establish successful recovery before Luna runs. These cached source-expression metrics do not establish final local schedule readiness or geospatial accuracy.

### Hindi/Hinglish 80-case development diagnostics after V2.1

Recalculation exactly equals every field of the saved `after` summary, including targeted metrics and case diagnostics. All 80 saved raw transport-failure arrays are empty: the 13 invalid/schema cases are not 13 network exceptions.

| Metric | Result |
| --- | --- |
| Evaluated / schema-stage valid | 80/80 / 67/80 |
| Raw query type / raw complexity | 74/80 / 56/80 |
| Guarded output complexity | 52/80 |
| Exact pickup / drop | 28/51 / 24/51 |
| Vehicle | 43/51 |
| Timing mode | 46/51 |
| Source date / source time | 47/51 / 45/51 |
| Passenger field | 49/51 |
| Flags | 46/51 |
| Vehicle exclusions, including empty expected exclusions | 48/51 |
| Positive exclusion cases only | 0/3 |
| Negative vehicle/flag cases | 0/5 |
| Exact missing-field set | 22/51 |
| Unsupported-request exact set | 49/52 |
| Daypart preservation | 4/6 |
| Bare-hour PM policy interpretation | 5/5 |
| Bare-hour complete schedule resolution | 0/5 |
| Conditional routing containment | 8/8 |
| Changed-mind routing containment | 4/5 |
| Full alternatives/supersession correctness | UNMEASURED; pending Luna |
| Returned-draft provenance violations | 0/80 |
| Luna / Places / selections / submissions | 0 / 0 / 0 / 0 |

Ambiguous temporal source fields are scored for **AMBIGUOUS state only**; alternative values are not fully scored. Routing containment does not prove preservation of every alternative or superseded clause. The 48/51 exclusion headline is dominated by cases without positive exclusions; the focused 0/3 and 0/5 results are the relevant unresolved-negation evidence.

## VII. Places and user confirmation

The authority boundary still follows raw source → interpretation → application candidates → Places suggestions → explicit user selection → review/form resolution → explicit booking action. There are **zero model-callable tools**. The Luna request contains no tool definitions, and the dependency firewall excludes operational booking/payment/dispatch services.

The grounding code checks query/candidate identity, exact source text, role and form revision. Autocomplete sends the original candidate phrase with an application session token. Duplicate or malformed suggestion IDs fail validation. A single match remains `USER_SELECTION_REQUIRED`. Selection requires an offered ID and the current revision; Details must return the same authoritative ID and finite, in-range coordinates. The identity-refresh path supplies a replacement suggestion and requires a new explicit selection, with no automatic adoption of replacement coordinates.

`review.ts:92` checks candidate/query lineage against session snapshots before applying a selected place. Identical authoritative IDs or both identical coordinate axes produce `SAME_GROUNDED_ENDPOINTS`. Trusted registry entries cannot be silently rebound to different locations. Edits clear fare and final review; dependent route/location confirmation is invalidated. `formResolution.ts:22` requires booking intent, both grounded endpoints, a valid schedule when scheduled, actual fare/route recomputation, and explicit location/final review before `submissionAllowed` becomes true. Unsupported material semantics block; advisory passenger count and narrowly recognized soft AC preferences remain visible without inventing capability.

These are backend caller/trust contracts, not an exposed authenticated Search endpoint. A future endpoint must own the trusted review/session boundary; it must not accept client-fabricated “trusted” selections or confirmation state as authority.

The 48-case continuation independently checks as 48 `COMPLETE` rows with zero provenance issues, **96 location-search results, none confirmed**. The cached zero-network V2.1 Places proof preserves candidate spans/provenance. It is not a live Details/selection success measurement. Historical quota stops and the earlier selected-ID mismatch remain part of the evidence lineage. Deterministic ID-refresh support now exists; a full live selected-Details regression remains unverified.

The ordinary manual UI still contains unconditional `pickupCoords ?? PICKUP_FALLBACK` / `dropCoords ?? DROP_FALLBACK` payload expressions at `VehicleSelect.jsx:862`. The surrounding signed-quote checks limit what reaches creation, but these expressions cannot serve as the future NL geography boundary. No Search form-resolution gate currently protects that manual payload, because Search is not connected. Backend Search drafts can be edited without invoking booking creation; customer NL editing/adoption safety remains unimplemented and untested end to end.

## VIII. Benchmark integrity

| Artifact | Verified identity / execution state |
| --- | --- |
| Search V1 frozen dataset | `2c2a0d7099c4b65be9495d08d5049e72fb44b6d49f84b82c65dbaf643ca61296`; recalculated over frozen records. |
| Search V1 split | `aea66b52ac37ddea99d4bb1c2861d63c70c7e7a3e84f7946a9c0a1a5414ef5de`; 222 development / 98 held-out; split hash matches; cross-split template-family intersection 0. |
| Hindi/Hinglish 80 | `f69ddab81d97627d4acdd7a02f188367ef2f99c8993cbdb9b116e7564d9a7d6d`; full content hash matches. Original 40 plus added 40; now development/diagnostic, not independent held-out. |
| English control plan | Recorded `c27af4a9d8b57f691b6eb4d07cd26c6e7f57d1d86673a2fb3f509bd4533d9a48`; paired purposive development controls. This audit used their saved report, not a new inference run. |
| Independent-construction challenge | `805b1616083ce0ebae0b2c1146a0187bcf3915329c19b1df00655dfc5c7a3520`; full content hash matches; 18 cases, 6 families; execution `NOT_RUN`, approach lock pending. Agent-authored synthetic evidence, no independent human calibration. |
| Original S6 packet | `447920d9b26e161579bbae7d44c2f73b91a95e8c4cf0140f8922f2f281792a7f`; recomputed hash; 32 development-only traces retained. |
| Original S6 package | `e85d9dec14d137a37600b4a412cce6d5c74bdd507151128e642d50ec144af01a`; recomputed hash; `verifierExecuted: false`. |
| Current Search sources | 36/36 final pending-manifest source hashes match raw current file bytes. |
| Responsibility V5 preservation boundary | Freeze hash `e484afc4c7fa724ea29af6edd962c48b814dc73a10e4f4a5e33833ad26afbe75` matches; all 22 accepted source hashes match. No Responsibility evaluation rerun. |

Integrity checks only hashed the held-out/challenge payloads and inspected metadata/split identities. Their expected answers were not displayed, analyzed for implementation decisions, or executed. Metric recalculation uses development labels only. The audit found no held-out/challenge/verifier execution-receipt filenames in the relevant Search/language output roots and no held-out case identities in the 1,776 checked Search V1 caches. Current accessible status is **NOT RUN**, with the limitation that an unrecorded external execution cannot be disproved from these checkouts.

The frozen 80-case corpus still contains its original `scoredProviderCalls: 0` freeze-time metadata. That is not its current execution state: the later 80-case receipts and outputs prove execution. Similarly, older S5 summaries showing 130, 174 or 178 completed interpretations belong to different source/config versions. They must not replace the latest separated-stage partition or be summed as distinct cases.

The 9 October checkpoint contains some UTC timestamps on 8 October that fall on 9 October in IST. This is not evidence of a later hidden run. No Search-specific checkpoint newer than 9 October was located; the October 15 Git commit preserves prior Search work. Later Proofloop documents reaffirm that Search evaluations were not resumed, but they are not new Search measurement receipts.

The historical S6 engineering review reports 12 boundaries, 14 accepted/fixed findings, 0 rejected, 3 deferred, and no unresolved known static HIGH/CRITICAL findings. AI findings remain unmeasured. The temporal annex preserves the old package while describing changed deterministic sources; its presence does not complete independent verification. The current execution contract remains **NOT FROZEN**.

### Evidence access and portability

The original repository’s `.gitignore:96` ignores `/output/`; coverage artifacts are also ignored. `git check-ignore` confirmed both final Hindi and Search aggregate evidence paths are local ignored files. The Proofloop worktree does not have `output/hindi-temporal-casefold-2026-10-09` or `output/search-provider-continuation-2026-10-08`. Its identical tracked documents point to artifacts that it cannot access locally. This audit did not extract migration archives, copy private artifacts, or change ignore rules.

Principal local evidence:

- `output/provider-light-2026-10-07/provider-resume-manifest.json`: pre-inference identities/order and historical capability commitments.
- `output/search-s5-authorized-development/live-development-source-any-strength-guard/{rows,summary,receipt}.json`: retained original 131 cases.
- `output/provider-resume-2026-10-07/{rows,receipt,aggregate-development-audit,runtime-pending-manifest}.json`: 91 additional Jev cases and 124/50/48 reconciliation.
- `output/search-provider-continuation-2026-10-08/{places-plan,places-rows,places-receipt,api-preflight}.json`: actual Places continuation and API stop.
- `output/hindi-temporal-casefold-2026-10-09/{continuation-state,development-report-final,runtime-pending-manifest,quality-closure,replay-proof,replay-rows,places-replay-proof}.json`: final source-bound continuation.
- `output/hindi-temporal-v2-2026-10-08/{remaining-diagnostics,hinglish-contract-replay,english-control-report}.json`, `evaluation/evaluation-receipt.json`: linguistic decomposition and accounting.
- `docs/search/s6-development/{verifier-input,verifier-package,engineering-review}.json` and `hindi-temporal-annex-2026-10-09.md`: retained S6 evidence.

## IX. Outstanding problems, in priority order

| Priority | Type | Exact remaining problem / verification gap |
| --- | --- | --- |
| P0 — before any customer enablement | Integration / authority | No NL endpoint, trusted session composition, customer draft adoption UI, or browser submission-gate coverage. The manual coordinate fallbacks cannot become Search authority. Hosted revision/configuration remains UNKNOWN. |
| P0 — before signoff | Missing evidence / provider availability | 50 direct-API Luna stages, conditional post-Luna Places, live explicit selected Details, full development safety/quality/fallback metrics, S6 independent verifier and execution freeze are incomplete. Current quota/availability UNKNOWN. |
| P1 | Deterministic candidate implementation | Hindi/Devanagari/Romanized role and prefix/suffix coverage: 50 missing expected endpoint observations; five local candidate failures. Reuse existing labels; distinguish generator coverage from subsequent model choice. |
| P1 | Deterministic source assertions | Negative vehicle/sharing forms: two vehicle and one flag schema failures, 0/3 positive exclusion correctness, 0/5 negation-field correctness. Preserve generic SUV exclusion semantics and original polarity. |
| P1 | Model quality / strict schema | Four malformed probability cases and five incompatible route pairs in Hindi; `Delta 2` incompatible pair in Search V1 remains. Do not relax schema/tolerance to manufacture a pass. Distinguish Jev routing failures from application source recognition. |
| P1 | Model quality / missing labels or outcomes | Alternatives, explicit corrections, supersession, complex unsupported requests and source-role ambiguity need actual fallback outcomes and explicit scoring of values/provenance, not containment/state-only scores. |
| P1 | Deterministic policy / UX | Exact missing fields only 22/51; dayparts 4/6; source timing gaps remain. Preserve omitted minutes and exact-time confirmation. Bare-hour schedule 0/5 is an intentional unresolved component under current policy, not permission to invent `:00`. |
| P2 | Evaluation completeness | Distinct all-case raw/intermediate/adoption/selection metrics, current-source coverage, calibrated fallback criteria, provider usage and end-to-end latency; monetary pricing inputs absent. Historical perfect subsets do not close these gates. |
| P2 | Missing independent evidence | Search 98 held-out and language 18 challenge are unexecuted; challenge is synthetic without human calibration and is gated on a locked language approach. Keep them sealed until development/review gates pass and separate execution is authorized. |
| P2 | External / review dependency | Current-source S6 independent review, disposition of deferred findings and any resulting source changes require preserved package lineage and revalidation. Static zero known HIGH/CRITICAL is not AI signoff. |
| P2 | Evidence availability | Ignored output is available only in the original checkout for the key continuation directories. Preserve verified local access before switching worktrees; no automatic archive/import action is implied. |
| P3 — conditional scope | Product extension | General translation and full stop/return/rental booking support are not silently required fixes. Translation is conditional on B1 residual evidence; stop booking is a separate planned product capability. |

## X. Recommended next steps

This is a proposed sequence only; none was started. Provider estimates are request counts rather than money: no authoritative versioned pricing is configured, and this audit made no pricing/provider requests. Changed provider inputs must get new identities; unchanged saved successes must not be repeated merely to refresh a count.

| Task | Objective and exact source area | Reuse / required validation | Provider calls and cost exposure | Completion criteria / dependencies |
| --- | --- | --- | --- | --- |
| 1. Repair bounded role/candidate and negation recognition | B1 development version in `locations/candidates.ts`, `requestPrefix.ts`, `bookingTail.ts`, `observations.ts`, `vehiclePolicy.ts`; extend `complex/evidence.ts` only where its source assertions need the same recognition. | Reuse 80 development cases, 20 controls, 50 role-error entries, existing Hindi/candidate/vehicle tests. Add source-span, Devanagari/postposition, protected-place, polarity/scope and resource-bound tests. Reconcile five local failures and distinguish supported grammar from unresolved input. | Start with 0 provider calls. Saved inputs whose complete request identity still matches may be replayed later; changed inputs need fresh Jev stages. A full 80-case two-stage pass is at most 160 Jev requests before early stops; changed subset size UNKNOWN. Luna/Places remain separate. | Measured increase in exact candidate coverage and correct negation without source/provenance regressions, no weakened guards, source-bound quality closure. Requires authorization for implementation; no held-out labels. |
| 2. Reconcile development quality and lock the language approach | `parser.ts`, `extractor.ts`, `questions.ts`, temporal policies, diagnostic scorer and A/B plan. Diagnose malformed probabilities, incompatible route pairs, missing-field accuracy and residual temporal binding. | Reuse immutable raw responses and current baseline metrics. Add explicit alternative/supersession scoring; separate unsupported semantics, model decisions and deterministic recognition. Preserve bare-hour minute requirements; seek a product decision only if changing that policy. | 0 for offline diagnosis/scoring. Fresh changed-input Jev calls determined by identity audit. B2 translation calls are **not** assumed; if justified, define and budget a separate experiment first. | Every residual failure categorized; no silent alternative/negation loss; approach explicitly locked for independent challenge. Depends on task 1 evidence. |
| 3. Resume the preserved production-equivalent development queue | `complex/luna.ts`, `complex/service.ts`, separated development orchestration and existing pending manifests. Do not rewrite the original queue or overwrite old receipts. | Reuse all 50 verified pending inputs/parse hashes and original order; determine whether task 1–2 changes invalidate any inputs. Retain raw failures and stop at first 429; run source/schema/trusted-conflict checks after each accepted result. | One small availability preflight, then up to **50 Luna interpretation attempts** for the unchanged queue; nominal output cap 204,800 tokens across those 50, excluding preflight/reviewer. Conditional Places calls depend on accepted outputs, up to two endpoint autocomplete requests per case for ordinary journeys, not a measured requirement. Additional language-cohort Luna count UNKNOWN. | Full actual stage outcomes, no stale-cache substitution, no inferred combined-provider completion. Depends on authorized provider budget and current availability; source/config identity must be frozen for this run. |
| 4. Close live Places selection evidence | `locations/places.ts`, `grounding.ts`, `review.ts`, `googleAPI.js`, `googlePlaceIdentity.js`. Verify ordinary Details and provider-bound identity refresh with explicit reselection. | Reuse cached suggestions/provenance, fake provider identity tests, quota/error recovery cases. First define the smallest representative development selection cohort and measure actual ID/coordinate/role behavior; avoid pretending that 96 autocomplete results were confirmed. | Cohort not yet specified, so exact count UNKNOWN. At least one Details request per selected endpoint; expired sessions/IDs may require fresh autocomplete, and ID refresh may require another explicit selected Details call. | Recorded user-choice boundaries, correct session/query/revision binding, no canonical-ID bypass, all failures fail closed. Depends on Places availability and approved test scope. No customer booking submission needed to test adapter selection. |
| 5. Complete S6 and freeze the execution contract | `backend/benchmarks/search/toolAudit.js`, verifier packaging/orchestration, `docs/search/s6-development`, current temporal annex. | Preserve original 32-trace package. Prepare a separately identified current-source supplement/version, explicit reviewer transport/receipt, strict packet/capability/trace validation and finding dispositions. Reuse source-bound offline safety/quality proofs; rerun changed-source checks only as warranted. | Typically one independent API review attempt per frozen packet; exact configuration/token budget must be specified first. No existing successful verifier run can be reused as signoff. | Current-source review and dispositions complete, full development metrics/calibration and cost/latency accounting available, objective gates pass, execution identities frozen. Depends on tasks 2–4; no model-callable tools added without separate justification. |
| 6. Build customer integration behind an off-by-default control | Add a trusted backend composition/session boundary and connect landing/search to `BookingFlow`, `OnBoarding`, `VehicleSelect`; reuse `formResolution` and existing authenticated signed-quote creation. | Fake providers for initial browser tests. Validate mobile/desktop entry, field corrections, missing/ambiguous/unsupported states, stale requests, Places reselection, fare recomputation and explicit review. Prove no submission from interpretation and no fallback coordinates for NL drafts. Apply `rcs-ui` when implementation is authorized. | 0 provider calls for mocked integration. Live acceptance scope/calls require a separately bounded plan. | Working editable prefill and gated explicit confirmation in browser, trusted server authority, scoped tests/build and visual verification. Can be developed off after source contracts stabilize; enablement depends on all quality gates. |
| 7. Execute independent evaluations, then consider S7 | Frozen Search 98 and separate language challenge 18, followed by controlled rollout review. | Keep labels sealed during development. Verify frozen identities, prerequisites and leakage; run once under separately authorized execution plans; report failure before making any follow-on tuning decision. Challenge requires locked approach plus production-equivalent Luna/Places safety prerequisites. | For 98 Search cases, at most 196 Jev stages before early stops plus unknown Luna/Places/selection calls; for 18 challenge cases, at most 36 Jev stages plus unknown fallback/Places calls. These are planning ceilings for the two-stage parser, not authorization or cost quotes. | Independent metrics and reversals reviewed, language/full-system gates pass, deployed revision/config inspected, separate explicit rollout authorization. Depends on tasks 1–6 as applicable. |

The smallest sensible next implementation prompt is tasks **1–2’s offline B1 diagnosis/repair**, with strict preservation of frozen labels and no automatic provider resumption. The existing 50-case queue should be consumed only after checking whether that source change alters its exact execution identities. Customer wiring is substantial outstanding product work even if backend evaluations pass.

## XI. Preservation and verification summary

### Commands and checks actually executed

The command families below summarize the actual invocations and scoped inline programs; none of the historical runner/freezer scripts was executed.

- `Get-Content -LiteralPath <attached Pasted text.txt>`; both root `AGENTS.md` files; scoped reads of owner policy and small test/module files.
- `git status --short` / `git status --porcelain=v1`, `git branch --show-current`, `git worktree list`, `git log ... -- backend/services/search docs/search backend/benchmarks/search`, `git rev-parse HEAD`, and corresponding `git -C <Proofloop checkout>` reads.
- `git diff --stat HEAD..codex/phase9d1-custody-local-20261016 -- backend/services/search backend/benchmarks/search docs/search`; scoped `git diff --summary` and `--numstat`; `git show --stat --oneline 5a46690 -- ...`; `git check-ignore` on the two local evidence paths.
- Scoped `rg --files`, `rg -n`, `Get-ChildItem`, and `node tools/token-guard/read.mjs outline|read <path> <start> <limit>` for code, historical Search documents, test coverage locations, output names and composition-root searches.
- Read-only inline Python programs for working-tree counts, byte comparison, selected JSON summaries, cache-key recomputation, source-file SHA-256 and evidence-access checks. Results: 36 service + 14 benchmark + 61 document + 54 test files identical between trees; 36/36 final Search source identities matched; 1,776 Search cache identities checked with zero invalid keys/foreign development identities/held-out IDs.
- Read-only inline Node programs using `fs`, `crypto`, `searchPrediction`, `scoreSearchBenchmark` and the pure diagnostic `summarize` helper. Results: all-222 and complete-172 metrics recalculated; 80-case final summary reproduced exactly; 50/50 pending input/parse hashes, 48/48 previous-parse hashes, queue order and 172/50 partition verified; dataset/split/S6 hashes reproduced; 22/22 Responsibility freeze source identities matched. No parser/provider inference replay or frozen trace execution.
- In `backend/`, with `TSX_DISABLE_CACHE=1`: `node --import tsx --test --test-reporter=dot tests/rideSearchArchitecture.test.js tests/rideSearchS4Architecture.test.js tests/rideSearchHindiTemporal.test.js tests/rideSearchS3Grounding.test.js` — **26/26 passed**, exit 0. These are static/pure/fake-provider tests, not live-provider or browser acceptance.

Some initial PowerShell `rg` invocations used unexpanded wildcard paths and reported path errors; relevant sources were then inspected through explicit paths/scoped glob filters. One initial Python JSON read used the Windows default codec and was repeated with UTF-8. Broad directory/status output and two attempted in-memory preservation summaries were truncated and narrowed. No failed read was treated as positive evidence, and none of those attempts wrote a file.

No frontend build, full backend test/typecheck campaign, captain-app lint, Docker campaign, browser/simulator session, fresh coverage run, or mutation run was performed. The archived **1,559-test**, 100% scoped coverage and **408 killed / 13 equivalent / 1 detected timeout** temporal-quality results belong to the saved V2.1 closure; they are not new audit executions. Source identity matches support reuse of their stated scope only.

### Files and Git state

The only file intentionally written by this audit is this new document:

`docs/benchmarks/search-v1-hinglish-resumption-audit-2026-11-01.md`

No source, fixture, historical report, manifest, cache, frozen trace, expected answer, ignore rule, branch, commit or staged content was changed by this audit. No reset/clean/checkout/merge/cherry-pick/commit/push occurred. No API key, operational customer/captain data or credential contents were inspected or printed.

The original checkout’s status increased from 177 entries at the initial inspection to 180 before this report was created: three unrelated untracked entries appeared under `legal-review/2026-11-01-audit/`, `legal-review/RCS-Travels-Legal-Documents-Lawyer-Review.txt`, and `tools/legal-audit/`. This audit did not create those paths. They were preserved. Final checks show the original HEAD remains `2ff51e7`, with **181 entries: 23 staged, 96 unstaged, 62 untracked**, including this report. The Proofloop checkout remains at `8cb24fd`, with **1,719 entries: 0 staged, 1,582 unstaged, 137 untracked**. Excluding only this report, both status-list hashes match the pre-write snapshot. All six protected file-byte hashes (three frozen datasets, S6 packet/package and Responsibility freeze manifest) are unchanged.

### Unavailable or unestablished evidence

- The suggested final-directory `remaining-diagnostics.json` is absent; the actual V2 diagnostic file is accessible at the location documented above.
- Key ignored Search final-output directories are absent from the Proofloop worktree. Their availability in a remote clone or cloud continuation is UNKNOWN.
- No completed S6 independent-verifier output, final Search execution freeze, Search held-out/challenge execution receipt, or customer NL browser adoption/submission evidence was found.
- Current external provider availability, authoritative prices, hosted revision, deployment environment and production runtime behavior remain UNKNOWN.

**Audit complete. Implementation and provider evaluation remain stopped pending review.**
