# Phase 9D-1 — P4 transport and source acceptance

18 October 2026 IST. Continues the [SQL coverage plan](phase9d-1-sql-coverage-plan.md), [P3 checkpoint](phase9d-1-p3-delivery-recovery-checkpoint-2026-10-18.md), [P2 checkpoint](phase9d-1-p2-capture-consistency-checkpoint-2026-10-18.md) and [ICR-1 correction](phase9d-1-lineage-ack-checkpoint-2026-10-18.md). **P4 supported behavior and native metric: VERIFIED_IN_ISOLATION. WHOLE-SQL CERTIFICATION: PARTIAL. PHASE 9D-1: PARTIAL. PRODUCTION_READY: NO.**

Evidence: [source-bound manifest](../../output/phase9d-p4-2026-10-18/manifest.json), [acceptance matrix](../../output/phase9d-p4-2026-10-18/acceptance-matrix.json), [coverage comparison](../../output/phase9d-p4-2026-10-18/coverage-comparison.json), [catalog definitions](../../output/phase9d-p4-2026-10-18/catalog-definitions.json), [selected execution receipts](../../output/phase9d-p4-2026-10-18/selected-acceptance.json). Actual original UTC timestamps are retained; initial runs began on 17 October UTC and the final accounting pair ran on 18 October UTC.

## Scope and installed composition

**All fifteen SQL files are byte-identical to the task baseline.** No SQL function, production permission, ICR-1 validation, signing implementation, accounting rule, accepted guard, authentication or application business policy changed. This batch adds tests, a measurement collector and runner dispatch/source inventory.

| Installation / routine | Actual dependency and execution identity | P4 verification |
| --- | --- | --- |
| Source `outbox9d.remote_payload(bigint,uuid)` | SECURITY DEFINER, shadow9d_owner; actual shadow9d_exporter login; control/delivery locks and committed source binding. | Correct retained payload; wrong token/owner/epoch/expiry, stopped source, missing row/payload and changed original journal cannot acknowledge. |
| Source `outbox9d.valid_remote_receipt(jsonb,jsonb)` | SQL-language SECURITY DEFINER helper; invoked inside authorized ACK/cleanup; direct exporter EXECUTE denied. | Closed fields, required fields/NULL/type cases, service/key/payload binding, receipt UUID, work ID/status boundaries and transport HMAC. Native PL/pgSQL counters do not apply. |
| Source `outbox9d.remote_ack(bigint,uuid,jsonb)` | Actual exporter calls the lease-bound payload helper and receipt predicate; persists one local receipt and audit record. | Invalid/stale ACK leaves persisted local state unchanged; fresh sender reconciles the original receiver receipt after lease expiry. |
| Source `outbox9d.remote_delete_payload(bigint,jsonb)` | Actual shadow9d_ops login; requires ACKED delivery and terminal receipt with the saved immutable body relationship. | Pending/foreign/nonexistent/repeated cleanup refused; terminal cleanup retains source receipt/tombstone and receiver identity. |
| Receiver `transport9d.receive(jsonb)` | Installed closure wrapper, SECURITY DEFINER, shadow9d_owner; actual shadow9d_capture login. | Actual authenticated HTTP and direct restricted SQL; conflict produces one retained audit observation bound to receiver lineage capture. |
| Receiver `transport9d.receive_committed(jsonb)` | Original receiver renamed by closure-transport.sql; called by the wrapper's definer context. Direct shadow9d_capture EXECUTE is denied (42501). | Original admission/duplicate/stop/capacity/configuration/rejection paths measured separately from wrapper. |
| Receiver `transport9d.serialize(jsonb)` | Invoker PL/pgSQL canonical serializer under the installed receiver composition; no application-schema dependency. | Nested object, array, scalar, empty containers, JSON null and SQL NULL observations. |

Source and receiver are distinct disposable databases. The unchanged custody/lineage fixture supplies the composed receiver triggers and a separate custodian server. These helpers have no artificial opposite-service installation or branch. Source staging, source transport receipt verification, receiver admission and independent audit-custody receipts remain separate boundaries. Transport receipts use the accepted shared HMAC protocol; they are not Ed25519 custody receipts.

## Persisted-state cases and existing reuse

[phase9dCustodyP4.test.js](../../backend/tests/integration/phase9dCustodyP4.test.js) has thirteen leaf groups plus their parent. It reuses the real cancellation/export fixture, actual restricted PostgreSQL clients, HTTP sender/receiver child processes and unchanged lineage fixture. The same cases run ordinarily and in separate fresh profiling-only infrastructure.

| Family | Actual supported result |
| --- | --- |
| Committed source and staged binding | One fresh synthetic driver cancellation commits before shadow export. Wrong source key, owner pseudonym, source event/work, evidence version, original commitment, snapshot or configuration is rejected by protected staging without a persisted queue/receipt/audit/lineage change. Valid staging returns the exact projected payload; a changed staged payload is refused. |
| Receiver contract and transport authentication | SQL NULL/JSON null/scalars/array, malformed/closed-contract/configuration/version/key/hash/lineage/privacy and oversized cases do not admit work. Actual HTTP rejects wrong request MAC, malformed JSON and 65,537-byte body before SQL admission. Missing receiver configuration, STOP and capacity also deny new admission. |
| Admission / duplicate / conflict | Valid authenticated payload creates one new receiver work/receipt. Exact duplicate reuses both, including MAC. Conflicting immutable content on that key is rejected and its local audit row has an exact independently readable lineage commitment. No second work is created. |
| Receipt expressions | Missing required body fields, NULL fields, selected wrong scalar/container types, unknown root/body fields, wrong service/key/payload binding/UUID/status/MAC and work-ID boundaries execute against real PostgreSQL. Valid statuses and accepted length boundaries execute separately from the native metric. |
| Source ACK / recovery | Wrong/stale token, altered receipt, wrong lease owner/epoch, expiry, missing payload/row, STOP and changed original source policy deny ACK. A new sender process reclaims after 121 seconds and persists the receiver's original receipt; receiver work and receipt rows stay unchanged. This is lost-local-ACK reconciliation, not a new database-server crash proof. |
| Cleanup / authority / accounting | Nonterminal, foreign terminal receipt identity, missing delivery and repeated cleanup are refused. Correct terminal receipt allows payload deletion. Receiver payload cleanup plus STOP retains a duplicate receipt without recreating work. Source financial observations equal the post-cancellation baseline; broker control and actual broker accounting snapshots match before/after. No new operative authority is created. |
| Catalog / principals | Actual capture cannot call private receive alias, enqueue directly, edit configuration or delete receipt history. Exporter cannot use the old direct delivery bypass, read configuration/application bookings or directly execute the internal receipt helper. Definition/owner/SECURITY DEFINER/search-path/ACL catalogs match before/after each fixture. |

The unchanged [transport integration](../../backend/tests/integration/phase9dTransport.test.js) supplies the directly affected ordinary regression paths: real sender/receiver process death, lost ACK and restart reconciliation, reordered duplicates, source staging crash, receipt cleanup/tombstones, STOP lock ordering, bounded failure and principal denials. Its original mutation group is excluded by the explicit `transport-behavior` skip-name pattern. Node reports fourteen selected tests, all passing, with zero reported skips; its saved witness has thirteen ordinary groups and **no sqlMutations field**. No omission helper is invoked. The original test file was not edited.

The unchanged [lineage integration](../../backend/tests/integration/phase9dCustodyLineage.test.js) is reused to check this receiver wrapper's capture and conflict observation through independent custody, plus its existing offline guard/accounting path. It passes 7/7. It makes one fake offline analyst call; every new P4 run makes zero analyst calls. Live/paid provider evaluations are zero. Custody 20/20, P2, P3, ICR-1, unit and historical full-backend results remain accepted at their own epochs; they are not relabelled as new P4 executions.

## Dedicated native profiling and precise before/after counts

The final `p4-profile` execution uses fresh databases/processes with the pinned image: PostgreSQL **17.5**, plpgsql_check extension schema **2.10**, source tag **v2.10.4**, commit `c882056fac65532dee95fc174c4fdc0cc0965293`. The recipe SHA-pins the vendor inputs; exact runtime/image/source identities and raw trees are retained. Baseline fixture installation precedes counter reset and workload measurement. No routine-replacement mutation or active-function replacement probe runs.

[phase9dP4Profile.js](../../backend/tests/helpers/phase9dP4Profile.js) independently reconstructs visible `lineno > 0` statements and IF first-statement/implicit-else outcomes for these exact six routine bodies. The original receiver includes an explicit ELSE, counted separately. Both reconstructed ratios must equal the pinned native APIs. `NR` means no selected historical native attribution; it is not zero and no newly observed count is invented for that missing history. The saved zero-count wrapper/alias definitions match current definitions after LF/CRLF normalization.

| Installation / routine | Before statements | After statements | Before branches | After branches |
| --- | ---: | ---: | ---: | ---: |
| source / `outbox9d.remote_ack(bigint,uuid,jsonb)` | NR | **8/8** | NR | **2/2** |
| source / `outbox9d.remote_delete_payload(bigint,jsonb)` | NR | **7/7** | NR | **2/2** |
| source / `outbox9d.remote_payload(bigint,uuid)` | NR | **6/6** | NR | **2/2** |
| receiver / `transport9d.receive_committed(jsonb)` | 0/22 | **22/22** | 0/14 | **14/14** |
| receiver / `transport9d.receive(jsonb)` | 0/8 | **8/8** | 0/4 | **4/4** |
| receiver / `transport9d.serialize(jsonb)` | NR | **6/6** | NR | **4/4** |

There are **no unhit visible statements or native procedural branches in these six observations**. The wrapper newly observes eight statements/four branches and the private implementation twenty-two/fourteen relative to the named old zero window. Other routines have newly supplied numerical attribution, rather than a fabricated zero-to-full comparison. Old ordinary behavioral passes remain distinct from this profiler window. No combined whole-SQL percentage is produced.

### SQL-expression and trust limitations

Native coverage does not count each AND/OR operand, SQL NULL truth value, WHERE/join predicate, embedded CASE or JSON scalar type. The SQL receipt helper has no native procedural denominator. The persisted cases supply their stated outcomes, not exhaustive MC/DC or Boolean adequacy. ACL/default privileges, table constraints, trigger attachment and configuration are catalog/security invariants, not native branches. Existing unchanged catalogs are reused; this is not a project-wide DDL certification.

The existing receipt predicate uses `#>>` text extraction: a correctly authenticated numeric JSON `workId:1` passes, as do nineteen-digit decimal strings without a bigint-range check. These observations are retained. The receiver normally emits a string work ID; this task adds no string-only, integer-range or new cryptographic acceptance rule. HMAC authenticity trusts the configured issuer/key boundary; a synthetic fixture owner can produce a valid MAC. A valid receipt predicate alone does not independently query the remote record.

Protected source staging verifies original journal/owner/evidence bindings. The receiver verifies its authenticated producer's bounded contract and immutable duplicate binding; it cannot independently reconstruct original ownership from pseudonyms. P4 does not claim journal-origin proof against a trusted sender/owner compromise, deployed TLS/IAM or new independent administrative custody. No ACK or cleanup grants human-final, financial or production authority.

No new crash/recovery diagnostic is reported in the selected profiling server observations. The historical profiling-enabled PostgreSQL signal-11 defect remains unresolved. A successful isolated profiling run does not diagnose that defect; future mutation work must still use a separate unprofiled server/process.

## Executed results and source epochs

| Selected verification | Actual result |
| --- | --- |
| Final P4 ordinary integration, including accounting readback | **14/14 PASS**, no skips |
| Final fresh P4 profiling-only integration | **14/14 PASS**, no skips |
| Unchanged transport, ordinary groups only | **14/14 PASS**, no reported skips; mutation group excluded |
| Unchanged lineage integration | **7/7 PASS**, no skips |
| Backend typecheck | **PASS** |
| Scoped lint | **3 files, zero errors/warnings** |
| Scoped Git / new-file whitespace | **PASS** |
| SQL preservation | **15/15 unchanged** |
| Original local/staged/archive/HEAD | **19/19 local, 23/23 staged; archive/HEAD unchanged** |
| Accepted Clerk / frozen V5 / original custody | **3/3 / 22/22 / 28/28**, both worktrees |

All selected executions record `sourcesUnchanged:true` and their own exact source/log identities. Final P4 and typecheck source graphs match current bytes. Transport and lineage regressions predate the added accounting read/assertions in the new P4 file, which neither legacy suite loads; their SQL, fixtures, runtime and own test sources are unchanged. Exact later differences remain in selected-acceptance.json. Initial passing P4 epochs before expanded receipt assertions or accounting readback remain saved and are not substituted for the selected final pair. Database work was sequential.

## Changed code and catalog identities

| New/changed code | SHA-256 |
| --- | --- |
| `backend/tests/integration/phase9dCustodyP4.test.js` | `7afad91494e5ce16e049e7082a89b01bcf5ccd6c548bda1601550b2853a41477` |
| `backend/tests/helpers/phase9dP4Profile.js` | `1727348fc7832868309e2ad189976233eb1e8e3bfa19ff63c206ed2f8afdf60e` |
| `tools/phase9d/closure-run.mjs` | `234853509b2ae5d149e045069db9db19f416ec754c124a85c03d941c29d69235` |

The runner's byte-exact pre-P4 version is retained in historical-source/closure-run-before-p4.mjs, hash `16bb2195e39f80cfc49927e3fabbefd9d5109e12c43905823a478ea1996cef94`. Among **1931** pre-existing inventoried working files, only this runner changed. It adds P4 dispatch/profiling modes, explicit test scope and the non-mutation transport selection. The staging index and HEAD are unchanged. Prior fixtures, SQL, P2/P3/ICR-1 sources and evidence were not edited. The manifest separately binds this checkpoint and evidence/executor files.

| Installed catalog definition | SHA-256 |
| --- | --- |
| source / `outbox9d.remote_ack(bigint,uuid,jsonb)` | `e66c7d113b0d4fbeccceb4d2d332fd6f23507a4569b54833f032ac6b16c84772` |
| source / `outbox9d.remote_delete_payload(bigint,jsonb)` | `75eee90a2a583da02862ec2200cecf44b7e360980a669e94b9d7f5faec99c49d` |
| source / `outbox9d.remote_payload(bigint,uuid)` | `aa81876ecada91e459ee3b804b6acd9f1d7c93d58f638c5c87dbd35cc6f39d19` |
| source / `outbox9d.valid_remote_receipt(jsonb,jsonb)` | `69813b4674675e55876d0e750871514e9bb3c881dd8599ac6d4e81430a9fcc41` |
| receiver / `transport9d.receive_committed(jsonb)` | `316aa149bb0b77853585be31958632f68239c35a7d66b7d789e418e39b6cc138` |
| receiver / `transport9d.receive(jsonb)` | `19e8967c669c60b63b13590922615cde4c7ed9fb6a2985fe18ef47a764c958d9` |
| receiver / `transport9d.serialize(jsonb)` | `ba8b05d88b3214d899af257328b54c31d95142b0ac9321d2cd6266bf0a575aee` |

## Host observations and cleanup

Owner-approved RAM admission/abort thresholds remain disabled; scripted observation, deadlines and existing execution limits remain. The first observer saved 1223 samples, minimum 128.1 MiB free RAM, with 0 heartbeat gaps over eight seconds and 0 unresponsive taskbar samples. All initial selected executions fall inside its saved window. It ended without its completion receipt at 2026-10-17T23:59:11.430094+00:00; cause is unknown. The saved-row reconstruction does not invent later monitoring.

At resumed readback the engine pipe was absent and Docker processes were absent; that first cleanup check is retained as INCOMPLETE. No stop/restart cause is inferred. The final accounting pair uses a fresh engine preflight and its own scripted observer: minimum 380.5 MiB, 1 heartbeat gap(s) over eight seconds (8.01 seconds), and 0 unresponsive taskbar samples. Final owned-fixture readback and normal Docker shutdown are recorded separately. Both approved Dell services remain Running/Auto. Same-host samples cannot rule out a complete OS freeze. No unrelated service/process, existing volume, cache or global Docker data was removed.

## Remaining scope and P5 requirements

P4 closes the stated isolated transport/source acceptance cases and six-routine native metric. Exhaustive SQL-expression/NULL truth tables, independent receipt-scalar/range policy, every fault schedule, whole-SQL structural/mutation/DDL adequacy and broader production gates remain outside this certificate. P2's invalid-lineage measurement gap and P3's attempt-count/lineage recovery limits remain unchanged. Existing readiness rows and historical failures are preserved.

P5, only when separately requested, should map the broker/recovery composed definitions and private aliases, then exercise the missing current/stale lease/token/generation, response/usage conflict, terminal/cleanup and request/token/currency accounting paths in small groups. Reuse B/R witnesses first; collect native counters in fresh profiling-only infrastructure and keep any later approved replacements separate. **P5 was not started.**

Frozen V5 remains `e484afc4c7fa724ea29af6edd962c48b814dc73a10e4f4a5e33833ad26afbe75`. No full backend or JavaScript mutation campaign, restricted capsule campaign, real incident collection, live model/provider call, auth/policy change, commit, push, merge, deployment or production activation occurred. **Whole-SQL certification and Phase 9D-1 remain PARTIAL. Production remains OFF. Stop after P4.**
