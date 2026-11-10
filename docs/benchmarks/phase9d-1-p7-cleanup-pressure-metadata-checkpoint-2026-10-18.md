# Phase 9D-1 — P7 cleanup, pressure and database metadata

18 October 2026 IST. Continues the [SQL plan](phase9d-1-sql-coverage-plan.md), accepted [P2](phase9d-1-p2-capture-consistency-checkpoint-2026-10-18.md), [P3](phase9d-1-p3-delivery-recovery-checkpoint-2026-10-18.md), [P4](phase9d-1-p4-transport-acceptance-checkpoint-2026-10-18.md), [P5](phase9d-1-p5-broker-accounting-checkpoint-2026-10-18.md), [P6 behavior](phase9d-1-p6-key-epoch-checkpoint-2026-10-18.md) and [P6 crash diagnostic](phase9d-1-p6-profiler-crash-diagnostic-2026-10-18.md).

**P7 supported unprofiled behavior and installed metadata: VERIFIED_IN_ISOLATION. P7 native coverage: NOT_RUN. P6 native profiling: FAILED / INCOMPLETE. WHOLE-SQL CERTIFICATION / PHASE 9D-1: PARTIAL. PRODUCTION_READY: NO.**

Evidence: [source-bound manifest](../../output/phase9d-p7-2026-10-18/manifest.json), [acceptance matrix](../../output/phase9d-p7-2026-10-18/acceptance-matrix.json), [selected actual executions](../../output/phase9d-p7-2026-10-18/selected-acceptance.json), [pressure results](../../output/phase9d-p7-2026-10-18/pressure-results.json), [catalog identities](../../output/phase9d-p7-2026-10-18/catalog-identities.json), [batch readiness supplement](../../output/phase9d-p7-2026-10-18/readiness-current-p7.json). Execution receipts retain their original UTC timestamps.

## Scope, composition and preserved baseline

**All fifteen SQL sources remain byte-identical to the task baseline.** The new test and metadata helper, plus runner dispatch/source inventory/selection changes, are the only code additions/changes. No cleanup, signing, ACK, accounting, guard, authentication, frozen V5, retention policy or production configuration implementation changed.

The new P7 test uses the existing `custodyClosureFixture`: migrated synthetic source application/outbox/transport sender, separate receiver with original permissions/transport/broker/recovery and optional custody capture/admission, and an independent custodian database on a separate disposable PostgreSQL server. Its two-server setup remains on one local host. The later optional lineage/transport wrapper composition is not installed here; P2/P4/ICR-1 retain their separate accepted scopes.

All database jobs execute sequentially using accepted unprofiled startup. The new fixture records **empty shared_preload_libraries** in source, receiver and custodian; receiver profiler setting is OFF, and source/custodian return null before module initialization. Null is reported as uninitialized, not an enabled profiler. No P7 profile mode was added. No routine-replacement mutation or P6 crash reproduction ran.

## Actual results and reused tests

| Selected check | Actual result |
| --- | --- |
| New focused P7 behavior/metadata | **13/13 PASS**, no skips: twelve leaf groups and parent |
| Existing outbox cleanup/denial subset | **3/3 PASS**, no skips: two leaves and parent |
| Existing custody registration/permission/default subset | **5/5 PASS**, no skips: four leaves and parent |
| Existing safety pressure/catalog subset | **3/3 PASS**, no skips: two leaves and parent |
| Existing broker/recovery terminal/late-accounting subset | **4/4 PASS**, no skips: three leaves and parent |
| Backend typecheck | **PASS** |
| Scoped lint | **Three files, zero errors/warnings** |
| Scoped Git/new-code whitespace | **PASS** |
| SQL sources / staging / HEAD | **15/15 unchanged**; staged-entry projection and HEAD unchanged |
| Original repository and accepted identities | **19/19 local, 23/23 staged**, archive/HEAD unchanged; Clerk **3/3**, frozen V5 **22/22**, original custody **28/28**, both worktrees |

Every selected receipt records sourcesUnchanged:true; final readback matches every bound source against current bytes. Excluded groups are not additional passing tests. Exact selection patterns and names are retained in [regression-selection.json](../../output/phase9d-p7-2026-10-18/regression-selection.json).

- Unchanged [outbox integration](../../backend/tests/integration/phase9dOutbox.test.js): lost ACK, unfinished payload deletion refusal, eligible terminal deletion, delayed delivery after deletion without recreation, and exporter privilege denials. Its nested-trigger outage/profile toggle and thirteen-omission mutation group were excluded.
- Unchanged [custody integration](../../backend/tests/integration/phase9dCustody.test.js): actual journal registration, independent worker-principal denials, wrong-password rejection and future-PUBLIC/search-path protections. Mutation and unrelated sender/service crash groups were excluded.
- Unchanged [safety integration](../../backend/tests/integration/phase9dCustodySafety.test.js): five small lowered-limit fixture probes and catalog/default privilege checks. Rotation, crashing ingestion race, recovery-operator and mutation groups were excluded. The selected witness's mutations array is empty.
- Unchanged [recovery integration](../../backend/tests/integration/phase9dRecovery.test.js): never-admitted terminal expiry, terminal cleanup with unknown cost/late reconciliation, and stale-generation accounting without current-result authority. SQL omissions, server restarts, CLI/process-failure and unrelated race groups were excluded.

The unchanged legacy outbox test enforces its historical output-directory convention. Its newly generated UUID witness was copied byte-for-byte into the P7 directory with [provenance](../../output/phase9d-p7-2026-10-18/outbox-witness-provenance.json). No pre-existing artifact was copied over or migrated. Legacy catalog/native API snapshots, read with profiling disabled, are not new native measurements or numerical coverage claims.

The new P7 test makes zero analyst/provider calls. The selected outbox recipe invokes its existing fake offline worker; no live/paid model/provider call occurs. Each new leaf compares actual application consequences to the fixture's post-incident baseline. Earlier P2–P6 successes, including P6 15/15, selected 6/6 and 4/4, and the historical full backend 1,865/1,865, retain their own epochs and were not rerun.

## Cleanup, tombstones and delayed observations

[phase9dCustodyP7.test.js](../../backend/tests/integration/phase9dCustodyP7.test.js) asserts persisted PostgreSQL rows and actual authorized function results. It adds no mocked SQL acceptance or deletion policy.

| Family | Observed supported result |
| --- | --- |
| Unfinished / foreign cleanup | Broker CLEAN before terminal eligibility returns INVALID; a missing target returns STALE. Existing outbox cases also refuse unfinished source/receiver payload deletion. Wrong or nonterminal transport receipt cannot authorize source deletion. |
| Eligible terminal cleanup | An actual authorized execution role reserves/admits/begins a synthetic send. Unknown outcome remains UNKNOWN. Existing operations TERMINATE then CLEAN remove broker payload and linked receiver snapshot while retaining request/work/dispatch/evidence identities. |
| Exact duplicate operation | Replaying the same cleanup UUID/arguments returns the original operation outcome without another capture/history transition. No new idempotency semantics were introduced. |
| Late authenticated accounting | After cleanup a synthetic authenticated BILLED_FAILURE receipt is ACCEPTED; exact receipt replay is DUPLICATE. The original attempt becomes CONFIRMED, request remains cleaned TERMINAL, payload remains null, guard input remains unavailable and another begin_send is refused. |
| Spending retention | Actual accounting retains **five minor units held** and **two confirmed**, with zero results. A lower observed cost does not release the worst-case hold or authorize current-result/financial consequences. |
| Terminal transport receipt | Actual restricted capture connection re-observes the original payload and obtains MANUAL_REVIEW status for the same transport receipt/work identity. Authorized source ops deletes payload only with the correctly bound terminal receipt. |
| Duplicate / delayed transport | A second remote_delete_payload returns false because the payload is already absent. A delayed original remote ACK also returns false. Duplicate receiver delivery returns the same terminal receipt identity, without recreating receiver snapshot, source payload or broker work. Receipt status/MAC may legitimately change from the original nonterminal observation; receipt/work identity remains bound. |
| Custody after cleanup | All **eight** retained custody events are delivered in sequence after cleanup, signed by the existing synthetic signer and independently verified. Local ACKs succeed; remote duplicates retain original bodies/receipts. Original sequence, local ID, event and commitment remain equal before/after; only ACK/receipt state changes. |
| Tombstone reuse | Re-registering the original cleaned broker message returns the original request identity. No new attempt/reservation or operative result is created. Application payments/payouts and all compared consequence state remain unchanged. |

Duplicate outcomes are API-specific: broker operation replay returns its historical outcome, whereas repeated remote payload cleanup returns false. No uniform “duplicate means true” rule was invented. The reused ordinary outbox case separately verifies its existing local delivery/deletion behavior.

## Five pressure dimensions at unchanged default thresholds

New tests use the current configured values, rather than changing production/default SQL limits. Each dimension is isolated from the others using bounded, explicitly trusted fixture rows. Below-threshold reservation succeeds; at/above the corresponding threshold the actual admission routine raises **54000 / AUDIT_BACKPRESSURE**.

| Dimension | Below | At current threshold | Above |
| --- | ---: | ---: | ---: |
| Unacknowledged events | **99** | **100** | **101** |
| Retained unacknowledged payload bytes | **131,071** | **131,072** | **131,073** |
| REVIEW count | **24** | **25** | **26** |
| Observed REVIEW age, controlled seconds | **86,399** | **86,400** | **86,401** |
| Total custody relation bytes | **303,104** | **10,485,760** | **10,493,952** |

The storage fixture actually reached the exact configured 10 MiB boundary; an unrepresentable boundary was not assumed. Age uses `broker9d.control.now_at` and the fixture event's observed timestamp, not a claim of elapsed real-world outage time. Payload metrics measure stored `pg_column_size(event)`, not transport packet or total database size.

### Probe boundaries, STOP and restoration

- Threshold probes run in owned transactions/savepoints and temporarily assume `broker9d_exec` **session authorization**, because the accepted reservation contract checks session_user as well as effective grants. These are trusted-controller role-context probes, not proof of authentication resistance against that controller. Separate real authenticated execution connections verify admission after clearing.
- The operations role executes STOP successfully while each pressured fixture condition is present, and retained row counts remain observable. Those STOP-at-threshold assertions are **inside the fixture transaction and subsequently rolled back**; they are not independent committed STOP-at-every-threshold executions. The reused safety recipe also executes its ordinary committed STOP after restoring its probes.
- After each rollback the original retained rows match exactly and unchanged limits are read back. A real execution login can reserve again inside its own rollback check. There is no automatic source replay, deleted unresolved evidence or changed recovery API.
- For storage, at most 1,601 synthetic rows are permitted by the fixture bound. A temporary PLAIN column makes physical allocation measurable. ACKED markers in these owner-created rows are fixture inputs, not independently delivered custody claims. All probe rows/column changes roll back.
- Rolled-back rows can leave allocated dead pages. An isolated `VACUUM (FULL, ANALYZE) custody_export.events` then compacts **only that owned fixture relation**, reducing it to **65,536 bytes**, with every committed row unchanged and admission restored. Physical relation files can change; logical definitions/owners/ACLs/columns/constraints are compared separately. No retention deletion policy or host/disk cleanup was added.

The actual four admission triggers and their WHEN clauses are catalogued. New default-boundary runtime assertions exercise reservation; reused safety assertions exercise registration/reservation at their separately recorded lowered fixture limits. This is not an exhaustive pressure-by-dispatch/send cross-product. Admission checks can allow a transaction to exceed a byte boundary after its initial check; a below-boundary admission is not a perfect global physical bound.

No full-disk exhaustion, prolonged stress, host ENOSPC reproduction or uncontrolled WAL experiment occurred. Total retained history, WAL, indexes beyond this selected relation, custodian disk, production capacity and lawful retention/hold policy remain open.

## Database metadata and permissions

[phase9dP7Catalog.js](../../backend/tests/helpers/phase9dP7Catalog.js) records routines/definitions, owners, language, SECURITY DEFINER, explicit search paths, ACLs/extension membership, table RLS flags, constraints, triggers/enabled states, columns, indexes, policies, default ACLs and restricted role flags. Catalog observations are separate from runtime assertions.

| Installation | Routine rows / custom component routines | Constraints | Non-internal triggers |
| --- | ---: | ---: | ---: |
| Source, including migrated public application metadata | **66 / 27** | **181** | **10** |
| Receiver, including original broker/recovery and custody export | **79 / 43** | **96** | **6** |
| Independent custodian | **44 / 8** | **17** | **0** |

Custom counts exclude extension-owned routines and public application routines. No pgcrypto binary certification is inferred. Source public application metadata is compared for preservation; it is not recertified as part of the custom-function owner/search-path assertions.

- Component routine owners match the existing shadow/auditor/broker/custody owner map. Custom component routines deny PUBLIC EXECUTE and retain explicit `pg_catalog`-first search paths. Relevant cleanup/admission/ACK routines remain SECURITY DEFINER; invoker helpers are not incorrectly required to become definers.
- All four custody admission triggers are enabled; their definitions retain registration/reservation and conditional dispatch/send boundaries. Broker capture and revision trigger metadata remain intact.
- Direct negative probes produce **three CHECK rejections**, **three UNIQUE rejections** (key identity, signing epoch, retained commitment) and **one foreign-key rejection**. Probe transactions roll back. Applicable PK/UNIQUE/FK/CHECK definitions are retained in the catalog; this is not exhaustive testing of every application constraint.
- Five owner/default-privilege probes create a fresh trivial function, explicitly assert absence of PUBLIC execution, then observe a permitted-schema restricted role's 42501 denial. All probes roll back. These are new disposable default-ACL probes, **not replacement mutations of installed product routines**.
- Real execution, signer, ingress and verifier connections receive the selected 42501 denials for forbidden limits/history/key access or role escalation. Existing custody tests independently exercise worker principals, wrong credentials, source writes, TEMP and search-path boundaries.
- Exactly two existing rehearsal source SELECT policies are present on bookings and driver_cancellations; their actual RLS flags are true in this fixture. No RLS policy was invented for queues or custody tables. Policies alone are not substituted for effective access checks.
- Broker budget configuration, source enabled/version configuration, custody limits and the one ACTIVE epoch-1 public signing-key registry remain unchanged. No secret configuration values are exported. No rotation or P6 signing failure scenario is run.

All selected logical before/after catalogs match exactly. The source's public application schema/columns/constraints/indexes/triggers/policies are unchanged **after accepted fixture installation**. That installation deliberately applies its existing permissions/RLS rehearsal recipe in the disposable database; no original application migration, deployed schema or policy changed.

## Retained failures and source epochs

The initial new PostgreSQL run reports **0 PASS / 2 FAIL**, one failed leaf plus parent. A below-limit positive reservation was denied by the existing `attempts_owner_check`: SET LOCAL ROLE had left the controller as session_user. This was a fixture-caller error, not a product admission defect. The test now assumes the intended session authorization within the owned rollback boundary and checks actor/effective identity. No SQL/grant was weakened. Original failed source and source-stable receipt are retained.

Initial scoped lint reported four unused destructured fields; an explicit identity projection corrected them without changing the intended equality assertion. Original source/report remain. The first **13/13** pass predates the explicit future-PUBLIC ACL and uniqueness assertions; it is retained separately. The selected final **13/13** and all narrow regressions/typecheck bind the final source epoch. No failed observation was overwritten or relabelled.

| New/changed code | SHA-256 |
| --- | --- |
| `backend/tests/integration/phase9dCustodyP7.test.js` | `96089424336221bed07c75c776282caae0f2605b7046661628abb1c7ebf5067f` |
| `backend/tests/helpers/phase9dP7Catalog.js` | `f17c308e03c6820dc9980298dbbfb62c26540d278081c8efe4f38761b3d5b779` |
| `tools/phase9d/closure-run.mjs` | `0d3b83f9444d5028c25c6ab8a365b05d084208d95dc4bd570018b2538a64f616` |

Only the runner changed among **1,942** pre-existing inventoried working files. Its byte-exact before version is retained with hash `782ccd392ea9bbe40983fda07937c2385e5fb724c15546475100057c3051d8e1`. Changes add P7 dispatch/source inventory and narrow selections; the profiling-enabled mode list is unchanged. All original SQL/fixtures/regression sources remain unchanged. Scoped fixture lint disables complexity enforcement; no whole-critical-code numerical quality certificate is claimed.

P6's original **147** artifact hashes and diagnostic's **35** artifact hashes remain intact. Their manifests remain `bd274bdde7da43c3d093a3c561a8616c2502a7c03742e272fe10f717f62bd6fa` and `bcb5b28971a8e2fa9a164ad9363e2eb03fdf8baab2ffcc14b2033be128d86132`. Their historical source epochs are preserved; the changed runner is not retroactively attributed to those runs. No existing readiness row was rewritten.

## Host monitoring, cleanup and remaining gates

[Monitoring](../../output/phase9d-p7-2026-10-18/host-summary.json) retains **287 samples**, minimum free RAM **54.6 MiB** during Docker startup, minimum commit headroom **9,303.6 MiB**, **one 8.256-second heartbeat gap** within the typecheck window and **zero unresponsive taskbar samples**. These are reliability observations, not a diagnosis or proof of no freeze. Before later selected jobs, recent free-RAM samples had recovered to approximately 2.7–3.5 GiB. Owner-approved RAM admission/abort settings remained OFF; deadlines and observer freshness/responsiveness checks remained. No additional safeguard was disabled, and no further database work followed the completed sequence.

Host-space minima were C: **90.45 GiB**, D: **466.89 GiB**. Each selected database receipt retains startup filesystem observations. No new server-signal/crash/recovery observation appears in selected diagnostic projections. This does not resolve P6's signal-11 cause or historical ENOSPC, transport deadlines and heartbeat findings.

[Cleanup](../../output/phase9d-p7-2026-10-18/cleanup-readback.json) confirms zero running containers and normal Docker shutdown. DellTechHub and SupportAssistAgent remain Running/Auto. Only accepted owned disposable fixture cleanup ran. No unrelated process/service, existing volume, global Docker/cache or host setting was changed.

P7 verifies the supported unprofiled cases above. It does **not** supply native statement/branch percentages, complete SQL Boolean/NULL truth tables, every trigger schedule, global retention/storage bounds, mutation adequacy, legal hold rules or production readiness. The P6 nested rejection/retry profiler failure remains unresolved; no attempt to close it occurred. P8 remains NOT_STARTED.

```text
P6 UNPROFILED BEHAVIOR: VERIFIED_IN_ISOLATION (historical accepted epoch)
P6 NATIVE PROFILING: FAILED / INCOMPLETE
P7 SUPPORTED UNPROFILED BEHAVIOR / INSTALLED METADATA: VERIFIED_IN_ISOLATION
P7 NATIVE PROFILING: NOT_RUN
WHOLE-SQL / PHASE 9D-1: PARTIAL
P8: NOT_STARTED
PRODUCTION_READY: NO
PRODUCTION DEPLOYMENT / ACTIVATION: NOT_AUTHORIZED
PRODUCTION SHADOW / AUTOMATIC CONSEQUENCES / SEARCH: OFF
```

Frozen V5 remains `e484afc4c7fa724ea29af6edd962c48b814dc73a10e4f4a5e33833ad26afbe75`. No real incidents, live/paid model/provider calls, full backend run, restricted capsule, SQL/JavaScript mutation campaign, auth/financial policy change, commit, push, merge or deployment occurred. **Stop after P7's unprofiled behavior/metadata verification. Production stays OFF.**
