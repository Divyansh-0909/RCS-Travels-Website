# Phase 9D-1 — P2 committed capture and consistency

18 October 2026 IST. Continues the [SQL coverage plan](phase9d-1-sql-coverage-plan.md), [ICR-1 checkpoint](phase9d-1-lineage-ack-checkpoint-2026-10-18.md) and [custody verification checkpoint](phase9d-1-custody-verification-checkpoint-2026-10-18.md). **P2 supported capture/consistency behavior: VERIFIED_IN_ISOLATION. WHOLE-SQL CERTIFICATION: PARTIAL. PHASE 9D-1: PARTIAL. PRODUCTION_READY: NO.**

Evidence: [source-bound manifest](../../output/phase9d-p2-2026-10-18/manifest.json), [before/after native counts](../../output/phase9d-p2-2026-10-18/coverage-comparison.json), [actual profiling witness](../../output/phase9d-p2-2026-10-18/p2-native-witness-f7477b5e-4956-4c30-9556-2de105b3b5d4.json), and [sequential execution receipts](../../output/phase9d-p2-2026-10-18/verification-sequence.json). Executions retain their original 17 October UTC timestamps; this checkpoint uses the local IST date.

## Scope and unchanged baseline

The five routines are `custody_lineage.capture()`, `capture_existing()`, `capture_status()`, `committed_rows()` and `emit(text,text,text,jsonb,text)`, measured separately in the source and receiver databases. **No SQL source, SQL function, permission, signing implementation or ICR-1 ACK validation was changed.** All 15 SQL source hashes match the start of this task. This is a test and measurement continuation.

The existing [lineage integration test](../../backend/tests/integration/phase9dCustodyLineage.test.js) and [fixture](../../backend/tests/helpers/phase9dCustodyLineageFixture.js) are unchanged. Its six leaf groups and parent were reused as **7/7 PASS** at the new source epoch. They exercise real synthetic cancellation and committed journal observation, actual outbox INSERT/change and transport/receiver INSERT capture, offline broker/guard usage, independent custody, restricted-role denials, ordinary versus REPEATABLE READ status, and deletion/gap detection. No duplicate broker, signing or custody architecture was added.

ICR-1's **13/13**, custody units **31/31** and the earlier backend **1,865/1,865** remain accepted results at their recorded epochs. Those suites were not rerun in this batch. Their sources and preserved evidence remain unchanged; this report does not relabel them as P2 executions.

## Added persisted-state regression cases

[phase9dCustodyP2.test.js](../../backend/tests/integration/phase9dCustodyP2.test.js) adds twenty-one leaf groups and a parent. The same deterministic scenarios run first without profiling and then in fresh profiling-only databases. Ordinary tests assert actual PostgreSQL rows and actual restricted-inspector observations; no mock SQL responses establish these results.

| Family | New assertion and existing reuse |
| --- | --- |
| Trigger composition | Source has outbox INSERT/UPDATE and audit INSERT triggers; receiver has receipt INSERT, work INSERT/UPDATE, audit INSERT and retry INSERT triggers. Enabled states and definitions match before/after. No booking/payment trigger is added. |
| Committed INSERT and rollback | Audit INSERT and its capture are in the same local transaction. Another connection sees no capture before commit; afterward the persisted event matches the original row hash. A rolled-back insertion leaves no capture/head change. Existing lineage reuse covers actual outbox and receiver-work INSERTs. |
| Changed / unchanged UPDATE | A source outbox change and receiver work change each add exactly one matching retained-row commitment. Updating the same value adds no capture or head change. |
| Receiver-only INSERT arms | Bounded synthetic receipt and retry-table inserts produce RECEIPT_ACCEPTED and RECOVERY_AUTHORIZED with exact original-row commitments. These trusted fixture writes test capture, not transport/recovery authorization. |
| Snapshot consistency | Default isolation returns CONSISTENCY_SNAPSHOT_REQUIRED. A REPEATABLE READ inspector retains the same status snapshot while another connection commits an audit/capture pair; a fresh snapshot sees the extra inspected row. SERIALIZABLE read-only inspection is also accepted. |
| Missing committed row | A trusted fixture controller temporarily disables its audit capture trigger, commits one synthetic original row, and re-enables the trigger. The intact capture chain still reports UNCAPTURED_COMMITTED_SOURCE with one missing row. Later `capture_existing()` adds one observer event; a second call adds nothing. Its integer result counts inspected originals, not newly created captures. |
| Sequence/source/hash/head | Seven separately rolled-back owner probes test missing sequence, wrong event sequence, source, previous commitment, event hash, control sequence and control head. Event-field probes recompute the event commitment, so detection is not merely a stale content hash. Sequence errors and headMismatch results are asserted separately. |
| Source-only expectation | Omitting a SOURCE_LINEAGE observation and rebuilding a consistent synthetic capture chain still reports missing committed source evidence. Original application journals remain intact. This probe is not run under a false receiver service identity. |
| Emit identity and deferral | Exact emit replay reuses one sequence; conflicting original content raises 23514. Capacity/deferred admission raises 54000. A committed synthetic CONTROL observation records deferred state without changing the event sequence/head; an independent inspector observes DEFERRED_CAPTURE. Restoration is trusted fixture cleanup, not a new recovery API or a new STOP policy. |
| Inspection limits | Bounded fixtures test retained-original enumeration at 1,000/1,001 rows, the source's additional expected-source inspection, `capture_existing()`'s 54000 bound, and the separate 1,001-captured-event limit. These are limit-plus-one regression fixtures, not prolonged stress or host ENOSPC experiments. |

Current-row backfill is a **later observation**, not proof that every earlier mutation was captured. In the audit backfill test its actor is `trusted_observer`; original trigger capture uses `application_transaction`. That actor distinction is not a universal temporal proof: the existing deferred `capture_committed()` also supplies `application_transaction` for SOURCE_LINEAGE. Producer path and original committed journals remain necessary context. Intermediate states erased before observation, or simultaneous suppression of both original occurrence and capture by a trusted owner, are not reconstructed.

## Dedicated native profiling and precise counts

The selected `p2-profile` execution creates a fresh server pair and its own disposable source/receiver fixture, loads the pinned profiler and resets its counters after fixture installation. It does not reuse the ordinary test databases. PostgreSQL is **17.5**, profiler extension schema **2.10**, source tag **v2.10.4**, commit `c882056fac65532dee95fc174c4fdc0cc0965293`. The SHA-pinned vendor archive, Docker recipe, exact routine definitions, raw native trees/counters and coverage APIs are retained.

[phase9dP2Profile.js](../../backend/tests/helpers/phase9dP2Profile.js) reconstructs visible statements and first-statement branch outcomes for the exact five routine shapes, including ELSIF/explicit ELSE and FOR bodies. It checks both native API ratios against the resulting numerator/denominator pairs. The retained [profiler implementation excerpt](../../output/phase9d-p2-2026-10-18/profiler-coverage-algorithm.txt) and [source fingerprint](../../output/phase9d-p2-2026-10-18/profiler-source.json) define this metric.

“Before” is the original saved custody native window, not an assumption that a zero meant an unused routine. Each definition matches the current catalog after normalizing LF/CRLF. “After” is only the new P2 profiling window. Counts are neither summed across installations nor presented as a whole-SQL percentage.

| Installation / routine | Before statements | After statements | Before branches | After branches |
| --- | ---: | ---: | ---: | ---: |
| Source / `capture()` | 0/17 | **14/17** | 0/9 | **5/9** |
| Source / `capture_existing()` | 7/8 | **8/8** | 2/3 | **3/3** |
| Source / `capture_status()` | 0/28 | **28/28** | 0/21 | **20/21** |
| Source / `committed_rows()` | 4/7 | **4/7** | 1/2 | **1/2** |
| Source / `emit(...)` | 16/22 | **21/22** | 5/10 | **9/10** |
| Receiver / `capture()` | 0/17 | **13/17** | 0/9 | **6/9** |
| Receiver / `capture_existing()` | 7/8 | **8/8** | 2/3 | **3/3** |
| Receiver / `capture_status()` | 0/28 | **22/28** | 0/21 | **15/21** |
| Receiver / `committed_rows()` | 6/7 | **6/7** | 1/2 | **1/2** |
| Receiver / `emit(...)` | 14/22 | **21/22** | 3/10 | **9/10** |

### Remaining unhit paths and measurement boundaries

Statement IDs below refer to the saved native routine-body tree, not repository line numbers.

- Source `capture()`: statements **12–14** are the receiver receipt/work/retry action assignments, outside the source trigger composition. Its corresponding three branch arms are unhit. The fourth missing native branch is the false outcome of the outbox source's `lineageValid` check: ordinary supported export supplied valid journal lineage. That rejection/absence outcome remains **unmeasured**, rather than being declared impossible by SQL constraints or forced using a fabricated service mode.
- Receiver `capture()`: statements **8–11** and three branch outcomes belong to the source outbox/lineage arm; the receiver installs no outbox capture trigger. No source table was fabricated in the receiver to obtain these counters.
- Source `capture_status()`: all visible statements execute. The unhit branch is the source-service IF's implicit receiver outcome. Receiver `capture_status()` leaves statements **22–27** and six branch outcomes in that source-only expectation block unhit.
- Source `committed_rows()` leaves receiver RETURN QUERY statements **5–7** unhit; receiver leaves source RETURN QUERY statement **4** unhit. The service IF has only its valid side executed in each installation.
- `emit(...)` leaves the opposite service's configuration SELECT unhit: statement **17** in source and **16** in receiver, one branch each. `capture_existing()` has no unhit statement or branch under this native metric.

Native coverage does not measure the individual AND/OR operands, NULL three-valued predicates, WHERE/EXISTS/COALESCE conditions, JSON scalar distinctions or embedded SQL CASE arms. For example, native capture counters do not distinguish OUTBOX_CREATED from OUTBOX_CHANGED or WORK_ADMITTED from WORK_CHANGED; the reused integration assertions and new persisted-row assertions supply the stated behavioral evidence. Independently varying every expected-source identity/evidence predicate, every optional owner/provenance input and every invalid projection remains outside this batch's numerical claim. No SQL-expression truth-table, whole-SQL structural or mutation certificate is inferred.

Trigger attachment/enabled state, owner, SECURITY DEFINER, STABLE classification where applicable, search paths and execute ACLs are separate catalog observations. The five definitions and metadata match before/after each fixture; each installation matches its historical definitions after line-ending normalization. `emit` legitimately substitutes `outbox9d` versus `transport9d` crypto/configuration dependencies. No cross-service percentage or false installation mode is used to erase those differences.

## Actual results, source epoch and preservation

| Selected check | Actual accepted result |
| --- | --- |
| New P2 behavior, profiling off | **22/22 PASS**, no skips |
| Fresh P2 profiling-only fixture | **22/22 PASS**, no skips; ten routine/installation observations |
| Existing lineage integration, unchanged | **7/7 PASS**, no skips |
| Backend typecheck | **PASS** |
| Scoped lint | **3 files; zero errors/warnings** |
| Scoped Git / new-file whitespace | **PASS** |
| Original repository preservation | **19/19** local files, **23/23** staged contents, archive and HEAD unchanged |
| Accepted auth / frozen V5 / original custody | **3/3 / 22/22 / 28/28** identities match in both worktrees |

All selected receipts bind the executed source graph, migration inputs, container image/version and log identities and record `sourcesUnchanged: true`; final readback checks those bound files again. An earlier **22/22** P2 run predates the additional independent committed-deferral assertion and final trigger readback. It is retained at its own epoch and is not substituted for the selected run. Historical evidence is neither overwritten nor rehashed as a new execution.

Initial manifest builds stopped on an ambiguous `selected-p2-*` pattern and a Windows default-encoding read of this UTF-8 checkpoint. Original builders and failure annotations are retained. Final selection checks each wrapper's recorded mode and exact receipt hash, and text reads specify UTF-8; no test outcome changed.

The dedicated profiler run reports no crash/recovery observation in its selected server diagnostic projection. The historical PostgreSQL profiler signal-11 defect remains **unresolved**. No routine-replacement mutation, SQL mutation campaign or active-function replacement experiment ran. Baseline schema composition precedes the counter reset; after installation the probes change bounded fixture rows/trigger state only, then verify restoration. Native profiling and future mutation execution must continue to use separate processes/databases.

| New or changed implementation file | SHA-256 |
| --- | --- |
| `backend/tests/integration/phase9dCustodyP2.test.js` — new regression file | `2fee76fb8419c192e2206428c70de3704d6a4867f26c8307a922fc753f0f434c` |
| `backend/tests/helpers/phase9dP2Profile.js` — new scoped collector/denominator reconciliation | `4c285a156b6271265309817f7710c673e57f7a3e533651015d2003013f78faf7` |
| `tools/phase9d/closure-run.mjs` — add P2 modes and source inventory | `77363a5f90ba75994ecb2c129f7f92de7ed27366dc8888c223d896078154c53b` |

The runner's preserved before hash is `d0f1ccaece9631dc4b7232f91a8daf244590fe892e227db0238be599aa1e26af`. The manifest records this checkpoint and new evidence/orchestration files separately. Only the runner changed among the **1,924** pre-existing working files inventoried at task start. The staging index is unchanged. All original SQL, ICR-1, fixture, Clerk, frozen V5, business policy, broker accounting, guard and production configuration sources remain unchanged. Financial application observations remain equal to the fixture's post-incident baseline.

Host checks ran as scripts under the existing owner rule: RAM admission/abort thresholds disabled, deadlines and existing execution controls retained. [Monitoring](../../output/phase9d-p2-2026-10-18/host-observer-summary.json) and [cleanup readback](../../output/phase9d-p2-2026-10-18/cleanup-readback.json) contain the actual observations. Same-host samples cannot prove the absence of a complete OS freeze. No unrelated app/service was terminated, existing volume pruned, or production setting changed.

## SQL status and the next P3 requirements

P2's supported committed capture, omission detection, snapshot, deduplication, deferral and inspection-bound cases are verified in isolation. Its native metric is now explicitly measured for both compositions; the unexecuted source invalid-lineage outcome and SQL-expression adequacy remain documented. **Whole-SQL certification remains PARTIAL.** Existing readiness rows, external trust/privacy/retention/capacity gates and historical reliability findings are preserved.

P3 is the next separately requested group, not part of this execution:

1. Exercise actual `custody_export.next()` and each installation's `custody_lineage.next()`: normal next, empty queue, chronological delivery, earliest REVIEW blocking later work, and attempts through the three-send REVIEW limit.
2. Reuse the original custody and safety scenarios for the real `custody_export.retry()` API: denied sender, authorized operator, stale CAS, exact UUID operation reuse, conflicting reuse, competing operators and bounded recovery cycles. Match current source/catalog identities first.
3. The lineage schema has no equivalent exposed operator retry API. Do not invent lineage recovery semantics or use export retry as its substitute.
4. Collect next/retry native counters in a separate profiling-only fixture; keep any future routine-replacement work in another unprofiled database/process. Preserve original receipt/work identities and unchanged application authority.

Reproduce this batch with a fresh output directory and the existing owned database safeguards:

```powershell
$env:CUSTODY_OUTPUT = 'output/phase9d-p2-fresh'
node tools/phase9d/closure-run.mjs p2
node tools/phase9d/closure-run.mjs p2-profile
node tools/phase9d/closure-run.mjs lineage
node tools/phase9d/closure-run.mjs typecheck
```

Frozen V5 remains `e484afc4c7fa724ea29af6edd962c48b814dc73a10e4f4a5e33833ad26afbe75`. No live model/provider evaluation, real incident collection, capsule campaign, full backend run, commit, push, merge or deployment occurred. Production remains OFF. **Stop after P2; P3 and broader certification were not started.**
