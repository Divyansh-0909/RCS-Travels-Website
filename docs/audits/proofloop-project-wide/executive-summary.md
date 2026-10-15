# Project-wide Proofloop discovery audit — 11 October 2026 (IST)

The audit identifies **103 curated workflows/features** and **429 traceability rows**, including smaller source units. The most urgent future verification targets are the alternate generic acceptance path, mandatory verified-payout eligibility, document-expiry claim gates and payout-destination continuity. Existing Responsibility and Phase 9 evidence should be maintained and extended at its residual boundaries.

**Overall audit status: PARTIAL.** Static production registration is reconciled, and every discovered entity is classified or explicitly unresolved. Complete policy authority, all UI-handler semantics, aliased/dynamic SQL writers and deployed permissions are not proved. This report does not certify the repository or assert an exhaustive semantic review of every line. Missing evidence is recorded as UNKNOWN, not as low risk.

The workspace comprises a Node/Express/Prisma backend; React customer/admin website; Expo/React Native captain app; shared theme/i18n; isolated DB, lifecycle/provider/fault/replay/browser/native verification; policy RAG CLI/corpus; operational/deployment/maintenance tooling; developer Code Atlas/plugins; and nonproduction Python/design experiments. Marketplace financial behavior is approved but its captain screen is a local prototype with an explicit not-connected claim action. New Search services are development/test implementations without the original customer NL UI/production handoff. See [driver-app/src/pages/MarketplaceDetail.tsx:108](../../../driver-app/src/pages/MarketplaceDetail.tsx#L108), [backend/rcs-rag/README.md:5](../../../backend/rcs-rag/README.md#L5), and [docs/search/search-owner-decisions-2026-10-06.md:9](../../../docs/search/search-owner-decisions-2026-10-06.md#L9).

## Actual inventory denominators

| Inventory | Discovered | Classified/accounted | Source-traceable | Explicit unknown | Excluded |
| --- | --- | --- | --- | --- | --- |
| api | 105 | 105 | 105 | 0 | 0 |
| jobs | 5 | 5 | 5 | 0 | 0 |
| models | 50 | 50 | 50 | 1 | 0 |
| ormWriters | 222 | 222 | 222 | 0 | 0 |
| financialWriters | 64 | 64 | 64 | 0 | 0 |
| rawSql | 26 | 26 | 26 | 26 | 0 |
| sqlWriters | 99 | 99 | 99 | 99 | 0 |
| screens | 46 | 46 | 46 | 33 | 0 |
| uiActions | 499 | 499 | 499 | 381 | 0 |
| uiRoutes | 54 | 54 | 54 | 0 | 0 |
| configs | 134 | 134 | 134 | 54 | 0 |
| sourceModules | 470 | 470 | 470 | 2 | 0 |
| policies | 2616 | 2616 | 2616 | 1933 | 0 |
| vm | 52 | 52 | 52 | 0 | 0 |
| externalIntegrations | 17 | 17 | 17 | 0 | 0 |

The file walk accounts for 1937 individual project files and 274,505 files in 37 excluded dependency/generated/profile/artifact directories. Six restricted configuration files are metadata-only. Symlinks/junctions are not followed; their exclusion records retain an unknown target denominator. Excluded .git/profile/device-output trees are accounting boundaries, not sources of application policy. Nested temporary Expo/design bundles have explicit classification refinements. [repository-inventory.json](../../../output/proofloop-project-wide-audit-2026-10-11/repository-inventory.json) and [inventory-refinements.json](../../../output/proofloop-project-wide-audit-2026-10-11/inventory-refinements.json) retain the denominator and exclusions.

The 105 production route declarations agree between independent AST/mount/root-import tracing and the bounded Code Atlas scan. Seven local security-probe routes are excluded from the production count. There are 54 actual router constructs: 34 captain and 20 website, including eight index/pathless layouts. Broad Atlas path-object candidates outside router constructs are not counted as navigation. There are 46 page files and 499 JSX event registrations; event registrations include bounded local UI actions and do not equal 499 business workflows.

The 64 financial writer candidates include financial data keys on Booking/Driver, not just money-named models. Seed/maintenance writes are identified separately from production-root reachability. Aliased NotificationDelivery and parameterized PolicyChunk writes are traced explicitly. OverchargeFlag has no recovered production writer. The 26 raw SQL and 99 migration/trigger write candidates remain a separate unresolved denominator; they are not all financial writes or demonstrated active mutations.

The 2616 policy-registry records include 26 curated policy families, 52 original VM requirements, document rule candidates, environment-key uses, schema/SQL contracts and 146 numeric implementation-rule candidates. **They are not 2616 approved business policies.** All 12 original scenarios A–L are recovered from owner source H0. Draft, historical, implemented, operational, approved and externally confirmable rules retain distinct statuses.

## Primary treatment counts

| Treatment | Curated workflows/features | All matrix rows | Additional supporting uses |
| --- | --- | --- | --- |
| FULL_PROOFLOOP | 70 | 83 | 2 |
| TARGETED_INTEGRATION | 15 | 64 | 3 |
| UNIT_CONTRACT_STATIC | 6 | 230 | 4 |
| UI_DEVICE_E2E | 4 | 40 | 26 |
| OPERATIONAL_MONITORING | 0 | 0 | 73 |
| MANUAL_OR_EXTERNAL | 3 | 3 | 76 |
| NOT_APPLICABLE | 1 | 3 | 0 |
| UNKNOWN | 4 | 6 | 0 |

One primary label per row makes the primary totals disjoint. Supporting labels overlap. Workflow rows and constituent source-unit rows represent different levels of the same system; do not add them as independent lifecycle adoption projects. FULL_PROOFLOOP on a helper means participation in its owning pipeline, not another bespoke simulator.

## Highest-risk findings

| Rank / exact feature and policy | Evidence type / source | Existing verification | Missing verification / dependencies | Risk / treatment |
| --- | --- | --- | --- | --- |
| 1 DS-07 Generic ride acceptance alternative path; VM-011, VM-012, POL-HOLDS, POL-ELIGIBILITY | Confirmed static enforcement mismatch; [backend/routes/driver.ts:2461](../../../backend/routes/driver.ts#L2461), [backend/services/driverAssignment.js:52](../../../backend/services/driverAssignment.js#L52) | securityHttp/criticalRideTransactions test families; no demonstrated negative witness for this alternate scheduled claim | Owned-offer, class, online, deposit and assignment effects through actual generic HTTP handler; Clear offer/hold authority; isolate DB; protect legitimate immediate callers | P0 / FULL_PROOFLOOP |
| 2 DR-06 Verified payout required at every new-work boundary; VM-014, VM-042, POL-PAYOUT | Confirmed approved requirement/enforcement gap; [backend/services/driverNewWorkEligibility.js:17](../../../backend/services/driverNewWorkEligibility.js#L17), [backend/routes/driver.ts:316](../../../backend/routes/driver.ts#L316), [backend/services/scheduledOffers.js:30](../../../backend/services/scheduledOffers.js#L30) | driverNewWorkEligibility assertions cover suspension/reliability; final-payment tests cover a narrower payout check | All online/candidate/offer/accept paths with missing/unverified/invalidated destination; Recovered H0/V1 mandatory-payout rule; human destination verification | P0 / FULL_PROOFLOOP |
| 3 DR-04 Document expiry versus cached request readiness; POL-DOCUMENTS, POL-ELIGIBILITY | Confirmed cached-expiry enforcement gap; [backend/services/driverDocuments.js:135](../../../backend/services/driverDocuments.js#L135), [backend/routes/driver.ts:284](../../../backend/routes/driver.ts#L284), [backend/services/driverNewWorkEligibility.js:17](../../../backend/services/driverNewWorkEligibility.js#L17) | documentPolicy/documentConcurrency and new-work tests; hourly expiry is not synchronous claim proof | Expired personal/active-vehicle docs between sweep and accept, including transaction revalidation; Safe continuation policy for already-assigned work | P0 / FULL_PROOFLOOP |
| 4 FN-10 Payout destination replacement and accepted-ride continuity; VM-043, VM-044, VM-045, VM-046, POL-PAYOUT | Confirmed replacement architecture mismatch; [backend/services/driverFinance.js:69](../../../backend/services/driverFinance.js#L69), [backend/services/driverPayouts.js:50](../../../backend/services/driverPayouts.js#L50) | Critical transaction tests demonstrate unverified UPI cash fallback; liability-change lock now exists | A-active/B-pending, accepted-ride payment continuity, open-batch change and compromised destination recovery; Versioned destination authority and provider-safe recovery | P0 / FULL_PROOFLOOP |
| 5 DS-03 Scheduled geographic/ETA/commitment feasibility; VM-004, VM-005, VM-006, VM-007, VM-012 | Confirmed absent feasibility assessment; consequence is a hypothesis; [backend/services/scheduledOffers.js:30](../../../backend/services/scheduledOffers.js#L30), [backend/services/driverDelay.js:32](../../../backend/services/driverDelay.js#L32) | Pool/nearby/dispatch tests and Phase 9 observation fallback; no whole-calendar feasibility assertion | Far captain, overlapping commitments, delayed workers, traffic and stale source observations; ETA/buffer/unknown-reachability decisions remain unapproved | P1 / FULL_PROOFLOOP |
| 6 OP-06 Seed, cleanup and phone-normalization maintenance writers;  | Confirmed maintenance isolation limitation; no execution/production damage observed; [backend/prisma/clean-bookings.js:64](../../../backend/prisma/clean-bookings.js#L64), [backend/prisma/clean-seed-data.js:38](../../../backend/prisma/clean-seed-data.js#L38), [backend/scripts/normalize-driver-phones.js:43](../../../backend/scripts/normalize-driver-phones.js#L43), [backend/prisma/seed-captain.js:1](../../../backend/prisma/seed-captain.js#L1) | No cleanup/normalization safety witness independently verified in this audit | Remote/local identity guard, real-versus-synthetic collision and cascade/ledger preservation; Explicit maintenance scope; disposable DB; read-only dry run itself reads records | P0 / TARGETED_INTEGRATION |

These findings are static mismatches or explicit hypotheses. No live attack, provider call, production database query, cleanup script or financial transaction was run. No application/schema/policy/test/flag was changed. All writes are inside the two authorized audit directories.

## Recommended first three workstreams

1. **New-work authority and eligibility:** close verification gaps across generic and owned-offer acceptance, current document validity and mandatory payout readiness. These are P0 policy gaps with clear sources and reusable protected HTTP/DB/fault infrastructure.
2. **Financial continuity across provider and booking boundaries:** extend current owner-hold/advance/settlement/refund evidence to payout destination/versioning, payout lost responses and concurrent wallet/debt/admin operations. Preserve completed ledger/replay work instead of rebuilding it.
3. **Scheduled operational recovery and feasibility:** extend delayed-worker/replacement/multiple-captain recovery first; defer ETA/commitment/short-notice decisions until approved. Reuse clocks, route/GPS/provider observations and Phase 9 replay.

Complete scope, fault points, replay inputs and acceptance criteria are in [adoption-roadmap.md](adoption-roadmap.md).

## Source/evidence continuity

HEAD remains unchanged. 11 hashed files changed concurrently; affected Phase 9C/UI findings are subject to change, and no current execution pass is inferred from expanded recipe source. [evidence-verification.json](../../../output/proofloop-project-wide-audit-2026-10-11/evidence-verification.json) identifies each change, current hash and historical mismatch.

The selected browser/native receipt bytes match their recorded hashes. Browser artifacts: 37/37 hash matches. Native artifacts: 37/39 matches; latest-build.json and phone-awake-state.json are mutable pointers changed during independent work, not selected-receipt corruption. Current-source matches are 456/463 browser and 16/20 native manifest identities; preserved historical scope cannot certify changed code. Both recovered frozen V5 source manifests match 22/22. The native nine-module coverage summary/manifest records 157 branches; checkpoint prose says 156. This metadata discrepancy is retained, without changing existing records.

Responsibility Phases 1–7 and Phase 8 retain their accepted scope; V5 freeze and comparator amendment remain. Phase 8.2 is retired by owner decision. Phase 9A/B evidence remains scoped; active Phase 9C continues independently. No Phase 9D or production permission proof is supplied here. Search S3 UI and unfinished S5/S6/S7/Hindi-Hinglish requirements remain separate; October 6 owner decisions supersede older unresolved year/week/timezone/SUV statements. No held-out, unseen challenge, pending paid provider/model evaluation or Responsibility Luna comparison was resumed.

## Audit status

```text
PROJECT-WIDE DISCOVERY AUDIT: PARTIAL
REPOSITORY INVENTORY: COMPLETE FOR THE DECLARED FILESYSTEM BOUNDARY
POLICY INVENTORY: PARTIAL
ENTRYPOINT RECONCILIATION: COMPLETE FOR STATIC API/JOB/ROUTER REGISTRATION; PARTIAL FOR DYNAMIC/ALIASED OPERATIONS
CROSS-SYSTEM INTERACTION AUDIT: PARTIAL
PROOFLOOP APPLICABILITY CLASSIFICATION: COMPLETE FOR DISCOVERED ROWS, INCLUDING EXPLICIT UNKNOWN
RISK PRIORITIZATION: PARTIAL FOR UNRESOLVED SOURCE/RULE CANDIDATES
PROJECT-WIDE PROOFLOOP IMPLEMENTATION: NOT STARTED
PHASE 9C: CONTINUES INDEPENDENTLY; SELECTED HISTORICAL CHECKPOINT PARTIAL
PHASE 9D: NOT STARTED AT THE RECORDED CHECKPOINT
PRODUCTION SHADOW: OFF AT THE RECORDED CHECKPOINT; LIVE SETTINGS NOT QUERIED
PRODUCTION CONSEQUENCES: OFF AT THE RECORDED CHECKPOINT; LIVE SETTINGS NOT QUERIED
SEARCH ROLLOUT: OFF AT THE RECORDED CHECKPOINT; LIVE SETTINGS NOT QUERIED
PUBLIC PROOFLOOP GENERALIZATION: NOT STARTED
```

## Full artifacts

[Applicability and risk rubrics](proofloop-applicability-report.md), [interaction/state map](interaction-dependency-map.md), [unverified requirements and historical dispositions](unverified-requirements.md), [adoption roadmap](adoption-roadmap.md), [methodology/reproduction](methodology.md), [complete-feature-matrix.csv](../../../output/proofloop-project-wide-audit-2026-10-11/complete-feature-matrix.csv), [policy-registry.csv](../../../output/proofloop-project-wide-audit-2026-10-11/policy-registry.csv), [entrypoint-coverage.json](../../../output/proofloop-project-wide-audit-2026-10-11/entrypoint-coverage.json), [audit-evidence-manifest.json](../../../output/proofloop-project-wide-audit-2026-10-11/audit-evidence-manifest.json).
