# Phase 9D-1 — storage, retention coordination and recovery engineering

19 October 2026 IST. Executions retain 18 October UTC timestamps. Continues the [P6/P7 closure review](phase9d-1-p6-p7-storage-retention-closure-2026-10-18.md). Evidence: [manifest](../../output/phase9d-engineering-closure-2026-10-19/manifest.json), [selected executions](../../output/phase9d-engineering-closure-2026-10-19/selected-executions.json), [78 readiness criteria](../../output/phase9d-engineering-closure-2026-10-19/readiness-gates-current.json), [20 audit rows](../../output/phase9d-engineering-closure-2026-10-19/audit-coverage-matrix-current.json).

**Supported isolated engineering: VERIFIED as scoped below. Universal physical storage bound, production retention/hold/deletion, whole-SQL and Phase 9D-1: PARTIAL. PRODUCTION_READY: NO. P8: NOT_STARTED.**

## Results by workstream

| Workstream | Decision and boundary |
| --- | --- |
| P6 native/key baseline | VERIFIED: accepted 16/16 unprofiled and 16/16 cache-OFF native results retained at their source epoch; no repeated P6 campaign |
| P7 native reconciliation | PARTIAL overall; ten exact saved entries reconciled with definition-matched P2–P6 evidence; private and expression exceptions retained |
| Unsafe instrumentation configuration | VERIFIED isolated configuration guard: shared runner forces cache OFF for native modes; combined profiler/replacement probe refuses before database creation |
| Default-cache signal11 root cause | BLOCKED: no symbolized fault location; tested workaround retained, no product SQL accommodation |
| Owner-requested diagnostic retry | One attempt completed, original failure NOT_REPRODUCED: different PID signal9 before intended query; no retained stack; stopped afterward |
| Global/per-node measured accounting and admission | VERIFIED for owned isolated management scope; conservative durable holds/refusal and recovery exercised |
| Total physical/operational capacity bound | PARTIAL: actual quotas, all PGDATA/VHD/external copies, infrastructure reserve and operator deployment unverified |
| Source/receiver recovery | VERIFIED: explicit client/admin quiescence, graceful shared-cluster restart, endpoint rediscovery, original committed lost-ACK identity and no duplicate work |
| Retention/hold coordinator | VERIFIED for durable metadata/simulation protocol on selected real schemas; actual customer-record deletion remains absent/disabled |
| Legal/hold policy and full category integration | BLOCKED on proprietor/counsel/provider decisions; broader real-category deletion integration PARTIAL |
| Backup/PITR/provider erasure or restore | NOT_RUN; authoritative stale metadata quarantined, provider-specific acceptance contract supplied |

## P6/P7: accepted evidence and crash disposition

The [coverage/exception matrix](../../output/phase9d-engineering-closure-2026-10-19/certification/p6-p7-exceptions.md) and [raw comparison identities](../../output/phase9d-engineering-closure-2026-10-19/certification/coverage-exceptions.json) preserve P6's six complete native entries and P7's ten fresh windows. No new percentages are manufactured. Same-definition P4/P5/P6 observations close the stated public native paths without repeating their campaigns. The private cleanup no-eligible-target guard remains 8/9 statements and 3/4 branches at its best retained measurement; private observe duplicate remains 14/15,5/6; P2 source invalid-lineage remains unmeasured. Opposite-service arms, SQL expressions and DDL/default grants remain separate adequacy measures. No private API/grant was exposed to force counters.

The [draft upstream report](../../output/phase9d-engineering-closure-2026-10-19/certification/upstream-profiler-report.md) describes the original serial nested-exception/cache interaction, exact pinned environment and required external debugging. It was not sent. The [separate retry report](phase9d-1-p6-profiler-crash-retry-2026-10-19.md) records the owner's later instruction to try again: signal9 in PID 840 at 21:11:28.008 UTC precedes submission of the GAP query in PID 796. The attach marker was observed; an early assertion/connection failure bypassed debugger-result collection. Recovery retained one event/signature. Memory pressure is a hypothesis; cgroup OOM attribution was not captured. This does not reproduce SIGSEGV or locate its root cause. One attempt was made and stopped; no global dump/security setting changed.

The shared runner's cache-OFF configuration and refusal guard remain in place. No native campaign, routine replacement or P8 execution ran in the engineering fixtures. The dedicated owner-authorized diagnostic is a separate default-cache exception, not a reopened normal profile path.

## Implemented storage controls and actual physical observations

The new optional `capacity9d` schema implements durable current measurements, finite UUID/operation ledgers, actor-bound/idempotent reservations, freshness checks, pending/physical thresholds, emergency reserve classification and aggregated escalation signals with operator acknowledgement. Its global ledger serializes aggregate reservations before per-node holds; partial node admission retains the conservative global hold and resumes by identical operation identity. Missing infrastructure attestation fails closed by default. The controlled tests explicitly choose measured-only mode without claiming a real disk quota.

Source and receiver share one cluster. Source owns shared WAL/temp and unassigned database overhead; receiver contributes its own database only. Custodian owns its independent cluster. Index/TOAST are diagnostic components already inside database totals. Actual owned log-directory allocation and artifact logical file bytes are sampled separately; PGDATA `du` allocation is a separate comparison, never added again. See the [capacity contract/category inventory](../../output/phase9d-engineering-closure-2026-10-19/capacity/implemented-contract.md) and [selected measurements](../../output/phase9d-engineering-closure-2026-10-19/capacity/selected-measurements.json).

| Selected stage | Measured catalog/database + WAL/temp + declared external bytes |
| --- | ---: |
| baseline | 260801631 |
| global-reservation | 260949087 |
| backlog-and-toast | 262497375 |
| signed-drain | 262562911 |
| repeated-cleanup | 326009643 |
| vacuum-checkpoint | 325149483 |
| after-source-receiver-restart | 325187751 |

These totals cover all fixture databases, shared cluster overhead and declared external inputs; they are not the preceding report's pipeline-table-only denominator. Owned log allocations at sampling: 20480 bytes, 32768 bytes. Artifact sample: 63221452 logical bytes in 210 files. PGDATA allocated-block observations: 132128768 bytes, 116019200 bytes; separate overlapping measurements, not additive.

The bounded workload adds sixteen high-entropy synthetic scratch rows per database and twelve original audit/lineage events per source/receiver installation. Native profiling is OFF. It observes heap/index/TOAST and WAL growth, crosses backlog/byte/ledger/freshness boundaries, refuses an actual broker-attempt INSERT under the additional fixture trigger, preserves readable history and STOP, drains independently signed custody and restores admission. Original allowed terminal CLEAN repeats without recreating work or erasing accounting. Only owned scratch rows are deleted for maintenance observations; new retention functions never delete original records.

Normal application STOP is not attached to the new-work gate. A rolled-back trigger denial also rolls back its in-transaction signal; the independent collector/direct reserve refusal supplies durable escalation. Logical release and VACUUM do not prove file shrinkage, old WAL erasure or backup deletion. max_wal_size remains a soft target. Global reservations are conservative accounting, not distributed atomic admission or a guarantee against privileged writes/page allocation. Actual quota/provider/temp/archive/log/backup policies, external paging and named operational ownership remain open. No host ENOSPC, existing volume removal or uncontrolled WAL growth ran.

## Source/receiver restart and lost acknowledgement

`createTestDatabase()` now exposes an explicit suspend/resume lifecycle. It closes its private admin client and all Prisma clients before an owned deliberate restart, keeps database/credentials/identity fixed, validates the inspected new mapped port and creates fresh connections. The recovery fixture exposes owned-child/service/controller quiescence. No global connection exception suppression was added.

The selected test reuses the accepted recovery fault recipe: actual authorized registration runs in a transaction, COMMIT completes, and a subsequent SQL wait withholds simple-query completion. An independent connection observes the wait/committed row and terminates that owned backend. The caller receives 57P01 instead of success; fresh registration reconciles the same one request. Later the shared source/receiver server is gracefully restarted after closing clients, and fresh authenticated connections reconcile both this original lost-ACK identity and the cleaned second request. Request/receipt/payload/tombstone/accounting observations persist; application financial consequences equal their original post-incident baseline. The independent custodian's postmaster identity remains unchanged.

Actual mapped source/receiver endpoint changed **32769 → 32771**. Shared postmaster start changed **2026-10-18T21:25:34.821Z → 2026-10-18T21:26:17.759Z**; custodian start stayed **2026-10-18T21:25:46.581Z**. The separate lost-ACK backend was **PID 1665**, SQLSTATE **57P01**; the original request identity is retained in the witness.

This is graceful server restart plus a separately injected single-backend connection interruption. It is not power-loss, corruption, ENOSPC, archive recovery or provider backup restore. The original hidden-admin 57P01 failure remains historical; this continuation fixes the lifecycle rather than suppressing it globally.

## Retention and hold engineering on real disposable schemas

The new `retention9d` metadata plane contains versioned disabled/unapproved policies, per-resource lifecycle/commitment/epoch/hold/tombstone state, durable three-node operations and acknowledgements, separate hold approvals/commands/targets, and authenticated audit rows. A database CHECK prohibits production_execution=true; policies are synthetic-only. There is no new application DELETE/NULL function.

Fixed adapters select actual source outbox, receiver broker and independent custodian records for the synthetic evidence scope. Selection is minimized and binding cannot silently overwrite an existing identity/commitment or reset a hold/tombstone. It covers selected related records, not every row/category/provider copy. The custodian adapter selects the earliest matching event as one retained commitment; complete case-graph selection remains required for any future deletion.

The 17 leaf scenarios verify disabled policy, active/unexpired eligibility, exact source/receiver/custodian records, closed/bound receipts, missing node acknowledgements, durable partial preparation, approved hold-before-decision fencing, partial hold propagation/retry, distinct release approval, stale epoch refusal, partial COMMITTING simulation, late-hold conflict, post-restart completion/idempotency and stale metadata quarantine. Source/receiver SIMULATED_PAYLOAD_PURGE updates metadata only; custodian RETAINED_COMMITMENTS retains the actual signed event. Original application records are read back unchanged throughout these simulation steps.

The controller is an explicit trusted root. Its local_commit credential does not cryptographically verify the central authorize decision; irreversible deletion cannot be enabled merely by changing a TTL. A future implementation needs reviewed decision authentication and complete selection/hold/rights semantics. A hold after a committed global decision reports LATE_HOLD_CONFLICT and never promises to undo deletion. Missing/held/tombstoned restore scopes quarantine; apparently clear scopes still require manual review and never authorize production restore. The [protocol/provider acceptance contract](../../output/phase9d-engineering-closure-2026-10-19/retention/protocol-and-restore-contract.md) identifies real snapshot/object/PITR tests still required.

The [twenty-category approval schedule](../../output/phase9d-engineering-closure-2026-10-19/retention/category-approval-schedule.md) gives concrete proposed triggers/durations, holds, provider copies and proprietor/counsel/CA decisions. It retains the UP sole-proprietor/India customer context, stages current Indian official requirements, and marks unverified hosting/contracts/regions and consolidated legal-text review. Proposals are not owner approval or legal sign-off. No production TTL, customer erasure or financial policy was activated. Hashes and tombstones are not presumed anonymous.

## Actual verification, source epochs and preservation

| Selected check | Actual result |
| --- | --- |
| New current management integration | **18/18 PASS**, no skips; seventeen leaf groups plus parent |
| Existing independent-database/rollback/race harness | **1/1 PASS** |
| Unchanged lineage integration | **7/7 PASS**, no skips |
| Existing database configuration/retry units | **2/2 PASS** |
| Backend typecheck | **PASS** |
| Scoped strict lint | **8 JavaScript files; zero errors/warnings**; no complexity/mutation certificate |
| Scoped Git and new-file whitespace | **PASS** |
| Unsafe combined probe guard | **EXPECTED_REFUSAL** before database creation |
| Original SQL sources | **15/15 byte-identical** |
| Existing local/index/archive/HEAD | **19/19 local, 23/23 staged contents**, archive/HEAD unchanged |
| Accepted Clerk / frozen V5 / original custody | **3/3 / 22/22 / 28/28**, both worktrees |

Current management receipts bind the final executed source, runtime image, quotas and logs and record sourcesUnchanged=true. Harness/lineage/typecheck predate only the added management-test lost-ACK assertion; their actual test/runtime/SQL/fixture bytes remain unchanged. That unrelated broad-scope hash difference is explicit in selected-executions.json. Earlier 18/18 management passes remain at their own test epoch. No historical receipt is relabelled as a later execution.

The first rehearsal passed fourteen tests and failed one leaf plus its parent: reconnect construction omitted pg's non-enumerable password when spreading ConnectionParameters. The second passed three and failed one leaf plus parent: a JavaScript array was passed as a PostgreSQL array instead of JSON to the new aggregate-report writer. Both original sources/failing receipts are retained. Explicit password propagation and JSON serialization correct test/adapter defects; no accepted product SQL changed. The debugger retry's signal9/collection limitation is a separate failure, not hidden by the ordinary test passes.

Only three of **1,949** pre-existing working files changed: the runner, database helper and recovery fixture. The staging index and HEAD remain unchanged; all other pre-existing files match the task baseline. All 324 artifacts in the prior closure manifest remain intact. Exact changed/new implementation identities follow; this checkpoint, detailed contracts, raw counters/history references, selected catalogs and execution tooling are separately bound by the manifest.

| New/changed implementation | SHA-256 |
| --- | --- |
| `tools/phase9d/closure-run.mjs` | `4938f9dcd2a5745eb996be702effefee50b2462283e32497a1c708d31d9312a6` |
| `tools/phase9d/management-adapters.mjs` | `889b613f5475885f23c5bd891d04872b1a286086101ada5ef834dd147963b82c` |
| `tools/phase9d/management-retention.mjs` | `eb41020baa3cb76ebb667490da67d3e444aca59760657f924f76b3c6f0f2e2dd` |
| `tools/phase9d/management-storage.mjs` | `47a67ed8ee029217f476e44f3404afbb32e8ab31d42a905bdaabdc7dbd1b2299` |
| `backend/tests/helpers/database.js` | `49e61ac9d26dcd7ed494d2f915cdf3f1baf6dcc6276ae66ab1c45342aac51d7f` |
| `backend/tests/helpers/phase9dRecoveryFixture.js` | `038df7951489077ae7040df1d9cc44c6e53ce44b8fe9868acdc4b0c9d95209b2` |
| `backend/tests/helpers/phase9dManagementFixture.js` | `a6cd88d345287a13490573ae94a3d87f8b5a88117bc044ec133b9a44ecf360a8` |
| `backend/tests/integration/phase9dManagement.test.js` | `70c6deda775c0e99a531c0ee8a7ccce94344c2b435d3a70e005eeb1480a870c9` |
| `tools/phase9d/management-capacity.sql` | `71de17d31e498ac22976e42e508e3bd139a47a8314d2a21292bc02c9adefc605` |
| `tools/phase9d/management-retention.sql` | `d77b5fad6c55c5b53d7851b03dc28f277ad2ff14fbe87a2d52ce473dd6c8c754` |

## Host observations, cleanup and remaining gates

Two scripted observer windows retained **472 samples**, minimum available RAM **94.7 MiB**, minimum commit headroom **6447.5 MiB**, **0 heartbeat gaps above eight seconds** and **0 sampled unresponsive taskbars**. Both ended by stop sentinel. Discrete readiness checks preceded each heavy workload. The final restart of Docker began in the interval between windows; its readiness probe is retained, and the second observer covered the subsequent database workload. Final readback found zero running containers and stopped Docker normally; DellTechHub and SupportAssistAgent remained Running/Auto.

No further workload follows final cleanup. Same-host sampling cannot rule out a complete OS freeze. Gaps between observer windows are not certified; initial readiness probes are discrete observations. Container quotas/deadlines and owned-process responsiveness checks remained active under the owner's explicit numeric RAM-threshold override. No unrelated service/app/cache/volume was changed.

All 78 readiness IDs/order and 20 audit action rows/order and their previous fields/statuses are retained. New engineeringClosureAssessment fields describe this continuation only. Remaining mandatory gates are explicit:

1. Native default-cache defect localization or independently accepted upstream correction; the one signal9 retry supplies no root cause.
2. P7 private/installation exceptions, SQL-expression/DDL/default-privilege, whole-critical-code structural and meaningful-mutation adequacy. P8 remains separately unstarted.
3. Actual total physical quotas and reserved control/recovery capacity across all PGDATA/WAL/temp/log/artifact/archive/replica/backup owners; deployed admission integration, external monitoring/paging and named operators.
4. Separately bounded full-disk, crash/power-loss and actual archive/provider restore acceptance; no laptop ENOSPC experiment is certified.
5. Approved category purposes/durations/holds/rights and provider/hosting/contracts, qualified India/state/tax interpretation and complete consolidated legal review.
6. Reviewed irreversible-deletion/decision authentication, complete real-category graph adapters, independent administration and provider hold/deletion/backup reconciliation. The simulation cannot serve as production erasure.
7. Existing off-host custody, universal denial observation, human calibration, production Clerk capacity, in-flight financial/human-final policy and separate deployment/activation authorization.

Frozen V5 remains `e484afc4c7fa724ea29af6edd962c48b814dc73a10e4f4a5e33833ad26afbe75`. No production connection, real incident/customer data, paid/live analyst call, full backend/capsule/mutation campaign, auth/guard/budget/financial-policy change, evidence migration, commit, push, merge or deployment occurred. The reused lineage scenario uses its existing fake offline analyst call. **Production stays OFF. Stop before P8.**
