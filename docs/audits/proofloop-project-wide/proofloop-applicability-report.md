# Applicability and risk classification

11 October 2026 (IST). Planning only. Machine entries: [features.json](../../../output/proofloop-project-wide-audit-2026-10-11/features.json), [complete-feature-matrix.csv](../../../output/proofloop-project-wide-audit-2026-10-11/complete-feature-matrix.csv), [policy-registry.json](../../../output/proofloop-project-wide-audit-2026-10-11/policy-registry.json).

## Classification rule

FULL_PROOFLOOP applies to consequential stateful workflows whose components can individually pass while composition violates owner/financial/authority invariants. Required relevant stages are failure hypotheses, scenarios, reproducible owned initial state, actual service execution, controlled faults, invariant assertions, immutable evidence, executable deterministic replay, permanent regressions and scoped mutation/quality validation. UI/device is added where human action/device state is essential. A provider fake does not replace the actual application service.

TARGETED_INTEGRATION fits bounded DB/provider/transport contracts such as owned saved-place CRUD, internal scheduler authentication, storage/ingestion and configuration/migration rehearsals. UNIT_CONTRACT_STATIC fits math/schema/normalization/catalog/primitive modules and supports a full pipeline at their consumers. UI_DEVICE_E2E is primary when browser/native interaction is the missing layer. OPERATIONAL_MONITORING records real timing/delivery/provider/queue effects the simulator cannot certify. MANUAL_OR_EXTERNAL preserves owner/legal/provider/human/device authority. NOT_APPLICABLE avoids a bespoke lifecycle for static marketing/asset presentation. UNKNOWN retains genuinely unresolved implementation/authority, not an automatic low-risk score.

| Treatment | Primary rows | Supporting uses |
| --- | --- | --- |
| FULL_PROOFLOOP | 83 | 2 |
| TARGETED_INTEGRATION | 64 | 3 |
| UNIT_CONTRACT_STATIC | 230 | 4 |
| UI_DEVICE_E2E | 40 | 26 |
| OPERATIONAL_MONITORING | 0 | 73 |
| MANUAL_OR_EXTERNAL | 3 | 76 |
| NOT_APPLICABLE | 3 | 0 |
| UNKNOWN | 6 | 0 |

The primary count denominator is 429 distinct IDs. The 103 curated behaviors have 70 full-pipeline candidates; maintain/extend/defer recommendations distinguish proven scope from missing paths. [features.json](../../../output/proofloop-project-wide-audit-2026-10-11/features.json) includes concrete gaps and source-backed intended behavior for every curated row. Smaller source units carry function declarations, branch/throw/catch observations, real-route traces, direct test imports and an explicit static-layer rationale. These summaries do not certify all branches.

## Invariant groups

| Domain / IDs | Existing invariant / forbidden state | Residual treatment |
| --- | --- | --- |
| Booking BK-01–08 | Server-owned quote; current actor/object; legal CAS transition; one terminal financial outcome | Form/reload, expiry and all illegal edges, with actual service/UI execution |
| Dispatch DS-01–09 | One assigned captain; requested class/capacity; owned offer; claim-time eligibility; no receipt-time freshness promotion | Alternate acceptance and feasibility-policy gaps; race/delayed-worker replay |
| Finance FN-01–15 / MP-01–02 | 0%/10% approved basis; original reservation owner; exact money-purpose/event identity; no duplicate capture/refund/earnings/payout | Maintain accepted owner-hold witnesses; extend payout/marketplace/ambiguous external effect boundaries |
| Cancellation CN-01–07 | Confirmed charge/provenance; waivers/caps; release correct capacity; each owner hold retained until terminal; recovery independent of blame | Cross-role/native races, multiple cancellations, replacement and later-pickup authority |
| Responsibility RS-01–08 | Immutable incident/evidence; missing facts mandate review; advisory model cannot create consequences; final lineage controls liability/strike | Maintain current scopes; unsupported detectors/financial semantics, real notice/review UI and Phase 9D permissions separate |
| GPS GP-01–05 | Observed versus receipt time; accurate/fresh evidence; terminal share privacy; fallback is not blame | Real device/GPS/maps/connectivity and provider-history instruments |
| Search AI-01–07 | Source-grounded draft; user detail selection and final review; deterministic booking validation; model not label/booking authority | Preserve Search gates and pending datasets/provider queues; no resumed evaluation |
| Messaging WA-01–04 | Raw signature; owned message/session/event identities; provider acceptance not delivered notice | Cross-delivery order, committed-state/outbound failure and retry evidence |
| Security SC-01–06 / ops OP-01–06 | Signed identity/role/owner; fail-closed scheduler caller; deployment/test separation; guarded maintenance writes | All registered-route authorization matrix; distributed jobs and isolated maintenance contracts |
| UI/compliance/tooling UI/LG/EX/UX | Current actor-bound state; accurate accessible disclosures; original approval versus draft/operational behavior | Conventional primitive contracts + selected device/human/provider layers; no public framework build |

Each feature JSON records required inputs, actors, concrete writer locations, related models, forbidden states, prerequisites, observations, current tests and reuse. Original VM fields retain original preconditions/action/expected outcome. These fields are partial where product authority or current enforcement is unknown; the audit does not invent an invariant to complete a blank.

## Ordinal rubric

Scores are independent potential-impact estimates, not production probability or invented frequency. 1 = minimal, 5 = maximal within the declared dimension. Financial exposure is not a rupee estimate.

| Dimension | 1 / 3 / 5 anchors |
| --- | --- |
| Consequence severity | Cosmetic / recoverable important failure / unauthorized irreversible financial, safety or authority effect |
| Financial exposure | No money / bounded obligation display or adjustment / ledger/provider transfer/liability corruption |
| Customer impact | Incidental / degraded recoverable workflow / stranded ride or private/financial harm |
| Driver impact | Incidental / interrupted bounded work / earnings, liability, strike/block or safe-work harm |
| Security/privacy | Public copy / owned personal metadata / administrative authority, private document/location or account data compromise |
| State complexity | Pure computation / local multistep state / multiactor clocks, ledgers and finality |
| Concurrency | Independent operation / duplicate/read-modify-write / competing consequential commits and external acknowledgements |
| External uncertainty | None / controlled provider contract / physical/vendor outcome with incomplete observations |
| Detection difficulty | Immediate explicit error / logs or reconciliation / silent state/financial harm requiring external evidence |
| Frequency/exposure | UNKNOWN until real operational evidence; no score fabricated |
| Actual failure history | UNKNOWN unless a source-bound failure/incident is recovered; audit hypotheses are not incidents |
| Verification strength | No recovered direct evidence / inspected relevant assertions / comprehensive same-scope execution + replay + mutation + required UI/device (not claimed globally) |
| Reuse | No applicable assets / unit/provider/clock pieces / existing actual-service DB/fault/evidence/replay pipeline |

P0 denotes consequential money/authority/privacy/safety state. P1 denotes bookings/dispatch/time-sensitive recovery. P2 denotes bounded important correctness/usability. P3 denotes lower-impact conventional contracts. UNKNOWN priority/dimensions remain unresolved. Shared helpers do not inherit an expensive bespoke pipeline simply because a P0 caller uses them.

## Current verification limits

The static test inventory contains 1,880 test/describe/it declarations across 221 source files; dynamic subtests, independent runners and historical versions make this incompatible with a current executed-test total. Direct import, filename, declaration and fake assertion are separate from execution. Selected assertion reads demonstrate commission ₹799/₹800, narrower suspension/reliability readiness, refund identity, scheduled fixture persistence, owner-hold/replacement financial witnesses and fake payout batch execution. No test was run in this audit.

Historical backend totals, scoped coverage/mutation and replay totals are retained per original manifest. Do not add overlapping native/browser/Phase 9B mutation populations or claim 100% project coverage. Exact saved-input UI replay remains distinct from native recipe repetition/backend replay. Safe-area/keyboard/gesture/native Maps/GPS fidelity is not inferred from Expo web.
