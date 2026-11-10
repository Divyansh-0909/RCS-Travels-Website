# Phase 9D-1 — native SQL conditions and storage/alert verification

31 October 2026 IST. Continues the [final targeted P8 register](phase9d-1-p8-final-register-2026-10-31.md), [SQL conditions/metadata checkpoint](phase9d-1-sql-conditions-metadata-checkpoint-2026-10-23.md) and [storage safeguards](phase9d-1-storage-safeguards-checkpoint-2026-10-23.md).

**Selected native SQL checks and local storage/TLS-alert lifecycle: VERIFIED_IN_ISOLATION. Required-chain NULL defect: FIXED in source and receiver. Whole-SQL, total production storage and Phase 9D-1 remain PARTIAL. Production OFF; deletion DISABLED. Docker/profiler work PAUSED.**

Evidence: [manifest](../../output/phase9d-native-sql-storage-2026-10-31/manifest.json), [finite acceptance checklist](../../output/phase9d-native-sql-storage-2026-10-31/acceptance-checklist.json), [before/after results](../../output/phase9d-native-sql-storage-2026-10-31/regression-before-after.json), [selected executions](../../output/phase9d-native-sql-storage-2026-10-31/selected-executions.json), [catalog/source delta](../../output/phase9d-native-sql-storage-2026-10-31/catalog-and-source-delta.json), [actual storage/alert witness](../../output/phase9d-native-sql-storage-2026-10-31/storage/witness.json) and [operator runbook](../operations/phase9d-native-sql-storage.md).

## 1. Reproduced defect and smallest correction

`custody_lineage.capture_status()` compared required event sequence, source and previous commitment using `<>`. A missing or JSON-null field extracts SQL NULL; if all other gap operands are false, the combined IF is UNKNOWN and its rejection body does not run. The inspector could report CAPTURE_CONSISTENT for that malformed chain.

Fresh original-code fixtures reproduced **12 failures among 65 assertions: 53 PASS / 12 FAIL**, covering missing and JSON-null values for the three fields in both installations. The owner probe recomputes the retained event hash and control head, so the detector cannot rely on a stale hash to catch it. Actual restricted inspectors read committed rows in REPEATABLE READ transactions. These are explicit trusted-owner integrity probes, not newly granted service writes or a claim to prevent an owner rewriting both original and captured history.

The correction changes only those three comparisons to `IS DISTINCT FROM`. Missing/null values now report CAPTURE_GAP. Wrong-string values still report a gap, and valid chains remain consistent. No strict new JSON scalar policy is invented; this fix concerns absent identity values. No emit/capture producer, ACK, signing, grant, budget or booking/payment behavior changed.

| Selected check | Actual result |
| --- | --- |
| New required-chain/precedence/composed retry checks | **65/65 PASS** after correction |
| Unchanged selected condition regression under current SQL | **253/253 PASS** |
| New native storage and real loopback TLS alert checks | **30/30 PASS** |
| Reused matching prior native storage suite | **30/30 at its recorded epoch**, not rerun |
| Scoped quality | **6 active Python files: Ruff/AST PASS; SQL runtime, Git and explicit new-file whitespace PASS** |

The new SQL cases also verify missing-original precedence over deferred observations, observer-labelled backfill, and unchanged composed retry NULL/stale outcomes with no partial queue/history/lineage write. Existing NULL-operation/expected behavior remains 23502, rather than being silently changed to false. Source-only and receiver-only paths retain their real installations.

The unchanged 253-case regression exercises its original emit/configuration, expected-source identity/evidence pair, permit and accounting/inspection scenarios. The adapter changes only output location and owned-server tracking. No source/helper logic was substituted with mocked query results.

## 2. Source epoch and metadata

Only `tools/phase9d/closure-consistency.sql` changes among the original fifteen SQL sources. Its old byte-exact copy remains under historical-source. Both installed capture_status definitions change identically; owners, SECURITY DEFINER, STABLE classification, search paths, ACLs, triggers, constraints and defaults remain equal. **89 other custom source/receiver routine definitions match exactly.** No runtime routine replacement occurs during these checks.

| Identity | Before SHA-256 | After SHA-256 |
| --- | --- | --- |
| closure-consistency.sql | `9a3010d5bd92702b1bb855115496b3919514be5038323967a03830c757c243be` | `077fc931a57f0ec3dd5233cf33a84151230958a24b80955199b906c32faf30de` |
| capture_status(), both installations | `6906974d4611ca83b5b9281441d06f0a401ac4c6200b0080273a6d893ce72503` | `0cae5038d38c4bd20545317856df9d0478e64e062bb04d28a945767a554479d4` |

This creates a new source epoch. Earlier P2/native/metadata/P8 receipts remain historical; they are not rehashed as fresh execution certificates over the changed file. The selected P8 register is unchanged, and no new mutation/profiling score is inferred. Installation and actual regression replace any unsupported standalone SQL-lint claim.

## 3. Native storage configuration and actual measurements

PostgreSQL **18.4** runs on newly owned loopback SCRAM instances, sequentially. The storage fixture reads back a 1 MiB per-process temp limit, 32 MiB slot retention, 128 MiB WAL target, logging collector ON with 1 MiB/one-hour rotation, and a 15-second idle-transaction timeout. Shared buffers are 32 MiB, work memory 1 MiB and maximum connections eight. None of these is a hard process RAM quota or a universal physical storage cap.

Thirty-two deterministic high-entropy synthetic rows generate the following actual measurements:

| Metric | Bytes |
| --- | ---: |
| Heap | 8,192 |
| Indexes | 16,384 |
| Table bytes including TOAST/auxiliary allocation | 589,824 |
| Total relation bytes | 606,208 |
| TOAST heap, already included above | 540,672 |
| WAL generated over the bounded write/checkpoint window | 577,432 |

The observer enumerates databases, cluster WAL/temp and separate external directories. Indexes/TOAST are not added again to database totals. The fixture confirms actual TOAST allocation and retained row count. The saved source-identical 30-case storage suite supplies its earlier actual 53400 temp-spill refusal, history admission/refusal, reservations and bounded-writer assertions; no laptop ENOSPC or broad archive workload was repeated.

Actual inventory remains **incomplete** and aggregate log storage unbounded: rotation is not retention. The guard therefore returns REFUSED, rather than treating the real observation as READY. Archive mode is OFF; provider archives/backups, all writers and hard quotas remain separate. No positive quota or full-disk claim is fabricated.

## 4. Alert setup and actual TLS lifecycle

The [disabled budget profile](../../output/phase9d-native-sql-storage-2026-10-31/profiles/storage-policy.disabled.json) and [disabled operator profile](../../output/phase9d-native-sql-storage-2026-10-31/profiles/operator-alerts.disabled.json) are reviewable configurations. Divyansh Singh remains technical responder; Rajuddin remains escalation approver. Proposed sender/recipient are rcstravels.support@gmail.com and rcstravels.business@gmail.com. Production email, schedules, deletion and policy activation remain disabled. Illustrative budgets are not approved production limits.

The real HTTPS loopback test uses a synthetic certificate and the unchanged transport/controller:

1. Default cycles and an unconfigured route send nothing.
2. The untrusted certificate is rejected before any HTTP request.
3. Trust is supplied only through the child test process; TLS verification stays enabled and no system trust store changes.
4. HTTP 503 leaves IN_FLIGHT/attempt 1 with no accepted receipt. A trusted fixture expires that lease without changing the host clock; reopening the SQLite ledger and retrying records attempt 2 and ACCEPTED_BY_TRANSPORT.
5. A cross-host redirect is refused. The generic closed payload contains no supplied secret marker, SQL or connection data.

Three HTTP requests reach the loopback endpoint: failure, successful retry and refused redirect. **Zero external messages** are sent. Transport acceptance is not human acknowledgement; actual Gmail delivery, independent monitoring/heartbeats and response remain pending. The synthetic TLS private key is deleted and the endpoint stopped.

## 5. Preservation, failures and quality

**872 protected inputs, HEAD and staging index remain unchanged.** The single allowed SQL correction has its before/after hashes and exact three-comparison delta recorded. The other fourteen SQL files, original migrations, frozen V5, Clerk, signing/ACK, financial policy and unrelated working changes remain within their preserved identities. Historical evidence files are not edited or moved. No JS/TS changed; no unrelated backend/typecheck or broad campaign ran.

The initial source probe records six NULL counterexamples before its backfill fixture correctly raises 54000 while deferred control is set. That failed harness epoch is retained. The corrected fixture restores the synthetic control before ordinary backfill and then observes deferral separately; the complete original baseline records all twelve genuine failures. The final code passes them. Original source bytes, failed witness, stderr and snapshots remain.

An initial 253-case regression pass predates only adapter import-order/output-path and dependency-inventory finalization. It is retained separately; the selected final run binds the final adapter. Initial scoped lint findings are corrected before the selected storage run. The source-bound original regression and all selected runtime dependencies match current bytes.

| New active code | SHA-256 |
| --- | --- |
| `tools/phase9d/native_sql_storage_checks.py` | `5b9821dd29ca43b09c333c800fa533899bdddb36b5a5abf84531daab9436390c` |
| `tools/phase9d/native_sql_storage_regressions.py` | `bb58c277c788d48b8970e0dc99507011d22931cfe8bc718ef9efa48cc6e5d016` |
| `tools/backups/native_storage_alert_checks.py` | `771bb413c6222ed361b61d640ab471e7c9917d038eb7ef9a193fae0262c00011` |
| `executors/run_job.py` in this evidence directory | `85d7963a01b7fc32dcbd27628b2cbce96ddd2d37ad5cc58743671568c3a8e105` |
| `executors/run_complete.py` in this evidence directory | `c26cce3db20652d7ee0b038dd06225aa1602efe008d4cd7cf45baff3cf57c3c7` |
| `executors/finalize.py` in this evidence directory | `02bc84b2592785efc1a4465fd01ffdf84314ff2315f0493dd6dbe4fec823235b` |

The manifest binds this checkpoint, runbook, disabled profiles, exact code/catalogs, source snapshots, all selected receipts and retained earlier failures. All ten newly owned servers from these sequential runs are stopped. No PANIC/unexpected signal termination is observed; expected constraint/probe errors remain in sanitized diagnostic counts.

Selected jobs retain **44 host samples**, minimum available RAM **3,332.52 MiB** and minimum commit headroom **13,600.56 MiB**. All retained jobs total **78 samples**, with zero unresponsive taskbar samples; minimum free disk was C: **91.16 GiB**, D: **477.96 GiB**. RAM admission thresholds remain owner-disabled, with deadlines and responsiveness monitoring active. Sampling cannot rule out a complete OS freeze. No unrelated process/service or global resource setting changed.

## 6. Remaining boundaries and stop point

The finite checklist has seven selected SQL/metadata items and nine local storage/alert items, with new or explicitly reused evidence. It does not assert every Boolean combination, optional management/provider/application deployment, structural metric or whole-SQL adequacy. Missing intermediate mutable states and trusted-owner suppression of both original/capture remain outside current-row inspection.

Actual provider/volume quotas, aggregate history/WAL/temp/log/archive/backup bounds, full writer enrollment, real alert routing/response, Google/R2, genuine off-host recovery, final independent custodian/key handoff and approved production retention periods remain pending. The profiles do not activate them. Default-cache profiler signal-11 stays OPEN/PAUSED; signal-9 stays SEPARATE/UNATTRIBUTED. All 78 readiness criteria, 20 audit rows and 24 condition families retain original fields/order with additive assessments.

No Docker startup, native crash reproduction, SQL routine-replacement mutation, hosted/customer/provider connection, paid resource, real email, production deletion, commit, push, merge or deployment occurred. **Production stays OFF; deletion DISABLED. Stop after this native verification batch.**
