# Responsibility guard audit and Hindi/Hinglish Jev baseline — 8 October 2026

This supersedes the native 110-case checkpoint for derived guard outcomes. Historical raw responses and reports are retained. Checkpoint time: 2026-10-08T16:22:24.461Z. Latest machine state: `output/responsibility-guard-audit-2026-10-08/continuation-state.json`.

## Part I — Six unsafe waivers

| Case ID | Raw recommendation | Evidence requiring review | Provisional route before → after | Root cause / correction / witness |
| --- | --- | --- | --- | --- |
| `platform_assignment_failure-cancellation_after_impossible_assignment` | PLATFORM_CAUSED / LOW; confidence 0.83; sufficient true; review false | availableDrivers: 0; no resolved platform waiver proof | AUTO_WAIVE → REVIEW | Shared independent-review/authority policy gap; permanent named witness in responsibilityIndependentGuard.test.js |
| `failed_pickup-rider_cancel_after_platform_delay` | PLATFORM_CAUSED / LOW; confidence 0.97; sufficient true; review false | assignment.delayedSeconds: 900; unresolved platform-delay causal review | AUTO_WAIVE → REVIEW | Shared independent-review/authority policy gap; permanent named witness in responsibilityIndependentGuard.test.js |
| `driver_late-rider_cancel_after_platform_delay` | PLATFORM_CAUSED / LOW; confidence 0.96; sufficient true; review false | assignment.delayedSeconds: 900; unresolved platform-delay causal review | AUTO_WAIVE → REVIEW | Shared independent-review/authority policy gap; permanent named witness in responsibilityIndependentGuard.test.js |
| `rider_cancellation-rider_cancel_after_platform_delay` | PLATFORM_CAUSED / LOW; confidence 0.83; sufficient true; review false | assignment.delayedSeconds: 900; unresolved platform-delay causal review | AUTO_WAIVE → REVIEW | Shared independent-review/authority policy gap; permanent named witness in responsibilityIndependentGuard.test.js |
| `platform_assignment_failure-rider_cancel_after_platform_delay` | PLATFORM_CAUSED / LOW; confidence 0.99; sufficient true; review false | assignment.delayedSeconds: 900; unresolved platform-delay causal review | AUTO_WAIVE → REVIEW | Shared independent-review/authority policy gap; permanent named witness in responsibilityIndependentGuard.test.js |
| `replacement_failure-rider_cancel_after_platform_delay` | PLATFORM_CAUSED / MODERATE; confidence 0.99; sufficient true; review false | assignment.delayedSeconds: 900; unresolved platform-delay causal review | AUTO_WAIVE → REVIEW | Shared independent-review/authority policy gap; permanent named witness in responsibilityIndependentGuard.test.js |

All six frozen truths are PLATFORM_CAUSED, mandatory review true, automatic waiver false. The bounded native schema has no explicit waiver action: PLATFORM_CAUSED plus sufficient true and review false implied the waiver recommendation. Native normalization preserves these fields; no adapter mapping defect was found.

Full synthetic traces, including exact evidence, provenance, category completeness, missing evidence, contradictions, raw output, normalization, factual validation and audit checks: `output/responsibility-guard-audit-2026-10-08/six-case-before.json` and `six-case-after.json`. These traces also probe a valid full production analyst envelope with the same classification/confidence/severity and true evidence citations. The bounded native output itself is not accepted as a production analyst envelope. Factual validation accepts the contract/citations; it does not independently establish causal waiver entitlement. The production policy probe changed from PROVISIONAL_AUTO_WAIVED to NEEDS_ADMIN_REVIEW for all six.

Real deterministic provisional eligibility bypasses: **6**. Mapping defects: **0**. Metric counting defects: **0**. Shared policy implementation gaps: **1**. Unresolved guard cases: **0**. Executed/authoritative waivers: **0**; all finalExecutedRoute values remain null. The metric counts unsafe eligibility, not executed production consequences.

### Independent correction

`backend/services/responsibilityEvidenceSafety.js` supplies shared runtime gates to the benchmark and production policy gate. It recomputes usable required categories, gives evidence-derived mandatory review precedence, and requires affirmative support for the proposed automatic route. It does not read benchmark IDs, scenario names, kinds or truth labels. AI sufficiency/review/severity/confidence answers retain veto/diagnostic roles and cannot create route authority.

Frozen contract references: `backend/benchmarks/responsibility/dataset.js:39` (review-required capacity/delay families), `:63` (capacity count), `:67`–`:77` (affirmative driver/platform/waiver/external facts and delay). Existing Phase 8.1 affirmative personal/administrative release facts are retained. No frozen evidence, labels, prompts, schemas, splits, thresholds or model settings changed. The independent guard also rejects serious conduct, conflicting authority, material external/connectivity/traffic facts, missing/null/unusable required evidence and absent values. Absent values are rejected by the existing production evidence schema before hashing; a separate adversarial test verifies that rejection and the low-level guard fallback.

Permanent regressions: all six observed case IDs have individual named tests. Adversarial variations exercise false review/sufficiency/external flags, contradiction precedence, provenance/staleness/corroboration, derived facts, malformed/prototype classifications, serious low-severity claims, conflicted causal authority, useful safe routes and disabled policy automation. The existing scenario/evidence builder supplies the witnesses.

## Part II — Immutable cache replay

| Backend | Replayed | Classification (unchanged) | Raw unsafe (unchanged) | Guarded unsafe | Mandatory-review recall | Review rate | Uphold precision / recall | Waive precision / recall |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Jev V5 | 113/113 | 102/113 | 0 | 0 → 0 | 83/83 → 83/83 | 98/113 → 98/113 | 5/5 / 5/8 | 10/10 / 10/10 |
| API Luna | 43/43 | 40/43 | 3 | 0 → 0 | 19/19 → 19/19 | 31/43 → 31/43 | 2/2 / 2/2 | 10/10 / 10/10 |
| Native Codex Luna | 110/110 | 102/110 | 5 | 6 → 0 | 76/82 → 82/82 | 88/110 → 94/110 | 8/8 / 8/8 | 8/8 / 8/8 |

False DRIVER_CAUSED and false LEVEL_2 are zero for every replayed backend before and after. Required-missing-evidence and critical-contradiction unsafe routes remain zero. API critical-contradiction coverage is zero, so API contradiction recall is unmeasured, not a safety coverage pass. See complete scores/coverage denominators in `replay-report.json`.

All original raw/normalized outputs were preserved. Only derived outcomes were replaced in a new output directory. Guard version: `responsibility-independent-evidence-v1`; derived hash: `c3e747cf9097446ff8386183b5a046eb9df236e65c8934ac5e0716b7814fc2fd`. Source hashes accompany the derived manifest; raw model/cache identities remain unchanged.

V5 cached consistency replay: **20 cases × 5 runs, all stable**, zero guarded unsafe. The production-equivalent V5/API comparison now covers the identical 43 available cases, and the separate native comparison covers 110 matched V5/native and 40 three-way cases. These selected partial cohorts do not replace the original full API gate. Full metrics, macro F1, latency and token usage: `same-cohort-comparison.json`; V5 repeat evidence: `v5-consistency-replay.json`. Native/API repeat evaluation remains incomplete.

Targeted mutation testing: **219/219 killed**, **0 survivors, 0 timeouts, 0 ignored**. Exact tested source hashes are bound to `guard-closure.json`; the final report is `mutation-final-report.json`. Mutation scope is the new evidence helper plus changed call sites/route branch, not unrelated historical suites. Stryker's JavaScript-only run skips TypeScript project preprocessing; full backend typecheck is recorded separately.

## Part III — Direct API Luna

Preflight: **NOT ALLOWED** at 2026-10-08T16:22:24.461Z. Development **43/113**; **70 pending**. New successful requests **0**. New HTTP 429 **NO**. New retry timestamp **none**. API consistency **INCOMPLETE**.

Recorded earliest retry: **8 October 2026, 23:34:50.884 IST / 18:04:50.884 UTC**. The last historical 429 was a token rate limit. The 70-entry order matches the original 77-entry queue after its seven successful prefix cases, with the original raw config/cache identities. First pending: `driver_late-missing_provenance`.

Native Codex Luna remains **BLOCKED** at its original 120-second timeout; zero native calls in this continuation. After the API timestamp, use one small preflight with retries disabled, then the existing direct Luna API evaluator, cache-first and sequential, with a checkpoint after every success. Any 429 stops the run immediately and preserves the remaining order. Responsibility retains priority over Search Luna capacity. No new owner decision is pending.

## Part IV — Search and Hindi/Hinglish

Search development **124/222**, Luna API pending **50**, Places pending **48**, S6 verifier **BLOCKED**. All 34 frozen parser source identities remain unchanged. Search V1 end-to-end completion did not increase.

Hindi/Hinglish Jev baseline: **80/80 evaluated**, 144 sequential Jev requests, **37/80 without invalid-response/schema-stage failure**. Luna baseline **0/80**. Places calls **0**. Raw routing query type **74/80**, complexity **56/80**; guarded pipeline complexity **52/80**. On all 51 frozen SIMPLE cases, exact source pickup **21/51**, drop **20/51**, timing mode **21/51**, source date **29/51**, source time **28/51**. Failed SIMPLE cases stay in denominators. Complex cases are scored for normal Jev routing, with complex field extraction left to the pending Luna stage.

All 144 SDK requests returned; zero transport/auth/rate-limit exceptions. The 43 invalid/schema cases decompose into 6 malformed probability distributions, 29 missing temporal source bindings, 2 unsupported vehicle-exclusion assertions, 1 unsupported flag assertion, and 5 incompatible query-type/complexity schema combinations. Five candidate-generation failure cases and role conflicts remain separately recorded. Offline replay reproduced every saved draft/issue using cached responses and zero model calls; no validation tolerance was changed to accept failures.

Language-specific deficit: **YES**, specifically an observed deterministic source-binding gap. Temporal recognizers admit English anchors/dayparts but miss kal/subah/shaam and Devanagari equivalents. This does not establish a causal model-quality difference against English; matched English model controls have not run. Normalization justified: **UNDECIDED**. No translation/normalization experiment or runtime change was made.

Provenance issues in returned drafts **0**. Semantic interpretation is separate from grounding: Places/selection/submission safety and remaining complex/timezone/alternative semantics are **unmeasured**. No end-to-end robustness or rollout pass is claimed. The 80-case corpus remains frozen purposive synthetic robustness evidence, not an independent held-out benchmark. Detailed case errors and language partitions: `hinglish-jev-report.json`; immutable cache/receipts and contract replay are adjacent.

## Part V — Quality and phase status

Backend tests **1542/1542 PASS**. Scoped coverage **100% statements/branches/functions/lines** over the full evidence helper, policy gate and benchmark module. Two synthetic data: module source-map entries from unrelated existing tests were removed only from a report copy to work around c8 URL handling; original V8 files/counters and every scoped file source map remain intact.

Critical source maxima: cyclomatic **20**, cognitive **9**, Halstead Difficulty **29.75**, CRAP **20**, source LOC **378**; all below required thresholds. New regression source remains below 500 LOC. Typecheck **PASS**, scoped lint **PASS**, clone detection **0** (three source modules; five-line/50-token minimum), git diff --check **PASS**. No unrelated working-tree changes were reverted.

Mutation survivors **0**; held-out leakage/calls **0**; final candidate **NONE**. Phase 8.1 **INCOMPLETE**; Responsibility held-out **NOT RUN**; Phase 8 **INCOMPLETE**; ready for Phase 9 **NO**. Search S5/S6 **INCOMPLETE**, S6 verifier **BLOCKED**; Hindi/Hinglish robustness **INCOMPLETE**. Phase 9, project-wide Proofloop and public generalization **NOT STARTED**. Production consequences, auto-adjudication, dual-shadow and rollout remain off.
