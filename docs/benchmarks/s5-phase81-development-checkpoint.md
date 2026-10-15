# Search review preparation and responsibility development checkpoint

Search and responsibility use independent datasets, labels, prompts, thresholds and conclusions. No final held-out inference, rollout, dual-shadow or automatic adjudication is authorized by this checkpoint.

## Search review preparation

Start with [the risk-ordered core review pack](../search/benchmark-v1/CORE_REVIEW_REQUIRED.md). It groups 142 core cases into 23 families, gives the specific decision, proposed affected labels and alternatives, and leaves already deterministic fields as context. All labels remain **PROPOSED**.

| Item | Result |
|---|---:|
| Core queries | 320 |
| Exploratory Hindi/Hinglish | 40, EXPLORATORY_UNSCORED |
| Original deterministic cases | 178 |
| Independent proof passed | 178 |
| Moved to human review | 0 |
| Core human review required | 142 |
| Unresolved-policy records | 21 |
| Proposed development / held-out | 222 / 98 |
| Template-family leakage | 0 |

The narrow independent proof grammar derives visible fields from query spans and frozen deterministic search rules. It does not use family IDs, proposed expected values or provider output to generate its predictions. Every eligible record is compared against its proposed labels; span/ownership errors, contradictions, unsupported interpretation and unresolved policies fail closed. A failed certificate moves the case into review without rewriting labels. Passing establishes **eligibility for class-level approval**, not human approval.

Machine-readable proof: [class-approval.json](../search/benchmark-v1/class-approval.json). Dataset hash: `3517a2aebdd38d2c19beb689abd0a8bfafa6ec8b8162d46da722e935936f4a6b`.

[Product-policy decisions](../search/benchmark-v1/product-policy-decisions.md) list all 21 IDs, affected fields, possible choices and downstream effects:

| Policy | Affected case suffixes | Affected semantic field |
|---|---|---|
| Omitted year | core-ambiguity-conflict-003, 008, 013, 018, 023 | Resolved date |
| Bare/this/next weekday | core-ambiguity-conflict-002, 007, 012, 017, 022 | Resolved date |
| Non-IST timezone | core-ambiguity-conflict-004, 009, 014, 019, 024 | Resolved date/time |
| Generic SUV exclusion scope | core-vehicle-preferences-005, 010, 015, 020, 025, 030 | Family-wide exclusions |

Those affected fields stay outside resolved-label metrics until product policy is frozen. The split is provisional; Search dataset approval, freeze, fallback tuning and final held-out execution remain pending.

### Google identity investigation

Autocomplete selected ID equaled the Details request ID. Google returned a different canonical ID in Details. Both calls used Places API (New); no selected-ID transformation, legacy/New conversion or wrong session token caused the mismatch. [Google documents that a Details response place ID can differ from the requested ID](https://developers.google.com/maps/documentation/places/web-service/place-id).

The ordinary Details identity guard remains strict. A session-bound Google response with a different ID, consistent `places/<id>` resource name, address and no moved-place indication may return a **409 selection-refresh requirement**. It supplies a replacement suggestion without coordinates. The user must explicitly select it again; the next Details response must match that selected ID. Forged/unbound, malformed and repeated identity changes fail closed.

Small live preflight: **PASS**, one autocomplete and two Details calls, one session, public Pari Chowk fixture. The refreshed selection was explicitly simulated by the preflight driver. Receipt: `output/ai-evaluation-preflight/google-refresh-result.json`. No full Search live benchmark was run. Customer natural-language search remains off.

## Responsibility Phase 8.1

### Four original false LEVEL_2 predictions

[The focused failure analysis](responsibility-phase81-severity-failures.md) preserves each evidence record, raw score/probabilities, label, mapping and gate route.

| Case | Truth | Jev score | HIGH probability |
|---|---|---:|---:|
| failed_pickup-ordinary_driver_evidence | DRIVER_CAUSED / LEVEL_1 | 1.56 | 0.60 |
| failed_pickup-available_driver_unresponsive | DRIVER_CAUSED / LEVEL_1 | 1.60 | 0.63 |
| driver_late-ordinary_driver_evidence | DRIVER_CAUSED / LEVEL_1 | 1.51 | 0.61 |
| driver_late-available_driver_unresponsive | DRIVER_CAUSED / LEVEL_1 | 1.55 | 0.63 |

The ordered SDK score mapping is mathematically correct; there is no observed adapter inversion. However, the severity question supplies only short LOW/MODERATE/HIGH choices, with no frozen criteria, and its midpoint thresholds remain uncalibrated. Evidence contains ordinary avoidable driver action and baseline presence; it has no affirmative aggravating facts. In particular, the `available_driver_unresponsive` display name is not sent to the provider and its evidence does not prove repeated unresponsiveness. Prompt/criteria and evidence context are underspecified; raw model judgment disagrees with the synthetic LEVEL_1 reference. This single run does not isolate their causal contributions.

All four route to review. Independent tests also allow HIGH under a test-only policy and verify that non-driver responsibility, insufficient evidence, required human review, material platform/external cause and contradictions still prevent adverse automation. No question or threshold was tuned in this checkpoint.

### Expanded development experiment

Frozen V2 remains 163 cases, 104 development / 59 held-out. Six independent development-only serious-incident cases add affirmative conflicting commitments and deliberate unavailability. That creates a 110-case development experiment: 84 LEVEL_0, 20 LEVEL_1, six LEVEL_2; 26 DRIVER_CAUSED, 21 PLATFORM_CAUSED, 63 EXTERNAL_OR_UNCERTAIN. It includes missing evidence, contradictions, safe-uphold, safe-waive and review cases.

Completed experiment hash: `9390a04d995b9c639bd19abb52432d2f9ee14bb2fec692e95cc6c8f196eb5ce4`. Configuration hash: `4a0bc4c6e9c78529ad7acaa4f01d16123e8f5fe761e7d1db934770bb04233171`. Twenty-four prior development responses were replayed only after validating dataset/input/configuration/domain/run identity; their gates were recomputed. No held-out response was replayed.

| Metric, 110-case experiment | Jev | Luna |
|---|---:|---:|
| Successful responses | 110 | 33 |
| Provider failures | 0 | 77 |
| Successful-only responsibility accuracy | 84/110 (76.36%) | 30/33 (90.91%) |
| Raw ordinal-severity proxy accuracy | 22/110 (20.00%) | 21/33 (63.64%) |
| Responsibility-conditioned consequence-level accuracy | 101/110 (91.82%) | 32/33 (96.97%) |
| False DRIVER_CAUSED | 5 | 0/33 |
| Raw false LEVEL_2 | 5 | 0/33 |
| Unsafe raw adverse recommendations | 11 | 0/33 |
| Gated unsafe auto-uphold candidates | 0 | 0 |
| Gated false LEVEL_2 routes | 0 | 0 |
| Missing-evidence / contradiction unsafe routes | 0 / 0 | 0 / 0 |
| Review outcomes, including failed-call fallback | 102/110 | 101/110 |
| Review recall | 83/83 | 83/83 |
| Safe-uphold precision / recall | 8/8; 8/8 | 2/2; 2/8 |

LOW/MODERATE/HIGH is an ordinal proxy, not itself the frozen consequence level: a DRIVER_CAUSED LOW suggestion still maps to LEVEL_1 in the benchmark. Both proxy and conditioned level are retained, not conflated. Failed calls are excluded from raw accuracy. The successful cohorts are unequal, so this table is **not a winner selection**. Luna returned no successful LEVEL_2 examples.

The fifth Jev false LEVEL_2 occurred on `driver_offline-received_at_vs_observed_at`, an uncertain stale-observation case. It remains visible in raw metrics and routes to review. Raw Jev macro F1 in the 110-case run is 0.5824; the absent valid-waiver positive stratum limits that run.

A separate independent three-case development-only valid-waiver supplement remedies that missing stratum using authenticated rider-requested release plus an explicit incident-bound recorded admin waiver. It introduces no new valid-reason policy and changes neither the completed 110-case receipt nor V2 held-out families. These are **synthetic administrative facts, not real human-final cases**. Supplement hash: `618bee7137a3be6fc81c0f3ca8dc0c1cb07069bf4857f6e27be59abc5ed78add`.

Jev completed three supplementary calls: 3/3 VALID_WAIVED / LOW, one shadow waiver recommendation and two review recommendations due to inconsistent external-cause answers. No false driver/LEVEL_2/unsafe-uphold results in that supplement. Total development coverage is now 113 cases. Luna supplement execution remains blocked by quota.

Corrected main report: `output/phase81/expanded-development-1791126083366-review.json`. Supplement receipt: `output/phase81/waiver-development-result.json`. Historical main `-summary.json` predates explicit provider-failure separation; use `-review.json` for interpretation.

### Providers, quota and capabilities

OpenAI Luna access/funding preflight succeeded: the former access blocker is **RESOLVED**. The expanded run then encountered 65 RPM and 12 RPD failures, with observed limits 10 requests/minute and 50/day. Two bounded later LEVEL_2 retries also failed with rate limits. No further Luna retry is justified until quota allows it. The development runner now paces calls, caps requests and opens a fail-closed circuit on AUTH, QUOTA, RATE_LIMIT or missing model/API. Failures are redacted in receipts.

Jev uses TypeSafe SDK 0.6.0, requested `jev-latest`, actual `jev-1.13.0`. Luna uses OpenAI SDK 7.10.0, exact `gpt-6-luna`, strict bounded Structured Outputs, low reasoning, 512 output-token cap, 60-second timeout and no SDK retry. Domain questions/schema are separate from Search.

Successful new-call latency p50/p95: Jev **330/384 ms** (98 calls); Luna **2112/2601 ms** (21 calls). New-call usage: Jev 165,384 input / 16,653 output tokens; Luna 17,945 input / 1,254 output tokens. Historical replay latency is not treated as new-call performance. Monetary cost is unavailable without authoritative versioned pricing inputs.

Five-run Jev consistency is now measured on nine development cases: 45 successful responses, reusing nine initial responses and making 36 additional calls. Classification consistency is **9/9 (100%)**, review consistency **8/9 (88.89%)**, and responsibility-conditioned consequence-level consistency **7/9 (77.78%)**. Two driver-late cases fluctuate across the current severity midpoint; the synthetic administrative waiver case changes review routing. The actual model remained `jev-1.13.0`. Per-case score/probability variances are preserved in `output/phase81/development-consistency-result.json`. These results do not calibrate thresholds or establish held-out quality. Luna consistency remains unmeasured because of quota.

Decisions discovery: actual `models.list` succeeded, but exposed no decision-named model. Installed SDK and official public documentation provided no actionable Decisions request contract. **Entitlement remains UNKNOWN; contract unavailable; benchmark not executed.** Absence from model discovery does not prove an account entitlement denial. No endpoint or SDK method was invented.

Real human-final cohort remains **0**. No production/runtime database was queried or copied. Synthetic strata and safe gating do not establish production auto-adjudication safety.

## Validation and remaining work

Final backend regression: **1305/1305 PASS** (`output/phase81/checkpoint-final-backend.log`). The coverage regression passed **1304/1304**; all statements, branches, functions and lines are **100% across 22 scoped modules**, including the Google HTTP proxy. Later targeted assertions also passed: Search **12/12**, responsibility null-response/budget **14/14**. Coverage reporting reused that run's raw coverage with bounded source directories, avoiding traversal of concurrent mutation sandboxes; tests were not substituted or skipped.

Backend typecheck and scoped JS/TS/route lint: **PASS**. Complexity/CRAP measured across those 22 modules: maximum physical LOC **377**, cyclomatic **21**, cognitive **20**, Halstead Difficulty **32.121**, CRAP **21**, no violations. The 22-module duplicate scan found **0 clones**. Scoped explicit `any`/`unknown` scan found none; lint/static consumer inspection found no introduced unused code. `git diff --check` passed and 33 explicitly owned files had no trailing whitespace. Receipts: `output/phase81/checkpoint-quality.json`, `checkpoint-duplicates/jscpd-report.json`, `checkpoint-static.json`, `checkpoint-diff-status.txt`.

Mutation runs overlap and must **not** be added together:

| Run | Total | Killed | Survived | Timeout |
|---|---:|---:|---:|---:|
| Earlier full Phase 8 | 1857 | 1650 | 206 | 1 |
| Phase 8.1 final critical | 703 | 634 | 68 | 1 |
| Phase 8.1 strengthened witness | 324 | 316 | 7 | 1 |
| Phase 8.1 dataset identity witness | 8 | 8 | 0 | 0 |
| Phase 8.1 null-response/pacing witness | 10 | 10 | 0 | 0 |
| Search final critical | 579 | 490 | 89 | 0 |
| Search strengthened witness | 128 | 120 | 8 | 0 |
| Search audit/endpoint witness | 49 | 49 | 0 | 0 |
| Google identity boundary | 54 | 54 | 0 | 0 |

The strengthened tests kill earlier meaningful gaps in label isolation, probability bounds, independent unsafe-route criteria, raw/gated denominators, frozen identity checks, rejection reasons and endpoint identity. Remaining historical survivors still require per-mutant reconciliation and justified equivalence analysis. **Global meaningful-survivor signoff remains PENDING**, not zero. Raw survivors are not automatically meaningful or equivalent; historical timeouts are not silently counted as killed. Inventory: `output/phase81/latest-mutation-inventory.json`.

The final null-response/pacing replay killed the strengthened run's missing-analysis survivor and stalled-wait timeout with explicit null-response exclusion and a bounded test watchdog. The six remaining responsibility witness survivors are contract-equivalent: optional chains guard values already guaranteed by a validated runner envelope, array scanning equals object-entry scanning for normalized JSON arrays, and the strict/inclusive probability tolerance differs only at an unrepresentable IEEE-754 boundary. The Search witness's two remaining label-status survivors are redundant under its strict `LABELLED`/`NOT_LABELLED` schema and defined independent output values. The six other Search witness survivors were killed in the 49-mutant replay. These **narrow dispositions do not clear the broader historical reports**. Exact report/ID justifications are in `docs/benchmarks/s5-phase81-mutation-audit.md`.

A benchmark-reporting defect was corrected: the four-failure diagnostic previously hard-coded `level2Automated: false`; it now derives that flag from the simulated deterministic gate route. Tests exercise a deliberately unsafe simulated route as well as the original four protected routes. Production responsibility behavior is unchanged.

Remaining barriers:

- Search: product-owner review of the 178-case class and 142-case core pack, 21 policy-affected records, then dataset/split freeze and development calibration. No final held-out run or rollout yet.
- Responsibility: finish mutation triage, obtain successful Luna development coverage including LEVEL_2 and the waiver supplement, then development calibration/configuration freeze before held-out. Real human-final calibration remains unavailable.
- Decisions: lack of an actionable API contract prevents that candidate's comparison; it does not block Jev/Luna work.

Neither track changes production responsibility analyst selection, appeals/finalization, financial/reliability consequences or customer Search rollout. Shared infrastructure is limited to the existing domain-keyed inference cache. Search labels/thresholds do not control responsibility; responsibility labels/thresholds do not control Search.
