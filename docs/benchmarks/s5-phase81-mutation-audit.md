# Two-track mutation audit — global signoff pending

Reports overlap. IDs identify a mutant only together with its report. No historical survivor is waived just because a newer narrow run passed. The outstanding full-scope reconciliation remains a blocker to mutation signoff.

## Responsibility strengthened witness

Report: `backend/coverage/phase81-witness-mutation.json`: 324 total, 316 killed, seven survived, one timed out.

| ID | File/line | Disposition and justification |
|---|---|---|
| 7 | benchmark.js:284 | Contract-equivalent optional-chain removal. The preceding non-null normalized result and `run.error` access already require a run object; only then can this expression access its gate. |
| 33 | metrics.js:61 | Contract-equivalent for normalized JSON model input. An array's present index values are scanned by both `every` and `Object.entries(...).every`; neither skips a present label/sentinel. Empty/sparse arrays also agree. Custom enumerable array properties are outside normalized JSON and are not sent to providers. |
| 52 | metrics.js:149 | Equivalent numeric boundary. Around a sum of one, its exact distance from one is an integer multiple of 2^-53 or 2^-52. The double `0.000001` is not such a multiple. Thus strict versus inclusive comparison cannot differ at this boundary. Values further from one cannot qualify under either comparison. Probability bounds are separately tested. |
| 120 | rawGatedMetrics.js:2 | Contract-equivalent optional-chain removal. Severity is read only after the successful-response filter; actual runner envelopes contain a validated normalized object or null with a provider error. Missing-analysis exclusion is independently tested. |
| 126 | rawGatedMetrics.js:3 | Contract-equivalent optional-chain removal on `run`. A missing run already fails the earlier `row.results[candidate].normalized` access. Every admitted row has a run envelope. |
| 134 | rawGatedMetrics.js:4 | Contract-equivalent for actual runner envelopes. Failed envelopes short-circuit on their error; successful envelopes carry a simulated gate. This is not a claim that arbitrary malformed objects are valid benchmark input. |
| 153 | rawGatedMetrics.js:8 | Meaningful missing-analysis guard; **killed** by the subsequent null-response/pacing witness. A null analysis without an error marker must still be excluded from raw accuracy. |
| 14 | developmentBudget.js:12 | Stalled promise after removing the timer/resolve executor. The earlier run timed out; the subsequent bounded test-watchdog replay **killed** it. The old timeout is not retroactively counted as a kill. |

Replay: `backend/coverage/phase81-null-response-witness-mutation.json`, **10/10 killed**. Actual changed-dataset/insufficient-strata defenses: `phase81-identity-witness-mutation.json`, **8/8 killed**.

## Search strengthened witness

Report: `backend/coverage/search-s5-witness-mutation.json`: 128 total, 120 killed, eight survived.

| ID | File/line | Disposition and justification |
|---|---|---|
| 5 | approval.js:104 | Exploratory certificate eligibility/count guard: **killed** in the audit replay. |
| 26, 32 | approval.js:108–109 | Audit rejection reasons: **killed** in the audit replay. |
| 55, 56 | approval.js:116 | Contract-equivalent redundant status guard under strict schema validation. `NOT_LABELLED` forbids a value; known independently derived fields always have defined JSON values, so comparison rejects them. Unknown fields remain rejected by membership checking. `LABELLED` requires a JSON value. Removing/changing this status subexpression therefore cannot certify an unlabelled field. |
| 86 | classReview.js:54 | Incorrectly claims a proof failed for ordinary review cases: **killed** in the audit replay. |
| 96 | classReview.js:56 | Adds nonexistent error codes as reviewable semantic fields: **killed** in the audit replay. |
| 120 | grounding.ts:117 | Treats distinct authoritative IDs as equal: **killed** in the audit replay. |

Replay: `backend/coverage/search-s5-audit-witness-mutation.json`, **49/49 killed**. Google refresh identity boundary: `search-s5-identity-mutation.json`, **54/54 killed**.

## Remaining full-scope work

Reconcile the earlier full Phase 8 report, broader Phase 8.1 safety/critical reports, and broader Search approval/critical reports with these later witnesses. Re-run unresolved meaningful changes, including audit metadata and legacy benchmark adapter/CLI paths where relevant. Cosmetic text or redundant guards require an individual contract-based justification; they are not automatically waived. The machine-readable inventory preserves all report counts and unreviewed findings at `output/phase81/latest-mutation-inventory.json`.

**MEANINGFUL SURVIVING PHASE 8 MUTANTS: PENDING.** No held-out inference, Search rollout or responsibility dual-shadow is enabled by this audit.
