# Native Codex Luna verified / Responsibility API stop — 8 October 2026

Continues [the adapter checkpoint](codex-luna-development-checkpoint-2026-10-08.md).
The owner's latest automatic fallback instruction gives Responsibility Phase 8
priority. Native verification succeeded, so `CODEX_LUNA: VERIFIED`, not BLOCKED.
The required production-equivalent API comparison was resumed after the pilot and
one bounded native development batch. A new API HTTP 429 stopped provider execution
immediately. No additional native, API, Search, Places, S6 or Hindi calls followed it.

## I. Native Codex Luna

| Check | Actual result |
|---|---|
| CLI | 0.160.1 |
| Native invocation | PASS — one fresh structured preflight completed |
| ChatGPT authentication | VERIFIED through successful forced ChatGPT/built-in provider execution |
| Custom bridge bypass | VERIFIED under ignored user configuration and sanitized environment |
| Isolation | Fresh temporary directory, read-only sandbox, project rules/tools disabled |
| Unexpected actual tool calls | 0 across preflight and 30 successful development observations |
| Structured output | Preflight PASS; 30/30 development outputs validated |
| Pilot | 10/10 completed; classification 10/10, macro F1 1.0 |
| Pilot severity | Raw ordinal 8/10; conditioned level 9/10 |
| Pilot safety | False DRIVER_CAUSED 0; false LEVEL_2 0; raw unsafe adverse 1; guarded unsafe 0 |
| Pilot routing | Uphold precision/recall 1/1; waive precision/recall 2/2; mandatory review 7/7 |
| Pilot sufficiency | FP 0; FN 0 |
| Native usage limits | None observed; future allowance unknown |
| Extra adapter fixes | 0; the existing corrected adapter succeeded |

Routing verification rests on the completed response plus the forced built-in OpenAI
provider, forced ChatGPT authentication, ignored user config/rules, no inherited API
keys or endpoint overrides, and retained execution metadata. It is not inferred from
the model flag alone. Global configuration, authentication and bridge files were
unchanged. Startup warnings were distinguished from actual tools.

The native plan remains
`96c60f10e334ab3f903d9bbd647bd717a63367985fa67a5b25df69285bf2ab33`.
An output-directory orchestration script reused the existing adapter/journal/plan
without changing their source or evaluation identity. Each invocation admits at most
20 fresh cases in frozen order and checkpoints every success. The pilot's 10
observations were reused, with 20 fresh development calls: **30/113 total**, 83
pending. The intermediate batch receipt contains a 22-case prefix; eight additional
preselected pilot cases make the audited unique total 30. No successful case was
resampled. Native consistency **INCOMPLETE / NOT RUN**, because full development is
not complete. There is no native blocker requiring a standalone repair command.

New native accounting: **31 CLI invocations** (one preflight, 30 development), not an
observed HTTP request count. Development usage: 168,127 input / 1,704 output tokens;
latency p50 6,309.269 ms, p95 28,026.379 ms including CLI startup. Native monetary cost
and remaining allowance are unknown. No API observation satisfies a native cache key.

## II. Responsibility

| Track | Valid development | Classification | Macro F1 | Guarded unsafe |
|---|---:|---:|---:|---:|
| Jev V5, full frozen development | 113/113 | 102/113 | 0.924200 | 0 |
| Luna API, partial | 43/113 | 40/43 | 0.932340 | 0 |
| Luna Codex, partial | 30/113 | 30/30 | 1.000000 | 0 |

These rows have different cohorts. On identical **43 API-available cases**, V5 is
41/43, macro F1 0.950000, versus API Luna 40/43, macro F1 0.932340. On identical
**30 native cases**, both V5 and Codex classify 30/30, macro F1 1.0. On the exact
**25-case three-way overlap**, V5 is 25/25, API Luna 24/25, Codex 25/25; API/native
classification agreement is 24/25. The overlap is an availability-selected subset.
Execution surface and configuration differ; causal attribution remains unmeasured.

API partial results: raw unsafe adverse 3, false DRIVER_CAUSED/LEVEL_2 0/0,
ordinal severity 25/43, conditioned severity 36/43, uphold precision/recall 2/2,
waive precision/recall 10/10, mandatory-review recall 19/19, review rate 31/43,
sufficiency FP/FN 0/4. Coverage includes one mandatory missing-evidence case and zero
critical contradictions, so guarded zeros cannot establish full adequacy.

Native partial results: raw unsafe adverse 1, false DRIVER_CAUSED/LEVEL_2 0/0,
ordinal severity 15/30, conditioned severity 29/30, uphold precision/recall 2/2,
waive precision/recall 8/8, mandatory-review recall 8/8, review rate 20/30,
sufficiency FP/FN 0/0. Coverage includes one mandatory missing-evidence case and one
critical contradiction; it is still incomplete. No labels or schemas were changed
to repair severity differences. V5's previously understood sufficiency errors remain
unchanged; no V6 was introduced.

### API continuation and stop

The old 42 successful cache entries were verified and preserved. The original
71-case pending queue was verified against the original 77-case manifest slice.
`driver_cancellation-missing_provenance` succeeded as frozen observation 1.
`driver_late-missing_provenance` then failed with HTTP 429 `rate_limit_exceeded`.
**Two fresh API calls: one success, one failure; retries 0.** New physical attempt
claims retain the original failed claim and original logical cache identity.
Fresh calls were sequential with at least 3,000 ms between starts.

The failure was recorded at `2026-10-08T14:23:13.924Z`; provider `retry-after-ms`
was 13,296,960. Earliest new retry:
**8 October 2026, 23:34:50.884 IST** (`2026-10-08T18:04:50.884Z`). This is a
provider timestamp, not a promise that capacity will be available then. Stop on the
next limit response; do not rerun this stopped invocation.

**43/113 complete, 70 pending**, in the unchanged original order. First pending:
`driver_late-missing_provenance`. The authoritative new pending state is
`output/codex-luna-native-resume-2026-10-08/responsibility-pending-state.json`.
A later allowed continuation must use a new append-only attempt directory, retain
all failed receipts, preserve each frozen logical identity, and reuse all successes.
The original manifest, old 42-case state and old stopped invocation are immutable.
Original API consistency precommit remains unchanged: 20 cases × five observations,
first observations reused, at most 80 fresh repeats. API consistency is incomplete;
V5 consistency is stable at 20×5.

Engineering recommendation: **continue full Luna API evaluation** after provider
capacity permits it. The original gate is retained. Native development remains
supplementary. Selected production candidate **NONE**; Phase 8.1 **INCOMPLETE / NOT
FROZEN**; held-out **NOT RUN**; Phase 8 **INCOMPLETE**; ready for Phase 9 **NO**.

## III. Search

Production-equivalent development **124/222**; Codex Search development **0**.
Luna API pending **50**; Places pending **48**. No Search or Places calls occurred.
Validated routing remains 221/222 with the retained Delta 2 strict rejection.
Authoritative safety violations remain **0 observed**, with provider grounding and
selected-place validation incomplete. Raw absent-role errors 8; ROLE_CONFLICT 10.
Model-callable tools 0; model-controlled Places NO.

S6 original AI verification **BLOCKED**; Codex verification **NOT RUN**. Known static
HIGH/CRITICAL findings 0; AI findings unmeasured. All 34 frozen Search source hashes
were reverified. The 12-capability/32-trace package was recomputed without its hash
field and matches `e85d9dec14d137a37600b4a412cce6d5c74bdd507151128e642d50ec144af01a`.
Search execution freeze **NOT FROZEN**; held-out **NOT RUN**. Search S5/S6 remain
incomplete and follow Responsibility completion under the latest priority.

## IV. Hindi/Hinglish

Separate frozen robustness suite **80 cases**; its content hash was reverified as
`f69ddab81d97627d4acdd7a02f188367ef2f99c8993cbdb9b116e7564d9a7d6d`.
Jev tested **0**; Codex tested **0**; production API baseline **NOT RUN**. Every field
accuracy and language-specific failure rate is **UNMEASURED**. Translation experiment
justification **UNDETERMINED**; experiment **NOT RUN**. Original source text and
provenance remain authoritative. Production-equivalent robustness gate **INCOMPLETE**;
rollout readiness **NO**. This suite is not an independent statistical held-out set.

## V. Verification and roadmap

- Backend regression rerun: **1519/1519 PASS**; backend typecheck PASS; scoped lint PASS.
- Reporting/orchestration script syntax PASS; `git diff --check` PASS.
- Critical adapter source changes: **0**. Prior coverage is retained with verified
  identical source bytes: eight modules, **100% statements/branches/functions/lines**.
- Prior mutation sign-off reverified against all eight current source proofs:
  **1003 unique; 971 killed, 13 detected timeouts, 19 reviewed scoped equivalents,
  zero meaningful survivors**. Large mutation suites were not rerun.
- Prior scoped duplicate count **0** and quality measurements retained with identical
  measured source hashes: max cyclomatic 12, cognitive 11, Halstead 26.943, source
  LOC 314, critical-module CRAP 12. Reporting scripts are outside the 100% scope.
- Cache identities verified: **43 API + 30 Codex**, separate execution identities.
  Same-cohort labels/evidence/guard inputs verified; benchmark leakage **0**.
- Frozen evidence, prompts, labels, schemas and splits unchanged. No production
  integration, rollout, shadow or consequences were enabled.

Evidence: `output/codex-luna-native-resume-2026-10-08/{preflight,pilot-gate,
all-native-cache-receipt,comparison,current-common-cohort,responsibility-pending-state,
final-status,validation}.json` and
`output/responsibility-api-continuation-2026-10-08/{development-receipt,
development-rows,pending-state}.json`.

```text
CODEX_LUNA: VERIFIED
RESPONSIBILITY PHASE 8.1: INCOMPLETE
RESPONSIBILITY PHASE 8: INCOMPLETE
SEARCH S5: INCOMPLETE
SEARCH S6: INCOMPLETE
HINGLISH ROBUSTNESS: INCOMPLETE
PHASE 9: NOT STARTED
PROJECT-WIDE PROOFLOOP APPLICATION: NOT STARTED
PUBLIC PROOFLOOP GENERALIZATION: NOT STARTED
```
