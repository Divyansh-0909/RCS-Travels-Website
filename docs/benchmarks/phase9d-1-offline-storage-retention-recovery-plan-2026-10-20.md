# Phase 9D-1 — offline storage, retention and recovery handoff

20 October 2026 IST. **Design/source review complete for this handoff; runtime/provider/policy acceptance remains open.** No Docker startup, database query, provider request, destructive action or policy activation occurs. This follows E2/E3/E5/E6 in the [pre-P8 checklist](phase9d-1-pre-p8-reconciled-checklist-2026-10-20.md).

## 1. Physical quota feasibility decision

The retained [quota probe](../../output/phase9d-completion-local-2026-10-19/quota-enforcement-probe.json) records declaredStorageOptBytes=268435456, maximumAttemptedBytes=285212672, write_result=0. The filesystem projection showed a much larger overlay backing store. **Docker accepting an option did not establish a quota on that tested writable layer.** This does not diagnose every Docker volume backend or prove no supported quota backend exists.

The [capability observation](../../output/phase9d-completion-local-2026-10-19/storage-capability.json) retains an unsuccessful FUSE-device check and an available filesystem utility; neither proves a mounted finite persistent destination. No current host or Docker configuration is interrogated/changed here. Do not rerun the same option and call it progress.

Future acceptance requires a separately owned environment whose actual persistent destination can enforce finite storage independently of the laptop's free space. A dedicated finite block device/filesystem or supported provider quota is a **candidate**, not a verified configuration. No global Windows/WSL/Docker setting, privileged mount or paid resource is authorized by this document.

### Smallest justified runtime sequence — not executed

1. Resolve exact owned destination and backend; verify ownership, available host reserve, enforced hard allocation and treatment of WAL/temp/log locations. Save the actual mount/quota/backend readback. A configuration flag alone is insufficient.
2. First use a tiny ordinary-file control on that destination, with a bounded writer and an external deadline. Capture the actual quota/disk-full error, bytes accepted, available reserve and recovery after deleting **only its owned control file**. If it writes beyond the claimed cap, stop: do not proceed to PostgreSQL.
3. Only after that control succeeds, use one fresh synthetic PostgreSQL installation with fixed CPU/RAM/PID budgets, no native profiler, no replacements and no real signing/customer material. Record committed baseline hashes and quotas before work.
4. Fill only the owned finite target, keeping separate operator/recovery reserve and finite SQL/connection deadlines. Verify the application admission check refuses first if that is the designed boundary. If actual PostgreSQL disk-full acceptance is required, scope it separately with a predictable upper bound; preserve failed transactions/server logs and demonstrate committed baseline survival.
5. Restore headroom on the owned destination, reconnect and verify signatures/receipt commitments, hold/tombstone state, accounting and absence of duplicate operative outcomes. Do not convert a clean graceful restart into power-loss/PITR acceptance.
6. Stop after one unexpected termination, ignored quota, unresponsive observer or unavailable recovery channel. No automated repeated crash attempt, host-wide ENOSPC, global prune or unrelated process cleanup.

No hard numerical quota or reserve is activated by this plan. Select them for the verified environment before execution; operator recovery must remain possible even when workload admission is refused.

## 2. Complete accounting boundary

| Physical/logical material | Existing implementation/evidence | Remaining implementation or acceptance |
| --- | --- | --- |
| Source application journals, outbox payloads and identities | management-adapters selects one evidence-linked outbox resource; historical outbox cleanup retains identity | Enumerate all approved category copies, not one selected row; bound retained originals/history using approved lifecycle and destination controls. |
| Receiver work, broker requests/attempts/events/results/usage/operations | P5/P7 retained accounting, terminal cleanup and durable receipt tests | Historical rows continue to grow. No deletion of unresolved costs/history merely to admit more work. |
| Independent custody/lineage/signatures/keys/denials | P2/P3/P6 capture/delivery/key evidence and storage measurements | Separately controlled archive/lifecycle, administrator and restores; ACK does not erase history or establish global bounds. |
| Heap/index/TOAST/catalogs/auxiliary allocation | Actual relation/database sizes and later du observations | TOAST is already inside table bytes; database totals and du are overlapping measures. Choose a consistent denominator and retain both diagnostic views without summing them. |
| WAL/shared cluster temp | management-capacity.observe uses cluster-owner selection; adapters group system_identifier and require exactly one owner per cluster | Physical source/receiver cluster bytes counted once. Provider permissions and physical telemetry may differ; inaccessible measurement is unknown, not zero. max_wal_size is not the accepted hard disk cap. |
| Slots/archives/replicas/PITR | Earlier isolated archive OFF/zero-slot observation | Actual provider capability, retained bytes, lag, reserve and restore evidence pending. Do not promise PITR through daily logical exports. |
| Logs/artifacts/temporary exports | management-storage.artifactUsage bounds traversal, rejects links; ownedContainerStorage measures allocated paths | Logical file lengths differ from allocated destination blocks. Account for abrupt-exit scratch and host backing; quota observation still false/unverified. No arbitrary artifact expiry. |
| External object versions/backups | GCS code indication and encrypted synthetic S3 upload/restore | Actual buckets/regions/versions/soft-delete/holds/bytes/lag and independently controlled recovery unverified. Database metadata is not object bytes. |

`capacity9d` reservations/admission and global measurement are logical conservative controls. `quotaAttestation()` in management-adapters trusts a supplied infrastructure adapter. Neither creates a physical quota. `acceptCapacityReport()` trusts the controller; no independent telemetry authority is invented.

`management-observation.sql` distinguishes disabled/unknown/normal/warning/critical states and required external inventories. Retain freshness, future timestamp, missing source, ledger exhaustion and pending-count checks. Unknown/incomplete coverage must not become a reassuring zero. Poll intervals, thresholds and alert budgets need an environment-specific reviewed configuration, not copied defaults presented as production approval.

## 3. Retention and holds: actual copy mapping before implementation

The [20-category owner worksheet](../../output/phase9d-offline-closure-2026-10-20/owner-decision-worksheet.json) preserves every category name from the existing policy matrix. Durations, triggers and approval references remain null. It is non-executable and production_enabled=false. Prior proposed durations remain proposals in their historical matrix; they are not adopted here.

| Source-grounded boundary | What exists | Required completion |
| --- | --- | --- |
| management-adapters.selectResource | Fixed minimized queries: one matching source outbox row, receiver request and first custodian event; requires unique selected result | This is an advisory fixture binding, not a selector for every booking/journal/evidence/object copy. Enumerate versions and child/history rows explicitly, including multiple custody events. Never widen selectors silently. |
| retention9d configuration/policies | CHECK(NOT production_execution), synthetic_only constraints; approval/version/terminal/hold gates | Keep these guards. A production migration/adapter requires separate approved design and policy; no switch here can authorize it. |
| RetentionCoordinator | Sequential prepare/ack/authorize/commit and pending-node outcomes; local_commit invoked with false production argument | Authenticated SQL clients/controller remain trusted. No distributed atomic hold or deletion decision signature is claimed. Real coordinator authentication/fencing needs a separately reviewed protocol. |
| Hold and preserve_remaining | Authoritative hold first; per-node propagation; late erased-copy conflict and durable remaining-copy barrier | Preserve remaining copies and manual review under the owner's synthetic policy. An unreachable/in-flight node is pending; an erased copy is not recoverable through a later hold. |
| Restore quarantine | Current authority versus restored resource/policy metadata, tombstones and hold conflicts; ordinary app access excluded | A complete fresh independent policy/hold/tombstone ledger and full-copy mapping are prerequisites for release. Matching only the selected scope cannot certify omitted object/history copies. |

### Approval and implementation sequence

1. Proprietor, informed by Indian counsel/CA, approves category purpose, fields, trigger, period, exceptions, legal hold/release authority, dispute/tax handling and provider transfers. No new legal conclusion is supplied by this engineering review.
2. Technical operator proposes exact read selectors, identity/version/commitment joins, dependency order and every copy destination. Record missing/inaccessible destinations as unresolved, not absent.
3. Stage a dry-run manifest of eligible and excluded copies; show held, unresolved, immutable and unexpired records remain protected. No production deletion during dry run.
4. Verify stale policy/epoch/actor approvals, duplicate/conflicting operations, missing nodes, late holds before/after partial action, lost acknowledgements and restore resurrection against synthetic versions of the approved mapping.
5. Irreversible action requires explicit approved policy and operational authority, verified copy acknowledgements and a documented manual-review path. The current disabled synthetic implementation is not that activation.

## 4. Recovery inventory and release checklist

| Material | Recovery control to prepare/verify | Current state |
| --- | --- | --- |
| Source/receiver/custodian PostgreSQL | Preserve versions/extensions/owners/ACLs/default grants/role-membership options, migrations, settings and schema inventory | Three synthetic restores pass; hosted Supabase role/extension/managed-schema compatibility remains unverified. |
| Private R2 ciphertext | Bucket privacy/location/lifecycle, scoped writer vs reader access, hash download, last recovery snapshot and failed/stale alerts | Moto tested only. Location/account/privacy checks pending; real workflows OFF. |
| Offline age identity | Named independent owner, offline recovery ceremony, loss/rotation plan and usable spare under approved custody | Owner TBD. Never put offline production key in synthetic Actions secrets or with the only backup copy. |
| Signing secrets | Recover/rotate actual signer material under independent authority; preserve historical public keys, original receipts and compromise status | Synthetic public signature/history tests pass; actual secret-store recovery unverified. Fresh key cannot masquerade as historical signer. |
| GCS document/photo/object versions | Inventory actual buckets, object generations, hashes, holds, soft-delete and lawful exports | backend/lib/storage.js indicates GCS; no account queried. Object byte recovery not implemented by pg_dump. |
| Clerk, payment/messaging/maps/push/model services | Required control-plane configuration, allowed provider-side records, credential rotation and lawful recoverability | Repository integrations are not confirmed deployments; each actual account/region/subprocessor remains a provider decision. No secret values belong in this inventory. |
| Audit artifacts/repository and independent anchors | Separately controlled copies, original hashes and recovery authority | Existing evidence preserved; one host/admin cannot provide independent off-host custody. |

### Restore release procedure (proposal, production remains prohibited)

- Restore into a fresh isolated quarantine, with application traffic and ordinary logins disabled; authenticate the backup/manifest and approved key source.
- Verify archive integrity, exact scope, migrations, required extensions, owners, ACLs/default privileges, role memberships and database settings before enabling any login.
- Obtain a complete current independently controlled policy/hold/tombstone ledger. Missing/stale authority means remain quarantined. Apply approved no-resurrection reconciliation, including external objects/versions.
- Reconcile original source events, remote receipt/signature bindings, retired/compromised key trust, broker accounting and duplicate outcomes across separately timed snapshots. Snapshots are not a global atomic backup.
- Measure retrieval/key access/provisioning/import/reconciliation time and snapshot lag with realistic data. The small synthetic restore seconds are not a production RTO, and a daily schedule is not a guaranteed 24-hour RPO.
- Require named technical operator and proprietor/custodian approvals appropriate to access, legal and business decisions. Record who authorizes release; no automatic application activation follows a successful import.

## 5. Alerts and independent custody handoff

Initial technical response belongs to the designated operator; legal, irreversible-deletion and business-impact decisions escalate to the proprietor. Named person, actual private destination and response coverage remain TBD. Test routing/acknowledgement, missed deadlines and failed restore separately from a generic webhook stub. A watchdog on the same GitHub service cannot prove detection of a whole-service outage.

Admin custody role is the owner's current designation. Separate account/project, credential recovery, backup scope and control of historical records must prevent the application/developer administrator from silently rewriting both sides. Name and verify those administrators; this plan does not grant access. Encryption at rest and three archives in one unrestricted account do not create independence.

## 6. Completion boundary

E2 feasibility assessment, E3 accounting design, E5 policy/copy integration worksheet and E6 recovery handoff are now written. **Actual enforcement, additional PostgreSQL assertions, live provider compatibility, full-copy retention integration, off-host recovery and owner approvals remain open.** They cannot be truthfully closed by more static documents. No crash retry, P8 mutation, deployment or production deletion is started.
