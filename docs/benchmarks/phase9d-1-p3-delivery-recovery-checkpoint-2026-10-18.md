# Phase 9D-1 — P3 ordered delivery and bounded recovery

18 October 2026 IST. Continues the [SQL coverage plan](phase9d-1-sql-coverage-plan.md), [P2 checkpoint](phase9d-1-p2-capture-consistency-checkpoint-2026-10-18.md) and [ICR-1 correction](phase9d-1-lineage-ack-checkpoint-2026-10-18.md). **P3 supported delivery/recovery behavior: VERIFIED_IN_ISOLATION. WHOLE-SQL CERTIFICATION: PARTIAL. PHASE 9D-1: PARTIAL. PRODUCTION_READY: NO.**

Evidence: [source-bound manifest](../../output/phase9d-p3-2026-10-18/manifest.json), [P3 acceptance matrix](../../output/phase9d-p3-2026-10-18/acceptance-matrix.json), [native before/after observations](../../output/phase9d-p3-2026-10-18/coverage-comparison-final.json) and [final sequential receipts](../../output/phase9d-p3-2026-10-18/verification-sequence-final.json). Actual execution timestamps remain 17 October UTC; this checkpoint uses local IST.

## Scope and accepted semantics

The measured routines are receiver `custody_export.next()` and `custody_export.retry(uuid,bigint,integer)`, plus `custody_lineage.next()` in the source and receiver installations. **All 15 SQL files remain byte-identical to the task baseline.** No queue semantics, ICR-1 ACK validation, signing implementation, broker accounting, application policy or production configuration was changed.

`next()` selects the lowest sequence whose status is not ACKED. An earliest REVIEW row blocks later rows. Selecting an event counts an attempt before any network delivery; the third selection still returns its frame and records REVIEW, and the fourth selection returns null. Attempt counts alone do not prove a network send succeeded or failed.

Recovery's `expected` argument is the **current attempt count**, not a unique revision or generation. The tests reject a stale count, verify the reset to zero, and exercise repeated cycles that reach three again. They do not claim an ABA-safe revision fence across different REVIEW cycles. Replaying an already committed operation UUID can return true even after exhaustion: it acknowledges the historical operation and does not apply a new recovery transition.

Lineage has no exposed operator retry routine. A valid delayed receipt may still ACK a REVIEW event and unblock later delivery. A lineage REVIEW with no matching valid receipt remains blocked; this batch adds no recovery or redelivery API. The delayed-receipt test submits an already selected retained frame through the existing independent custodian and verifier path, not through a new REVIEW bypass.

## Acceptance matrix and actual behavior

[phase9dCustodyP3.test.js](../../backend/tests/integration/phase9dCustodyP3.test.js) has **17 leaf groups plus their parent**. The same scenarios execute unprofiled and then in fresh profiling-only databases. Assertions read actual persisted PostgreSQL rows and independently committed custody records.

| Requirement | Executed supported result |
| --- | --- |
| Oldest eligible event / chronological order | All three queues select the lowest unacknowledged sequence, skip ACKED history and drain later events in sequence. Ordering is per source queue, not a global cross-service clock. |
| Empty eligible queue | With all retained rows ACKED, next returns null without changing attempts, receipts, commitments or row count. No history was deleted to manufacture an empty table. |
| Three-attempt REVIEW bound | Selections one/two remain PENDING; selection three records REVIEW; a subsequent call returns null. The later event remains PENDING with zero attempts. |
| Actual sender replacement | In each queue an owned sender process selects a frame and is killed with SIGKILL. A fresh process with the same restricted sender role receives the identical event/MAC and advances the persisted attempt count. These are sender-process replacements, not new PostgreSQL-server or host restart proofs. |
| Retained identities / evidence / receipts | Sequence, source event, commitment, local identity and original source-row reference remain unchanged through selection, replacement, recovery and ACK. A previously ACKED event/receipt remains byte-equivalent as a JSON observation while the next event recovers. |
| Authorized operator and denied sender | The actual custody_sender retry gets 42501. The established custody_operator role can recover an eligible REVIEW row; missing rows, stale attempt counts and non-REVIEW targets return false without queue/history changes. |
| Admission capacity | At the existing pending-count cap, recovery returns false. The owned fixture restores its original cap; no production capacity policy changes. |
| UUID idempotency / conflict | Exact operation reuse returns true without another transition. Reuse with another sequence, expected count or authenticated actor returns false. |
| Competing operators | Two distinct authenticated SQL roles on separate connections compete for the same REVIEW transition. Exactly one wins, one recovery/history row is added, and the stored actor is that winner. This does not certify real-human operational ownership. |
| Bounded recovery cycles | Three new recovery transitions are allowed. After another three selections, the event remains REVIEW with attempts=3/recoveries=3. A fresh operation is refused; an old operation's true idempotent reply leaves that exhausted state and history unchanged. |
| Independent delayed ACK | The existing custodian commits the retained event, issues its original durable signed receipt, and unchanged public-key verification validates it. The authorized local verifier ACKs it; independent custody status reports INDEPENDENTLY_VERIFIED. Duplicate remote receipt identity/signature is retained. No ACK gains human-final or financial authority. |
| Lineage scope | Both lineage installations have no retry entry point. Their REVIEW behavior and legitimate delayed ACK path are tested directly; export retry is never used as a lineage substitute. |

The [sender child](../../backend/tests/helpers/phase9dP3Sender.mjs) receives only its synthetic role connection and closed schema choice over IPC. It has no custodian signing material. Its role is checked, its heap is bounded to 128 MiB, and the parent owns termination and cleanup. Database identities, public receipt proofs, recovery operation rows and replacement observations are retained; passwords and private signing keys are not written to witnesses.

### Existing tests reused

- **Original custody integration: 20/20 PASS**, unchanged [phase9dCustody.test.js](../../backend/tests/integration/phase9dCustody.test.js). This supplies existing real failed HTTP sends, retry exhaustion, denied sender/authorized recovery, custodian process death before/after commit, restart/duplicate receipt reconciliation and preserved cleanup/accounting/financial observations.
- **Existing lineage integration: 7/7 PASS**, unchanged [phase9dCustodyLineage.test.js](../../backend/tests/integration/phase9dCustodyLineage.test.js). It retains real synthetic cancellation/export/receiver capture, independent lineage custody and restricted-role assertions under current SQL.
- The competing-operator and bounded-cycle recipe is reused from [phase9dCustodySafety.test.js](../../backend/tests/integration/phase9dCustodySafety.test.js). The new fixture uses that already established `custody_recovery_competitor` role recipe: no superuser/create-role/create-database/inherit/bypass-RLS, schema usage and retry EXECUTE only. This is a disposable test grant; no application/deployed grant was changed. The complete safety file was **not run**, because it includes an unrelated routine-replacement mutation.

Each reused custody and lineage regression run makes one fake offline analyst request: two calls in the selected pair, four across the initial and final regression pairs. Live/paid provider evaluations are zero. The new P3 queue tests make no analyst request. P2's 22/22 behavior and 22/22 profiling, ICR-1's 13/13, custody units 31/31 and the historical full backend 1,865/1,865 remain results at their own source epochs. Those completed campaigns were not repeated or relabelled here.

## Native profiling: four routine/installation observations

The dedicated `p3-profile` invocation creates fresh disposable infrastructure; it does not profile the earlier behavioral databases or the legacy regressions. Counter reset follows baseline fixture/role installation. The pinned image/profiler provenance is reconciled with P2: PostgreSQL **17.5**, profiler extension schema **2.10**, source **v2.10.4**, commit `c882056fac65532dee95fc174c4fdc0cc0965293`. See [runtime provenance](../../output/phase9d-p3-2026-10-18/profiler-provenance.json).

[phase9dP3Profile.js](../../backend/tests/helpers/phase9dP3Profile.js) retains raw native statement trees and both coverage API ratios. For these exact bodies the pinned algorithm counts visible `lineno > 0` statements and IF then/implicit-else branches. Reconstructed counts must match both native APIs. No SQL Boolean-expression, CASE or DDL denominator is invented.

“Before” is the existing saved custody native measurement, not a claim these functions had no earlier passing behavioral tests. Each current definition matches that historical definition after line-ending normalization. “After” is the selected P3-only profiling window. Newly observed counts below are not summed into a whole-SQL score.

| Routine / installation | Before statements | After statements | Newly observed | Before branches | After branches | Newly observed |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `custody_export.next()` / receiver | 0/6 | **6/6** | 6 | 0/2 | **2/2** | 2 |
| `custody_export.retry(...)` / receiver | 0/13 | **13/13** | 13 | 0/6 | **6/6** | 6 |
| `custody_lineage.next()` / source | 0/6 | **6/6** | 6 | 0/2 | **2/2** | 2 |
| `custody_lineage.next()` / receiver | 0/6 | **6/6** | 6 | 0/2 | **2/2** | 2 |

There are **no unhit visible statements or native procedural branches in this four-entry measurement**. This does not certify every input, fault schedule or SQL subcondition. In particular:

- Native next coverage has only a single procedural IF; it does not itself distinguish no eligible row from REVIEW, ACK filtering, chronological ORDER BY, concurrent network dispatch or the embedded status CASE. Persisted-state assertions supply the stated normal/empty/REVIEW/order outcomes.
- Retry's three IFs contain multiple SQL Boolean operands. Positive reuse and sequence/count/actor conflicts, stale attempt count, missing/non-REVIEW rows, pending admission and exhausted recovery are tested; exhaustive NULL/malformed arguments and independent truth-table coverage of every operand are not claimed.
- Attempt-count CAS does not become a unique generation fence because both native branch ratios are one. Row locking, selected competing-session outcomes and UUID history do not establish distributed exactly-once delivery or cancellation of an already selected send.
- Export retry exists in the receiver only. Lineage is tested in both actual service compositions without fabricating an operator API. There is no opposite-service branch to force in these shared next bodies.
- Catalog owners, SECURITY DEFINER, explicit search paths, execute ACLs and denied table writes remain separate observations. Before/after catalogs match within each fixture. The competitor's existing test-recipe EXECUTE grant is an intentional fixture ACL difference from the historical catalog, not a change to the SQL definition or production grants.

No routine-replacement mutation or security campaign runs in either selected P3 environment. The historical profiler signal-11 finding remains unresolved; a successful profiling-only run does not diagnose it. Full SQL-expression, DDL/default-privilege, structural and meaningful-mutation adequacy remain separate work. P2's unmeasured invalid-lineage outcome and its installation-specific exclusions remain intact.

## Actual selected verification and source binding

| Check | Selected result |
| --- | --- |
| P3 unprofiled behavioral integration | **18/18 PASS**, no skips |
| Fresh P3 profiling-only integration | **18/18 PASS**, no skips |
| Existing custody integration | **20/20 PASS**, no skips |
| Existing lineage integration | **7/7 PASS**, no skips |
| Backend typecheck | **PASS** |
| Scoped lint | **4 files; zero errors/warnings** |
| Scoped Git / new-file whitespace | **PASS** |
| SQL source preservation | **15/15 unchanged** |
| Original local/staged/archive/HEAD preservation | **19/19 local and 23/23 staged contents; archive and HEAD unchanged** |
| Accepted auth / frozen V5 / original custody | **3/3 / 22/22 / 28/28** match in both worktrees |

The initial P3 pair and affected regressions passed, but a source-scope audit found the dynamically launched sender child missing from static dependency discovery. The runner now explicitly binds that child. Earlier PASS receipts and their original source scopes remain; they are not selected as the final P3 source certificate. The final sequence reruns the narrow P3 pair and affected regressions with that binding. Selected receipts record unchanged sources during each execution and final readback checks every bound file against current bytes. The actual child source is among those hashes.

Post-process readback caught the finalizer's stdout changing after its initial inventory was hashed. The before-settlement manifest/validation and observed difference are retained. Final inventory is rebuilt after that process ends; test executions and counters are unchanged. This checkpoint's fake-call tally also distinguishes both reused regression suites and the initial/final pairs explicitly.

| New/changed code | SHA-256 |
| --- | --- |
| `backend/tests/integration/phase9dCustodyP3.test.js` | `b7bcc67815e471aad30a2c8e5b94d9b708785d7ab315cd50692b7542811d3dbd` |
| `backend/tests/helpers/phase9dP3Profile.js` | `cd382108b5722692d60b9586f1816672a8b71595d8ddef9f1f5b88937ba2fe9c` |
| `backend/tests/helpers/phase9dP3Sender.mjs` | `c4ff22b9035c50a3eb370e8f806d4e6ed008259bd72c910c055e2adca8c534ae` |
| `tools/phase9d/closure-run.mjs` | `16bb2195e39f80cfc49927e3fabbefd9d5109e12c43905823a478ea1996cef94` |

The runner's preserved before hash is `77363a5f90ba75994ecb2c129f7f92de7ed27366dc8888c223d896078154c53b`. Its changes add P3 dispatch/profiling modes and inventory entries only. The manifest separately hashes this checkpoint, acceptance matrix and execution tooling. No existing P2, ICR-1, custody/lineage fixture or regression source was edited. The staging index and all unrelated working files remain unchanged.

Catalog definition hashes are `c8aebfcdaa69c25fcf59d6c7df1a0f790b49d09350eafed09e09b0b124989339` for export next, `5976ab671ffa9bec3d326d5d8c27daf1b71a2e523678dcb1860c5b50aefdffbd` for export retry, and `44a8109306e06e4d5b9abac93f45568994d2dd52ab4e03a5f4e2ec8d614dd1ce` for lineage next in both installations. The lineage definition's normalized LF hash is retained separately, not substituted for its raw identity. Full definitions and ACL/search-path metadata are in the selected witness.

Host monitoring remains scripted under the existing owner rule: RAM admission/abort thresholds disabled, other deadlines and execution controls retained. [Monitoring](../../output/phase9d-p3-2026-10-18/host-observer-summary.json) and [owned-fixture cleanup/readback](../../output/phase9d-p3-2026-10-18/cleanup-readback.json) record actual results. Same-host sampling cannot prove the absence of a complete OS freeze. No unrelated process, service, container, volume or cache was removed to obtain a pass.

## Required P4 follow-up — not executed

P4 should verify actual source/receiver acceptance and binding: valid/duplicate delivery, existing-key conflict, foreign evidence/source/owner/configuration, malformed/oversized/incorrect-MAC input and the private receive alias's denied grant. Match the installed `transport9d.receive()` wrapper and `receive_committed()` separately; do not transfer old-body counters to the wrapper. Review relevant source remote-payload/receipt/ACK/cleanup helpers and SQL-language receipt predicates where those dependencies are exercised.

Reuse the existing transport and lineage cases first, add only missing deterministic persisted-state assertions, and collect native counters in a fresh profiling-only fixture. SQL-expression truth tables and catalog/constraint observations remain separate from native procedural counts. Any later approved mutation work must use another unprofiled database/process. The transport file includes an existing mutation block; do not run its whole file as a profiling workload.

**P3 is complete for the stated isolated behavior and native metric. P4 was not started. Whole-SQL certification and Phase 9D-1 remain PARTIAL.** Frozen V5 remains `e484afc4c7fa724ea29af6edd962c48b814dc73a10e4f4a5e33833ad26afbe75`. No full backend run, P2 profiling repeat, restricted capsule campaign, JavaScript mutation campaign, live incident collection, live model/provider evaluation, authentication/policy change, commit, push, merge, deployment or production activation occurred. Production remains OFF.
