# Phase 9D-1 — native SQL verification and historical regression reconciliation

13 October 2026 IST. Continues the [accepted containment checkpoint](phase9d-1-continuation-checkpoint-2026-10-13.md). Evidence: [source-bound manifest](../../output/phase9d-1-sql-broker-2026-10-13/manifest.json), [SQL matrix](../../output/phase9d-1-sql-broker-2026-10-13/sql-testability-matrix.json), and [criterion-level readiness](../../output/phase9d-1-sql-broker-2026-10-13/readiness-gates.json).

**PHASE 9D-1: PARTIAL. PRODUCTION_READY: NO.** This continuation implements the first SQL/historical-regression stage. The directory name reserves the subsequent broker work; it does not mean an outbox, standalone broker or external audit service has been implemented. Those authorized isolated implementation stages remain outstanding, with no new owner decision required to continue them.

## I. SQL source, execution and numerical boundaries

The implemented SQL boundary is `tools/phase9d/permissions.sql`: seven principals, two schemas, three tables and eleven routines. Eight routines use PL/pgSQL; three use SQL. The matrix retains exact catalog definitions and hashes, owners, SECURITY DEFINER flags, explicit search paths, executable login principals, ACLs, constraints, default privileges, table security and dependencies. This boundary uses privileges rather than RLS; its three tables have no RLS policies or custom enforcement triggers. The adversarial audit-failure trigger is a temporary test fixture and is removed.

Actual disposable PostgreSQL **17.5**, PostGIS **3.5.2** and pgvector **0.8.6** remain the baseline. Native profiling uses `plpgsql_check` source tag **v2.10.4**, commit `c882056fac65532dee95fc174c4fdc0cc0965293`. Its extension schema version is **2.10**, distinct from the source release version. The profiler is built against exact 17.5 headers in a separate builder; only the extension library/SQL files enter the original runtime image. The two HTTPS source archives are SHA-pinned in the Docker recipe and execution sources. No production extension or server version changed.

| Native PL/pgSQL routine | Visible statements hit / total | Native branches hit / total |
| --- | ---: | ---: |
| `claim` | 15/15 | 6/6 |
| `complete` | 16/16 | 6/6 |
| `delete_payload` | 6/6 | 2/2 |
| `enqueue` | 21/21 | 10/10 |
| `fail` | 9/9 | 2/2 |
| `permit` | 12/12 | 4/4 |
| `set_stop` | 4/4 | 0/0 |
| `valid_snapshot` | 19/19 | 17/17 |
| **Eight-routine total** | **102/102** | **47/47** |

Raw native statement trees/counters and both native coverage ratios are retained **before mutations**. Denominators follow the pinned profiler's algorithm: visible `lineno > 0` statements; IF then/implicit-else branches; FOR bodies. The exact eight routines have no procedural ELSE/ELSIF/CASE/exception blocks. Reconstructed numerator/denominator pairs are checked against the native APIs. `set_stop` has no native branch; 0/0 is not two fictional outcomes. Static `plpgsql_check_function_tb` inspection reports no error-level findings; original warnings remain in the witness.

This is **100% of the stated native PL/pgSQL metric**, not 100% SQL certification. It does not count SQL-language expression branches, each AND/OR subcondition, embedded SQL CASE arms, grants, migration statements or authentication configuration as native branches. Whole-SQL cognitive/Halstead/CRAP measurement and comprehensive logical-condition/mutation adequacy remain incomplete. **Q2 remains open; SQL SECURITY CERTIFICATION: PARTIAL.** The [pinned native profiler implementation](https://github.com/okbob/plpgsql_check/blob/c882056fac65532dee95fc174c4fdc0cc0965293/src/profiler.c) defines this metric.

## II. Actual adversarial tests and two corrections

The final SQL suite passes **12/12**: eleven leaf groups and their parent. It executes timestamp/category truth tables, malformed nested evidence, privacy rejection, pause/backpressure, exact duplicates, conflicting duplicates, capacity, retry deadlines, lease expiry/exhaustion, request quotas, stale tokens/epochs/owners, malformed/oversized/final-authority results, terminal payload deletion, concurrent claims and concurrent result persistence.

Restricted-principal probes deny application reads, direct queue changes, audit delete/truncate/append, stop changes, owner/session/role escalation, schema and temporary-table creation, server-file/program access and password-catalog reads. Search-path manipulation does not replace qualified objects. Incorrect worker-password authentication returns **28P01**. Permission denials return PostgreSQL **42501**, distinct from application-level false/null results and **23514** constraint rollback. Existing wrong-database/URI/role admission and broader application consequence denials remain separately source-bound worker/container evidence.

Concurrent actual connections claim one entry and commit one result. An independently installed failing audit trigger causes result persistence to roll back: work remains PROCESSING, the trigger is removed, and retry succeeds. This proves same-database transaction atomicity, not external audit delivery or independent denial custody.

Two counterexamples were reproduced and corrected **only in the isolated rehearsal**:

1. **Future PUBLIC execution.** Explicit revocation on existing routines did not protect future owner-created routines. The earlier witness successfully called a temporary owner-context read using PostgreSQL's default PUBLIC execution. Both non-login owners now globally revoke default routine execution. A new future-routine probe is denied, while explicit legitimate entry-point grants still work. A schema-local revoke would not remove a global default; the correction uses owner-wide defaults.
2. **Conflicting duplicate acknowledgement.** The earlier receiver returned its existing ID when the same logical key carried different evidence/provenance hashes. It now rejects differing immutable hashes, provenance or retained snapshot content, records DUPLICATE_CONFLICT, and preserves the original entry. Exact duplicate delivery still returns one ID. Terminal payload deletion does not recreate work. Capture remains a trusted identity: this correction alone does not prove that evidence originated in a committed journal or create an export/outbox.

Original SQL bytes are preserved in `historical-source/permissions-pre-certification.sql`. Earlier counterexample witnesses and failed executions remain intact. The changed SQL was executed in one additional actual restricted worker container because its permission boundary changed: **17 checks, 16 denials, one fake advisory result, all 51 application tables unchanged**, with owned cleanup. Earlier restricted-container repeats are retained for their original epochs; they were not rerun merely to increase counts.

**26/26 seeded SQL/DDL mutants are killed**, with zero survivors or errors in the final inventory. Each routine mutation uses an exact unique catalog-definition anchor, executes its baseline and mutated probe, and restores the original. Seeds cover stop, epoch, lease owner/token/expiry/status, request quotas, privacy, evidence version, calendar/hour 24, concurrency, terminal deletion, duplicate source binding, direct work/audit grants and future default execution. Raw mutant SQL and SHA identities are retained. All eleven routine definitions and explicit ACLs equal the pre-mutation catalog afterward. These 26 selected mutations are not claimed as exhaustive SQL mutation adequacy. Previous nine SQL mutations remain separate evidence rather than being added into a misleading total.

## III. Historical Phase 5/7 reconciliation and erratum

The original two test files were copied before editing, with SHA identities in `historical-source/manifest.json`. Original 54/58 failures, checkpoints and raw logs remain unchanged. The four failures represented **three leaf assertions and their failed Phase 7 parent**, not four distinct policy defects.

| Historical scenario/purpose | Conflict and current-policy v1 witness |
| --- | --- |
| Phase 5 persistence/round trip | Generic `recorded:true` fixtures previously expected automatic uphold/waive eligibility from confident raw classifications. The approved independent guard requires affirmative causal authority. Current witnesses preserve raw DRIVER_CAUSED/PLATFORM_CAUSED recommendations, assert NEEDS_ADMIN_REVIEW and INDEPENDENT_ROUTE_AUTHORITY, and execute persisted contract/hash/citation checks, duplicate decision reuse, immutable analysis reuse and the existing low-confidence veto. |
| Phase 5 concurrency/crash recovery | Automatic-route assertions prevented downstream recovery checks from running. Current witnesses retain one case/analysis/decision under concurrency, recover a crash after analysis persistence, reuse that analysis with one analyst call, and require independent review with no automatic final authority. |
| Phase 7 cancellation/retry/human waiver | A real committed driver cancellation and a confident raw AUTO_UPHOLD_CANDIDATE do not independently establish causal entitlement in the generic evidence fixture. The shadow result/case require review. Retry/outage/durable-result checks run, then only the explicit synthetic human waiver with displayed evidence version/hash creates the existing permitted human authority. |

The authority is the owner-accepted [8 October independent guard](responsibility-guard-closure-checkpoint-2026-10-08.md), implemented in `responsibilityEvidenceSafety.js` and the shared policy gate. Neither frozen policy nor fixtures' generic recorded facts were weakened or relabelled. These failures were not caused by the Clerk admission remediation.

New shared assertions verify absent automatic final/admin/appeal authority and unchanged booking, wallet, payment, payout, compensation, liability and reliability observations. Phase 7 snapshots compare after business cancellation and before analyst evaluation, so an ordinary cancellation effect is not misclassified as an advisory consequence. The explicit human waiver remains distinct from model authority. Existing duplicate-worker, different-case concurrency, expired-lease recovery, new-evidence versioning, poison-evidence and disabled-backlog paths also execute.

Focused affected suites passed **11/11**. The current broader disposable database suite is genuinely **58/58 PASS**, no skips. **Q4 is VERIFIED_IN_ISOLATION** for these repaired versioned witnesses and all their downstream paths. This is an appended reconciliation; it does not rewrite the historical findings.

## IV. Verification and source epochs

| Check | Executed result |
| --- | --- |
| Current full backend, bounded process concurrency 4 | **1,793/1,793 PASS**, no skips |
| Current broader disposable DB | **58/58 PASS**, no skips |
| SQL/native/seeded mutation suite | **12/12 PASS**, 26 mutants killed |
| Restricted worker after SQL change | **PASS**, 17 checks and 16 denials |
| Backend typecheck / changed regression and runner lint | **PASS / PASS** |
| Paired application backend replay | **37/37 actual tests PASS**, 36 equivalent scenario receipts |
| Replay runtime preservation | **208/208 current backend source hashes** in each of 36 receipts |
| Accepted critical runtime JavaScript | Four source hashes unchanged; prior 100% coverage, 173 mutation identities and structural certificate retained |
| Clerk / frozen V5 | **3/3 / 22/22 source identities unchanged** |

The replay's outer wrapper changed while the long run was executing; its original `sourcesUnchanged:false` flag remains. The selected replay preservation artifact independently checks all actual scenario source hashes, receipt hashes and paired digests against current backend files. The 37 passing tests are not relabelled as an execution of the later wrapper. An earlier passing full suite with wrapper/source drift is likewise retained; a fresh unchanged-epoch full suite supplies the final accepted backend result.

Earlier failures include the new runner's wrong denied-URL constant, a profiler binary that required a symbol absent in PostgreSQL 17.5, archived Debian package retrieval, confusion between extension schema/release versions, an initially correlated stop/epoch mutation probe, and an exact-anchor whitespace mismatch. Their logs/witnesses remain. The stop mutant now independently tests the stop predicate with an owned state-corruption probe while holding epoch constant. No meaningful survivor was waived or mislabeled equivalent.

Critical runtime JS quality remains the previous four-module certificate because those modules were not changed. The new regression/fixture orchestration is linted separately; its lint configuration does not impose runtime complexity thresholds on test orchestration. No new full coverage/complexity certificate over those scripts, historical large routes or all SQL is claimed. Git whitespace validation is retained in the manifest's artifact set.

Frozen V5 remains **`e484afc4c7fa724ea29af6edd962c48b814dc73a10e4f4a5e33833ad26afbe75`**. Live model/provider evaluation calls and live production provider operations are **zero**. Authentication, financial policy, production switches, deployed roles and unrelated dirty-tree edits are preserved. No Vite-cache cleanup, phone operation, commit or deployment was performed.

## V. Remaining implementation and readiness

The complete unchanged/updated criterion list and minimum next actions are in `readiness-gates.json`. This checkpoint does not implement subsequent stages by documentation alone.

1. **SQL certification debt:** enumerate and independently exercise remaining SQL logical subconditions/CASE arms and DDL invariants, expand meaningful mutations, and supply appropriate SQL structural measurement. Native PL/pgSQL execution is verified; aggregate Q2 stays open.
2. **Authorized isolated implementation next:** a bounded export durably derived from the existing committed Phase 7 incident/evidence journal, source-version/ownership verification, supported-family filtering, source-bound interrupted-delivery replay, receiver reconciliation and retry exhaustion. Receiver deduplication is available; the actual export is NOT_IMPLEMENTED.
3. **Offline broker:** separate credentials/import/egress authority; immutable V5 selection; independent deadline, request/concurrency/token/currency limits and atomic stop/dispatch/commit admission. Current fake worker execution does not establish a standalone broker or live transport stop guarantee.
4. **Independent custody:** separate audit service/storage principal, hash/identity/admin-forgery controls, independently observed denials, delivery failure/retry/reconciliation and external retention/anchors. Existing same-database append-only permissions are verified only within that boundary; external custody remains PARTIAL.
5. **Capacity/operations:** production-shaped synthetic authenticated HTTP customer/captain/admin journeys across replicas with a shared rate-limited Clerk emulator, throughput/recovery/latency/error measurements, metrics and alert ownership. Prior guard-only synthetic load remains separate; no weaker revocation contract or real provider overload is authorized.
6. **Policy/external gates:** retain the accepted admission-only in-flight guarantee; finish source-grounded financial/admin/role-change mapping without changing operative semantics. Privacy purpose/disclosure/retention and blind human-review protocol proposals still require explicit approval and independent real labels. Deployed IAM/permissions, monitoring, stopped-first rollout/reconciliation and activation require separate authorization. No real incident collection or Phase 9D-2 is authorized.

Reproduce this completed stage:

```powershell
node tools/phase9d/next-run.mjs sql
node tools/phase9d/next-run.mjs historical
node tools/phase9d/next-run.mjs all-db
node tools/phase9d/next-run.mjs full
node tools/phase9d/next-run.mjs typecheck
```

The profiler vendor inputs are preserved and SHA-checked. No phone is required. The container command remains `node tools/phase9d/continue.mjs capsule`; repeat it only for a changed boundary requiring container proof. A new outbox/broker/audit implementation needs its own tested source epoch and quality closure.

```text
RESPONSIBILITY PHASES 1–8: VERIFIED / COMPLETE FOR APPROVED SCOPE
HISTORICAL PHASE 8.2: RETIRED — NO RECOVERED SCOPE
PHASE 9A / 9B / 9C: COMPLETE FOR APPROVED ISOLATED SCOPE
PHASE 9D-1: PARTIAL
PHASE 9D-2: NOT STARTED
ISOLATED SHADOW CONTAINMENT: VERIFIED FOR SUPPORTED SCOPE
INDEPENDENT AUDIT CUSTODY: PARTIAL
SQL SECURITY CERTIFICATION: PARTIAL
NATIVE EIGHT-ROUTINE PL/PGSQL EXECUTION: VERIFIED_IN_ISOLATION
PRODUCTION_READY: NO
PRODUCTION DEPLOYMENT: NOT AUTHORIZED
PRODUCTION SHADOW / AUTO-ADJUDICATION / CONSEQUENCES / SEARCH ROLLOUT: OFF
PROJECT-WIDE PROOFLOOP / PUBLIC GENERALIZATION: NOT STARTED
```
