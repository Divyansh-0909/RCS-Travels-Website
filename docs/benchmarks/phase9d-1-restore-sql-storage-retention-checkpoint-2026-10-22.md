# Phase 9D-1 — restore, SQL predicates, archive recovery and retention integration

22 October 2026 IST. This continuation started on 21 October; its output directory retains that date. Execution receipts retain their actual UTC timestamps. Continues the [previous checkpoint](phase9d-1-phone-recovery-sql-followup-2026-10-21.md) and [SQL plan](phase9d-1-sql-coverage-plan.md).

**Supported restore/predicate/archive/synthetic-retention scopes below: VERIFIED_IN_ISOLATION. Complete managed-project recovery, total physical storage bounds, real category retention/holds and whole-SQL certification: PARTIAL. Phase 9D-1 PARTIAL; P8 NOT_STARTED; production OFF.**

Evidence: [selected executions](../../output/phase9d-engineering-completion-2026-10-21/selected-executions.json), [manifest](../../output/phase9d-engineering-completion-2026-10-21/manifest.json), [quality](../../output/phase9d-engineering-completion-2026-10-21/quality.json), [preservation](../../output/phase9d-engineering-completion-2026-10-21/preservation.json), [78-criterion/20-row reconciliation](../../output/phase9d-engineering-completion-2026-10-21/readiness-current.json), [remaining acceptance](../../output/phase9d-engineering-completion-2026-10-21/remaining-acceptance.json).

## 1. Actual results

| Selected execution | Result | Scope |
| --- | --- | --- |
| Hosted custody restore | **20/20 PASS** | Complete custom custody schema/metadata and synthetic contents through two disposable databases |
| Current application restore | **24/24 PASS** | Current 83-migration, 51-table application schema and mapped metadata; no source data export |
| Additional helper expressions | **94/94 PASS** | Projection/serialization, historical key lookup, pressure and management receipt predicates |
| Composed broker predicates | **77/77 PASS** | Original base/private alias and recovery `allowed()` helpers, with original broker table constraints |
| Physical backup/archive recovery | **12/12 PASS** | Base-backup verification, bounded archive refusal/drain and named WAL recovery |
| Persisted retention integration | **50/50 PASS** | Three synthetic databases, real payload minimization, tombstones, stale manifests and late-hold freeze |
| New offline units | **18/18 PASS** | Restore-scope validation and archive integrity/refusal/duplicate/path checks |
| Scoped quality | **PASS** | Ruff and syntax compilation of current Python files; Git/new-file whitespace |
| Cleanup readback | **PASS** | Owned hosted databases removed; native fixtures stopped; custody service logins disabled |

These counts are separate assertion windows, not a combined SQL percentage. Earlier 96 expression checks, hosted custody 33/33, phone recovery, P6 cache-OFF 16/16 and P7 14/14 results remain at their original epochs. They were not rerun or relabelled here. No Docker, Google login, R2, native profiling, routine-replacement mutation, full backend or P8 campaign ran.

## 2. Supabase restore compatibility

### Custody custom schema

The synthetic custodian project is `itwepbryqixmlyqallia`, PostgreSQL **17.11**. Two fresh, marked, access-restricted databases were created there and removed afterward. Existing cluster roles were prerequisites, not recreated or assigned new passwords. Their earlier creation and actual restricted-login checks remain separate evidence.

The original installed custody schema was exported without original data. A temporary database restored its definitions as `custody_owner`, applied the observed schema/table/sequence/function/column grants and owner-wide function defaults, and received synthetic source/event/key/signature rows. Its full custom-schema dump then restored into a second fresh database. Assertions compare complete selected table rowsets, sequence state, function definitions, owners, effective grants, default privileges, constraints, indexes and RLS flags. Inspector SELECT remains permitted; inspector DELETE and PUBLIC accept execution remain denied.

CREATE permission was granted to the custom owner only in each disposable database during installation, then revoked. The source database's schema/catalog and empty custody rows remained unchanged. The provider pgcrypto namespace and explicit HMAC alias from the earlier bootstrap remain separate required dependencies. No extension was relocated and no new cryptographic implementation was introduced.

### Current application schema and provider baseline

The dev project is `ggpfpszwflvbodrqngkh`, PostgreSQL **17.6**. The protected dev connection was used; `backend/.env` and the production project were not used. A schema-only export of the current **83 completed migrations / zero unfinished / 51 application tables** restored into a fresh owned database. Source application row values were neither exported nor published. Read-only before/after table counts and catalogs are retained.

The required extension baseline is explicit: `pgcrypto 1.3`, `postgis 3.3.7`, `uuid-ossp 1.1`, and **vector 0.8.2**, all in `extensions`. The missing vector dependency was discovered by an actual failed restore. The empty template `public` schema is dropped only in the fresh target, without CASCADE, before the archive creates it.

The restore applies an explicit target-owner projection for `pg_database_owner`/`supabase_admin` to `postgres` where required; this is not an exact reserved-owner restoration or production approval. It compares schema, relation/function/type ownership and effective privileges; column grants and definitions/defaults/identity/generated attributes; application-owner public default privileges; constraints/indexes; triggers/enabled states; RLS flags/policies; views; and enum label ordering. Enum internal fractional sort positions are not stable logical identities and are compared as ordered labels instead. Mapped duplicate grants are normalized to their effective set.

**Provider-admin defaults are inventoried separately and never merged into application-owner defaults.** Merging those two creators would give future application objects different grants. Existing booking/user Data API denials survive, and a newly created quarantine table is not readable by `anon`. No source grant or policy changed.

The accepted earlier 28-table data restore belongs to the pre-migration backup epoch. This new 51-table result verifies current schema/metadata with empty application tables; it does not silently update that backup's data epoch or prove recovery of newer live data. The custom custody roundtrip uses synthetic data only.

### Supported boundary

[supabase_restore_scope.py](../../tools/backups/supabase_restore_scope.py) rejects managed-schema replay, missing target owner/grantee roles and unreviewed reserved-owner reassignment. Supabase-managed Auth/Storage/Realtime/Vault objects, reserved roles, service configuration, secrets and external object bytes need their own supported baseline and recovery acceptance. The official [backup/restore guide](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) distinguishes the platform restore workflow and customizations. Supabase also states that database backups exclude stored object bytes. [Database backups](https://supabase.com/docs/guides/platform/backups)

Consequently, the selected application/custom-schema restore compatibility is verified. **A complete managed Supabase project clone, all external services and production disaster recovery are not certified.** The current automation stays disabled for real production data.

## 3. Additional SQL-expression evidence

[native_remaining_cases.py](../../tools/phase9d/native_remaining_cases.py) uses a fresh native Windows PostgreSQL **18.4** fixture. It installs exact source definitions and records their catalog identities:

| Family | Checks |
| --- | ---: |
| `entries`, pseudonym/HMAC, projection/redaction, serialization and binding | 29 |
| `active_key` / `signable`, missing receipts, ACTIVE/RETIRED/COMPROMISED and retained signatures | 17 |
| `pressure`, empty/mixed/ACKED queues, bytes, future timestamp clamp and relation size | 11 |
| Closed management receipt fields/types/NULLs/node/status/UUID/range patterns | 36 |
| Unchanged definitions/owners/grants/search paths | 1 |

[native_broker_predicates.py](../../tools/phase9d/native_broker_predicates.py) separately installs the exact original broker tables and normal recovery alias/wrapper composition. Its **77** assertions vary STOP/generation, tokens, lease boundaries, permitted-state arrays, work/receipt/evidence/snapshot/configuration/frozen bindings, missing joins, existing results, terminal/cleaned/conflicting usage, and the accepted SUCCESS receipt/response binding. All row probes roll back. Initial composition precedes assertions; no active-function omission/replacement campaign runs.

Dependency tables are deliberately small owner-controlled fixtures. Some probes represent inconsistent or NULL dependency projections, not a claim that the actual constrained producer can create those states. Original broker constraints remain enabled. The synthetic usage-receipt rows test the helper's query predicates, not authenticated `reconcile()` or receipt authority. Actual service authentication, grants, complete recovery transactions and races retain their separate P5 evidence.

Observed existing SQL semantics remain explicit: missing joined rows can yield SQL NULL; wrapper COALESCE can turn that into false. A permitted state plus NULL can satisfy the base helper while the recovery wrapper rejects it because its response-state condition is UNKNOWN. No acceptance rule was strengthened or weakened to remove that distinction.

The [24-family register](../../output/phase9d-engineering-completion-2026-10-21/condition-family-map-current.json) adds these cases to S03/S12/S17/S18/S21/S24 without rewriting prior findings. These are expression outcomes, not native branch counts. Remaining private normal-path exceptions, the source invalid-lineage question, other compound conditions, DDL/default-grant adequacy and meaningful mutation still require explicit evidence or justified exclusions. **Whole-SQL remains PARTIAL.**

## 4. Physical backup, bounded archive refusal and WAL recovery

[archive_spool.py](../../tools/backups/archive_spool.py) implements an owned synthetic archive spool with an enforced archive-content byte budget, exclusive writes, fsync, SHA-256 readback, idempotent duplicates, conflicting-content refusal and restore hash/path checks. It handles WAL segments, timeline history and base-backup `.backup` history files. A missing checksum sidecar after an interrupted publish can be reconstructed only after matching the retained content. No old archive is silently overwritten or deleted.

[native_archive_recovery.py](../../tools/backups/native_archive_recovery.py) creates a disposable native server, takes a physical `pg_basebackup` with streamed WAL and SHA-256 manifest checks, and runs `pg_verifybackup`. It commits a second synthetic row, creates a named recovery point and archives that WAL. A third row commits after the target. The spool then refuses additional content at **50,331,986 bytes**; PostgreSQL records the archive failure while the three source rows remain committed. Raising the fixture budget permits drain. Observed counters: **5 archived / 1 failed**, with the failed segment subsequently archived. WAL-directory contents during refusal were **67,109,202 bytes**; reported WAL generated in the window was **58,616,984 bytes**.

The verified base backup starts on a different loopback port and recovers from the hashed archive to the named point. It promotes, contains IDs **[1,2]** and excludes the later ID 3. A new ID 4 commits after recovery; the original source still contains **[1,2,3]**. Both servers then stop normally. Readiness and completed promotion are explicitly distinguished.

This is real physical backup/WAL replay on PostgreSQL 18.4, following PostgreSQL's documented [pg_basebackup](https://www.postgresql.org/docs/current/app-pgbasebackup.html) and [backup verification](https://www.postgresql.org/docs/current/app-pgverifybackup.html) facilities. It is not hosted Supabase PITR, an encrypted off-host archive, a physical ENOSPC trial, power-loss acceptance or a production RPO/RTO promise. Archive payload accounting excludes filesystem allocation overhead and checksum metadata. PostgreSQL can retain/generate more WAL when archiving fails: a spool cap is **not** a total disk cap or automatic application-admission fence.

Total retained history, WAL/slots/temp/logs/artifacts/backups, alert routing and an owned finite-volume/full-disk refusal/recovery environment remain separate acceptance requirements. No laptop disk was filled, global filesystem quota changed or unrelated storage cleaned.

## 5. Persisted retention/hold integration

[retention_row_manifest.py](../../tools/backups/retention_row_manifest.py) joins the existing `retention9d` coordinator to actual synthetic payload minimization. It obtains bounded FK-bound manifests for reviewed booking/case/event fixture tables, binds row/catalog hashes, and rechecks locked rows before combining local commit, payload NULL updates, tombstones and authenticated actor recording in one transaction. Missing roots, unreviewed/cyclic copy graphs, excessive rows, changed manifests and conflicting operation reuse fail closed. Its hard guards restrict it to marked synthetic databases and `retention_lab`; it exposes no production mutation switch.

[native_retention_integration.py](../../tools/backups/native_retention_integration.py) creates three disposable databases on one native cluster. The original management SQL's production-disabled constraints remain unchanged. A clearly named fixture-only policy starts disabled; the trusted fixture enables it solely for the synthetic rehearsal, not as a real retention approval.

Actual outcomes include:

- Only the three FK-bound synthetic rows are selected; an unrelated booking remains unchanged.
- All three prepares and exact per-node commitments are needed for authorization. A foreign-node receipt is rejected.
- A changed payload after preparation causes refusal and rolls back the local tombstone transition.
- Actual payloads become NULL, while identifiers, FKs, commitments and tombstones remain. Exact operation reuse is idempotent; conflicting reuse rejects.
- A hold after the first copy is minimized reports **LATE_HOLD_CONFLICT**, preserves the receiver/custodian payloads, freezes further automatic work and writes durable manual-review incidents. No erased copy is claimed recovered.
- Tombstoned and held copies fail the existing restore-allowed predicate and require quarantine. A separate authenticated reader can inspect tombstones but gets 42501 when attempting deletion.

This implements and verifies the owner's approved **synthetic** late-hold behavior. The controller remains trusted; these are SQL observations, not new remote signatures or a global distributed transaction. The three databases share one administrator/server. The adapter covers the reviewed fixture tables, not every real category, provider object, immutable audit history or backup copy. Real category mappings, approved eligibility/minimization/periods, distributed hold propagation, provider erasure/restore tombstones and manual escalation ownership must be accepted before production integration/activation. The 20-category matrix remains a proposal; no production schedule, legal approval or customer deletion was invented.

## 6. Failures, integrity and stop point

The [failure register](../../output/phase9d-engineering-completion-2026-10-21/failure-register.json) retains every failed runtime attempt and its executed source snapshot. Custody rehearsals exposed ownership/namespace and ACL-comparison issues; application rehearsals exposed the existing template schema, vector dependency and inappropriate comparison/mapping of provider defaults and enum internals. Archive rehearsals exposed `.backup` handling and premature promotion assertion. One broker expectation misunderstood NULL-array behavior. Product SQL was unchanged throughout. The earlier 21/21 application pass remains at its narrower metadata epoch; final selection adds column structure, type grants and view comparisons.

All selected executable source hashes are rechecked after execution. Exact new-code hashes are in [changed-code.json](../../output/phase9d-engineering-completion-2026-10-21/changed-code.json); the manifest separately binds the report, witnesses, historical sources, quality and reconciliation artifacts. **115 pre-existing inventoried files**, including **103 SQL/migration inputs**, remain unchanged; the prior sealed 65-file continuation, HEAD and staging index are preserved. This is the recorded inventory boundary, not a claim over every unrelated editor file. No application JS/TS changed, so a project typecheck/full backend run was not substituted for the focused Python checks.

[Monitoring](../../output/phase9d-engineering-completion-2026-10-21/host-monitoring-summary.json) retains per-job RAM/commit/disk/responsiveness samples with owner-disabled RAM admission thresholds. Available RAM fell to about **0.6 MiB** in one sample; same-host sampling and zero sampled taskbar timeouts cannot prove absence of a complete freeze. Database jobs ran sequentially under deadlines; intervals between jobs were not continuously observed. No unrelated app/process/service was terminated, global host setting changed, or Docker engine started.

[Cleanup](../../output/phase9d-engineering-completion-2026-10-21/cleanup-readback.json) verifies no owned hosted restore databases, no enrolled synthetic custody rows, disabled custody service logins, 83/0 dev migration completion and no remaining native fixture PID files. Dumps, physical backups, credentials and server logs stay in access-restricted local scratch outside source control; no secure-erasure claim is made.

**Remaining requirements are explicit rather than labelled complete:** full managed-service/external-object recovery; a genuinely finite-volume ENOSPC/off-host acceptance and universal storage lifecycle; complete reviewed real-category/copy integration and proprietor/legal/CA approval; remaining SQL/DDL/mutation adequacy; final Rajjudin access handoff, phone disconnection, Gmail and R2 setup. Existing signal-11 remains OPEN and signal-9 SEPARATE/UNATTRIBUTED. No new crash reproduction ran.

No commit, push, merge, deployment, paid resource, production connection, real customer-record mutation or activation occurred. P8 remains a separately requested scope; this report does not start it or waive its acceptance requirements. **Production stays OFF.**
