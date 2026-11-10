# Phase 9D-1 — remaining engineering continuation

22 October 2026 IST. Continues the [restore, SQL, storage and retention checkpoint](phase9d-1-restore-sql-storage-retention-checkpoint-2026-10-22.md). **Selected new checks: VERIFIED_IN_ISOLATION. Whole-SQL, storage and real retention: PARTIAL. P8: NOT_STARTED. Production: OFF.**

Evidence: [manifest](../../output/phase9d-open-gates-2026-10-22/manifest.json), [selected executions](../../output/phase9d-open-gates-2026-10-22/selected-executions.json), [preservation](../../output/phase9d-open-gates-2026-10-22/preservation.json), [remaining readiness](../../output/phase9d-open-gates-2026-10-22/readiness-current.json).

## Executed scope

All database jobs ran sequentially. New local fixtures use Windows PostgreSQL **18.4**, loopback SCRAM, eight maximum connections, 32 MiB shared buffers and 1 MiB work memory. These settings are not a hard process-memory cap. No Docker, native profiler, routine replacement, production connection or provider login ran. The owner's RAM admission/abort gates remain disabled; deadlines and read-only host sampling remain active. No application SQL, booking/payment transaction, authentication, frozen V5, signing implementation or financial policy changed.

| Selected execution | Actual result | Boundary |
| --- | ---: | --- |
| Source lineage helper and persisted capture | **377/377 PASS** | 53 synthetic scenarios; exact current helper/trigger bodies, minimal original-table projections |
| Capacity measurement and conditions | **79/79 PASS** | Actual local observations plus explicit owner-controlled report/boundary probes |
| Retention extra-copy barrier | **38/38 PASS** | Actual synthetic SQL payloads; simulated object/backup copy observations |
| Hosted dev metadata inspection | **4/4 PASS** | TLS, READ ONLY, REPEATABLE READ; schema/count metadata only |

No counts are combined into a whole-SQL percentage. These are assertions, not 498 independently falsified Boolean operands or a pinned native-coverage measurement. Earlier 20/20 custody restore, 24/24 application schema restore, 94/94 helper, 77/77 broker, 12/12 archive recovery and 50/50 retention results remain accepted at their previous epochs; none was rerun or overwritten here.

## Source lineage: previously unobserved rejection outcome

[native_source_lineage_cases.py](../../tools/phase9d/native_source_lineage_cases.py) installs the exact current `outbox9d.entries/source`, `custody_lineage.capture/emit` and deferred expectation definitions. The source service remains `source-lineage-v2`; receiver-only paths are not fabricated. The delivery table uses the original SQL declaration, including its absence of an FK from `source_work_id` to the original work table.

Three valid families—rider cancellation, driver cancellation and late-driver recovery—produce the expected actor and both SOURCE_LINEAGE and OUTBOX_CREATED events. Fifty negative variants independently change selected snapshot, booking/user, evidence/case, source-key, assignment, cancellation, transition and late-fault fields, or omit joined originals. NULL/object timelines and missing joins are included.

When source validity is false or NULL, the actual trigger records OUTBOX_CREATED but emits no SOURCE_LINEAGE. The retained delivery-row commitment is checked using the trigger's UTC timestamp representation. `expected_sources()` excludes the invalid source; deferred `capture_committed()` does not backfill it. Valid deferred observation deduplicates the already recorded identity. Unchanged delivery updates add no event. Each scenario rolls back its bounded fixture rows; final catalog definitions/owners/ACLs/search paths match.

This supplies behavioral evidence for P2's formerly unobserved invalid-lineage outcome. **P2's saved native counters are unchanged.** Inconsistent original rows are trusted-owner fixture probes on minimal dependency tables, not a claim that the constrained application producer can naturally create each state. Full topology, SQL-operand, DDL and mutation adequacy remain separate.

## Capacity conditions and physical recovery boundary

[native_capacity_conditions.py](../../tools/phase9d/native_capacity_conditions.py) uses the unchanged optional management SQL. It checks actual current-database sizing, exclusion of cluster-level WAL/temp from a non-cluster-owner report, source plus lineage backlog counts, declared external bytes, signals and acknowledgement reset. Physical measurement is bounded by readings immediately before/after `observe()`; saving its own report/signals can allocate pages.

Additional condition probes check disabled/invalid inputs, NULL/type/missing/extra JSON fields, per-node positive cost bounds, stale/missing reports, incomplete inventory/quota assertions, exact backlog limits, NORMAL versus STOP reserve boundaries, operation reuse/conflict/release and retained ledger bounds. Local/global reports are deliberately edited by the fixture controller for exact boundary cases. An asserted `quota_verified=true` is **not** evidence of a real enforced quota. No actual source/receiver/custodian accounting authority or universal retained-storage bound is inferred.

The previous physical base-backup/WAL archive refusal/drain/recovery result remains intact. This continuation also prepares a distinct finite-volume ENOSPC test:

- [Reviewable plan](../../output/phase9d-open-gates-2026-10-22/isolated-volume-plan.json): a new **384 MiB fixed VHD**, label `RCS_TEST_f2b988ff`, under `D:\RCSProofloop-IsolatedTests\f2b988ffa6aa4e0eb7e41bc6005c9f17`.
- Creation verifies the exact image-to-disk binding, RAW state, non-boot/non-system identity and size before formatting that new virtual disk. Existing physical disks are not selected for formatting.
- The prepared test validates the mounted volume's label, path and small size before writing. It reserves emergency space, fills only that volume, makes at most one SQL write probe, reclaims its known filler files before shutdown, checks original rows/restart/new writes, then detaches only after PostgreSQL stops.
- **NOT RUN.** A specific Windows administrator/UAC action was requested but no answer was received during this continuation. No VHD file was created, attached or formatted. Syntax/lint checks are preparation, not ENOSPC acceptance.

Off-host archive recovery, power loss, universal WAL/slot/temp/log/backup bounds, deployed alerts and capacity ownership remain open. No host disk was filled and no uncapped diagnostic or historical crash reproduction was attempted.

## Retention copy completeness

[retention_copy_barrier.py](../../tools/backups/retention_copy_barrier.py) adds an optional barrier before the existing **synthetic-only** row minimizer. Its separate revoked control schema records expected copies, scope/content commitments, operation, epoch, policy version, state, hold and observation freshness. It does not weaken the original payload graph's rejection of unreviewed FKs.

Persisted tests show that absent/incomplete inventories, missing external acknowledgements, stale observations, foreign scope/epoch/version/commitment, waiting copies and held copies prevent both payload changes and tombstone advancement. A hold plus an already-purged copy returns LATE_HOLD_MANUAL_REVIEW_NO_RECOVERY. When all declared synthetic copies are prepared and bound, the existing atomic minimizer clears only the selected lab payloads and retains two tombstones. Production execution remains disabled by the original SQL constraint.

These are controller-trusted **simulated** object-version/backup-generation observations. No Google/R2 object or backup was deleted. The barrier locks the local controller view; it cannot prove inventory completeness or prevent an unseen remote hold. It is not a provider adapter, independently signed erasure receipt, distributed transaction or completed real-category integration. The earlier three-node durable late-hold freeze/manual-review evidence remains separate.

The [20-category draft copy worksheet](../../output/phase9d-open-gates-2026-10-22/retention-copy-bindings-proposed.json) accounts for all **51 current application tables**, pipeline histories, object versions, logs, physical copies and backups as review candidates. Metadata-based FK navigation is prepared for booking, driver, user and responsibility-case roots. Alternative/cyclic relations and logical references without matching FKs remain explicit; no automatic deletion selector is inferred from a column name. All category durations are NULL, policies unapproved and deletion disabled.

Rajjudin remains the designated admin custodian, with independent administration handoff unverified. Divyansh Singh remains key owner/technical responder. The proprietor retains final policy approval with qualified Indian counsel/CA where relevant. Sender/recipient assignments remain rcstravels.support@gmail.com → rcstravels.business@gmail.com; delivery verification is pending. No legal approval is invented.

## Supabase applicability and external configuration

The protected dev-only connection targets **ggpfpszwflvbodrqngkh**, PostgreSQL **17.6**, with TLS `verify-full`. A read-only snapshot confirms **83 completed / zero unfinished migrations** and 51 application tables. Auth users and identities, Storage buckets and objects, and Vault secrets each contain **zero rows** in that snapshot. Only counts and catalog metadata were retrieved; no raw application, authentication or secret values were exported.

This narrows the present managed-data recovery scope; it does not verify Auth settings, API secrets, service configuration, future records or external GCS object bytes. Supported custom/application restore compatibility was already tested at its stated scopes. A complete managed project clone is still not certified. Supabase's [migration guide](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) distinguishes project migration/customization steps; its [backup documentation](https://supabase.com/docs/guides/platform/backups) explains that database backups omit stored object bytes and recommends off-site exports for Free projects.

**Google account verification and R2 activation remain pending by the owner's latest instruction.** No new login, bucket, paid resource or real backup workflow was enabled. Current external-file recoverability, live alert delivery and R2 roundtrip acceptance cannot be marked complete.

## Evidence, failures and stop point

[Failure register](../../output/phase9d-open-gates-2026-10-22/failure-register.json) retains the first source timestamp-comparison failure, capacity report-allocation comparison failure, provider wrapper's duplicate keyword error and retention control-FK refusal. Original executed source snapshots, failed witnesses and receipts are preserved. Test-only corrections did not change product SQL or convert a failed receipt into PASS.

Scoped Ruff, Python syntax, PowerShell parsing and Git/new-file whitespace checks are recorded in [quality](../../output/phase9d-open-gates-2026-10-22/quality.json). Exact new code hashes are in [changed-code.json](../../output/phase9d-open-gates-2026-10-22/changed-code.json); the manifest binds this report and all selected source/evidence identities. No application JS/TS changed, so no backend typecheck or full test run was substituted for these scoped checks.

The previous **237 sealed artifacts**, **103 SQL/migration inputs**, HEAD and staging index are checked unchanged. This is the explicit inventory boundary, not a claim about every unrelated editor file. All selected local servers stopped; no owned native PID file remains. The virtual disk remains a plan. [Monitoring](../../output/phase9d-open-gates-2026-10-22/host-monitoring-summary.json) retains samples from both failed and passing jobs; same-host responsiveness sampling cannot guarantee that the OS never froze. No unrelated app, service, Docker volume or host setting was changed.

The additive register preserves all **78 criteria**, **20 audit rows** and **24 condition families**. Remaining completion gates are: the approved administrator step for finite-volume acceptance; real policy/complete copy-selector and provider integration; Google/R2 setup; external/managed-service and off-host recovery; final custodian/key handoff; further condition/DDL and separately requested P8 adequacy. Default-cache signal-11 remains **OPEN**; signal-9 remains **SEPARATE / UNATTRIBUTED**. Neither was reproduced here.

No production deletion, customer-record mutation, commit, push, merge, deployment or activation occurred. **P8 was not started. Production stays OFF.**
