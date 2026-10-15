> Current owner policy override (2026-10-06): see [Search owner decisions](search-owner-decisions-2026-10-06.md). Historical unresolved-year/weekday/timezone/SUV statements below are superseded. ?Follow-up?, ?ask? and ?clarification? mean deterministic form resolution, never a conversational AI loop. Stops are a planned product feature, currently blocked at submission.

# Search S4 — Luna fallback

**S4 COMPLETE.** Implementation is additive to the signed-off S1/S2/S3 contracts. Responsibility/Phase 8 is unchanged. Customer natural-language search is not deployed. S5 has not started.

## Architecture

`query → existing S2/S3 Jev pipeline → deterministic eligibility → one Luna interpretation → source/candidate/scalar validation → same BookingDraft → S3 immutable session replay → Places suggestions → explicit selection → shared follow-ups → user review`

The entry point is `createSearchInterpretationService`. The interpreter is injected through `ComplexBookingInterpreter`; the production adapter factory is `createProductionLunaInterpreter`. No endpoint, frontend, job, booking/payment/dispatch or responsibility composition root imports the S4 service.

## Model and transport

- Exact model: `gpt-6-luna`, verified against [the official model page](https://developers.openai.com/api/docs/models/gpt-6-luna).
- Installed SDK: `openai@7.10.0`; Responses `parse`, `zodTextFormat`, strict Structured Outputs, reasoning `low`.
- Schema: `ride-search-luna-v1`. Transport semantic fields reuse `bookingDraftSchema.shape`; locations are span aliases. Application code supplies the candidate array and validates the complete existing `BookingDraft`.
- One interpretation attempt; SDK retries zero; maximum 15 seconds; abort propagation; maximum 4,096 output tokens; existing 12,000-character provider-context bound. No model alias or alternate-provider escalation.
- Configuration: existing `OPENAI_API_KEY`. Missing configuration returns `LUNA_CONFIG_ERROR`. Secrets and raw provider messages are never returned.
- A search-owned SDK client avoids the legacy shared client's unbounded in-memory RPM wait, which would defeat the timeout. This service is not customer-wired; production rate/abuse limits remain a rollout requirement.

## Fallback eligibility

| Condition | Luna | Reason |
|---|---|---|
| Missing pickup/drop/time/vehicle only | No | Ask only for missing information. |
| Complex query | Once | Interpret without adding product capability. |
| Jev timeout/network/provider failure | Once | Language interpretation can continue independently. |
| Invalid bounded answers/schema/roles/temporal binding | Once | Attempt interpretation, then independently validate. |
| Missing location candidate | Once | New exact source spans can recover generator misses. |
| Jev authentication/permission failure | No | Credentials/access are not a language problem. |
| Invalid provenance/resource limit | No | Reject unsafe input without amplification. |
| Google failure, quota, details error, no match | No | Preserve text and use grounding follow-up. |
| Missing authoritative registry for an existing trusted location | No | Request review context; never fabricate geography. |
| Omitted year/weekday/non-IST/SUV-family policy ambiguity alone | No | Preserve unresolved product policy. |
| Unsupported service alone | No | Preserve unsupported request; do not invent capability. |

No probability threshold is introduced. A failed Luna attempt returns structured degradation and the original safe simple result. Structured booking remains independently available.

## Provenance and trusted state

All generated source references belong to the exact query ID/revision/text. Location slices use zero-based UTF-16 offsets with exclusive end and cannot split a surrogate pair. New spans use `LUNA_SOURCE_SPAN`; their IDs hash query identity, generator version, span and text. Existing exact spans reuse S3 IDs. Unknown aliases, collisions, invalid spans, model-generated `USER_FIELD`/`USER_SELECTION`, place IDs and coordinates are rejected.

Valid source spans are necessary but insufficient for scalar facts: existing deterministic observations also validate vehicle categories/exclusions/strength, passenger counts, dates, time expressions and flags. Missing AM/PM, year or exact daypart time remains unresolved. Recognized unsupported clauses are retained even when the model omits them. Unknown unsupported interpretations degrade to clarification rather than being accepted as facts. This is intentionally conservative; novel phrasing needs S5 measurement.

Safe same-query partial extraction survives an unspecified model field. Explicit user edits and trusted grounded selections are replayed through the S3 session and win over model values; conflicts remain observable. Display-only selection IDs require an authoritative review registry. Previous query snapshots, temporal anchors and user edits remain immutable. `interpretationSnapshot` preserves raw validated interpretation; public `parse.draft` and `draft` expose the effective reviewed value. New query revisions merge through the existing S3 history/invalidation rules.

The optional `currentQuery` fence compares exact query identity before and after interpretation/grounding; an abort signal cancels SDK work. Late results are discarded. Existing session and Places-selection guards provide an additional revision barrier.

## Geography, follow-ups and unsupported requests

All new locations use the existing S3 Places provider, Google proxy, session lifecycle, suggestions and explicit detail selection. No first-result auto-selection is added. Standalone locations use the explicit active field; without one, `LOCATION_TARGET_REQUIRED` remains required. Trusted saved/current/map/Google selections are retained without new Places calls.

Follow-up ordering and fare/route/location-confirmation invalidation are reused from S3. Stops, return journeys, rentals, AC preferences, passenger enforcement and conditional preferences remain unsupported; interpretation does not enable booking them. Multi-stop/conditional requests retain those clauses and require review.

## Telemetry and S5 boundary

Returned safe telemetry includes original fallback reasons, attempts, schema failures, trusted conflicts, new source-span count and generator-miss recovery, plus provider/model/schema, request count, latency and token usage when exposed. No inferred price, raw credentials, hidden reasoning or sensitive logging is added.

Harness routes: `JEV_SIMPLE`, `LUNA_COMPLEX`, `LUNA_PROVIDER_FALLBACK`, `FOLLOW_UP_ONLY`, `UNSUPPORTED`, `UNCLEAR`. Deterministic cohort labels remain separate from provider input. These results do not establish live Jev/Luna accuracy or calibrated fallback thresholds.

## Live preflight

One optional Luna request executed using the configured development credentials: exact model, Responses, strict output accepted; latency 8,580 ms; input 7,857 tokens; output 296 tokens. This proves account/adapter compatibility only. The later 4,096 output-token cap is covered by offline transport assertions. Jev and Google live preflights were not run. The full live benchmark remains S5 work.

## Validation status

Measured against the final implementation on 2026-10-04:

| Check | Result |
|---|---|
| Focused S4 | 81/81 PASS |
| All search / S2–S3 regression | 352/352 PASS |
| Full backend | 1,229/1,229 PASS |
| Scoped c8 statements / branches / functions / lines | 100% / 100% / 100% / 100% |
| Backend typecheck / scoped ESLint | PASS / PASS |
| Cyclomatic / cognitive maxima | 18 / 18; both <22 |
| Halstead difficulty maximum | 30.293; <80 |
| CRAP maximum | 18; <25 |
| Source file maximum (all 11 material files) | 222 physical lines; <500 |
| Duplicate scan (26 search source files; 5 lines / 60 tokens) | 0 clones |
| Explicit any / explicit unknown introduced | 0 / 0 |
| Dead source / redundant clones introduced | 0; scoped symbol/dependency inspection, lint and full function coverage |
| git diff --check / new-file whitespace inspection | PASS / PASS |
| Mutation final source inventory | 1,234 total; 1,171 killed; 14 timed out; 49 surviving; 0 uncovered |
| Equivalent/non-actionable survivors / meaningful survivors | 49 / 0 |

The source hashes, replay procedure and all 49 survivor justifications are in [search-s4-mutation-signoff.md](search-s4-mutation-signoff.md). Detailed machine reports remain under `backend/coverage/search-s4/`; mutation IDs are namespaced across independent campaigns and never double-counted. The final coverage run itself passed all 352 tests. No database, migration, frontend, live Jev/Google or full live benchmark was required or run for S4.

Validation found and corrected S4-specific defects: new span aliases were initially rejected; safe partial fields could be lost; a proposed location span could mask timing/unsupported observations; missing timing could be labelled ambiguous; and partial input could carry foreign query refs. Their regressions now pass. No unrelated production subsystem was changed.

## Files changed

- Added production: `backend/services/search/complex/{contracts,eligibility,evidence,locations,luna,service,trusted}.ts`.
- Added a parsed-draft grounding seam in `backend/services/search/locations/service.ts`; exported existing direction validation in `backend/services/search/validation.ts`; extended the parse-route type in `backend/services/search/parser.ts`; mapped installed Jev authentication/permission errors in `backend/services/search/provider.ts`.
- Added 13 `backend/tests/rideSearchS4*.test.js` files: AdapterFinal, AdapterMutations, Architecture, BoundaryFinal, Cohort, EvidenceFinal, EvidenceMutations, Luna, RoutingMutations, Service, Trusted, TrustedMutations, Validation.
- Added `backend/tests/helpers/rideSearchS4Fake.js` and `backend/tests/fixtures/rideSearchS4Fallback.js`.
- Added this validation document and `docs/search/search-s4-mutation-signoff.md`. Isolated replay/build helpers and logs are validation scratch artifacts under `output/search-s4-validation-scratch/`, not production modules.

The legacy `backend/services/AI/bookingParser.ts` is unchanged and remains unwired. Existing production customer booking, Places, fare calculation, payment, dispatch and responsibility composition roots remain unchanged.

## Unchanged decisions and blockers

Omitted-year, weekday, non-IST and SUV-family exclusion policies remain unresolved. They do not block S5 fixture/benchmark development but block customer rollout for affected semantics. S5 live quality evaluation, fallback calibration, customer integration, rate controls and rollout review remain required. The legacy nullable booking prototype remains unchanged and unwired. Terra, translation and automatic submission are absent.

Phase 8 responsibility benchmark remains INCOMPLETE. It blocks neither S4 nor S5 search work; it still blocks responsibility Jev dual-shadow and responsibility auto-adjudication.
