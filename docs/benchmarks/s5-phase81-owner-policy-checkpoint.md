# Search S5 / Responsibility 8.1 / Search S6 preparation checkpoint

Date: 2026-10-05. This is an incomplete development checkpoint, not evaluation signoff. Neither held-out benchmark, Search rollout, responsibility dual-shadow nor auto-adjudication ran. No production responsibility services, schema, finalization or consequence writers were changed.

## Search S5

The exact original 178 independently certified cases are human-approved as `APPROVED_AS_SPEC_DERIVED_CLASS`, with original label hashes bound to the product-owner receipt. Their labels are unchanged. P2 omitted-year, P3 weekday qualifiers, P4 timezone conversion and P5 SUV-family exclusion are frozen product decisions. The benchmark overlay applies them to the 21 former policy-only records and preserves old/new truth in an audit. These deterministic policy-derived proposals do not falsely inherit approval as members of the original 178-case class.

Review burden is now **121 core cases / 19 families**, down from 142 / 23. Five additional required/excluded SUV contradiction records use the frozen P5 family context but remain ambiguous and review-required. Forty Hindi/Hinglish records are exploratory and unscored. The proposed split remains **222 development / 98 held-out**, with no family leakage. Current proposal hash: `ac38649bef3448b14e2e23bbf341a68bdfd586c672225b81384d6655fca3ea3e`. The dataset is not frozen.

Start with [the compact family review](../search/benchmark-v1/owner-policy-v2/FAMILY_REVIEW.md). Highest-risk families cover nontrivial/repeated direction, unsupported stops/returns/rentals, conditional destinations, conflicting times/preferences and corrections. Each heading gives representative queries, deterministic context, the fields requiring judgment, recommendations/alternatives and IDs for exceptions. Full labels, approval ledger and policy audit are adjacent JSON artifacts.

Five next-Friday records retain unscored resolved dates because the existing application has no calendar-week origin. The owner-approved qualifier semantics are retained; no hidden Monday/Sunday convention was inserted. Omitted-year December 5 fixtures are understood but outside the 168-hour booking window. London fixtures retain source time/date and ICU-derived conversion, including IST midnight rollover. The existing production temporal/vehicle parser still needs policy integration and edge verification; this overlay is not a claim of a completed general timezone resolver or a production parser change.

Search-specific Jev preflight: **PASS**, four real requests across two new synthetic queries. The partial booking stayed SIMPLE with missing time left for follow-up; standalone location stayed LOCATION_SEARCH. SDK 0.6.0; response model `jev-1.13.0`. Routing/extraction latency observations were 873/329 ms and 334/330 ms; these two examples do not establish latency distributions or accuracy. Provider-reported totals: 4,421 input tokens, 1,255 output tokens. No Luna or Google calls occurred in this preflight. No labels were sent to the model.

The earlier Google canonical-ID preflight remains PASS: one autocomplete, explicit selection, refresh suggestion without accepted coordinates, explicit reselection, matching authoritative details. No new Google call was needed. Search Luna's previous adapter preflight remains separate from the new responsibility requests. No final Search benchmark or threshold calibration ran.

A final fixture audit discovered and corrected a benchmark-only midnight offset bug: the London 23:00 record initially advanced the IST date by one extra day. Full local calendar date/time now participates in the ICU offset calculation. `core-ambiguity-conflict-014` is the only corrected proposed expectation; the 178 approved labels are untouched. `revisions/pre-london-midnight-fix.json` and `resolution-fix-audit.json` preserve the old proposal/hash and exact correction. This was not a provider disagreement or a production defect.

Artifacts: `docs/search/benchmark-v1/owner-policy-v2/`, `output/search-s5-development/jev-preflight.json`.

## Responsibility Phase 8.1

Installed SDKs remain TypeSafe 0.6.0 and OpenAI 7.10.0. The new development-only Jev experiment uses eight categorical choice questions, including seriousReliabilityFailure, aggravatingEvidencePresent and ordinaryDriverFailure. It retains confidence diagnostically, adds no uncalibrated probability threshold and sends only normalized evidence. No production analyst was replaced. Configuration/question hashes and a separate cache namespace retain reproducibility.

Executed **113 new Jev development responses**. Luna reused **33 validated successful cached responses** and made **three new attempts: two successes, one rate-limit failure**. Successes now cover 19 LEVEL_0, 14 LEVEL_1 and 2 LEVEL_2 cases; classifications cover driver 16, platform 9, external/uncertain 10 and waived **0**. Coverage remains inadequate for final calibration. OpenAI funding/API access is freshly confirmed by the two gpt-6-luna successes.

The fresh failure was reported as **TPM**, numeric limit 100,000, Retry-After 17,419,000 ms (~4.84 hours). Requests were serialized/paced; this pass did not trigger another uncontrolled RPM loop. The runner stopped instead of retrying earlier than the server hint. Prior 65 RPM / 12 RPD failures remain historical observations, not the explanation for this fresh failure. Retry logic has bounded requests, attempts and delays; daily quota/auth/model failures open a circuit, poison schema cases do not starve later valid cases. Future retries receive new attempt identities; successes are reused and failed attempts remain auditable. [Official rate-limit guidance](https://developers.openai.com/api/docs/guides/rate-limits) distinguishes temporary retry delays from errors requiring account action.

### Comparable development cohort: 35 successful cases for all three candidates

| Candidate | Classification accuracy | Conditioned level accuracy | Raw false LEVEL_2 | Unsafe simulated upholds before factual guard | Unsafe simulated upholds after factual guard |
|---|---:|---:|---:|---:|---:|
| Original ordinal Jev | 33/35 (94.29%) | 31/35 (88.57%) | 4 | 0 | 0 |
| Evidence-aware Jev | 33/35 (94.29%) | 33/35 (94.29%) | 0 | 2 | 0 |
| Luna bounded baseline | 32/35 (91.43%) | 32/35 (91.43%) | 0 | 1 | 0 |

False DRIVER_CAUSED is zero for every candidate on this common cohort. These are synthetic development results, not human-final or held-out evidence. The full 113-case evidence-aware run had three unsafe simulated upholds before the separate guard, caused by understated seriousness in documented conflicting-commitment cases. Both original rows and unguarded metrics remain preserved.

The benchmark-only factual guard requires review for affirmative conflicting-commitment/deliberate-unavailability facts or reported aggravation, independently of the model's severity answer. It uses factual evidence fields/IDs, never truth labels or incident-name heuristics, and applies identically to every candidate. This is a separately versioned development postprocessing comparison, not a production policy change or a rerun of cached provider inference. The new guarded Jev result sends **35/35** common cases to review: review recall 14/14, safe-uphold recall **0/2**, precision undefined because there are no upholds. Ordinal/Luna retain safe-uphold precision 2/2 on this common cohort. Safety was not traded for automation coverage, and operational limitations remain explicit.

Five-run consistency on seven development cases reused seven original responses and made 28 additional Jev calls. Classification and review consistency were 7/7 (100%); level consistency was 6/7 (85.71%). Deliberate-unavailability seriousness still varies categorically. The original ordinal instability also included score variance around its 1.5 cutoff. No arbitrary review-band boundaries were added; the evidence-aware severity design is **not frozen**.

New evidence-aware latency p50/p95: 333/421 ms across 113 requests; reported input/output usage: 263,795 / 42,107 tokens. New Luna successful-request observations: 2,819 and 5,706 ms, 2,544 / 120 input/output tokens. Failed-request token usage is unavailable. Historical ordinal observations are labelled historical, not new live calls. Monetary cost is not computed without versioned authoritative pricing inputs.

Decisions discovery: model listing PASS, no Decisions-named model and no `decisions` SDK resource. Usable API contract **NOT EXPOSED**; account entitlement **UNKNOWN**; benchmark NOT RUN. No endpoint or request schema was invented. This does not block all Jev/Luna development.

Real human-final cohort: **0**. Severity/config freeze, adequate Luna development coverage and mutation signoff remain held-out prerequisites. No held-out inference ran.

Artifacts: `output/phase81/evidence-aware-development/{receipt,rows,summary,guarded-rows,guarded-summary,consistency-rows,consistency-summary,account-discovery}.json`.

## Search S6 preparation

[Tool inventory and AI-verifier design](../search/search-s6-tool-audit-preparation.md) are ready. They explicitly apply [Anthropic's tool-design guidance](https://www.anthropic.com/engineering/writing-tools-for-agents). Proposed model-callable tools: **none**. Jev and Luna remain application-orchestrated inference; candidates, identity/span checks, temporal conversion, service support, validation and merges remain deterministic. Google autocomplete/details remain application-orchestrated, followed by explicit user selection. Model-controlled Google Places: **NO**.

The preparation defines namespace/schema/description boundaries, concise domain outputs, redacted recoverable failures, development-only trace review and a strict advisory AI-review shape. Engineering review is required for every AI recommendation. Tool-definition payload is zero because no callable definitions are registered; provider inference usage is measured separately. No final S6 evaluation or AI-verifier execution ran.

## Validation / signoff limitations

- Full backend after the arithmetic fix: **1,326/1,326 PASS**. Final focused changed-module tests: **22/22 PASS**, including a subsequently added host-timezone portability test.
- Five changed evaluation modules: **100% statements/branches/functions/lines** (259 statements, 187 branches, 22 functions, 259 lines).
- Backend typecheck, scoped lint, complexity/CRAP limits, duplicate scan (zero clones) and diff/owned-source whitespace checks: PASS. Max source LOC 105; cyclomatic 19; cognitive 12; Halstead difficulty 27.696; CRAP 19.
- Initial new-scope mutation report: **576 total, 459 killed, 114 survived, 3 timed out**.
- Follow-up witness/new-cache report: **366 total, 279 killed, 39 survived, 48 timed out**. Reports overlap and are not additive. Additional targeted assertions were added after the witness snapshot; no unexecuted witness is claimed as killed.
- Corrected midnight arithmetic slice: **46 total, 43 killed, three survived, no timeouts**. A separate six-mutant host-timezone witness killed all six, including the portable-timezone survivor. The remaining two narrow-slice survivors remove padding characters from PM hours that are already two digits for every admitted immutable fixture; they are equivalent for this fixed-clock PM-only derivation, which is not a general production timezone resolver. These narrow results do not complete broader mutation signoff.
- Broader responsibility reconciliation is **INCOMPLETE**: 2,663 exact-source witnessed kills, 144 pending meaningful-review entries, 762 old-source entries needing reconciliation/retest and six previously justified equivalent/non-actionable entries. No unchanged historical debt was silently exempted. Pending survivors/timeouts are not reported as zero meaningful survivors.

Quality artifacts are under `output/phase81/owner-policy-*` and `output/phase81/mutation-reconciliation.json`. Live or benchmark artifacts do not authorize deployment.

## Remaining work

Search: owner family approval, production P2–P5 integration/temporal edge verification, calendar-week anchor, complete development/calibration and mutation reconciliation. Keep the dataset unfrozen. Responsibility: respect the provider retry delay, resume only missing development inference, add waived/safety cohort coverage, improve evidence-aware seriousness distinctions and reconcile mutations before any config freeze. S6: use search development traces for measured audit and the advisory AI verifier before separately authorized final evaluation. No next rollout or automation phase was started.

Search and responsibility datasets, labels, questions, schemas, thresholds and conclusions remain independent. Shared low-level cache storage is namespaced by domain/input/config/run identity; no business rules are shared across tracks.
