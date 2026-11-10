# Phase 9D-1 — storage, actual-row holds and recovery verification

19 October 2026 IST. Supersedes the execution boundary in the [resource-blocked continuation](phase9d-1-remaining-storage-retention-engineering-checkpoint-2026-10-19.md), following the owner's explicit RAM override. **Supported local engineering: VERIFIED_IN_ISOLATION. Total storage, complete category retention/holds and whole-SQL certification: PARTIAL. Production OFF; P8 NOT_STARTED.**

Evidence: [manifest](../../output/phase9d-storage-retention-remaining-run-2026-10-19/manifest.json), [selected exact executions](../../output/phase9d-storage-retention-remaining-run-2026-10-19/selected-executions.json), [actual witness](../../output/phase9d-storage-retention-remaining-run-2026-10-19/selected-witness.json), [catalog definitions/hashes](../../output/phase9d-storage-retention-remaining-run-2026-10-19/catalog-definitions.json), [physical observations](../../output/phase9d-storage-retention-remaining-run-2026-10-19/physical-storage-summary.json).

## 1. Starting-point reconciliation

The [subsequent 227-artifact engineering checkpoint](phase9d-1-storage-retention-engineering-checkpoint-2026-10-19.md) already implemented measured capacity reservations, metadata retention coordination and the hidden-admin/client restart fix. The older closure report's source/receiver 57P01 lifecycle problem was not still an unfixed defect. Its selected management integration passed 18/18, including durable commit with a lost response and graceful reconnect. All historical artifacts remain intact.

This continuation adds actual-row fencing and richer storage reconciliation, then executes fresh targeted tests. P6's accepted behavior/cache-OFF native **16/16 each** and P7's behavior/native **14/14 each** remain at their recorded epochs. No native profiling or routine-replacement operation ran. Default-cache signal-11 remains OPEN; signal-9 remains UNATTRIBUTED. The [attribution review](phase9d-1-signal9-attribution-review-2026-10-19.md) is unchanged.

## 2. Implemented and now executed

| Workstream | Supported result |
| --- | --- |
| Durable storage observations | Required external-source inventory, configurable byte/backlog warning and critical thresholds, freshness/unknown states, reservation age, current reconciliation and operator-readable signals. Missing observations/required physical-quota verification refuse admission. |
| Actual new-work admission | Optional triggers on source outbox deliveries, receiver broker requests/attempts and custodian events. Reconciliation precedes the existing conservative reservation check. Audit, STOP and recovery records are excluded from these new-work gates. Actual broker refusal preserves committed rows and STOP. |
| Logical/physical reconciliation | Current database/WAL/temp measurements plus declared external bytes and retained reservations. Observing materialized growth does not automatically release a reservation; conservative double counting can refuse early. Operator resolution remains explicit. |
| Actual-schema hold protection | Fixed bindings cover selected source deliveries, broker requests, linked receiver work and custodian events. Local holds block protected-field changes; bound identity deletion and source TRUNCATE are denied. Existing cleanup after approved synthetic release records tombstones/audit in the same transaction. |
| Hold/delete coordination | Existing durable three-node metadata operations/ACKs, partial propagation, idempotency and late-hold outcomes are retained. New actual-row fences enforce the local hold using the same configuration lock. A competing cleanup waits and then rejects after the hold commits. |
| Restoration/terminal safety | Actual stale source-payload reinsertion over a tombstone rejects; coordinator restore decision is QUARANTINE. Terminal source work cannot reopen, original registration deduplicates, and no operative result is created. |
| Recovery | Fresh graceful source/receiver shared-cluster restart preserves new guards, tombstones, reservations, delivery receipts, broker rows/accounting tables, lineage/custody commitments and signatures. Existing lost-response recovery also passes in a fresh regression. |

Implementation is optional disposable infrastructure in `tools/phase9d`, not a production migration. All **15 original SQL source files remain byte-identical**. No booking/payment transaction, broker budget, ACK/signing implementation, independent guard authority, frozen V5 or Clerk source changed. No arbitrary production retention duration or new customer-deletion API was activated.

The trusted management controller remains an explicit root. Bindings cover selected related records, not every historical copy sharing evidence or all twenty categories. Local fencing plus partial ACKs is **not a global distributed hold barrier**. A coordinator decision already in COMMITTING, an actual tombstone or a late hold produces an explicit conflict; the implementation does not promise retroactive restoration. These boundaries require an approved irreversible-decision/hold policy before broader deletion integration.

## 3. Actual tests and source epochs

| Selected execution | Actual result |
| --- | --- |
| New storage/actual-row hold/restart integration | **13/13 PASS**, no skips; twelve leaf groups plus parent. |
| Existing management/recovery integration, unchanged | **18/18 PASS**, no skips; includes actual COMMIT/lost-response identity, controlled backend interruption and source/receiver reconnect. |
| Backend typecheck | **PASS**. |
| Scoped lint | **3 files PASS**, zero warnings/errors; existing harness complexity exclusion, no structural certificate. |
| JavaScript syntax | **3/3 PASS**. |
| Whitespace/preservation | PASS; exact readback recorded in the manifest. |

The new regression exercises persisted PostgreSQL rows and actual restricted sensor/hold/operator roles. Receiver cleanup uses the existing authorized broker operation; source cleanup is an explicitly labelled trusted-fixture invocation of the original function, without a new service grant. Custodian commitments/signatures remain retained. Every group checks unchanged post-incident application consequences.

The initial 12/12 pass predates the added restart case; an intermediate 13/13 predates the final terminal/TRUNCATE probes. Those receipts and executed source bytes are retained, and neither substitutes for the selected final 13/13. Earlier resource refusals are separate from product failures. Selected database receipts each bind **370 source identities**, record sourcesUnchanged=true and are rechecked against current bytes. Catalog evidence retains 24 capacity/retention routine definitions per installation, owners, SECURITY DEFINER/search paths and ACLs; these are catalog identities, not numerical native coverage.

Runtime: PostgreSQL **17.5 (Debian 17.5-1.pgdg110+1)**, image `sha256:a2b1801097f195b0a31c9da1c2f9cf2587a542e3c55cbb191b1873667dc45072`. Both selected server pairs read back **805,306,368-byte RAM and 750,000,000 NanoCPU limits**. Profiling is not enabled. Selected diagnostic projections contain SERVER_READY observations and no server-process signal event; this does not diagnose either historical crash.

## 4. Controlled storage refusal, measurements and recovery

A bounded sort exceeds a **256 KiB session temporary-file limit**, asserting PostgreSQL **53400** and preserved committed request identities/bindings. Settings are reset afterward. A separate owned **8 MiB tmpfs scratch filesystem** is verified through Docker configuration and actual `df` capacity, receives **4 MiB** and returns to its baseline allocation after truncating only the owned probe. This never fills the host disk and is not a persistent PGDATA quota or ENOSPC/power-loss certificate.

Selected actual database observations below exclude WAL from database bytes. Source owns shared cluster WAL accounting; receiver's WAL contribution is zero. Index/TOAST observations are components, not additional bytes to sum into database totals.

| Stage | Source DB bytes | Receiver DB bytes | Custodian DB bytes |
| --- | ---: | ---: | ---: |
| missing external inventory | 80,833,510 | 10,177,683 | 69,913,574 |
| conservative reservations | 80,849,894 | 10,194,067 | 70,126,566 |
| after bounded temporary refusal | 80,849,894 | 10,194,067 | 70,126,566 |
| after original cleanup/quarantine | 80,964,582 | 10,259,603 | 70,192,102 |
| after source/receiver restart | 80,806,242 | 10,259,603 | 70,192,102 |

Source index/TOAST observations change from **2,629,632 / 696,320** to **2,670,592 / 696,320** bytes; receiver **819,200 / 319,488** to **860,160 / 319,488**; custodian **434,176 / 196,608** to **475,136 / 196,608**. Allocated WAL remains **50,331,648 bytes per physical cluster**. Between the named first/last LSN observations, generated WAL is **278,968 source/shared-cluster bytes** and **816,848 custodian bytes**; receiver LSN deltas are not added again. Logs/allocated PGDATA and logical artifact sizes are retained separately. None establishes full volume accounting, file shrinkage or erasure from old WAL/backups.

The final source/receiver endpoint changes **32776 → 32778**. Their shared postmaster time changes **10:18:25.402 → 10:19:12.623 UTC on 19 October**; custodian remains **10:18:36.552 UTC**. Retained state hashes match before/after, stale-payload restoration still rejects after reconnect, and no duplicate operative result follows. The unchanged 18-test regression separately verifies the original committed request after a withheld response. This is graceful restart and a deliberate connection fault, not crash/PITR/archive restore.

## 5. Remaining unbounded categories and exact closure requirements

| Open requirement | Completion criterion |
| --- | --- |
| Aggregate original incident/evidence/application journals; historical outbox/transport receipts/tombstones; broker/accounting/operation history; custody/lineage/key/denial/audit histories; management audit/binding metadata | Approved lifecycle/archive boundaries plus deployed accounting, reserves and physically enforced quotas. Never delete unresolved, held or immutable evidence merely to meet a threshold. Logical ledger limits do not bound all retained physical history. |
| Full PGDATA/catalog/auxiliary space, indexes/TOAST, WAL/slots/archives, temporary work, logs/artifacts, VHD backing, replicas and backups | Independently owned actual destinations, verified hard quotas/reserves and alerts, bounded admission/refusal/recovery acceptance. Scratch tmpfs and temp_file_limit do not establish these limits. Persistent-volume ENOSPC and archive recovery remain untested. |
| Complete actual-category hold/deletion integration | Approve category scope, irreversible-decision finality and late-hold behavior; implement reviewed full-copy selectors and coordinator decision authentication/fencing, test disconnected/partial nodes before irreversible action. Current selected local fences do not close this global requirement. |
| Real retention, lawful purpose and rights handling | Proprietor/counsel/CA approve fields, minimization, category trigger/period, disputes, hold/release authority, exceptions, processor disclosures and linkable commitments. Production deletion remains disabled pending integration/acceptance. |
| Provider backups/PITR/versions, off-host administration and restore | Confirm actual accounts, administrators, regions, copies/APIs and lag. Restore into quarantine; obtain a complete independent current policy/hold/tombstone ledger; reconcile no resurrection, signatures, accounting and duplicate consequences before release. **BLOCKED** without those resources. |
| Operational monitoring | Deploy complete collectors, freshness/coverage contracts, alert destinations and named on-call/recovery owners. Current SQL signals and owned fixture collectors do not prove deployed escalation. |

The [twenty-category decision register and provider acceptance contract](../../output/phase9d-storage-retention-remaining-2026-10-19/owner-provider-decisions.md) remains part of this deliverable. It uses the confirmed UP sole-proprietorship/India-facing context, rechecks primary Indian sources and distinguishes proposed periods from approval. Repository integrations include Clerk, PostgreSQL/Supabase trust material, configured Cloud Run/Build asia-south1, GCS, Razorpay/X, WhatsApp, Firebase/FCM, Maps/Routes and OpenAI. This is code/configuration evidence; actual production hosting, subprocessors, replicas, backups and transfers remain TBD. No provider account was queried and no legal-compliance finding is made.

All **78 original criteria and 20 audit rows**, including IDs/order, statuses, records and historical assessments, are preserved in additive [readiness](../../output/phase9d-storage-retention-remaining-run-2026-10-19/readiness-gates-current.json) and [audit](../../output/phase9d-storage-retention-remaining-run-2026-10-19/audit-coverage-matrix-current.json) reconciliations. Only supported isolated observations are added. **P8 cannot begin on the basis of this checkpoint without separately resolving the mandatory boundaries above.**

## 6. Host controls, cleanup and preservation

The first continuation enforced RAM floors and refused execution. The owner then explicitly requested proceeding without host RAM limits; a scoped flag records that override. Container limits, bounded process heaps, disk/commit checks, responsiveness checks, deadlines and owned cleanup remained active. No container limit or global Windows/WSL crash setting was removed.

The [scripted observer](../../output/phase9d-storage-retention-remaining-run-2026-10-19/host-observer-summary.json) retains **371 samples**, minimum available RAM **15.2 MiB**, minimum commit headroom **8,330.2 MiB**, zero heartbeat gaps above eight seconds and zero unresponsive taskbar samples. Minimum free disk: C **85.23 GiB**, D **471.57 GiB**. These are finite monitored windows on the same host and cannot rule out a complete OS freeze.

Windows rejected stop requests for the two previously authorized Dell services; both were independently rechecked **Running/Auto**, with startup settings unchanged. No unsaved editor/browser window or unrelated process was terminated. Final readback found zero running containers in desktop-linux and stopped Docker normally. No existing user volume, global prune or cache cleanup was targeted; the accepted disposable fixture cleanup remains separate.

| New/changed code | SHA-256 |
| --- | --- |
| `tools/phase9d/closure-run.mjs` | `3b11a8569e4aa84595103f1b300ac53d863521ebe16c3fa482345d69c57352e0` |
| `tools/phase9d/management-remaining.mjs` | `7363c4997bb9c92d4df48a2854c83c25f838f1b8eeaafbb2d2e069559554b492` |
| `tools/phase9d/management-observation.sql` | `6dc9a2e717c12d76813776b2b4340cfebc6c4309b242799ced6d6e6b145097d3` |
| `tools/phase9d/management-hold-guards.sql` | `0dcb42680281e6840059d72616c776cd7b04950980ef8a881560cdd4cee27227` |
| `backend/tests/integration/phase9dManagementRemaining.test.js` | `b27e64ab22c01d033ce41800e557cbab0f698337d490f83f9cda74ab37eb6ada` |

Only the runner changes among **1,960 initial working files**; all other pre-existing bytes, HEAD and index identity are preserved. New implementation/test files and historical source epochs are retained separately. Fresh accepted Clerk **3/3**, V5 **22/22** and original custody **28/28** identities match in both worktrees. Original SQL and historical manifests/evidence are not rewritten. Frozen V5 remains `e484afc4c7fa724ea29af6edd962c48b814dc73a10e4f4a5e33833ad26afbe75`.

No native/replacement campaign, debugger, capsule, full backend run, real incident, live/paid provider evaluation, policy/auth/financial change, evidence migration, commit, push, merge, deployment or production activation occurred. **Stop after this continuation: local supported engineering VERIFIED_IN_ISOLATION; broader closure PARTIAL; signal-11 OPEN; signal-9 UNATTRIBUTED; P8 NOT_STARTED; production OFF.**
