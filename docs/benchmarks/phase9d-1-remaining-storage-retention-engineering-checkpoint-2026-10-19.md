# Phase 9D-1 — remaining storage, recovery and retention engineering

19 October 2026 IST. **Continuation PARTIAL: new optional controls implemented in source; PostgreSQL execution and typecheck RESOURCE_BLOCKED. No new SQL runtime certification. P8 NOT_STARTED. Production OFF.**

Evidence: [manifest](../../output/phase9d-storage-retention-remaining-2026-10-19/manifest.json), [selected verification](../../output/phase9d-storage-retention-remaining-2026-10-19/selected-verification.json), [retained acceptance](../../output/phase9d-storage-retention-remaining-2026-10-19/retained-acceptance.json), [78 criteria](../../output/phase9d-storage-retention-remaining-2026-10-19/readiness-gates-current.json), [20 audit rows](../../output/phase9d-storage-retention-remaining-2026-10-19/audit-coverage-matrix-current.json).

## Reconciled starting point

The [later engineering checkpoint](phase9d-1-storage-retention-engineering-checkpoint-2026-10-19.md) supersedes several open implementation findings in the [original closure review](phase9d-1-p6-p7-storage-retention-closure-2026-10-18.md). Its 227 historical artifacts remain hash-identical.

| Requirement | What was already actually verified; not repeated here |
| --- | --- |
| Durable measured accounting/admission | Optional capacity schema, conservative local/global reservations, stale/unknown/quota refusal, backlog and external measurements; selected management integration **18/18 PASS**. |
| Source/receiver restart and lost response | Hidden admin and Prisma clients explicitly quiesced; graceful shared-cluster restart, mapped endpoint rediscovery and reconnection, original committed registration after lost response, unchanged custodian. Included in the accepted management run. The original admin-client 57P01 failure is historical, not still an unfixed lifecycle defect. |
| Metadata retention/holds | Disabled/unapproved versioned policies, three-node operations/ACKs, partial reconciliation, late-hold conflict and stale-metadata quarantine were verified. This simulated minimization, without enforcing a hold on actual cleanup. |
| Existing narrow regressions | Harness **1/1**, lineage **7/7**, database configuration/retry units **2/2** at recorded epochs. No new pass is inferred from their unchanged bytes. |
| P6/P7 | P6 behavior and cache-OFF native **16/16 each**; P7 behavior/native **14/14 each**, with documented scope/gaps. Preserved, not rerun. |

The [signal-9 review](phase9d-1-signal9-attribution-review-2026-10-19.md) remains authoritative: PID 707/sender UNATTRIBUTED; no GAP query reached. Default-cache signal-11 stays OPEN. No debugging or native profiling resumed.

## New source implementation — runtime verification pending

These extensions install only in the explicitly selected disposable management test mode. They are not application migrations or production activation. Original fifteen SQL sources, acknowledgement/signing logic, broker budgets, guard authority and application transactions are unchanged.

### Storage observations and admission

[management-observation.sql](../../tools/phase9d/management-observation.sql) adds a durable external-source inventory, independently configurable byte/backlog warning and critical thresholds, freshness checks, reservation age, a current reconciliation row and operator-readable signals. Missing required observations or unknown required quotas classify capacity as UNKNOWN. Measured bytes plus retained reservations remain conservative; a measurement never automatically releases a reservation. This may double-count already materialized reserved growth rather than silently undercounting it.

The optional installer attaches admission to new source outbox deliveries, receiver broker requests/attempts and independent custodian events. It rechecks observations and the existing reservation rules. Audit, STOP and recovery records are deliberately excluded from these new-work gates. In-transaction refusal rolls its signal back too; an independent collector must persist escalation. None of this proves a hard physical disk limit or deployed alert delivery.

External inventory covers explicitly declared non-overlapping bytes, not every unknown provider copy. Finite inventory/ledger limits refuse further work; trusted controller/owner access and all retained historical bytes still need infrastructure controls. The new SQL and these producer attachments have **not executed** in PostgreSQL here.

### Actual-row hold and restoration fences

[management-hold-guards.sql](../../tools/phase9d/management-hold-guards.sql) and [fixed adapters](../../tools/phase9d/management-remaining.mjs) bind selected real disposable outbox deliveries, broker requests, linked receiver work and custodian events to retention scopes. Bound identity deletion/truncation is denied. Protected-field changes under a local hold are denied; payload minimization through existing cleanup atomically records a tombstone/audit observation. A stale payload cannot be restored over that tombstone, and terminal status cannot reopen through the guarded update.

Local mutation and hold decisions use the same configuration lock. This supplies a testable local fence, **not a global distributed hold barrier**. Partial propagation and a late hold remain explicit existing coordinator outcomes. The trusted controller can register scopes; arbitrary owner/DDL compromise is outside this trust model. Selection covers these related records, not all twenty categories or every historical record sharing evidence. Custodian signatures/commitments have no new deletion API. No production TTL or customer deletion was enabled.

## Prepared bounded regression and recovery cases

[phase9dManagementRemaining.test.js](../../backend/tests/integration/phase9dManagementRemaining.test.js) contains **11 leaf groups plus parent, none executed**. They assert persisted states and actual SQL roles rather than mocked database outcomes:

- Disabled defaults, catalogs/ACLs, synthetic incident-to-source/receiver/signed-custody binding.
- Missing external/provider inventory, unknown quota, stale observations, warning/critical states and conservative held reservations.
- Real broker admission refusal with retained history and STOP available.
- A bounded sort exceeding PostgreSQL's session temporary-file limit; original committed rows must survive.
- Read-back of an owned **8 MiB tmpfs scratch quota**, a bounded **4 MiB** allocation and truncation/recovery. This is separate from PGDATA, WAL, host disk or provider storage; it does not deliberately fill the filesystem.
- Distributed hold ACK/partial propagation, actual cleanup refusal, local hold-versus-cleanup lock ordering, approved synthetic release, original cleanup functions, retained identities, late-hold conflict and restored-payload quarantine.

The runner retains **768 MiB / 0.75 CPU per PostgreSQL container**, actual resource readback and ownership checks. The new mode adds the bounded scratch filesystem. No quota was removed. No crash, ENOSPC, archive/PITR restore or new source/receiver restart was attempted. The accepted graceful-restart/lost-response proof is reused at its original epoch; restart durability of the new management extensions remains unverified.

## Actual verification and host result

| Current check | Actual result |
| --- | --- |
| JavaScript syntax | **3/3 files PASS**, source-stable receipt. |
| Scoped lint | **3 files PASS**, zero warnings/errors; existing test-harness complexity exclusion, no structural certificate. |
| Python executor parse | PASS; this is not validation of its unexecuted Docker cleanup path. |
| Whitespace/preservation | PASS as recorded in manifest validation. |
| Targeted PostgreSQL integration / physical measurements | **NOT_RUN — RESOURCE_REFUSED**, zero tests launched. |
| Backend typecheck | **NOT_RUN — RESOURCE_REFUSED**. Prior typecheck remains historical. |

The new prompt reinstates host readiness checks. Selected database admission observed **447.7 MiB free versus 5,120 MiB required**; selected typecheck admission observed **730.1 MiB versus 1,536 MiB required**. The scripts refused before launching those jobs and before any Docker command. Lower-cost syntax/lint used bounded Node heaps and monitored windows. Resource refusal is not a product-test failure. Earlier static receipts remain retained separately from the final source-bound selection.

[Monitoring](../../output/phase9d-storage-retention-remaining-2026-10-19/host-observer-summary.json) covers checks and lightweight verification windows, not continuous freeze detection. Same-host sampling cannot rule out a complete OS freeze. No database resource was created; no Docker startup, shutdown, container/volume cleanup or unrelated process/service change occurred. No default-cache experiment, mutation, capsule or full backend run occurred.

## Remaining storage, provider and legal boundaries

Aggregate original journals, ACKED history, receipts/tombstones, broker accounting, custody/lineage/key histories, denial/audit histories and management ledgers still consume retained storage. Full PGDATA/catalog overhead, index/TOAST allocation, WAL/slots/archives, temporary work, logs/artifacts, VHD backing space, replicas and backups need independently enforced budgets. Row limits, conservative reservations and database measurements do not establish a universal physical cap. VACUUM or clearing payloads does not prove physical shrinkage or old-copy erasure.

The [twenty-category owner/provider decision register](../../output/phase9d-storage-retention-remaining-2026-10-19/owner-provider-decisions.md) reconciles the established UP sole proprietor/India context with repository integrations. It rechecks primary Indian commencement and CERT-In sources, keeps candidate periods unapproved, distinguishes code/configuration from confirmed deployment, and specifies provider quota/hold/delete/restore acceptance. Final hosting, regions, processor copies and backup locations remain TBD. No provider account or live data was accessed.

| Blocker | Exact completion criterion |
| --- | --- |
| New SQL/catalog/hold/admission acceptance | Safe host headroom, then pass the 11 prepared leaf groups and parent in fresh owned finite-budget databases; retain exact function/ACL/trigger identities, actual counts and physical observations. Add/fix only findings supported by execution. |
| Typecheck and affected recovery regression | Pass current typecheck; validate new extension state through the existing controlled source/receiver reconnect recipe if making a new restart-durability claim. Do not relabel old results as new execution. |
| Total retained-storage enforcement | Actual exclusive quotas/reserves and monitoring for every DB/WAL/temp/log/artifact/archive/backup destination; bounded refusal/recovery tests with committed identities, spending and tombstones preserved. PGDATA/host ENOSPC remains untested. |
| Complete category/hold scope | Approved resource selectors and field policy for every affected category; demonstrate no omitted held copy, local fences and acknowledged partial recovery. Implement a reviewed global hold/irreversible-decision protocol before claiming that guarantee. |
| Real retention/deletion activation | Proprietor/counsel/CA approve purposes, trigger/period, disputes, hold/release, erasure exceptions and processor disclosures; reviewed adapters and authenticated decisions, disabled until acceptance. |
| Backup/PITR/off-host custody | Confirm resources/administrators/regions and APIs; restore into quarantine, fetch complete independent current tombstones/holds, reconcile all copies and release only after no-resurrection/no-duplicate tests. **BLOCKED** without provider resources. |

All **78 criteria and 20 audit rows** retain original IDs/order, statuses, records and prior assessments. Only additive continuation assessments are added; no readiness gate is closed by unexecuted code. **P8 cannot begin on the basis of this continuation.**

## Exact changed code identities and preservation

| File | SHA-256 |
| --- | --- |
| `tools/phase9d/closure-run.mjs` | `26e7ad896d1e454006e9626f8c5bedf0eb3dff428e8b64ca65c18bb4c2af78bb` |
| `tools/phase9d/management-remaining.mjs` | `7363c4997bb9c92d4df48a2854c83c25f838f1b8eeaafbb2d2e069559554b492` |
| `tools/phase9d/management-observation.sql` | `6dc9a2e717c12d76813776b2b4340cfebc6c4309b242799ced6d6e6b145097d3` |
| `tools/phase9d/management-hold-guards.sql` | `0dcb42680281e6840059d72616c776cd7b04950980ef8a881560cdd4cee27227` |
| `backend/tests/integration/phase9dManagementRemaining.test.js` | `aebe88f702a8803a4e646ce0f18046ece33177ed59baa7066823c99520660a91` |

These are source-file hashes, not freshly observed PostgreSQL catalog hashes. The preserved runner before-image is `4938f9dcd2a5745eb996be702effefee50b2462283e32497a1c708d31d9312a6`. Only that runner changes among 1,960 baseline working files; new files are this optional implementation, tests, checkpoint and evidence/orchestration. Original fifteen SQL sources, frozen V5, Clerk, business/financial policy and all historical artifacts remain unchanged; HEAD/staged identity is preserved. No evidence migration, commit, push, merge, deployment or live evaluation occurred.

With safe headroom, the prepared guarded command is:

```powershell
python output/phase9d-storage-retention-remaining-2026-10-19/executors/run-remaining.py database
python output/phase9d-storage-retention-remaining-2026-10-19/executors/run-remaining.py typecheck
```

This checkpoint stops at the enforced resource boundary. It does not claim the requested engineering closure. **P6 native VERIFIED_IN_ISOLATION; P7 supported native VERIFIED_IN_ISOLATION with gaps; signal-11 OPEN; signal-9 UNATTRIBUTED; Phase 9D-1 PARTIAL; P8 NOT_STARTED; production OFF.**
