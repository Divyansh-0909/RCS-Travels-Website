# Storage safeguards and recovery operations

23 October 2026 IST. **Prepared and tested locally; no production installation or scheduler enabled.** This is an operator runbook, not permission to delete records or change provider settings. Rajuddin approves legal/irreversible/business-impact decisions; Divyansh Singh is the technical first responder.

## What the controls enforce

| Resource | Mechanism | Boundary |
| --- | --- | --- |
| Retained history, indexes, TOAST | Current whole-database sizes plus cooperative admission/reservations; existing optional `capacity9d.admit()` can fence enrolled INSERTs | All mutation paths, partitions, UPDATE growth and privileged writers must be reviewed before enrollment. It is not a physical database quota. |
| Overall usage | Sum disjoint physical domains across the inventory, then add outstanding reservations and preserve emergency headroom | Account for each database once, cluster WAL/temp once, and external directories once. Missing/stale coverage refuses admission. No universal bound without enforced storage quotas. |
| WAL and slots | Observe physical WAL, slot retention, archiver failures and old transactions; finite slot-retention setting and alerts | `max_wal_size` is soft. Slot retention is checked at checkpoints; invalidation can require replica rebuild. Never remove WAL or drop provider slots to free space. |
| Temporary storage | PostgreSQL per-process `temp_file_limit`, bounded concurrency, backup scratch reservation | Explicit temp tables are outside that GUC; parallel backends multiply usage. A worker/filesystem quota is needed for an aggregate hard cap. |
| Logs, archive, artifacts | Optional `bounded_put()` serializes enrolled writers, counts all files, enforces bytes/file count, refuses overflow and preserves originals | It does not automatically intercept PostgreSQL, provider or third-party logging. Native log rotation alone is not an aggregate retention cap. |
| Encrypted backups | `guarded_backup()` reserves worst-case scratch/ciphertext before invoking the unchanged backup path and caps the upload | All prefix/account copies need inventory; no backup pruning. Reservations persist after success/error pending explicit measurement reconciliation. |
| Controller state | At most 10,000 reservation records, one bounded observation, one alert per known condition; 16 MiB SQLite main-file cap | Rollback journals/filesystem metadata need additional headroom. Full state fails closed; an independent watchdog must detect missing/failed monitor runs. |

The example [policy](../../tools/backups/storage-policy.example.json) is disabled. Its byte budgets and backup/restore deadlines are **illustrative**, not approved production limits or retention durations. No record expiry or automatic deletion is implemented. The local guard's actor labels are trusted daemon labels, not authenticated human decisions; proprietor holds continue to use the separate authenticated ledger.

## Observation and controller commands

Use a private operator-owned directory outside the repository for roots configuration, state and reports. No symlinks/junctions or overlapping measured directories. Never put a connection URI in command arguments, chat or a tracked file.

1. Set `STORAGE_OBSERVER_URL` through the protected local/runner secret mechanism, without dotenv discovery. Hosted connections require verified TLS; transaction poolers are refused.
2. Prepare a private JSON object mapping `logs`, `archive`, `backups`, `artifacts` to their actual disjoint directories. A missing provider view is unknown, not zero. The native observer needs catalog/filesystem privileges; managed-provider denials must be recorded and replaced by supported provider metrics, not bypassed.
3. Run the observer once:

```powershell
python tools/backups/storage_probe.py --roots <private-roots.json> --output <new-private-observation.json>
```

4. Reconcile all required source/receiver/custodian clusters, actual external generations, quotas, archive status, slot budgets and independently verified backup/restore times. The collector deliberately outputs `inventoryComplete=false` and unverified controls; do not merely change these to true to get a passing result. A report timestamp alone does not verify backup integrity or restore success. Retain the underlying evidence privately.
5. After reviewing a separate environment-specific policy, run:

```powershell
python tools/backups/storage_controller.py --policy <reviewed-policy.json> --state <private-state.sqlite> --report <private-complete-report.json>
```

Exit zero means the reported cooperative admission conditions passed, not that production is approved or a disk quota exists. A repeated operation UUID cannot authorize another write. Release reservations only after measuring committed/orphaned output and accounting for it; never release just because a worker disconnected. Protect the state file and report against other users; there is no untrusted multi-user service endpoint.

Deployment still requires: complete writer enrollment and worst-case per-operation costs, verified physical quotas/reserve, provider-supported settings, protected daemon/service credentials, a reviewed monitor interval, independent missed-heartbeat detection, and tested escalation. No Windows task/service or GitHub schedule was activated here.

## Alerts and response

`StorageGuard.observe()` persists transitions for category/overall pressure, missing/stale measurement, stale backup/restore, unbounded WAL/temp/log controls, archiver failure and slot lag. Repeated identical observations do not create an unbounded queue. Recovery followed by recurrence creates a new generation. Claims bind a destination commitment, random token and 30-second lease; three failed/expired attempts require manual review. State capacity/refusal is surfaced by a failing process, not by evicting earlier evidence.

Actual sending requires explicit `--send-alert` and the existing protected `BACKUP_ALERT_*`/SMTP configuration. Default invocation sends nothing. SMTP STARTTLS/implicit TLS is verified; cross-host/downgrade webhook redirects are refused. Transport acceptance is not inbox delivery, operator acknowledgement or issue resolution. A recipient/password is never put in the ledger; only a destination hash is retained.

- **Initial response:** Divyansh checks current capacity, stale/missing observations, active work, slot/archive failures, last valid encrypted generation, restore status and alert backlog. Preserve uncertain usage/reservations.
- **Pressure:** stop optional new analysis/export admission through its enrolled controls; preserve the existing application STOP path and financial/incident authority. Do not turn unknown costs into zero, erase ACKED histories, disable logging, prune WAL or silently delete backups.
- **Escalation:** Rajuddin decides legal holds, irreversible deletion, retention exceptions and business-impact actions. A held/unknown copy cannot be removed just to meet a budget. Provision additional approved capacity or archive safely; no paid resource is automatically created.
- **Monitor/route failure:** an independently scheduled observer must detect missing heartbeats. Configure/test real delivery and acknowledgement before activation. Gmail verification remains pending, so this handoff is not complete.

## Second-computer synthetic restore handoff

The packet contains **only `backup.tar.age` and `packet.json`**. Its manifest contains a synthetic public configuration, recovery point, cipher hash, expected row commitment and source-machine commitment; no SQL plaintext, login secret or private age identity. Transfer the packet hash through an independent channel and the **synthetic** identity separately. Co-delivering a hash is integrity checking, not authentication. Do not transfer the production offline key or use a customer dump for this drill.

On a second operator-controlled Windows computer with matching PostgreSQL 18 tools, Python requirements and age installed, copy the tool dependencies at the source-bound revision. Set `AGE_BIN` to that computer's age executable. Run:

```powershell
python tools/backups/offhost_recovery.py --packet <packet-directory> --packet-sha256 <separately-confirmed-hash> --synthetic-identity <separate-private-key-file> --receipt <new-private-receipt.json>
```

The command rejects the source machine before starting PostgreSQL. It owns a new loopback-only cluster, restores only to a fresh quarantine database, verifies catalog/data commitments and NOLOGIN custom roles, then stops that cluster. It does not change the target's installed PostgreSQL service. Credentials are reset-required; traffic is never released. An old restored ledger is not a current legal-hold authority.

The available packet is a **small synthetic logical smoke drill**, not full Proofloop recovery. Actual off-host acceptance must also exercise source/receiver/custodian fixtures and public receipt verification, dependency-compatible roles/extensions/configuration, full application migration scope, archive/base-backup chain where supported, current-hold reconciliation and external objects. Measure transfer, key retrieval, role reset/configuration and operator time in addition to restore time. A successful one-table rehearsal is not the production RTO/RPO. Regenerate a fresh synthetic packet if its recovery deadline has expired.

**Not run on a second host:** owner says one will be available later. Google/R2 and real alert verification are also pending. Record actual independent host receipt and cleanup before changing that status.

## Primary configuration references

- WAL targets can be exceeded during archive failure and other conditions: [PostgreSQL WAL settings](https://www.postgresql.org/docs/18/runtime-config-wal.html).
- Slot WAL retention is checkpoint-dependent; the unlimited setting and replica implications require care: [replication settings](https://www.postgresql.org/docs/18/runtime-config-replication.html).
- Temporary-file limits apply per process and exclude explicit temporary tables: [resource settings](https://www.postgresql.org/docs/18/runtime-config-resource.html).
- Rotation settings control individual log files; total preservation/lifecycle still needs an approved arrangement: [logging settings](https://www.postgresql.org/docs/18/runtime-config-logging.html).
- Managed database quota and overall physical disk are distinct: [Supabase database/disk size](https://supabase.com/docs/guides/platform/database-size). Local superuser observations are not managed-provider permissions or deployed quotas.
