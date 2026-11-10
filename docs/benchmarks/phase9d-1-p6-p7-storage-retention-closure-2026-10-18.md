# Phase 9D-1 — P6/P7 native measurements, storage and retention closure review

Completed **19 October 2026 IST**. The requested filename and evidence directory retain 18 October; executions retain their actual 18 October UTC timestamps. Continues the [SQL plan](phase9d-1-sql-coverage-plan.md), [P6](phase9d-1-p6-key-epoch-checkpoint-2026-10-18.md), [crash diagnostic](phase9d-1-p6-profiler-crash-diagnostic-2026-10-18.md), [P7](phase9d-1-p7-cleanup-pressure-metadata-checkpoint-2026-10-18.md) and [custody checkpoint](phase9d-1-custody-verification-checkpoint-2026-10-18.md).

**P6 supported six-routine native metric: VERIFIED_IN_ISOLATION with a tested instrumentation workaround. P7 native observations and historical reconciliation: VERIFIED_IN_ISOLATION for the stated windows, with explicit gaps. Total storage, real retention/hold engineering and whole-SQL certification: PARTIAL. Default-cache crash root cause: unresolved. PHASE 9D-1: PARTIAL. PRODUCTION_READY: NO. P8: NOT_STARTED.**

Evidence: [manifest](../../output/phase9d-p6-p7-closure-2026-10-18/manifest.json), [selected exact executions](../../output/phase9d-p6-p7-closure-2026-10-18/selected-executions.json), [native comparison](../../output/phase9d-p6-p7-closure-2026-10-18/sql-measurements/native-comparison.json), [storage measurements](../../output/phase9d-p6-p7-closure-2026-10-18/storage/storage-summary.json), [all 78 readiness criteria](../../output/phase9d-p6-p7-closure-2026-10-18/readiness-gates-current.json), [all 20 audit rows](../../output/phase9d-p6-p7-closure-2026-10-18/audit-coverage-matrix-current.json).

## 1. Decision by required workstream

| Requirement | Decision | Evidence / remaining boundary |
| --- | --- | --- |
| P6 key/signature/race behavior | VERIFIED | Final 16/16 unprofiled; original 15/15 retained at its epoch. No signing/product SQL change. |
| P6 native observations | VERIFIED | Final 16/16 profiling-only; all visible statements/native branches observed in six routines under use_lxcache=off. |
| Native signal-11 root cause and symbolized stack | BLOCKED | One new crash; debugger failed to attach before process death. Safe configuration demonstrated, native fault location unproved. Dedicated debugger/instrumented upstream investigation remains required. |
| P7 behavior/catalogs | VERIFIED | Final 14/14 unprofiled; original 13/13 and selected legacy successes preserved. |
| P7 native certification | PARTIAL | Fresh 14/14 profiling-only and ten precise entries; reusable definition-matched P2–P6/historical observations identified below. Private/SQL-expression/whole-SQL exceptions remain. |
| Physical storage/WAL/index/TOAST measurement | VERIFIED | Bounded three-database/two-cluster measurement, metrics identities, backlog/refusal/drain, retention prototype, maintenance and custodian graceful restart. |
| Total physical/operational storage bound | PARTIAL | No global retained-history/log/archive/disk bound; no physical ENOSPC or archive restore proof. Concrete implementation/acceptance plan supplied. |
| Retention/hold technical prototype | VERIFIED | 13/13 storage/retention integration; real PostgreSQL restricted roles and persisted outcomes in retention_test only. |
| Real category retention, distributed holds and backup erasure | BLOCKED | No approved schedule or production integration; late hold/partial deletion and actual backup gaps remain explicit. |
| Indian legal/provider/hosting decisions | BLOCKED | Owner context confirmed; primary sources reviewed; named approvals and unverified locations remain open. |
| Whole-SQL / Phase 9D-1 closure | PARTIAL | Native execution is one adequacy measure; policies, storage/reliability and broader critical-code gates are not closed. |

VERIFIED means only the isolated scope in that row. It does not imply production approval.

## 2. P6 crash investigation and configuration workaround

### Observed chronology

| Execution | Observation |
| --- | --- |
| Original P6 profile attempt 1 | Signal 11 at 11:03:58.632 UTC; recovery ready 11:03:59.746. Nine leaf groups passed before ingestion/rotation failure. Original evidence retained. |
| Original P6 profile attempt 2 | Signal 11 at 11:07:05.783 UTC; recovery ready 11:07:06.686. Same group and JavaScript retry position; original terminated backend PID was not retained by that projection. |
| Previous reduced serial profile ON | Backend 826: expected nested GAP/23514 at 11:45:43.320; retry submitted 11:45:43.322; signal 11 at 11:45:45.348. Serial OFF passed. No concurrent rotation needed for this reduction. |
| New single default-cache debugger attempt | Backend **776**: GAP/23514 at **16:08:11.731**; signal 11 at **16:08:13.300**; valid retry submitted only at **16:08:13.755**, after backend death. Recovery retained one committed event and one signature. |
| Fresh reduced serial cache OFF | PASS: nested rejection, valid retry, durable signing, rotation, retired-key refusal, exact duplicate and catalog preservation. No new crash in this variant. |
| Final bounded P6 native execution | 16/16 PASS, including concurrent ingestion/rotation and all targeted key lifecycle assertions; actual server budgets read back before SQL. No signal/recovery observation in selected profile logs. |

The new ordering corrects the strength of the earlier inference: a subsequent valid retry is **not required to have reached PostgreSQL before the fault**. The error/transaction cleanup interval is implicated by timing; the native faulting instruction is not established. Earlier traces that began a retry before the crash remain separate observations.

The pinned extension exposes `plpgsql_check.use_lxcache` as a supported user setting. Its source creates a local-transaction statistics cache associated with TopTransactionContext, registers a reset callback, caches pointers/lxid in profiler state, and merges into shared counters on reset. The profiler's abort hook also finalizes statement/function statistics. Relevant preserved source: profiler.c get_lxcache/lxcache_reset_callback, update_persistent_stmts_stats/update_persistent_fstats and profiler_func_abort. These make cache/error lifetime interaction a concrete hypothesis, not a proven use-after-free diagnosis. Direct shared statistics with **use_lxcache=off** bypass that cache while retaining native measurement. Shared statistics remain ON; no session-local counter aggregation is substituted.

Successful OFF versus crashing ON, matched SQL/binaries and serial failure provide evidence for a configuration-sensitive instrumentation interaction. They do not identify a PostgreSQL core bug, a specific faulty C line, or prove every extension/error schedule safe. No native extension or product SQL patch was made. The default-cache signal-11 reliability issue remains OPEN.

### Debug facilities and crash budget

A disposable debug image added gdb 10.1-1.7 and binutils to the pinned profiler runtime. Its build config digest is `37824530aef1e86f30826324a9050581f8284b1222ce0ef7634e4f8461073a58`; the runtime tag and recipe/build logs are retained. SYS_PTRACE was added only to that owned debug container, core limit was zero, and no global Windows/WSL/Docker dump/security configuration changed. No memory dump, SQL parameter, credential or private signing material was exported.

The debugger returned “Unable to attach: program terminated with signal SIGSEGV”. **No symbolized backtrace was obtained.** Its sanitized output/hash and exact backend/server timing are preserved. After this one new crash the default-cache diagnostic path stopped; it was not restarted repeatedly. A future native investigation needs symbols matching the pinned PostgreSQL/extension, debugger attachment before the expected nested rejection, sanitized no-argument/no-local stack collection, and one bounded reproduction on an isolated host. Existing global piped core handling was not changed or claimed disabled by the container core limit.

The reduced diagnostic's original memory call also used byte units in Testcontainers' GiB API. Its historical declared 512 MiB cap was therefore not established by that call. Both original bytes and this correction are retained. Final acceptance uses separately verified actual Docker limits, described below; earlier results are not relabelled as budget-verified runs.

## 3. Environment, source epochs and P6 native counts

Actual selected runtime: PostgreSQL **17.5 (Debian 17.5-1.pgdg110+1)**; plpgsql_check extension schema **2.10**, pinned source **v2.10.4**, commit `c882056fac65532dee95fc174c4fdc0cc0965293`; runtime image `sha256:a2b1801097f195b0a31c9da1c2f9cf2587a542e3c55cbb191b1873667dc45072`. Vendor archive SHA `7743f4d8be3415d50f9c1018c7e176c0b16df6760998f3a18ad2a12f2349a1d3`; headers SHA `9f43e428d4145d3212b68a70970cc5b736ce544b4bec2f1d6f010225787ddef4`. The original profiler recipe remains unchanged.

Final profile modes preload plpgsql_check, enable the profiler and set **use_lxcache=off** at startup. P6 records actual cache OFF/shared statistics ON. P7 asserts the actual cache setting. Each server has a read-back-verified **805,306,368-byte memory limit and 750,000,000 NanoCPUs**, ownership label and zero core ulimit. Baseline schema composition precedes counter reset. Profiling and routine-replacement mutation never share these environments; **zero mutations** ran.

`phase9dP6Profile.js` preserves raw native trees and checks both API ratios against exact visible statements and first-statement branch counts. “Before” is the original saved custody native window, with matching definitions after line-ending normalization; “after” is the final P6 window, not a sum of epochs.

| Routine / installation | Before statements | After statements | Before branches | After branches |
| --- | ---: | ---: | ---: | ---: |
| `custody_export.ack(bigint,text,jsonb)` / receiver | 5/6 | **6/6** | 1/2 | **2/2** |
| `custody.accept(jsonb,text,text)` / custodian | 11/16 | **16/16** | 4/10 | **10/10** |
| `custody.ingest(jsonb)` / custodian | 9/12 | **12/12** | 3/6 | **6/6** |
| `custody.rotate(text,text,bigint)` / custodian | 0/12 | **12/12** | 0/6 | **6/6** |
| `custody.store_signature(uuid,text)` / custodian | 7/9 | **9/9** | 2/4 | **4/4** |
| `custody.valid_event(jsonb,text)` / custodian | 22/34 | **34/34** | 20/32 | **32/32** |

There are no unhit visible statements/native branches in these six final entries. Exact catalog definitions and SHA-256 identities are retained in the selected witness and native comparison. New owner-only contract probes cover custom valid_event's malformed/missing/type/hash/UUID/time/generation arms, supported lineage/denial variants and unknown-source accept rejection without new service grants. They complement the unchanged lifecycle/race tests. Native counters still do not measure independent AND/OR operands, NULL logic, SQL CASE/WHERE expressions, cryptographic validity or every possible schedule. No SQL Ed25519 implementation, acknowledgement authority or signing behavior changed.

## 4. P7 fresh numerical scope and valid reuse

`phase9dP7Profile.js` preserves raw trees before reconciliation and reuses the pinned P4/P5/P6 shape algorithms where definitions match. Capture/admission/frame shapes are explicitly reconciled against the native APIs. P7's fresh fixture has original transport receive, **not** the later receive wrapper. The fresh source/receiver observations below are not whole-SQL percentages.

| Installation / routine | Fresh statements | Fresh branches | Existing matching evidence / remaining difference |
| --- | ---: | ---: | --- |
| source / `outbox9d.remote_payload(bigint,uuid)` | 5/6 | 1/2 | P4 6/6, 2/2; fresh window exercises terminal/stale refusal, not a new positive export. |
| source / `outbox9d.remote_ack(bigint,uuid,jsonb)` | 4/8 | 1/2 | P4 8/8, 2/2; fresh window exercises late ACK refusal after cleanup. |
| source / `outbox9d.remote_delete_payload(bigint,jsonb)` | 7/7 | 2/2 | P4 7/7, 2/2; fresh all native nodes observed. |
| receiver / `broker9d.operate(uuid,uuid,text,bigint,text)` | 26/31 | 14/19 | P5 31/31, 19/19; fresh STOP/terminal/CLEAN does not repeat every invalid/idempotent/rollback arm. |
| receiver / `shadow9d.broker_payload_cleanup(uuid)` | 7/9 | 2/4 | P5 8/9, 3/4; private no-eligible-target guard remains unhit; missing receiver-row guard was measured in P5. |
| receiver / `custody_export.admit_analysis()` | 6/6 | 2/2 | Original N 5/6, 1/2; fresh all nodes; five independent pressure thresholds asserted. |
| receiver / `custody_export.capture()` | 10/10 | 0/0 | Original N 10/10, 0/0; fresh all visible nodes, no procedural branch denominator. |
| receiver / `custody_export.frame(bigint)` | 6/6 | 2/2 | Original N 5/6, 1/2; new authorized missing-frame regression closes fresh return arm. |
| receiver / `custody_export.ack(bigint,text,jsonb)` | 5/6 | 1/2 | Original N 5/6, 1/2; final P6 same definition 6/6, 2/2 covers rejection. |
| receiver / `transport9d.receive(jsonb)` | 12/22 | 5/14 | P4 original body as receive_committed 22/22, 14/14; full definition matches after only declared-name/line-ending normalization. Wrapper counters remain separate. |

Fresh unhit statement/branch identities remain in native-comparison.json. In particular remote_payload RETURN 6; remote_ack statements 5–8; operate 8/10/12/15/26; private cleanup 4/7; ACK 4; base receive 4/6/9/14–20 are unhit in this P7 window. Previously measured public paths are not rerun just to make this window numerically identical. No private service grant was added to force a percentage.

Additional P7 dependencies explicitly reconciled: historical local `outbox9d.delete_payload` has 5/5 visible statements and 2/2 procedural branches, `shadow9d.delete_payload` 6/6 and 2/2 at their saved permissions/outbox compositions. Remaining outbox claim/scan/stage/deliver/fail/serialize native API ratios are 1/1 in the original O witness; no new denominators are invented. P3 measures export next/retry at 6/6,2/2 and 13/13,6/6, and both lineage next installations at 6/6,2/2. P2/P4 wrapper/lineage and P5 current broker/native exclusions remain at their own source epochs. SQL-language pressure/receipt/allowed/accounting helpers, constraints/default grants/trigger WHEN clauses, and control configurations are separate behavioral/catalog invariants.

Historical matching SQL bytes and routine definitions establish reuse scope, not automatic recertification of every surrounding topology. The private cleanup no-target guard, private observe duplicate guard from P5, source invalid-lineage outcome from P2, installation-specific branches, SQL-expression truth tables, structural certification, meaningful SQL mutation adequacy and broader critical JS numerical gaps remain explicit. The new test-only retention functions have behavioral tests but no native/mutation or whole-critical-code certificate. **Whole-SQL certification remains PARTIAL; P8 did not run.**

## 5. Physical storage, WAL, cleanup and recovery

The bounded workload records all user-table sizes/counts in each database and clusters separately. Source/receiver are different databases on one physical server; the independent custodian is another server. Public application journals and extensions remain in per-database totals. Pipeline totals below include only the named pipeline schemas plus the isolated retention prototype; they exclude unrelated application/extension tables. Heap, indexes, table size, TOAST and FSM/VM observations are retained. `total = table_bytes + indexes`; TOAST is already inside table_bytes and must not be added again.

| Stage | Source pipeline total bytes | Receiver pipeline total bytes | Custodian pipeline total bytes |
| --- | ---: | ---: | ---: |
| baseline | 352256 | 835584 | 180224 |
| ordinary-signed | 393216 | 876544 | 278528 |
| larger-backlog | 425984 | 909312 | 278528 |
| review-cycle-1 | 425984 | 942080 | 278528 |
| signed-drained-admission-restored | 442368 | 1015808 | 401408 |
| terminal-cleaned | 442368 | 1056768 | 409600 |
| synthetic-retention-payloads | 598016 | 1212416 | 565248 |
| synthetic-retention-purged | 598016 | 1212416 | 565248 |
| vacuum-checkpoint | 925696 | 1851392 | 704512 |
| after-graceful-restart | 925696 | 1851392 | 704512 |

| Installation | Baseline heap / indexes / TOAST bytes | After maintenance heap / indexes / TOAST bytes | Full database bytes before → after maintenance |
| --- | --- | --- | --- |
| source | 65536 / 204800 / 81920 | 155648 / 253952 / 155648 | 20499603 → 21832207 |
| receiver | 131072 / 540672 / 163840 | 262144 / 647168 / 237568 | 9219219 → 10478095 |
| custodian | 16384 / 122880 / 40960 | 163840 / 229376 / 81920 | 8072339 → 8790543 |

The test adds 32 committed audit/lineage events per installation in bounded batches, accumulates backlog, performs six real failed loopback HTTP sends across two REVIEW/recovery cycles, preserves original identities, drains independently signed receipts, and executes existing terminal cleanup. A temporary fixture pending limit of one rejects reserve with 54000; signed drain restores admission and the original cap is restored. No unresolved history is deleted to reclaim capacity. Selected new work makes no live/paid or fake analyst evaluation.

Synthetic retention payloads are 24,576 high-entropy characters per database and produce actual external TOAST storage. Purge sets eligible payloads NULL and retains tombstones/commitments. Immediate physical allocation does not fall. VACUUM/checkpoint changes reusable space and auxiliary/catalog allocation; it is neither guaranteed file shrinkage nor erasure from old WAL/backups. Increased physical totals after maintenance are retained observations, not cleaned out of the evidence.

WAL generated from baseline through final checkpoint: **3,119,880 bytes** in the shared source/receiver cluster and **783,784 bytes** in the independent custodian cluster. Physical pg_wal allocation remains **50,331,648 bytes per cluster** in these windows. Archives are OFF, slots zero, segments 16 MiB. Test max_wal_size=1 GiB is not a hard disk cap; temp_file_limit and max_slot_wal_keep_size are -1. No deployed archive/slot/replica capacity is inferred. Actual temporary directories are empty at the measured final checkpoint.

A source/receiver restart probe encountered the inherited hidden admin client's unhandled 57P01 lifecycle and is retained as a failed fixture execution, not a successful recovery. The corrected narrow probe gracefully restarts only the independent custodian, verifies changed postmaster time, unchanged selected event/receipt identities and synthetic tombstones across all databases, and records signature-table/storage observations. Docker changed its mapped host port from **32808 to 32809**; reconnect now uses inspected actual port. Source/receiver postmaster time is explicitly unchanged. This is not power-loss, full-disk, corruption or off-host restore acceptance.

The [complete retained-storage inventory and capacity/recovery plan](../../output/phase9d-p6-p7-closure-2026-10-18/storage/capacity-and-recovery-plan.md) covers journals, outbox/transport/broker/custody/lineage, observer/denials, retries/tombstones, heap/index/TOAST, WAL/temp, logs/artifacts and backups. It distinguishes logical per-event/pending caps from global retained history. ACKED records, control history, independent signatures, logs and backups have no demonstrated universal physical bound. Alerts, archive/hold-aware policy and operator ownership remain missing. Proposed 70%/85% capacity review points are recommendations only, not activated limits. Full-disk testing requires a separately owned quota-controlled volume with reserve/abort/restore criteria; no laptop ENOSPC, global prune or uncontrolled WAL workload ran.

## 6. Retention, legal holds and actual providers

The [20-category purpose/retention matrix and approval decisions](../../output/phase9d-p6-p7-closure-2026-10-18/retention/policy-and-approval-matrix.md) is part of this deliverable. It identifies sources, personal/linkable fields, minimization, recipients, system/administrator ownership, triggers, current mechanisms, candidate durations, holds, auditability and backup implications for every category. It incorporates the owner's confirmed **UP sole proprietor / India customers / UP and Delhi NCR focus**. Final provider/region/backup/residency arrangements remain TBD.

Repository integrations include Clerk, PostgreSQL/Supabase trust material, Cloud Run/Build and GCS, Razorpay/RazorpayX, Meta WhatsApp, Firebase/FCM, Google Maps/Routes and OpenAI. Cloud Run configuration targets asia-south1, but this is not live or final deployment verification. Current object-storage code uses GCS; older Supabase-storage references are historical. No provider account was queried and no production credential inspected.

The linked worksheet cites current primary Indian notifications, CERT-In directions/FAQ, SPDI rules and central transport guidance, and distinguishes commencement/applicability from future obligations. It identifies the unverified corrigendum and state-specific interpretation for counsel. No lawful basis, statutory customer TTL, India-only hosting guarantee or legal compliance conclusion is invented. Earlier 7/90-day suggestions and new transient/backup candidates remain proposals requiring reconciliation with applicable security/processing-log minima, contracts, disputes and legal holds. No production duration or customer deletion is activated.

The test-only `retention_test` prototype starts its synthetic 60-second schedule disabled. Three isolated databases explicitly enable only that test policy. Actual restricted hold/delete/reader logins test active, nonexpired, stale, held and eligible states, wrong release operation, policy version, denied table/audit mutation, idempotent purge, retained commitments, cross-system partial completion and stale synthetic restore denial. Logs bind authenticated session actors. No original audit/financial/customer table is purged or put under new permissions.

A late hold after source purge returns ALREADY_PURGED_HOLD_INCOMPLETE; other nodes retain held copies until authorized release/reconciliation. This exposes the need for a real distributed hold/deletion coordinator with scope acknowledgements. Local row locks do not provide a global hold barrier or retroactive restoration. The stale-backup test applies an existing authoritative tombstone to a synthetic restore function; real provider backup/PITR purge and full restore remain unimplemented. Hashes/tombstones are not automatically anonymous. The prototype is not connected to application or immutable custody histories, so actual legal-hold enforcement there remains NOT_IMPLEMENTED pending approved policy/integration.

## 7. Exact verification, retained failures and preservation

| Selected current check | Actual result |
| --- | --- |
| P6 unprofiled | **16/16 PASS**, no skips |
| P6 cache-OFF profiling-only | **16/16 PASS**, no skips; six native entries |
| P7 unprofiled | **14/14 PASS**, no skips |
| P7 cache-OFF profiling-only | **14/14 PASS**, no skips; ten native entries |
| Bounded storage / synthetic retention / custodian restart | **13/13 PASS**, no skips |
| Backend typecheck | **PASS** |
| Scoped strict lint | **6 JavaScript files; zero errors/warnings**; no broad complexity certificate |
| Scoped Git and new-file whitespace | **PASS** |
| SQL source preservation | **15/15 byte-identical** to task baseline |
| Original local/staged/archive/HEAD | **19/19 / 23/23**, archive/HEAD unchanged |
| Accepted Clerk / frozen V5 / original custody | **3/3 / 22/22 / 28/28**, both worktrees |

All six selected receipts record sourcesUnchanged:true and every bound file is rechecked against final bytes. All final database servers have verified real memory/CPU limits. Earlier passes at changed test/resource epochs remain historical, not selected current executions. Existing ICR-1/P2–P5 and original P7 regression evidence is preserved; unrelated full-backend, JS mutation, capsule and SQL replacement campaigns were not rerun. No application SQL dependency changed.

Retained failures include: initial invalid Dockerfile image reference; new default-cache signal11/debugger attachment failure; P7 profile collector initially missing CREATE EXTENSION in the custodian; unprofiled P7's initially over-strict dormant-GUC assertion (NULL is supported when not loaded); Testcontainers GiB/byte budget error; source/receiver admin-client restart 57P01; initial custodian reconnect using stale mapped port; and evidence-builder selection/path/encoding errors. Test-only corrections preserve original assertions about application behavior. Initial 15/15 P6, 13/13 P7 and 12/12 storage passes remain at their exact earlier epochs. Original source bytes, failing receipts/logs, and builder failures are retained; none is erased by a later success. The full P7 baseline title still says unprofiled even in native mode; mode, settings and witness.profiling identify the actual selected execution.

Only three of the **1,945 pre-existing working files** changed: closure-run.mjs and the P6/P7 test files. New files are the P7 native collector, storage metrics helper, synthetic retention SQL and storage/retention test. Runner changes add explicit safe profile/storage modes, source binding, actual resource/ownership checks and custodian identity; they do not alter accepted product routines. Staging index and HEAD are unchanged.

| New/changed code | SHA-256 |
| --- | --- |
| `tools/phase9d/closure-run.mjs` | `4b4310aa485b34f45b9424ccdd887ddd031e185a3d419acb2756934dade4bffd` |
| `backend/tests/integration/phase9dCustodyP7.test.js` | `7511f3bfa78ffc7987d66dbca32f227ab9fd3bfd7ab4330036cd01b55b362337` |
| `backend/tests/integration/phase9dCustodyP6.test.js` | `0821373d7816fc5871863d131b518df4a4ef91a8b03939d83a1d1b87f7c5b6ab` |
| `backend/tests/helpers/phase9dP7Profile.js` | `07b62a1168f34a434ff4f232d0f88078102207087a20fbea6548e467d3d52a12` |
| `backend/tests/helpers/phase9dStorageMetrics.js` | `9cb0d783b7d512603b771175593af671d2d339a19db229a10d61bd483069a465` |
| `backend/tests/helpers/phase9dSyntheticRetention.sql` | `bd5939c1582d7158d740e523b400309f9923d181d53af40583b7caf5e0848b9b` |
| `backend/tests/integration/phase9dStorageRetention.test.js` | `8d78b2c82c0a043151b4a4ecf7c5d78e9f0b152791ea307463fe247dbd9ddcba` |

The manifest separately inventories the checkpoint, exact selected catalogs/native trees, legacy source epochs, diagnostic receipts, matrices, policy/capacity worksheets and execution/monitoring code. Hash validation establishes identity, not test success or legal acceptance.

## 8. Host reliability and cleanup

Owner-approved RAM admission/abort thresholds remained disabled; deadlines, responsiveness checks, resource quotas and other existing controls remained active. The GiB/byte error is explicitly corrected rather than assumed away. The scripted observer recorded **7,023 samples**, minimum available RAM **44.1 MiB** at 16:26:30 UTC during an earlier uncorrected-budget storage rehearsal, minimum commit headroom **9,674.7 MiB**, and **zero** heartbeat gaps over eight seconds. One taskbar timeout at **18:49:10 UTC** occurred after the final database/typecheck sequence completed at 16:37:33 UTC; it is retained without inventing a freeze diagnosis. Same-host sampling cannot rule out a complete OS freeze.

The observer reached its four-hour maximum at 20:05 UTC rather than its stop sentinel. No database workload ran after the selected sequence; the engine remained idle until final readback/shutdown. Cleanup at 20:18 UTC found zero running containers and stopped Docker normally. DellTechHub and SupportAssistAgent were Running/Auto; no service/startup setting, unrelated process, existing volume or cache was changed. Finalization after the observer window is read-only/file work; no additional unmonitored database diagnostic was launched.

Historical profiler signal11, cloud ENOSPC and intermittent transport deadline findings remain distinguishable. New selected cache-OFF profiling has no crash/recovery observation; the intentional graceful custodian restart is not a profiler crash. No broad reliability root cause is inferred from a pass.

## 9. Readiness reconciliation and blockers before P8

All **78 original criterion IDs/order** and **20 original audit action rows/order** are preserved exactly. New closureAssessment fields classify supported work as VERIFIED/PARTIAL/BLOCKED/NOT_RUN while retaining original statuses, records, source hashes and epochs. Current capture-source identities are additive, so ICR-1 changes are not silently substituted into old matrices. No production gate is closed merely by the new measurements.

Remaining requirements before claiming the requested P6/P7/storage/retention closure:

1. Localize/fix or independently accept the default-cache instrumentation defect. No symbolized stack exists; use only the measured cache-OFF configuration for separately approved native work.
2. Review P7 historical/fresh composition reconciliation and the remaining private/installation native exceptions; close SQL-expression, DDL/default-privilege, structural and meaningful-mutation gaps without inventing a whole-SQL percentage.
3. Implement approved total retained-storage accounting, admission/reserve, archive/hold-aware lifecycle, actual alerts/escalation and bounded WAL/slot/temp/log/artifact/backup policies. A 10 MiB queue relation threshold is not this implementation.
4. Complete a reconnectable source/receiver storage-recovery fixture and separately owned full-disk/archive/restore acceptance. Preserve the failed admin-client probe; no global exception suppression.
5. Obtain signed category purposes/periods/holds/rights/provider/hosting/backup decisions from the proprietor and qualified Indian counsel/CA as appropriate. Verify actual regions, recipients/sub-processors, contracts and relevant state obligations.
6. Integrate the approved retention/hold/deletion coordinator with real source/receiver/custodian records, including partial failures, late holds, independent acknowledgements, backups and restore tombstones. The isolated prototype is not that production integration.

External deployment, independently administered/off-host custody, useful approved minimization, human calibration, production Clerk capacity/monitoring, financial/human-final policy, activation and broader critical-code gates remain open. They are not silently waived for P8.

**Recommendation: do not declare the prerequisite closure complete or begin P8 automatically.** P6 native measurement can proceed under the tested workaround in a separately requested scope; the default crash and total-storage/real-retention requirements still need the explicit engineering/approval decisions above. This report stops here.

Frozen V5 remains `e484afc4c7fa724ea29af6edd962c48b814dc73a10e4f4a5e33833ad26afbe75`. No production connection, live incident/provider/model evaluation, automatic adjudication, financial consequence, Search rollout, commit, push, merge, evidence migration, deployment or production activation occurred. **Production stays OFF.**
