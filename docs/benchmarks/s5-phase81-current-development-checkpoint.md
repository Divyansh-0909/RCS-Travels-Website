# Search S5/S6 and Responsibility Phase 8.1 development checkpoint

For current Search counts and provider-stop state, read the [later provider-stage checkpoint](provider-resume-checkpoint-2026-10-07.md). This file retains the historical 131-attempt snapshot and unchanged Responsibility development conclusions.

Recorded 7 October 2026, Asia/Kolkata. This supersedes older development counts and source identities. Frozen Search Benchmark V1 labels and split are unchanged.

Latest offline continuation: [provider-light checkpoint](provider-light-checkpoint-2026-10-07.md). It records all 28 sufficiency disagreements, eight wrong-role location cases, three metric layers, the frozen 77/109-case resume queues and updated 32-trace S6 package identity. No inference occurred in that continuation.

No held-out inference, execution freeze, rollout, responsibility dual-shadow, auto-adjudication, production consequences, multi-stop implementation or project-wide pipeline audit has started.

## Part I — Responsibility Phase 8.1

Criteria v3 remains the reference. Criteria v5 is the best internal development candidate; it is not promoted or frozen. V4 remains a historical experiment. All use TypeSafe SDK 0.6.0 and requested jev-latest; observed Jev model is jev-1.13.0.

The 21-case v3/v4 differential and 42-call ablation separate the causes: v4 external-cause wording improves waiver recognition, while its review wording forces complete ordinary cases into review. External-only ablation retained five safe upholds and recovered three waivers; review-only ablation retained zero safe upholds. V5 preserves the external-cause wording and clarifies blocking review conditions. Evidence, labels and deterministic guard remain unchanged.

| Metric | V5 development |
|---|---:|
| Classification | 102/113 |
| False DRIVER_CAUSED / false LEVEL_2 | 0 / 0 |
| Unsafe raw adverse / unsafe post-guard uphold | 0 / 0 |
| Safe-uphold precision / recall | 5/5 / 5/8 |
| Safe-waive precision / recall | 10/10 / 10/10 |
| Review recall / rate | 83/83 / 98/113 |
| Evidence-eligible waivers | 3 VALID_WAIVED + 7 PLATFORM_CAUSED; classification is preserved |
| Consistency | 20 risk-stratified cases × 5 runs; classification, severity, review, route, safe uphold and safe waive stable |

There are still 28 raw evidence-sufficiency answers that disagree with the labels. Guarded system safety does not turn these into correct model answers. Human-final calibration cohort remains zero.

V5 used 193 historical Jev calls including the consistency cohort, 544,061 input and 71,593 output tokens, request latency p50 345 ms / p95 402 ms. No fresh Responsibility inference was made in this continuation. Monetary cost is unavailable without authoritative pricing.

The new offline common-cohort audit verifies exact input/evidence hashes and cache keys for 36 existing Luna responses. The same development guard is applied to both providers; historical raw responses are retained.

| Existing common-cohort metric | V5 | Luna |
|---|---:|---:|
| Classification | 34/36 | 33/36 |
| Macro F1 | 0.6972 | 0.6786 |
| False DRIVER_CAUSED / LEVEL_2 | 0 / 0 | 0 / 0 |
| Unsafe raw adverse / post-guard uphold | 0 / 0 | 2 / 0 |
| Safe-uphold precision / recall | 2/2 / 2/2 | 2/2 / 2/2 |
| Safe-waive precision / recall | 7/7 / 7/7 | 7/7 / 7/7 |
| Review recall / rate | 15/15 / 27/36 | 15/15 / 27/36 |
| Request latency p50 / p95 | 344 / 407 ms | 1,843 / 3,153 ms |
| Input / output tokens | 97,757 / 13,329 | 32,330 / 2,317 |

This cohort has no VALID_WAIVED cases and has provider-availability selection bias. Macro F1 uses the benchmark four-class implementation, including the absent class. Common-cohort/Luna consistency is unmeasured. These results do not select a final winner.

Luna: 36 successful development records; VALID_WAIVED=0; LEVEL_2=3; 77 missing development records. Retry window elapsed: NO. Fresh preflight: NOT ALLOWED YET. Earliest recorded retry: **8 October 2026, 08:40:08.833 IST** (2026-10-08T03:10:08.833Z).

Mutation: 3069 killed, 66 equivalents, 4 non-actionable; meaningful survivors=0. This includes the 17 v5 mutations. No broad Responsibility mutation rerun was made.

**READY TO FREEZE PHASE 8.1: NO.** Remaining blockers: missing Luna VALID_WAIVED/other development coverage, adequate common-cohort comparison and Luna consistency, followed by final candidate selection and configuration freeze.

Evidence: `output/phase81/v3-v4-differential/{table,ablation-summary}.json`; `criteria-v5-development/{summary,usage-summary,luna-common-cohort-audit}.json`; `canonical-mutation-reconciliation.json`.

## Part II — Search S5

Frozen V1: 320 core records, 222 development, 98 held-out, 40 unscored exploratory inputs, zero template-family leakage.

Dataset hash: `2c2a0d7099c4b65be9495d08d5049e72fb44b6d49f84b82c65dbaf643ca61296`.
Split hash: `aea66b52ac37ddea99d4bb1c2861d63c70c7e7a3e84f7946a9c0a1a5414ef5de`.
Current source manifest: `c77064288ede005d600d446b628271d9699e66e94ea43e2073e20ba071ba423c`.
Current execution config: `f4290b70c05e2efab1dde06021328e09ae576db38c0bb2a8862af08327dc6b34`.

The prefix defect was an overly wide bare-route pickup capture. Courtesy stripping clips original spans without rewriting UTF-16 offsets. Routing wording separates numbered place names and unrelated information. Later development exposed independent vehicle-question ambiguity and closed flag tails swallowed into destinations. Three historical responses softened required classes; six lost explicit ANY through irrelevant vehicle uncertainty. Strength now binds to explicit source wording, and literal positive ANY with no competing class retains source references without unused vehicle questions. These are general source rules; labels and split were not edited.

Current-source Jev/S3: 131/222 attempted; 113/222 interpretations complete; 17 Luna/fallback pending; 1 Places-blocked; 91 unattempted. The run stopped on Google PLACES_QUOTA; no retry timestamp was reported and no retry was made. Every failure remains recorded. Earlier configurations are historical evidence and were not selected for favorable answers.

| Completed current-source subset metric | Result |
|---|---:|
| queryType | 113/113 |
| complexity | 113/113 |
| vehicle | 113/113 |
| timingMode | 113/113 |
| date | 113/113 |
| time | 113/113 |
| passengers | 113/113 |
| flags | 113/113 |
| Pickup spans | 76/76 |
| Drop spans | 69/69 |
| Endpoint reversals | 0 |
| Missing-field recall | 146/146; extra requirements 0 |
| Ambiguity recall | 4/4 |
| Unsupported-intent recall | 7/7 |
| Vehicle exclusions | 22/22 |
| Supplied flags silently lost | 0 cases |

All-attempted routing, including failed/pending responses: 130/131. Original 131-case cohort complete: 75/131. **Non-Luna subset: FAIL**; provider failures are not successful parses.

Observed completed-subset zero-tolerance failures: 0. All-attempted raw/partial location inventions under the benchmark absent-role metric: 8; these must be inspected separately from completed-system safety. Full Jev+Luna safety, necessary/unnecessary fallback rates, Luna recovery and selected-place grounding remain unmeasured. No live details selection was performed.

Current calls: 261 Jev attempts / 258 completed; 165 Google autocomplete including preflight; zero details, Luna and Decisions calls. Tokens 381,649 input / 92,850 output; missing usage=0; Jev request latency p50 344 ms / p95 432 ms. Monetary cost unavailable without authoritative pricing.

Search mutations: 2063 killed, 90 justified equivalents, 2 detected/non-actionable timeouts; meaningful survivors=0, required source retests=0. Current extractor/vehicle-policy/questions were retested together, with reviewed survivor witnesses and equivalence proofs. Changed flag-tail mutations: 61 killed, four justified equivalents, 1,120 differential witness comparisons with zero differences. Historical reports and their source identities remain recorded; overlapping counts are not additive.

**Execution contract: NOT FROZEN. Search held-out: NOT RUN. Rollout: OFF.** Remaining blockers: restore Places availability, complete the 91 unattempted current-source cases and the recorded Places-blocked work without replacing failures, complete pending fallbacks after an allowed successful Luna preflight, satisfy all development gates including the non-Luna gate, complete S6 AI verification, then freeze configuration before held-out execution.

Evidence: `output/search-s5-authorized-development/current-development-audit.json`; current run named in `development-plan.json`; `mutation-reconciliation.json`. Historical prefix/vehicle-routing/flag-tail attempts and their failures remain in their original run folders.

## Part III — Search S6

Static audit: **PASS for known boundaries**. Current package: 12 capabilities and 32 development-only traces, strict Zod-derived schemas and current source/dependency hashes. Package hash: `e85d9dec14d137a37600b4a412cce6d5c74bdd507151128e642d50ec144af01a`; input packet hash: `447920d9b26e161579bbae7d44c2f73b91a95e8c4cf0140f8922f2f281792a7f`. The offline continuation added metric boundaries and revisited deferrals without changing the 32 traces. No held-out inputs or benchmark labels enter the verifier packet.

Engineering findings: 14 accepted/fixed, 0 rejected, 3 deferred with reasons. Unresolved known static HIGH/CRITICAL=0. Deferred findings concern contained provider availability/source-binding failures; full Luna recovery is unmeasured. These engineering dispositions are not AI findings.

AI verifier: **BLOCKED** by the recorded Luna window. AI findings, accepted/rejected/deferred AI findings and AI HIGH/CRITICAL counts: **UNMEASURED**. S6 development: **INCOMPLETE**.

Model-callable tools required by the static architecture: NO (zero registered). Model-controlled Google Places: NO. One-shot interpretation → deterministic form resolution: PRESERVED.

Evidence: `docs/search/s6-development/{verifier-input,engineering-review,verifier-package}.json`.

## Part IV — Pipeline status and continuation

| Workstream or gate | Status |
|---|---|
| Search S5 / S6 | INCOMPLETE / INCOMPLETE |
| Search held-out / ready for controlled rollout / rollout | NOT RUN / NO / OFF |
| Responsibility Phase 8.1 / Phase 8 | INCOMPLETE / INCOMPLETE |
| Responsibility held-out / ready for future zero-consequence shadow | NOT RUN / NO |
| Dual-shadow / auto-adjudication / production consequences | OFF / OFF / OFF |
| Multi-stop implementation / project-wide pipeline application / public generalization | NOT STARTED / NOT STARTED / NOT STARTED |

Validation: full backend 1446/1446 PASS; backend typecheck PASS; focused production/tooling lint PASS; changed extractor/questions/vehicle-policy/booking-tail plus dependent temporal-suffix line/branch/function coverage 100%; changed production cyclomatic maximum 21, cognitive maximum 19, Halstead difficulty maximum 31.172, CRAP at 100% scoped coverage 21, source files <500 lines; changed parser-module duplicate scan zero clones. These are scoped measurements, not project-wide audit claims. See final validation logs and static-quality artifact. Repository whitespace check is recorded separately after writing this checkpoint.

Next eligible provider work: after the explicit retry timestamp, run exactly one small Luna preflight with retries disabled. On provider-limit failure, stop and persist the new delay. On success, prioritize the 77 missing Responsibility development records, including all three VALID_WAIVED cases, then complete only current Search pending fallbacks from their cached Jev/S3 results, then run the S6 AI verifier. Compare identical evidence, retain failures and apply the existing guard. Run risk-stratified Luna consistency only after its development gates pass. Do not rerun successful current-config Search interpretations without a relevant source/config invalidation.

No final candidate selection, held-out execution, rollout, consequences or next project-wide phase is authorized by this checkpoint. Existing conditional held-out authorization applies only once every corresponding development/freeze gate passes. No owner decision is pending.
