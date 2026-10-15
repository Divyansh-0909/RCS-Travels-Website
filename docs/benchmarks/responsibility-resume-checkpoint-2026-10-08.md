# Responsibility-priority continuation — 8 October 2026

Responsibility and Search remain independent. No owner decision is pending. This supersedes the earlier Luna availability/coverage state, while retaining the pre-inference queues, Search V1 and S6 package unchanged.

## Part I — Responsibility Luna

The allowed 8 October 08:40:08.833 IST timestamp had elapsed when execution began. Exactly **one** Responsibility preflight ran with retries disabled, using the first frozen VALID_WAIVED record and the unchanged prompt/schema/config. It **PASSed** and was cached as that record's first development observation.

The committed 77-case queue then ran sequentially in its original order. The preflight result was reused. Five additional cases succeeded; the next request hit **HTTP 429 / rate_limit_exceeded / tokens** on `driver_cancellation-missing_provenance`. Seven total fresh Luna requests were made: **six successful, one failed**, including the single preflight. No Search/S6 Luna requests or held-out requests were made.

The provider reported TPM limit **100000**, used **99395**, requested **848**, with `retry-after-ms: 6298560` and `retry-after: 6299`. The exact provider response, retry headers and immutable failed claim are retained in [the development receipt](../../output/responsibility-resume-2026-10-08/development-receipt.json). Recorded failure: **2026-10-08T09:32:35.741Z**. New earliest retry: **2026-10-08T11:17:34.301Z = 8 October 2026 16:47:34.301 IST**. All further Luna work stopped immediately; no retry occurred in this continuation.

Luna development is now **42/113**: existing 36 plus six new successes. VALID_WAIVED coverage **3/3**; LEVEL_2 coverage **6**. All three first queued waivers were classified VALID_WAIVED and guarded auto-waived; all three new deliberate-unavailability records were classified DRIVER_CAUSED and guarded for review.

There are **71 remaining cases**, with the failed missing-provenance case still first. The original 77-case pre-inference manifest is unchanged. [The new runtime Responsibility pending state](../../output/responsibility-resume-2026-10-08/responsibility-pending-state.json) records the successful prefix, exact remaining original order, failure and shared Luna stop. Future execution must retain failed claims/responses, make a new append-only attempt claim, reuse all successful cache entries and preserve the frozen logical observation identities. Do not rerun this stopped invocation or resample the queue.

Luna consistency remains **INCOMPLETE / NOT EXECUTED**; unstable cases **UNMEASURED**. The exact 20×5 plan remains precommitted at hash `e3cc1e432646336d930a32afc7e2a991ebd6f1ee526770f4d497d2fa3b54a17b`; at most 80 fresh repeats remain planned after full coverage gates. First successful development observations are reused; they are not fresh consistency repeats. No case substitution is permitted.

## Part II — Responsibility comparison and selection

The new [partial common-cohort audit](../../output/responsibility-resume-2026-10-08/current-common-cohort.json) verifies the same 42 IDs, labels, normalized evidence and input hashes, shared factual/policy guards and exact provider cache identities. The full 113-case comparison is **NOT RUN**. This provider-limited subset does not justify selection.

| Metric, identical 42-case cohort | V5 | Luna |
|---|---:|---:|
| Classification | 40/42 | 39/42 |
| Macro F1 | 0.947222 | 0.929731 |
| False DRIVER_CAUSED | 0 | 0 |
| False LEVEL_2 | 0 | 0 |
| Unsafe raw adverse | 0 | 3 |
| Unsafe guarded outcomes | 0 | 0 |
| Safe-uphold precision / recall | 2/2 / 2/2 | 2/2 / 2/2 |
| Safe-waive precision / recall | 10/10 / 10/10 | 10/10 / 10/10 |
| Mandatory-review recall | 18/18 | 18/18 |
| Review rate | 30/42 | 30/42 |
| Sufficiency FP / FN | 2 / 0 | 0 / 4 |
| Route-affecting sufficiency errors | 0 | 0 |
| Raw ordinal severity accuracy | 42/42 | 24/42 |
| Conditioned consequence-level accuracy | 42/42 | 35/42 |
| Latency p50 / p95, ms | 344 / 391 | 1969 / 4179.139 |
| Input tokens | 118095 | 40037 |
| Output tokens | 15543 | 2671 |

Raw errors remain visible and distinct from guarded consequences. All three raw Luna adverse errors are contained; no candidate is declared system-unsafe merely from those errors. Per-class precision/recall and confusion matrices are retained in the machine-readable audit. Monetary cost is not estimated without an authoritative pricing lookup.

This common cohort still contains **zero missing-mandatory-evidence and zero critical-contradiction cases**. Zero observed unsafe events in those empty strata is not a coverage pass. The next failed/pending missing-evidence record and remaining contradiction cases must complete before final adequacy/comparison.

V5 full development is unchanged: **102/113**, macro F1 **0.924200**, false DRIVER_CAUSED **0**, false LEVEL_2 **0**, unsafe raw adverse **0**, unsafe guarded outcomes **0**, uphold precision **5/5** / recall **5/8**, waive precision and recall **10/10**, mandatory review **83/83**, review rate **98/113**, 20×5 consistency stable. Its 28 raw sufficiency false positives still affect zero guarded routes; the eleven broader raw waiver candidates remain contained. V5 retained unchanged; no V6.

**Selected: NONE.** Safety/usefulness precede classification accuracy; the full cohort and Luna consistency remain unavailable. Meaningful Responsibility mutation survivors remain **0** (closed 3069 killed, 66 equivalent, 4 non-actionable). No historical mutation work was reopened.

## Part III — Responsibility phase status

Phase 8.1 **INCOMPLETE**; execution config **NOT FROZEN**; held-out **NOT RUN**; verified leakage **0** within exact development inputs/cache identities and the preserved split/isolation boundaries. Phase 8 **INCOMPLETE**; ready for Phase 9 **NO**; Phase 9 started **NO**.

Remaining Responsibility blockers: 71 missing Luna records including mandatory missing/contradictory evidence, full common-cohort comparison, precommitted Luna consistency, then final safety-first selection and immutable execution freeze. The already-authorized single held-out execution remains conditional on those gates. Search capacity cannot prevent Responsibility completion, and cannot consume Luna capacity before Responsibility finishes.

## Part IV — Search V1 / S6

Search state is unchanged: **124/222 complete, 50 Luna-pending, 48 Places-pending, 0 unattempted, 0 confirmed combined pending, 0 terminal validation failures**. Current validated routing **221/222**. Eight raw absent-role errors and ten ROLE_CONFLICT cases remain retained. Observed application-authoritative safety violations **0**, with live selected-place/canonical-ID full signoff still unmeasured.

There were **zero Jev, Places, Search Luna, S6 AI and Search held-out calls** in this continuation. No new evidence established Places capacity restoration after the recorded quota stop, so no extra probe was made. The 48-case Places queue and 50-case Search Luna queue remain intact. No geography, IDs, coordinates or selections were fabricated.

S6 static audit **PASS**, engineering findings **14 accepted/fixed, 0 rejected, 3 LOW-risk completion deferrals**, known unresolved static HIGH/CRITICAL **0**. AI verifier **BLOCKED**, AI findings/HIGH/CRITICAL **UNMEASURED**. Exact 12-capability/32-trace package unchanged:

`e85d9dec14d137a37600b4a412cce6d5c74bdd507151128e642d50ec144af01a`

Model-callable tools **0**, model-controlled Google Places **NO**, one-shot interpretation → deterministic form **PRESERVED**. Search execution contract **NOT FROZEN**; Search held-out **NOT RUN**. Meaningful Search mutation survivors remain **0**. No Search model/parser/policy change or deterministic Delta 2 override was made.

## Part V — Hindi/Hinglish robustness

The new [separate robustness suite](../search/hindi-hinglish-robustness-v1/dataset.json) is **FROZEN**, with **80 cases**: the original 40 exploratory queries retained exactly plus 40 purposeful additions. Hindi **30**, Romanized Hindi **30**, Hinglish **20**; reviewed semantic families **40**; exact duplicates **0**. Original cyclic exploratory family IDs were replaced only in this new suite by meaningful semantic grouping; Search Benchmark V1 labels/split/320 records remain unchanged.

Dataset hash: `f69ddab81d97627d4acdd7a02f188367ef2f99c8993cbdb9b116e7564d9a7d6d`. The hash, exact source UTF-16 spans and every required semantic dimension were frozen before any scored model output. The [per-case review](../search/hindi-hinglish-robustness-v1/review.md) describes explicit label-boundary assumptions, family grouping and form requirements. Labels were agent-reviewed from original language and owner policy; they are not claimed human-final calibration or generated from model outputs.

This is a frozen robustness suite, **not an independent statistical held-out** or claim of language-population representativeness. It supplies script/style, prefix/noise, role order, negation, correction, uncertainty, date/weekday/time/daypart/timezone, vehicle/exclusions/conditions, passengers/flags, return/rental/stops and form-resolution coverage. Unknown proper-name spellings stay source-owned. Dayparts do not invent exact clocks; negated/superseded destinations do not become positive selections; multi-stop stays a planned feature requiring resolution.

Baseline **NOT RUN**; raw Jev/Luna performance **UNMEASURED**; language-specific deficit **UNKNOWN**; normalization required **UNDECIDED**; normalization experiment **NOT RUN**; authoritative language-suite safety **UNMEASURED**, not zero by assumption; Hinglish ready for rollout **NO**.

No translation, transliteration or lexical normalization layer was added. Later baseline must use the current raw-original-query architecture with eligible fallback only, and retain three safety/quality layers. Only a demonstrated material language-specific deficit may trigger a separate experimental RAW-versus-NORMALIZED evaluation. Original source remains authoritative. English V1 closure, S6 and this additional language gate must all pass before controlled rollout readiness.

## Part VI — Validation and project state

Full backend **1472/1472 PASS** (1464 baseline + eight language-label regression tests); type errors **0**, lint errors **0**, duplicates **0**, git diff --check **PASS**. New offline-source function maxima: cyclomatic **19**, cognitive **15**, Halstead difficulty **16**; all source files under 500 lines. Existing critical runtime/parser/factual-policy/scoring modules and source identities remain unchanged with their retained four-way 100% coverage and CRAP gates. No 100% coverage claim is made for report/label-preparation scripts.

The immutable manifest preparation path was adjusted to verify and retain an already-committed plan when new provider successes exist, rather than reconstructing its pre-inference queue. This keeps selection order fixed. Freeze reproduction/labels, original source ownership, negation/corrections, temporal policy and committed-plan retention are regression-tested. No new critical model/parser/scoring surface and no targeted or broad mutation rerun occurred; both existing meaningful-survivor counts remain **0**.

Luna: **7 fresh calls, 6 successes, 1 rate-limit failure**. Search/Places/Jev/S6/held-out calls **0**. All queues and the failed request are retained. Production shadow, dual-shadow, auto-adjudication, consequences, Search rollout, Phase 9, project-wide application and public generalization remain off/not started.

Future order remains Responsibility queue → Luna consistency/full comparison → final selection/freeze → one authorized held-out and Phase 8 conclusion → remaining Search work/S6 → Search freeze/held-out → scored Hindi/Hinglish robustness before rollout readiness. Do not begin Phase 9 or Proofloop generalization here.

```text
RESPONSIBILITY PHASE 8.1: INCOMPLETE
RESPONSIBILITY PHASE 8: INCOMPLETE
READY FOR PHASE 9: NO
PHASE 9: NOT STARTED
SEARCH S5: INCOMPLETE
SEARCH S6: INCOMPLETE
HINGLISH ROBUSTNESS: INCOMPLETE
SEARCH READY FOR CONTROLLED ROLLOUT: NO
SEARCH ROLLOUT: OFF
PROJECT-WIDE RCS PROOFLOOP APPLICATION: NOT STARTED
PROOFLOOP PUBLIC GENERALIZATION: NOT STARTED
```
