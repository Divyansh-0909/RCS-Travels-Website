# Search S5 / Responsibility Phase 8.1 review checkpoint

This is a preparation checkpoint, not final benchmark signoff. Search label approval is pending. The product owner explicitly required review before Search freezing and final held-out inference. The two experiments remain independent.

## Part I - Search S5

### A. Dataset and review

The [complete readable review](benchmark-v1/review.md), [highlighted subset](benchmark-v1/REVIEW_REQUIRED.md), [proposed records](benchmark-v1/proposed.json) and [manifest](benchmark-v1/manifest.json) are the review deliverables. All labels remain PROPOSED; the dataset is not frozen. The current hash is in the manifest.

| Cohort | Core records |
|---|---:|
| Standalone locations | 30 |
| Complete simple bookings | 30 |
| Partial bookings | 30 |
| Immediate requests | 15 |
| Scheduled requests | 20 |
| Date-only requests | 20 |
| Time-only requests | 15 |
| Vehicle preferences / any / exclusions | 30 |
| Pickup/drop word order | 35 |
| Multiple stops | 15 |
| Return / rental / supported flags | 20 |
| Conditional requests | 15 |
| Ambiguity / conflict / temporal policy | 25 |
| Unclear / noisy / difficult candidates | 20 |
| **Core total** | **320** |

There are 40 additional exploratory Hindi/Hinglish inputs, excluded from resolved-label core metrics. Core: 178 ordinary/frozen-spec-derived cases and 142 adversarial/judgment cases. The highlighted subset is 182 records: 142 core + all 40 exploratory. Every record, including deterministic derivations, still needs approval. Exploratory field labels are deliberately unlabelled pending language/product review.

Proposed core split: 222 development / 98 held-out. There are 48 actual core template families; no family crosses splits. The eight exploratory grouping families do not enter either core split. The split seed is `rcs-search-s5-family-split-2026-10-04`.

Twenty-one core records involve unresolved policy: six generic SUV-exclusion cases and five each for weekday, omitted year and non-IST time. The manifest's 61 unresolved cases includes these 21 plus the 40 exploratory language cases. No omitted-year, weekday, non-IST or SUV-family interpretation has been silently chosen. Controlled time: `2026-10-04T12:00:00+05:30`, timezone `Asia/Kolkata`.

### B. Live provider preflights

| Provider | Actual check | Result |
|---|---|---|
| Jev | Installed TypeSafe SDK 0.6.0; requested `jev-latest`, returned `jev-1.13.0`; S2 routing batch for `SUV tomorrow` | PASS; BOOKING_REQUEST / SIMPLE; 636 ms total |
| Luna | OpenAI SDK 7.10.0; actual S4 adapter with `gpt-6-luna` and strict BookingDraft output | PASS; 11,547 ms total |
| Google | Existing Google proxy / S3 adapter; autocomplete then selected-place details | Autocomplete PASS (five suggestions); details FAIL closed because returned place ID differed from the requested suggestion ID |

A separate small diagnostic reproduced Google HTTP 200 autocomplete/details responses with valid coordinates but mismatched identity. The exact cause is unresolved. No identity guard was relaxed and no place was invented. This is a grounding blocker, not a reason to invoke Luna.

Preflight usage: Search Jev 603 input / 98 output tokens; Search Luna 7,866 input / 683 output tokens. Google: four total calls including the two-call diagnostic. These are adapter checks, not quality measurements. No live Search benchmark or fallback calibration has run.

### C-H. Routing, fields, reversals, follow-up, fallback and Places metrics

These live system metrics are **unmeasured**. The pure Search calculator now supports query/complexity and field accuracy; separate pickup/drop span accuracy and reversal IDs/rate; vehicle-any, exclusion and strength cohorts; missing/ambiguity/unsupported recall with false positives; necessary/unnecessary fallback rates; candidate miss/recovery and invention counts. Unknown labels are excluded. Unreviewed held-out rows cannot be scored, including in diagnostic mode.

No thresholds were calibrated. Missing information remains follow-up rather than fallback. Neither preflight demonstrates system accuracy or successful grounding after selection.

### I-K. Latency, cost and failures

Only the single preflight timings above exist for Search; p50/p95 are not estimated from one request. Monetary cost is not calculated without versioned authoritative pricing/billing inputs. Google grounding has one failed adapter preflight plus one diagnostic confirmation; these are not a representative provider failure rate.

### L. Verification and mutation

Final measured verification is recorded in the local `output/ai-evaluation-preflight/` logs and quality reports. The 11 scoped evaluation modules have 100% statements/branches/functions/lines coverage in the focused run. Full backend regression passed 1,264 tests. Backend typecheck and scoped lint passed. The expanded duplicate scan found zero clones. `git diff --check` passed with the repository's configured line-ending handling. An additional check found and corrected blank EOF lines in generated review Markdown. No schema/migration change was made, so Prisma validation was not newly required.

The earlier nine-module complexity/CRAP measurement passed. The expanded eleven-module measurement did not finish after more than eight minutes of CPU time and was stopped; its Halstead/CRAP/complexity result is **NOT PASSED / PENDING**. Scope was not reduced and no values were fabricated. Scoped lint passed before the final formatting-only adjustment; a final repeat stalled during startup and was stopped, so that repeat is not a completed check. Scoped lint includes the cyclomatic maximum check, but it does not replace the outstanding full complexity/CRAP measurement. Evaluation entry scripts are outside the measured coverage scope. Unused imports/variables are checked by lint; there is no claim of a separate exhaustive dead-code-tool run.

The first broader Search review-infrastructure mutation run completed with 1,298 generated mutants: 1,081 killed, 208 survived, nine timed out, none uncovered. This result predates the subsequent temporal-label correction, review-gate test hardening and new metric helpers. It is historical evidence of work remaining, **not** current mutation signoff. Meaningful survivor classification and current-source mutation verification remain pending; no zero-survivor claim is made.

### M-N. Blockers and conclusion

- Product-owner approval / receipt and Search dataset freeze: blocks final held-out evaluation and rollout.
- Google selected-place detail identity mismatch: blocks full live Places evaluation and rollout; investigate without weakening identity validation.
- Current-source mutation signoff and broad live development calibration: pending.
- Frozen acceptance criteria, final held-out metrics and review of every reversal: not yet completed. No acceptance threshold was selected after observing held-out data.

**SEARCH S5 RESULT: INSUFFICIENT LIVE DATA.** Customer natural-language search has not been enabled.

## Part II - Responsibility Phase 8.1

### O. OpenAI access re-check

A fresh responsibility-specific strict-output `gpt-6-luna` request succeeded in 2,976 ms. The former OpenAI funding/API-access blocker is **RESOLVED**. This does not establish Decisions API access.

### P-Q. Responsibility Benchmark V2

V2 preserves all 154 V1 records and adds nine synthetic affirmative-causation LEVEL_1 cases in three complete template families. Total: 163; development: 104; held-out: 59; ordinary: 65; adversarial: 98. V2 hash: `9369dd84368f1ea827117d3fdfcb6d7d19b66c2da026c091b199e2204b24911e`. This is a frozen synthetic benchmark, not a human-final corpus.

| Held-out stratum | Count |
|---|---:|
| DRIVER_CAUSED | 10 |
| PLATFORM_CAUSED | 14 |
| VALID_WAIVED | 14 |
| EXTERNAL_OR_UNCERTAIN | 21 |
| LEVEL_0 | 49 |
| LEVEL_1 | 3 |
| LEVEL_2 | 7 |
| SAFE_AUTO_UPHOLD | 3 |
| SAFE_AUTO_WAIVE | 14 |
| NEEDS_ADMIN_REVIEW | 42 |
| Missing mandatory evidence | 7 |
| Critical contradiction | 7 |
| Platform impossibility | 7 |
| External uncertainty | 21 |

The non-zero stratum check passes and all 23 families remain intact. Three held-out safe-uphold / LEVEL_1 positives are a minimum coverage repair, not strong statistical calibration. The development split has no positive LEVEL_2 cases, which limits development calibration; this must be addressed by additional distinct development families before any severity tuning requiring that cohort. No held-out inference has run.

### R-S. Candidate configuration

Jev uses the existing bounded responsibility/evidence-sufficiency/platform/external/review/severity questions through TypeSafe SDK 0.6.0. Actual model observed: `jev-1.13.0`. Existing benchmark-only binary threshold 0.5 and severity thresholds 0.5/1.5 are historical provisional benchmark mappings, not calibrated probabilities or production authorization. No search threshold controls them.

The new general baseline uses `gpt-6-luna`, Responses Structured Outputs, a strict bounded responsibility schema, low reasoning, 512 maximum output tokens, 60-second timeout and zero SDK retries. It returns no prose/hidden reasoning and is not the Phase 5 production analyst contract. Both candidates receive identical normalized evidence with no labels. The policy simulation is observational only.

Current configuration is `responsibility-phase8.1-v2`, including analyst configuration and deterministic-policy version/hash in cache identity. The small live development run used the preceding v1 config hash `20ff0f1cfb6ddcd787264076369265c42940ad062a8bc8a9cd521b09de9b2c6b`; its receipt has not been rewritten to claim current-config execution.

### T. Decisions API

Installed OpenAI SDK 7.10.0 exposes no Decisions member. Public official API documentation inspection did not find an actionable Decisions endpoint/schema contract. No endpoint or adapter was invented. **ACCESS: UNKNOWN; ACTUAL API CONTRACT FOUND: NO; BENCHMARK EXECUTED: NO / UNAVAILABLE.** No account-level forbidden/not-found response was observed, so confirmed account denial is not claimed. Decisions pricing is unavailable.

### U-X. Live development sample (not held-out)

The visible budget was 12 Jev + 12 Luna requests. Both completed all 12. The current CLI subset selected a single DRIVER_CAUSED / LEVEL_1 development family; it is **not representative** of all strata. No labels changed after inference.

| Metric | Jev | Luna |
|---|---:|---:|
| Classification correct | 12/12 | 11/12 |
| Unsafe auto-uphold candidates | 0 | 0 |
| False DRIVER_CAUSED | 0 | 0 |
| False LEVEL_2 | **4** | 0 |
| False auto-waive | 0 | 0 |
| Missed required review | 0 | 0 |
| False evidence-sufficient | 0 | 0 |
| Review rate | 10/12 | 10/12 |
| Simulated provisional auto-uphold | 2/12 | 2/12 |

Zero counts for absent platform/external/missing/contradiction cohorts are not safety proof. Macro F1/per-class metrics in the raw summary include absent classes and are not a balanced benchmark score. All 12 labels were DRIVER_CAUSED; Jev classified 12 as DRIVER_CAUSED, Luna 11 as DRIVER_CAUSED and one EXTERNAL_OR_UNCERTAIN. Severity: Jev predicted LEVEL_1 eight times and LEVEL_2 four times; Luna predicted LEVEL_1 eleven times and LEVEL_0 once. Safe-waive and required-review precision/recall are unmeasured on this sample.

### Y-Z. Consistency, usage and latency

No five-run consistency cohort has been executed. Jev development p50/p95: 331/518 ms; Luna: 1,961/4,719 ms. Jev usage: 19,254 input / 2,016 output tokens; Luna: 10,562 input / 883 output tokens. Twelve actual calls per candidate; no errors. The separate responsibility preflight adds one call per candidate. Cost is not computed without versioned authoritative pricing inputs. No Decisions calls occurred.

### AA. Human-final cohort

Available safe evaluation cohort: zero. No production/runtime DB was queried or copied. A real human-final calibration source remains unavailable and blocks responsibility auto-adjudication confidence.

### AB. Mutation signoff

The changed-critical scope (bounded Luna adapter, shared inference cache, responsibility safety-calculator changes) generated 200 mutants: 199 killed; one equivalent survivor; zero timeouts/uncovered. The survivor removes `utf8` from a JSON read: Node returns a Buffer, and `JSON.parse` coerces the Buffer to the same UTF-8 JSON. Cache identity/validation and resulting values remain unchanged. Meaningful survivors in this measured scope: zero.

The broader inherited Phase 8 run and the additional V2/runner logic are not thereby signed off. Global **MEANINGFUL SURVIVING PHASE 8 MUTANTS: NOT YET FULLY CLASSIFIED**. The historical broader report had survivors/timeouts; no global zero claim is made.

### AC. Candidate conclusions

- Jev: **NOT CURRENTLY SUITABLE** for an enablement recommendation with the current uncalibrated severity mapping; four false LEVEL_2 in the narrow development sample need investigation. Broad calibration data is also insufficient.
- Luna: **INSUFFICIENT CALIBRATION DATA**. The preflight and development sample pass the access check, not the full responsibility safety benchmark.
- Decisions: **INSUFFICIENT CALIBRATION DATA / UNAVAILABLE API CONTRACT**.

Responsibility dual-shadow and auto-adjudication remain disabled.

## Part III - Isolation / next steps

### AD-AF. Shared infrastructure and production behavior

Only low-level inference caching is shared, with separate domain namespaces and full dataset/input/config/model/run identities. Search and responsibility have separate prompts, schema, questions, dataset builders, split seeds, metric calculators, thresholds and conclusions. Domain keys prevent cross-domain cached-result reuse. No production analyst, finalization, appeal, money, strike/block or customer search wiring was changed in this pass. No DB migration was introduced.

SEARCH LABELS USED IN RESPONSIBILITY: NO

RESPONSIBILITY LABELS USED IN SEARCH: NO

SEARCH THRESHOLDS CONTROL RESPONSIBILITY: NO

RESPONSIBILITY THRESHOLDS CONTROL SEARCH: NO

CUSTOMER NL SEARCH AUTOMATICALLY ENABLED: NO

RESPONSIBILITY DUAL-SHADOW ENABLED: NO

RESPONSIBILITY AUTO-ADJUDICATION ENABLED: NO

### AG. Files and review checkpoint

Changed/added evaluation implementation:

- `backend/benchmarks/search/{dataset,templates,validation,review,prediction,metrics}.js`
- `backend/benchmarks/responsibility/{datasetV2,lunaBaseline,phase81}.js`
- `backend/benchmarks/responsibility/metrics.js`: false-auto-waive counting now includes labelled waiver-ineligible cases, not only misclassified driver-caused cases.
- `backend/benchmarks/common/cache.js`: namespaced, immutable inference cache.
- `backend/scripts/{search-s5-review,responsibility-phase81}.mjs`
- `backend/tests/rideSearchS5{Dataset,Review,Metrics}.test.js`, `benchmarkCache.test.js`, `responsibilityBenchmark{DatasetV2,LunaBaseline,Phase81Runner,Phase81Safety}.test.js` and focused mutation configuration files.
- Search review documentation and generated artifacts under `docs/search/benchmark-v1/`.

No responsibility production services, customer UI, Prisma models or migrations were edited for this checkpoint. Preflight/development results and measured gate reports are local artifacts under `output/` and `backend/coverage/`.

Stop at product-owner review of [the Search packet](benchmark-v1/review.md). Return approval by family or corrections by case ID. Search will not be frozen or finally evaluated until that review is recorded. No rollout or dual-shadow is authorized by this checkpoint.

```text
SEARCH S5: INCOMPLETE
SEARCH LIVE JEV BENCHMARK: NO
SEARCH LIVE LUNA FALLBACK BENCHMARK: NO
SEARCH LIVE GOOGLE PREFLIGHT: YES (DETAILS FAILED)
SEARCH PICKUP/DROP REVERSAL RATE: unmeasured
SEARCH NECESSARY FALLBACK RECALL: unmeasured
SEARCH UNNECESSARY FALLBACK RATE: unmeasured
SEARCH READY FOR CONTROLLED ROLLOUT: NO
RESPONSIBILITY PHASE 8.1: INCOMPLETE
OPENAI FUNDING/API BLOCKER RESOLVED: YES
RESPONSIBILITY DATASET V2 FROZEN: YES
HELD-OUT SAFE-UPHOLD POSITIVES: YES
HELD-OUT LEVEL_1 POSITIVES: YES
RESPONSIBILITY JEV HELD-OUT RUN: NO
RESPONSIBILITY LUNA HELD-OUT RUN: NO
OPENAI DECISIONS ACCESS: UNKNOWN
OPENAI DECISIONS HELD-OUT RUN: UNAVAILABLE
JEV UNSAFE AUTO-UPHOLDS: unmeasured on held-out (0/12 development)
LUNA UNSAFE AUTO-UPHOLDS: unmeasured on held-out (0/12 development)
DECISIONS UNSAFE AUTO-UPHOLDS: unmeasured
JEV FALSE LEVEL_2: unmeasured on held-out (4/12 development)
LUNA FALSE LEVEL_2: unmeasured on held-out (0/12 development)
DECISIONS FALSE LEVEL_2: unmeasured
MEANINGFUL SURVIVING PHASE 8 MUTANTS: pending global classification (0 in measured 200-mutant changed-critical scope)
REAL HUMAN-FINAL CALIBRATION: NO
READY FOR RESPONSIBILITY DUAL-SHADOW: NO
READY FOR RESPONSIBILITY AUTO-ADJUDICATION: NO
SEARCH/RESPONSIBILITY BENCHMARKS REMAIN INDEPENDENT: YES
```
