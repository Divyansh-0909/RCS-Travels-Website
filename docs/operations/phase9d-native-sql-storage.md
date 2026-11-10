# Native SQL and storage review runbook

31 October 2026. The [checkpoint](../benchmarks/phase9d-1-native-sql-storage-checkpoint-2026-10-31.md) and its source-bound receipts describe the completed local verification. Production stays OFF; deletion stays DISABLED.

## Local configuration

The [disabled budget profile](../../output/phase9d-native-sql-storage-2026-10-31/profiles/storage-policy.disabled.json) copies the existing illustrative policy without enabling it. The [disabled operator/alert profile](../../output/phase9d-native-sql-storage-2026-10-31/profiles/operator-alerts.disabled.json) records Divyansh Singh as technical responder, Rajuddin as escalation approver, and the proposed support-to-business email route. It contains no password, webhook secret, database connection or private key. Neither profile creates a scheduler, enables application admission, sends email or approves production budgets.

The owned native test profile actually read back:

| Control | Local value | Boundary |
| --- | --- | --- |
| Shared buffers / work memory / connections | 32 MiB / 1 MiB / 8 | These are not hard process RAM quotas. |
| Temporary files | 1 MiB per process | Explicit temp tables and aggregate processes need separate accounting. |
| Slot retention | 32 MiB | Applied at checkpoints; it is not a universal WAL/disk limit. |
| WAL target | 128 MiB | Soft checkpoint target, not a hard disk cap. |
| Logging / rotation | Collector ON; 1 MiB or one hour | Rotation does not bound aggregate retained logs. |
| Idle transaction timeout | 15 seconds | This does not cancel every source of WAL retention. |

Archive mode remains OFF in this logical test. Real provider archives, slots, backups, other writers, quotas and storage reserves require environment-specific verification. The observer therefore retains `inventoryComplete=false` and the cooperative guard refuses admission. Do not turn unknown observations into positive attestations to obtain READY.

## Operator workflow

1. Keep policy and sends disabled until actual environment budgets, complete disjoint inventories, backup/restore evidence, writers and quotas are reviewed.
2. Obtain metrics through the existing read-only storage observer using an explicitly supplied private connection and root inventory. No dotenv or production credential discovery is needed. Measure each cluster's WAL/temp once and each database once; do not add indexes/TOAST again to database totals.
3. The existing controller can persist observations and alert transitions without network delivery. Its default invocation has no `--send-alert`. Use operator-owned private state/report paths; the checked-in profiles are review material.
4. When Google verification or another approved private route becomes available, configure credentials outside source control and verify delivery to the proposed destination. SMTP/provider acceptance is not inbox delivery or a human response. Monitor independent heartbeats/missed runs as well as explicit failures.
5. For pressure, stale backups or failed restores, preserve reservations and original records, investigate the specific domain, and escalate legal, irreversible-deletion and business-impact decisions to Rajuddin. Do not silently purge history, WAL, logs or backups.

The real HTTPS integration used a loopback server and a synthetic CA trusted only inside the test process. An untrusted certificate was rejected, HTTP 503 retained the alert, an explicitly expired test lease retried after reopening the SQLite ledger, and accepted transport was recorded. A cross-host redirect was rejected. No global trust store changed and no Google/R2/email operation ran.

## Reverification and source epochs

The new consistency correction changes only three comparisons in `custody_lineage.capture_status()`. Missing/JSON-null sequence, source or previous commitment now reports CAPTURE_GAP. Capture/emit/ACK/signing and business transactions retain their definitions.

The native fixtures authenticate restricted inspectors/operators and create only synthetic databases. Output paths intentionally refuse overwriting witnesses. Use a new evidence directory and reviewed runner/harness output binding for another execution; do not rerun against sealed evidence paths. Jobs run sequentially with deadlines and ownership-checked cleanup. Keep profiling and routine-replacement testing separate; the held profiler investigation is not part of this workflow.

Remaining activation items are actual provider/volume limits, complete writer enrollment and aggregate storage controls, real alert delivery/response, Google/R2, genuine off-host recovery, final custodian/key handoff, and approved retention periods. The local tests and templates do not close those gates.
