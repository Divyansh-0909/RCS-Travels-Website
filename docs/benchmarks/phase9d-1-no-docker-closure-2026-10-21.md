# Phase 9D-1 — remaining work without Docker or R2

21 October 2026 IST. Continues the [dev backup/migration checkpoint](phase9d-1-supabase-dev-backup-migration-checkpoint-2026-10-21.md), [offline condition/audit review](phase9d-1-offline-sql-audit-reconciliation-2026-10-20.md) and [pre-P8 checklist](phase9d-1-pre-p8-reconciled-checklist-2026-10-20.md).

**Selected engineering and tests below: COMPLETE. Full managed-project restore, independent custody, offline key handoff, live alerts, external-object recovery and production retention approval: OPEN. Whole-SQL/Phase 9D-1: PARTIAL. P8 NOT_STARTED. Production OFF.**

Evidence: [manifest](../../output/phase9d-no-docker-closure-2026-10-21/manifest.json), [selected native SQL witness](../../output/phase9d-no-docker-closure-2026-10-21/native-contract-selected/witness.json), [41 offline tests](../../output/phase9d-no-docker-closure-2026-10-21/selected-offline-unit-receipt.json), [hosted role rehearsal](../../output/phase9d-no-docker-closure-2026-10-21/hosted-rolledback-role-probe.json), and [reconciled assessment](../../output/phase9d-no-docker-closure-2026-10-21/reconciliation-current/readiness-current.json). Original evidence and failures remain at their own epochs.

## 1. Requested work and outcome

| Work | Completed scope | Remaining dependency |
| --- | --- | --- |
| SQL coverage gap map | Reused and checked the existing 20-file/112-declaration map; added selected expression/NULL assertions and current source pins | Full SQL operand/metadata adequacy and documented private/installation exceptions remain partial |
| Audit/readiness reconciliation | Preserved all **78 criteria** and **20 audit actions**, IDs/order and original assessments; appended current evidence | Universal occurrence/delivery, external administration and other original gates are not promoted |
| Restore trial | Recovered all **28 backed-up public tables**, with exact counts/rowset hashes, in an isolated hosted quarantine; removed it afterward | Exact managed owners/default grants/provider functions cannot be restored by the current dev login; external material and release review remain pending |
| Supabase compatibility | Read-only catalogs, successful temporary database isolation, and **10/10** rolled-back role/privilege checks | Full Proofloop crypto namespaces, real service logins and independently administered source/receiver/custodian topology remain unverified |
| Offline key handoff | Prepared the [specific operator procedure](phase9d-1-key-alert-recovery-handoff-2026-10-21.md); preserved staged key/archive | Owner must identify offline media and perform/verify handoff |
| Alerts and stale-backup checks | Added explicit SMTP routing, configuration-only preflight, workflow wiring and **31** alert/freshness unit tests | Sender account/credential, inbox delivery, acknowledgement and independent monitoring remain unconfigured |
| External recovery inventory | Updated source-backed provider/object/key/configuration inventory; observed zero Supabase Storage buckets/objects in dev | Actual GCS development project/bucket, provider access, exports and restoration remain pending |
| Retention adapter preparation | Mapped **20 categories**, generated FK-based selector plans for four actual roots, and passed **10** selector-plan tests | No approved schedule, actual row eligibility/hold coordinator or production deletion activation |

Items requiring physical participation, identified external accounts or legal approval are not marked complete merely because their preparation is finished. Questions about offline media, Rajjudin's separately controlled environment, SMTP setup and development GCS identity remain pending.

## 2. Selected SQL cases without Docker

`tools/backups/native_postgres.py` creates one fresh Windows PostgreSQL **18.4** server on a random loopback port under an account-restricted, uniquely marked directory. It initializes SCRAM authentication, verifies database/user/host/port/data-directory identity, and shuts down only that owned server. No Windows service, global configuration or unrelated process changes. The selected server stopped successfully.

Actual settings include **32 MiB shared_buffers**, **1 MiB work_mem**, **16 MiB maintenance_work_mem**, eight connections, no parallel workers and JIT off. These are PostgreSQL settings, **not a verified hard process-memory quota**. No RAM admission threshold or freeze-absence claim is introduced. Work ran sequentially; no profiler or routine-replacement campaign was loaded.

`tools/phase9d/native_contract_cases.py` passed **82/82 named checks**:

| Scope | Checks | Boundary |
| --- | ---: | --- |
| `shadow9d.valid_categories` | 26 | Every allowed category; empty/all/duplicate arrays; unknown, mixed, nested, wrong-type and SQL/JSON NULL cases |
| `shadow9d.valid_instant` | 24 | Date/time/fraction/calendar boundaries, type distinctions and nullable/SQL NULL outcomes |
| `custody_export.retry` | 26 | Selected NULL/malformed/missing/stale inputs, persisted-state invariants, positive retry and exact UUID replay |
| Worker grants/defaults/original catalog preservation | 6 | Actual restricted worker login, direct 42501 denial, allowed claim, future-function PUBLIC denial and original metadata readback |

The full original `permissions.sql` was installed. Retry uses the **exact original table DDL and function declaration** from `custody-source.sql`, with authenticated synthetic operator access. It does not install or certify the surrounding broker/capture/signing composition. Its source and catalog hashes are retained. No accepted product SQL changed.

Important observed contracts: SQL-language helpers can return SQL NULL for particular missing inputs; callers must interpret `IS TRUE`/`IS NOT TRUE` as their contracts specify. A new retry with NULL operation or expected count raises **23502** and leaves persisted state unchanged. Duplicate UUID reuse with a NULL sequence/expected operand can return SQL NULL without another transition. These outcomes are recorded as existing behavior, not rewritten to an invented always-false contract.

The source lineage invalid/absent outcome, private wrapper-excluded guards, exhaustive Boolean independence and broader SQL-language/DDL adequacy remain explicit in the [updated condition map](../../output/phase9d-no-docker-closure-2026-10-21/reconciliation-current/condition-family-map-current.json). PostgreSQL 18.4 behavioral observations are separate from the historical pinned PostgreSQL 17.5/plpgsql_check native windows. There is no new native percentage or combined whole-SQL score.

## 3. Restore trials and hosted limits

The original encrypted archive and its key stayed outside Git. Decryption occurred only in a current-user/SYSTEM-protected scratch directory. The archive hash matched the accepted pre-migration backup. Each trial created a new uniquely marked `rcs_restore_test_*` database with public CONNECT revoked, verified actual routing to that exact empty database, and dropped only the marked database afterward. No restore was pointed at the existing application database.

| Trial | Actual outcome |
| --- | --- |
| Full archive with original ownership/grants | Stopped: current login cannot SET ROLE to reserved `supabase_admin` when restoring ownership |
| Full portable owner/grant mapping | Stopped: a provider-managed Realtime function requires permission to set `log_min_messages` |
| Public schema with mapped owner, retaining grants | Stopped: provider default privileges cannot be reassigned by this login |
| Public schema with explicit owner/grant mapping | **PASS**: all **28** original public table rowsets, including pre-migration history, match exactly; **12.956 seconds** for the measured provision/import/check/cleanup window |

No error was ignored to label a failed trial passing. The original archive was not edited. The successful scope used `--schema=public --no-owner --no-privileges`, preinstalled the necessary extensions in the quarantine and stayed access restricted. This proves application-schema content recovery; it does **not** prove original owners/ACLs, managed Auth/Storage/Realtime/Vault behavior, historical external signing keys or a releasable environment.

The recovered archive is the **59-migration recovery point** taken before the successful dev migration to 83; the restore trial did not falsely relabel it as a newer snapshot. The small measured window excludes offline-key retrieval, new-project provisioning, external objects, final permissions, reconciliation and operator approval. It is not a production RTO or a scheduled RPO guarantee.

Plain local PostgreSQL lacks the archive's PostGIS and Supabase Vault extensions. Hosted quarantine avoided that local dependency, but provider-managed privilege/configuration recovery still needs a supported fresh-project baseline and reviewed role/object mapping. Do not elevate into reserved provider roles or weaken accepted product SQL to make a measurement pass. [Supabase's migration guidance](https://supabase.com/docs/guides/platform/migrating-to-supabase/postgres) explains portable ownership/privilege exclusions; [managed-project restore guidance](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) also identifies separate provider configuration/key requirements.

The private trial logs, source hashes, sanitized failure diagnoses and cleanup readback are retained. Temporary database lifecycle operations changed cluster catalogs as expected; the receipts' source-data-preserved boundary refers to the original application records, not a claim that this entire continuation was read-only.

Owned plaintext archive scratch is removed after the trials, while the encrypted original and private key remain preserved. Dropping quarantines/removing scratch is not proof of secure erasure from provider WAL/backups, local disk remnants or pagefiles.

## 4. Hosted permission and composition review

The corrected read-only preflight reports absent crypto schemas as absent instead of failing its lookup. The dev service completed its eight catalog result sets. Existing public tables showed no case with SELECT granted to anon/authenticated while RLS was disabled in the inspected catalog; this is not a complete HTTP authorization test.

The separate transactional rehearsal created only unique NOLOGIN test roles/schema/rows/functions, exercised SET ROLE, direct-table and write 42501 denials, SECURITY DEFINER execution, RLS filtering and owner-wide default PUBLIC denial, then **rolled everything back**. All ten checks passed, with explicit confirmation that test roles/schema were absent afterward. This does not prove actual hosted service LOGIN/SCRAM access or installation of the full accepted topology.

`pgcrypto` remains in `extensions`. Required service-qualified hmac routines are not installed. The accepted source/receiver/custodian SQL expects its own qualified namespaces; no managed extension was moved and no wrapper substituted. Independently administered custody under Rajjudin is still a deployment/access decision, not established by a Clerk role or by several databases controlled through the same administrator.

## 5. Alert, freshness and retention preparation

`alert_routes.py` adds SMTP 465/587 with verified TLS and explicit opt-in, preserves the existing generic HTTPS webhook payload and rejects unsafe redirect changes. `notify.py --check` checks configuration without network activity. Workflow activation expressions, schedules and read-only repository permissions remain unchanged. No workflow was pushed/enabled, SMTP credential configured or message sent.

The existing freshness checker now requires JSON **integer** version/size fields; Python's bool-as-int coercion is rejected. Tests cover stale/future completion and recovery points, missing/wrong objects, size/hash metadata mismatch, and same-size ciphertext corruption. Metadata-only freshness still cannot detect content corruption that preserves metadata; full `verify` downloads and hashes the ciphertext. No R2 account or emulator was contacted by these tests.

`retention_copy_plan.py` prepares bounded child-FK join paths from the actual dev catalog without fetching rows or executing SQL. Four root plans cover bookings, drivers, users and responsibility cases. Parent records are not swept in automatically. Cycles, alternate paths and name-only references without matching FKs are flagged for review. Missing external/history copies remain unresolved. The planner exposes **no deletion API**, chooses no retention duration and cannot approve a hold/release or production action.

The updated 20-category worksheet retains all original categories and null/unapproved policy fields while recording the proprietor's authority, Rajjudin, Divyansh and the selected email. Actual hold-aware row eligibility, distributed authorization and complete provider/backups reconciliation remain separate engineering after approved mappings/policy. Earlier synthetic late-hold/barrier results retain their own epochs; no production deletion was activated.

## 6. Verification, failures and preservation

| Selected check | Result |
| --- | --- |
| Native selected SQL cases | **82/82 PASS**, server stopped, bound sources unchanged |
| Offline alert / freshness / copy-plan units | **15/15 + 16/16 + 10/10 PASS**, sequential, no live transport/storage calls |
| Hosted rolled-back role checks | **10/10 PASS**, test roles/schema removed by rollback |
| Mapped public-schema restore | **28/28 table rowsets match** |
| Scoped Ruff | **10 Python files PASS** |
| Workflow configuration checks | **3/3**, activation/schedules/permissions preserved |
| 78 criteria / 20 audit rows / 20 retention categories | IDs/order and original assessments retained; additive evidence only |
| Protected Phase9D SQL / Prisma migration inputs | Unchanged from this task's baseline |
| HEAD / staging index | Unchanged |

An initial native fixture stopped before any case because of its address identity guard; canonical host handling was corrected and the failed witness retained. An initial selector preparation rejected the legitimate leading-underscore migration metadata table; a regression now covers it. Three Ruff formatting errors were corrected, then the selected native checks reran with current source bindings. Earlier successful epochs are preserved, not substituted into the selected receipts. The three restore failures remain unresolved for their exact scopes despite the narrower content-recovery success.

No application JS/TS source changed, so no unrelated full backend/typecheck/mutation campaign was launched. Twenty accepted Phase9D SQL files and all 83 Prisma migration files remain unchanged; the edited SQL file is the separate read-only preflight worksheet. Existing uncommitted/staged work and original evidence were preserved. No commit, push, merge, deployment, paid-resource creation, Docker/R2 startup or production access occurred. Default-cache signal-11 remains OPEN; historical signal-9 remains SEPARATE/UNATTRIBUTED; neither was reproduced or diagnosed here.

## 7. What still requires input or another environment

1. Divyansh supplies offline media and completes key-copy/recovery verification.
2. Configure an authorized mail sender and verify real inbox delivery/acknowledgement; identify independent freshness monitoring.
3. Confirm Rajjudin's independently controlled custody account/environment and actual service-login separation.
4. Identify the development GCS project/bucket, then verify authorized external object/configuration/signing recovery.
5. Verify full provider-managed restore using a compatible baseline, reviewed ownership/default-grant mapping and required provider key/configuration material.
6. Obtain proprietor/counsel/CA policy approvals and complete actual category/hold integration. No policy is invented to close a checkbox.
7. Broader physical storage refusal/recovery, native reliability and remaining SQL adequacy retain their existing scopes and blockers.

R2 remains owner deferred and unconfigured. These results neither make P8 dependent on buying hosting nor authorize P8. **Production stays OFF.**
