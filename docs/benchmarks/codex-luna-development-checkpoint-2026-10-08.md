# Responsibility / Search — Codex Luna development checkpoint, 8 October 2026

This continues [the API checkpoint](responsibility-resume-checkpoint-2026-10-08.md).
Jev API, Luna API and Luna through Codex remain separate execution tracks. No business
policy, benchmark label, production integration or original freeze gate was changed.

## PART I — Codex Luna adapter

Implemented development infrastructure in `backend/benchmarks/codex/`:
`config.js`, `process.js`, `events.js`, `adapter.js`, `journal.js`, `plan.js`,
`responsibility.js`, `metrics.js`. Entry points:
`backend/scripts/codex-luna-preflight.mjs` and
`backend/scripts/responsibility-codex-development.mjs`.
[Execution, cache rules and standalone commands](../../backend/benchmarks/codex/README.md).

| Check | Actual result |
|---|---|
| Installed/evaluated CLI | 0.160.1 |
| `gpt-6-luna` availability | NOT VERIFIED: no completed native response |
| Native account authentication | CLI reports ChatGPT sign-in; inference path NOT VERIFIED |
| Local bridge bypass | Isolated config/environment configured; end-to-end inference NOT VERIFIED |
| Read-only isolation | Configuration/fixture checks PASS; native inference isolation NOT VERIFIED |
| Unexpected tool calls | 0 observed |
| Structured output | Fixture validation PASS; native completion NOT VERIFIED |
| Resume/cache tests | PASS |
| Codex usage limitation | UNKNOWN; no exhaustion response observed |

Two bootstrap defects were fixed: the resolver had selected a different bundled
binary (0.162.0-alpha.2), and a retry override attempted to redefine reserved built-in
provider `openai`. That launch rejected local configuration before a native thread.
The corrected native 0.160.1 invocation started a thread, but the original event
monitor aborted on startup warning items. Those were diagnostics, not tool calls.
The monitor now recognizes the exact warnings; other errors and tool events fail
closed. No completed response, pilot output or development observation was obtained.
The stopped preflight was not repeated during the continuation.

Original receipts/claims are immutable. Their incorrect initial tool counter remains
visible; [the audited interpretation](../../output/codex-luna-2026-10-08/preflight-audit.json)
records zero observed tool calls, two startup warnings and no completed response.
Nested execution is not established as either supported or unsupported by this stop.

The latest immutable development plan is
`output/codex-luna-2026-10-08/responsibility-plan-96c60f10e334ab3f903d9bbd647bd717a63367985fa67a5b25df69285bf2ab33.json`.
It contains 113 cases in deterministic order, 10 fixed pilot cases and the existing
20-case risk subset × five observations, with at most 80 fresh repeats. Earlier
preparation manifests are retained; none produced scored Codex results. Configuration
identity includes adapter, guard and runner source hashes. Startup verifies dataset
identity, every evidence hash and equality of model/guard evidence. The actual pilot
entry point rejected the unverified backend without inference.

Validation: **1519/1519 backend tests PASS**, typecheck PASS, scoped lint PASS,
duplicate clones **0**, whitespace checks PASS. The eight new critical modules have
**100% statements/branches/functions/lines** coverage. Source function complexity is
below 22, cognitive complexity below 22, source files below 500 LOC and scoped CRAP
below 25. Halstead is below 80 using ES2017 lowering for the legacy analyzer; its
measurement includes generated helpers and is identified in the artifact.

Mutation sign-off: **1003 unique mutations; 971 killed, 13 detected timeouts,
19 reviewed scoped equivalents, 0 meaningful survivors**. The complete run and
146-mutation witness run retain identical source proofs. Equivalence reasons are
per mutation, including the verified npm layout limitation. Historical Responsibility
and Search mutation scopes were not reopened; their meaningful survivor counts remain
zero. Reporting/entry scripts are not included in the 100% critical-module coverage claim.
[Validation](../../output/codex-luna-2026-10-08/validation.json),
[mutation review](../../output/codex-luna-2026-10-08/mutation-signoff.json).

## PART II — Responsibility three-way comparison

| Metric | Jev V5, full development | Luna API, existing partial cohort | Luna Codex |
|---|---:|---:|---|
| Valid development cases | 113/113 | 42/113 | 0/113 |
| Classification | 102/113 | 39/42 | UNMEASURED |
| Macro F1 | 0.924200 | 0.929731 | UNMEASURED |
| False DRIVER_CAUSED | 0 | 0 | UNMEASURED |
| False LEVEL_2 | 0 | 0 | UNMEASURED |
| Unsafe raw adverse | 0 | 3 | UNMEASURED |
| Unsafe guarded outcomes | 0 | 0 | UNMEASURED |
| Safe-uphold precision / recall | 5/5; 5/8 | 2/2; 2/2 | UNMEASURED |
| Safe-waive precision / recall | 10/10; 10/10 | 10/10; 10/10 | UNMEASURED |
| Mandatory-review recall | 83/83 | 18/18 | UNMEASURED |
| Review rate | 98/113 | 30/42 | UNMEASURED |
| Sufficiency FP / FN | 28 / 0 | 0 / 4 | UNMEASURED |
| Raw ordinal severity | 113/113 | 24/42 | UNMEASURED |
| Consistency | Stable, 20×5 | INCOMPLETE | INCOMPLETE / NOT RUN |

The first two columns use different cohorts. On the identical **42 cases**, V5 is
**40/42**, macro F1 **0.947222**; API Luna is **39/42**, macro F1 **0.929731**.
That partial cohort contains **zero missing-mandatory-evidence cases and zero critical
contradiction cases**. Its guarded zeros do not establish adequate coverage.
V5's understood sufficiency disagreements remain unchanged and route-affecting
disagreements remain zero. All three raw API adverse errors remain contained.

Codex cohort A has zero valid cases; three-way cohort B has zero overlap pairs.
API/Codex agreement is **UNMEASURED, denominator 0**, not 0% agreement. Execution
environments/configurations differ by design; causal attribution of output differences
cannot be measured without outputs. No API observation is reused as a Codex observation.
Latency/usage retain their original API measurements; native Codex usage is unknown.
No monetary cost is manufactured from API prices or Codex allowance.

## PART III — Responsibility phase status

Selected production candidate **NONE**. Original API-comparison gate **STILL REQUIRED**;
no gate amendment proposed or applied. Phase 8.1 **INCOMPLETE / NOT FROZEN**.
Responsibility held-out **NOT RUN**; held-out leakage **0**. Phase 8 **INCOMPLETE**;
ready for Phase 9 **NO**. V5 is the best internal candidate, not a finalized selection.

The API's 42 successful responses and original 71-case pending order remain intact.
Latest historical retry metadata is 8 October 2026 **16:47:34.301 IST**. No API request
was issued merely because that timestamp elapsed. Next permitted live work is one
fresh, fixed-monitor native preflight in a new run directory. Only a verified result
can admit the fixed pilot and later development/consistency. Standalone commands are
prepared in the guide; they have not been executed here. No new owner policy decision
is pending. The original production API coverage requirement cannot be replaced by
unmeasured Codex evidence.

## PART IV — Search

Production-equivalent development **124/222**; Codex development **0 cases**.
Luna API pending **50**; Places pending **48**. No Search/Places/S6 calls were made.
Application-authoritative safety violations **0 observed**, with remaining provider
grounding/selection validation incomplete. Validated routing **221/222**; retained
Delta 2 rejection remains unchanged. Raw absent-role errors **8**, ROLE_CONFLICT **10**.

S6 original verifier **BLOCKED**; Codex verifier **NOT RUN**. Known static unresolved
HIGH/CRITICAL findings **0**; AI findings remain unmeasured. The frozen 12-capability,
32-development-trace package remains at
`e85d9dec14d137a37600b4a412cce6d5c74bdd507151128e642d50ec144af01a`.
Model-callable Search tools **0**; model-controlled Places **NO**. Search execution
contract **NOT FROZEN**; held-out **NOT RUN**. Codex is supplementary and cannot
automatically complete the 50 deployed API fallbacks or 48 Places records.

## PART V — Hindi/Hinglish

Separate robustness dataset **FROZEN, 80 cases**; Search V1 unchanged. This is not an
independent statistical held-out benchmark. Jev baseline **NOT RUN**; Codex exploratory
baseline **NOT RUN**; production-equivalent baseline **INCOMPLETE**. Language-specific
deficit **UNKNOWN**; translation justification **NOT YET DETERMINED**; normalization
experiment **NOT RUN**. Authoritative safety violations **UNMEASURED**, not zero.
Ready for controlled rollout **NO**. Original text remains authoritative.

## PART VI — Final status

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
RESPONSIBILITY DUAL-SHADOW: OFF
AUTO-ADJUDICATION: OFF
PROJECT-WIDE RCS PROOFLOOP APPLICATION: NOT STARTED
PROOFLOOP PUBLIC GENERALIZATION: NOT STARTED
```
