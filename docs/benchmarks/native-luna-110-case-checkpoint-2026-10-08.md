# Responsibility native development: 110/113 — 8 October 2026

Continues [the verified native/API stop checkpoint](codex-luna-verified-api-stop-checkpoint-2026-10-08.md).
The owner's latest instruction allowed native testing independently of the closed API
retry window. The original native adapter, inference configuration, prompts, schema,
evidence, labels, deterministic guard and benchmark split were unchanged.

## PART I — Responsibility model evaluation

The initial 30 native cache entries were verified against their exact identities,
input/config/schema hashes and stored result hashes. Fresh guard replay matched every
stored result. All 113 model inputs contain evidence only. The 83 remaining identities
were precommitted before inference, hash
`8a0d45513fecf72b3a00e6438478f21fe82a872b4a900f1f8d8ff6402974fdc2`.
Execution used the verified ChatGPT-authenticated Codex path, isolated temporary
directories, read-only sandboxing, no bridge or tools, frozen order, one case at a
time, at most 20 fresh cases per invocation, and checkpoints after every success.

**80 new successes, one timeout; 110/113 native cases complete.** Successful cached
observations were not duplicated. Unexpected actual tool calls: **0**. The failed
case was `development-confirmed-deliberate-unavailability-2`, at 120,654.504 ms.
Its exclusive claim and failure receipt remain intact. There was no completed turn,
response, or usage metadata: only thread start, two recognized startup warnings,
and turn start; stderr was empty. No authentication or quota error was observed.

`CODEX_LUNA: BLOCKED (PROCESS_TIMEOUT)`. Previous native authentication/bridge-bypass
verification remains valid evidence. The current failure is execution reliability,
not proof that authentication failed or that the allowance was exhausted. No adapter
defect was identified, so **zero additional adapter fixes** were attempted. The frozen
120-second timeout was not extended, and the failed case was not retried or skipped.
Direct API fallback remains authorized but cannot run before its provider timestamp.

The three remaining identities retain their original order:

1. `development-confirmed-deliberate-unavailability-2` — failed, claim retained.
2. `development-authenticated-rider-release-reviewed-1` — not attempted.
3. `development-authenticated-rider-release-reviewed-2` — not attempted.

### Observed metrics — different cohorts

| Metric | Jev V5 full development | API Luna partial | Codex Luna partial |
|---|---:|---:|---:|
| Valid cases | 113/113 | 43/113 | 110/113 |
| Classification | 102/113 | 40/43 | 102/110 |
| Macro F1 | 0.924200 | 0.932340 | 0.926251 |
| False DRIVER_CAUSED | 0 | 0 | 0 |
| False LEVEL_2 | 0 | 0 | 0 |
| Raw unsafe adverse recommendations | 0 | 3 | 5 |
| Unsafe guarded outcomes | 0 | 0 | **6** |
| Safe-uphold precision | 5/5 | 2/2 | 8/8 |
| Safe-uphold recall | 5/8 | 2/2 | 8/8 |
| Safe-waive precision | 10/10 | 10/10 | **8/14** |
| Safe-waive recall | 10/10 | 10/10 | 8/8 |
| Mandatory-review recall | 83/83 | 19/19 | **76/82** |
| Review rate | 98/113 | 31/43 | 88/110 |
| Sufficiency FP / FN | 28 / 0 | 0 / 4 | 5 / 5 |
| Route-affecting sufficiency errors | 0 | 0, prior audited cohort | 0 |
| Raw ordinal severity | 113/113 | 25/43 | 85/110 |
| Conditioned level accuracy | 113/113 | 36/43 | 105/110 |
| Missing-evidence unsafe / critical contradiction unsafe | 0 / 0 | 0 / 0 observed, limited coverage | 0 / 0 |
| Consistency | Stable 20×5 | INCOMPLETE | INCOMPLETE |

On the identical **110 cases**, V5 classifies **99/110**, macro F1 0.924200;
native Codex classifies **102/110**, macro F1 0.926251. Guarded unsafe is **0 versus 6**.
V5 uphold precision/recall is 5/5 and 5/8; native is 8/8 and 8/8. V5 waive
precision/recall is 8/8 and 8/8; native is 8/14 and 8/8. V5 review recall is 82/82;
native is 76/82. Classification improvement does not offset unsafe waivers under the
owner's safety-first priorities. This is not a completed 113-case native comparison.

On the exact **40-case three-way overlap**: V5 **38/40**, API Luna **37/40**, native
Codex **38/40**; guarded unsafe **0/0/0**. API/native classification agreement **39/40**.
The six unsafe native cases lie outside that API-available overlap. Its zeros cannot
erase those failures or establish API safety on the missing cases.

### Native unsafe waiver diagnosis

All six failures are provisional waivers on cases requiring review:

- `platform_assignment_failure-cancellation_after_impossible_assignment`.
- `failed_pickup-rider_cancel_after_platform_delay`.
- `driver_late-rider_cancel_after_platform_delay`.
- `rider_cancellation-rider_cancel_after_platform_delay`.
- `platform_assignment_failure-rider_cancel_after_platform_delay`.
- `replacement_failure-rider_cancel_after_platform_delay`.

The model returns PLATFORM_CAUSED, material platform contribution, sufficient evidence
and `needsHumanReview: false`; the unchanged simulated policy then permits waiver.
Platform attribution is not adequate waiver eligibility for these frozen labels.
The guard does **not** contain these six errors. The separate five raw adverse
recommendations on proven aggravation cases are contained by the development severity
guard. No label, model instruction, policy or guard was tuned after observing this.
No production consequence or real waiver was issued.

### Per-class metrics on the identical 110-case cohort

| Class | V5 precision / recall | Codex precision / recall |
|---|---:|---:|
| DRIVER_CAUSED | 1.000000 / 1.000000 | 1.000000 / 1.000000 |
| PLATFORM_CAUSED | 0.656250 / 1.000000 | 1.000000 / 0.619048 |
| VALID_WAIVED | 1.000000 / 1.000000 | 1.000000 / 1.000000 |
| EXTERNAL_OR_UNCERTAIN | 1.000000 / 0.825397 | 0.887324 / 1.000000 |

Native strata: VALID_WAIVED 1/3 covered (1/1 correct); PLATFORM_CAUSED 21/21 covered
(13/21 correct, six unsafe waivers); DRIVER LEVEL_1 20/20 correct; DRIVER LEVEL_2 5/6
covered (5/5 classification correct); EXTERNAL_OR_UNCERTAIN 63/63 correct; deliberate
unavailability 2/3 covered (2/2 classification correct); conflicting commitments 3/3
correct; mandatory missing evidence 7/7 correct; contradictory evidence 14/14 correct,
including seven critical contradictions. Mandatory-review strata coverage is 82/83.
Severity failures remain separately reported, not hidden by correct attribution.

Native successful-case latency p50 **6,585.677 ms**, p95 **25,774.559 ms**, including CLI
startup. Same-cohort V5 p50 **345 ms**, p95 **405 ms**. Native 110 successful observations
report **620,718 input / 6,336 output tokens**. The timeout's usage is **UNKNOWN**, and
its 120,654.504-ms latency is recorded separately from successful-case percentiles.
This continuation made **81 CLI invocations**, not an observed HTTP request count;
native monetary cost and future allowance are unknown.

### Consistency and API status

Codex consistency **INCOMPLETE**: **18/20 first observations** exist in cache; **zero
fresh repeats** were made. Full development is incomplete and native execution is
blocked. The existing zero-unsafe-development admission prerequisite also fails.
Instability, changed output fields and changed final routing are **UNMEASURED**, not
zero. The original 20-case/5-observation plan and 80-fresh-repeat cap are unchanged.
No voting, repair or selective resampling was introduced.

API Luna remains **43/113**, with the exact frozen **70-case** pending queue intact.
API calls this continuation: **0**. Recorded retry remains **8 October 2026,
23:34:50.884 IST** (`2026-10-08T18:04:50.884Z`). It had not elapsed at the native stop.
Once eligible, use one bounded preflight with retries disabled, then the existing
cache-first sequential API evaluator, per-success checkpoints, and immediate stop on
another HTTP 429. Retain all old failed claims and use new physical attempt claims;
do not rerun the stopped API invocation or overwrite native caches with API results.

Meaningful mutation survivors remain **0** for unchanged measured source bytes.

## PART II — Phase 8

Selected production candidate **NONE**. Jev V5 remains the provisional production
candidate with the strongest measured safety evidence. Native Codex is a development
backend, not an authorized production replacement; it also fails guarded safety.
The production-equivalent API cohort is still incomplete.

**Development gates: FAIL / INCOMPLETE**. Precise blockers are native reliability and
three unfinished cases, six native unsafe waivers, incomplete native consistency,
70 missing API cases including inadequate contradiction coverage, and incomplete API
consistency. Full API comparison remains required. A gate amendment is **not proposed
or applied**: the incomplete native cohort and actual waiver failures do not justify
waiving the original production API comparison. No new product-policy decision is
needed to continue the already authorized direct API route when eligible.

Phase 8.1 **INCOMPLETE**; configuration **NOT FROZEN**; Responsibility held-out
**NOT RUN**; Phase 8 **INCOMPLETE**; ready for Phase 9 **NO**. The conditional one-time
held-out authorization remains valid after a legitimate freeze; its prerequisites
were not met here. Phase 9 and production behavior were not changed.

## PART III — Hindi/Hinglish

Frozen cases **80**, unchanged. Jev completed **0**; Codex completed **0**. Semantic
accuracy for all requested fields **UNMEASURED**; grounding **NOT RUN**; language-specific
deficit **UNKNOWN**; normalization justification **UNDETERMINED**; normalization
experiment **NOT RUN**; authoritative safety violations **UNMEASURED**; rollout
robustness **INCOMPLETE**. Higher-priority Responsibility evaluation stopped before
completion, so this conditional provider stage was not started. No translation was
introduced and semantic interpretation was not claimed as complete grounding.

## PART IV — Search

Search V1 production-equivalent **124/222**; Codex development **0**. Pending: **50 API
Luna + 48 Places**. S6 original AI verifier **BLOCKED**; Codex verifier **NOT RUN**;
static audit **PASS for known boundaries**. Execution contract **NOT FROZEN**;
held-out **NOT RUN**; rollout **OFF**. Application-authoritative violations remain
**0 observed**, with incomplete provider grounding/selection validation. No Search,
Places or S6 requests occurred. All 34 frozen Search source hashes, the frozen S6
package and Hindi dataset content hashes were reverified unchanged.

## PART V — Validation / roadmap

- Backend tests rerun: **1519/1519 PASS**. Backend typecheck and scoped lint **PASS**.
- Reporting script syntax and `git diff --check` **PASS**.
- Critical source changes **0**. Prior eight-module **100% statements/branches/functions/
  lines** coverage retained against identical source bytes; coverage was not rerun.
- Mutation sign-off retained and source proofs reverified: **1003 unique**, **971 killed**,
  **13 detected timeouts**, **19 reviewed scoped equivalents**, **0 meaningful survivors**.
  No historical mutation suite was reopened.
- Same-source quality retained: max cyclomatic 12, cognitive 11, Halstead 26.943,
  source LOC 314, critical-module CRAP 12; prior scoped duplicate count 0.
  Output reporting/orchestration scripts are outside the critical-module coverage scope.
- **110 native cache identities**, frozen evidence/labels and fresh guard replay verified;
  the original 30 result hashes are unchanged. API 43 successes and queue identities retained.
  Benchmark/held-out leakage **0**. No frozen inputs, prompts, labels, schema or split changed.

Evidence is in `output/native-luna-completion-2026-10-08/`: `precommit.json`, batch
snapshots, `responsibility-report.json`, `responsibility-comparison.json`,
`unsafe-waiver-audit.json`, `native-consistency.json`, `native-pending-state.json`,
`timeout-events.jsonl`, `timeout-stderr.txt`, and `validation.json`.
The original native/API claims, caches and stopped receipts remain preserved.

```text
CODEX_LUNA: BLOCKED (PROCESS_TIMEOUT)
RESPONSIBILITY PHASE 8.1: INCOMPLETE
RESPONSIBILITY PHASE 8: INCOMPLETE
READY FOR PHASE 9: NO
PHASE 9: NOT STARTED
SEARCH S5: INCOMPLETE
SEARCH S6: INCOMPLETE
HINGLISH ROBUSTNESS: INCOMPLETE
SEARCH ROLLOUT: OFF
PROJECT-WIDE RCS PROOFLOOP APPLICATION: NOT STARTED
PROOFLOOP PUBLIC GENERALIZATION: NOT STARTED
```
