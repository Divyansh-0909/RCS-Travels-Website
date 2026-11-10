# Phase 9D-1 — P6 PostgreSQL crash diagnostic

18 October 2026 IST. Continues the [P6 checkpoint](phase9d-1-p6-key-epoch-checkpoint-2026-10-18.md), [SQL plan](phase9d-1-sql-coverage-plan.md) and earlier outbox/recovery/native profiling findings. Original timestamps below are UTC.

**Diagnostic complete for the bounded investigation. P6 native profiling remains INCOMPLETE. Root cause is not conclusively identified. Phase 9D-1 / whole-SQL certification remain PARTIAL. Production remains OFF.**

Evidence: [source-bound manifest](../../output/phase9d-p6-crash-diagnostic-2026-10-18/manifest.json), [analysis/plan written before execution](../../output/phase9d-p6-crash-diagnostic-2026-10-18/analysis-before-execution.md), [original failure analysis](../../output/phase9d-p6-crash-diagnostic-2026-10-18/original-failure-analysis.json), [new execution receipt](../../output/phase9d-p6-crash-diagnostic-2026-10-18/serial-diagnostic-receipt.json), [query transcript](../../output/phase9d-p6-crash-diagnostic-2026-10-18/query-transcript.jsonl), [findings](../../output/phase9d-p6-crash-diagnostic-2026-10-18/diagnostic-findings.json).

## Conclusion and evidence limits

One reduced serial diagnostic passed with profiling OFF. Its fresh counterpart with profiling ON returned the expected nested `GAP` exception, then ingestion backend **PID 826** crashed with signal 11 on the valid retry. **Concurrent ingestion/rotation is not necessary for this reduced failure.** No concurrent diagnostic or further reproduction was run after that crash.

This implicates active native profiling in the pinned environment and narrows the investigation to the nested rejection/retry path. It does not identify a faulty C instruction/library, prove the original two crashes had the identical native cause, or establish an upstream fix. No product SQL change or test assertion correction is justified by the available evidence.

## 1. Both original P6 failures

| Original execution | Failure / recovery timeline UTC | Known process and operation |
| --- | --- | --- |
| `p6-profile-1792321404774-934e7c9e-d52a-47fd-878f-b2a70592b87a` | Started 11:03:26.578; signal 11 at **11:03:58.632**; recovery 11:03:58.736; ready 11:03:59.746; receipt finished 11:04:00.727 | Independent custodian server `cb57e6…`; client stack at `phase9dCustodyP6.test.js:104:118`, the retry of `custody.ingest($1)`. Exact terminated backend PID unavailable. |
| `p6-profile-1792321591490-0f5a0daa-b437-4846-839e-54260178f710` | Started 11:06:33.168; signal 11 at **11:07:05.783**; recovery 11:07:05.826; ready 11:07:06.686; receipt finished 11:07:07.851 | Independent custodian server `f613b8…`; same client retry callsite. Exact terminated backend PID unavailable. |

Both source-stable receipts report nine passing tests and two failed tests, including the failed leaf and parent. The first nine groups completed. These counts do not include unexecuted later groups as passes or skips. The corresponding receiver/source PostgreSQL server did not report the same crash.

The existing `serverDiagnostics()` projection exports the JSON log row's `pid`, which is **reporting postmaster PID 1** for these signal messages. It does not extract the terminated child PID embedded in the message. Raw logs have retained SHA-256 commitments but were not exported; their omitted fields cannot be reconstructed from hashes. Failed-witness PIDs 1114/1115 and 1050/1051 belong to the preceding competing-rotation group, not the failed ingress backend. No exact original faulting PID or C stack is claimed.

### Source-grounded operation sequence

The [unchanged P6 test](../../backend/tests/integration/phase9dCustodyP6.test.js#L101) performs:

1. Source broker RESUME creates retained frame sequence 3.
2. The custodian owner begins a transaction and locks its ACTIVE signing key `FOR UPDATE`.
3. The actual restricted ingestion connection starts `SELECT custody.ingest($1) value` asynchronously.
4. The owner polls that ingress PID's `pg_stat_activity` until it reports a `Lock` wait, rotates the signing epoch in the owner transaction, then commits.
5. The test awaits the first ingress result. If it errored, it asserts SQLSTATE 23514. It then retries `accept(frames[2])`, whose JavaScript helper calls `custody.ingest`, on the same ingestion connection.
6. Only after that retry succeeds would the test sign, propagate public enrollment, ACK and inspect independent status.

Both saved stacks identify step 5's retry await, not merely the test-group label or later signing call on the same long source line. Reaching that expression implies the first attempt produced an error and passed the 23514 assertion. Its message/context was not retained, so **KEY_EPOCH_CHANGED is a hypothesis for the original rejection, not an observed reason**. The original evidence does not pinpoint the SQL statement/C frame that segfaulted during the retry.

### Transactions and locks

| Routine | Relevant unchanged SQL |
| --- | --- |
| `custody.ingest(jsonb)` | Locks the enrolled source row `FOR UPDATE`, validates contract/MAC, selects ACTIVE key `FOR SHARE`, calls nested `custody.accept(...)`. |
| `custody.accept(jsonb,text,text)` | Locks the source row, looks up an existing event; for a new event, locks the selected ACTIVE key `FOR SHARE`, rejects missing/retired key, checks sequence/head, inserts event and updates source head. |
| `custody.rotate(text,text,bigint)` | Locks latest epoch `FOR UPDATE`, validates expected epoch/key material and unsigned receipts, retires the old ACTIVE key and inserts the new epoch/history. |

The test observes a generic Lock wait, not an exact original `pg_locks` object. These definitions support the key-row wait interpretation. Snapshot/row recheck behavior can leave admission needing a retry, but no saved snapshot proves the precise original 23514 path.

Both failing modes used global `shared_preload_libraries=plpgsql_check` and profiler ON. The accepted 15/15 unprofiled run used the same image without those preload/on startup options. Restricted connections inherit startup defaults; the P6 owner-setting assertions pass before workload. Thus the failing routines were invoked under enabled profiling and initially blocked during the first call. **The fault appears on the subsequent retry**, not an observed crash while waiting. The coverage collector runs only after all P6 groups; it had not been invoked in either original failure.

## 2. Historical comparison and hypotheses

The [outbox checkpoint](phase9d-outbox-checkpoint-2026-10-13.md) records signal 11 during an injected nested receiver trigger error; the same failure/retry case passes with session profiling disabled for that window. A retained original log identifies backend **838**, 13 October 2026 **08:18:44.383 UTC**. Its [sanitized projection and original-log hash](../../output/phase9d-p6-crash-diagnostic-2026-10-18/historical-outbox-projection.json) were recorded by this review without changing that log.

The [recovery checkpoint](phase9d-broker-recovery-checkpoint-2026-10-14.md) records a profiler-enabled crash after a cleanup/variable error. The [cloud checkpoint](phase9d-1-audit-custody-cloud-report-2026-10-16.md) records a crash during routine replacement. That cloud raw execution directory is unavailable locally; this diagnostic does not invent a native stack or equate its binary epoch to the current image. Historical activity shares profiling and error/changed-routine paths; it does not establish a common native cause. P2–P5 passing native windows remain valid for their recorded scopes.

| Hypothesis | Evidence and remaining uncertainty |
| --- | --- |
| Profiler/plugin error-unwind, cached expression or transaction-state defect | Stronger after the serial ON crash immediately following nested error, paired serial OFF pass and similar historical error activity. No stack identifies an extension instruction. |
| Shared-statistics / transaction-end cache interaction | Runtime has both `use_shared_stats_when_it_possible=on` and `use_lxcache=on`. Pinned source defines transaction-end cache hooks; relevant but untested as the cause. No cache setting was changed. |
| Concurrent rotation required | **Not required by the new reduced reproducer.** Original concurrent behavior may still exercise a related or different failure. |
| PostgreSQL core / SPI / PL/pgSQL plan behavior under instrumentation | Still possible. No native backtrace, symbolized fault or corrected build comparison distinguishes this from extension behavior. |
| Harness lifecycle/assertion defect | No demonstrated defect requiring a fixture correction. The reduced test omits the original full fixture, children, source queues and concurrency yet reproduces a server segfault. That reduces reliance on those harness features; it does not validate every harness detail. |
| Resource pressure | Monitored responsiveness and commit headroom remain available; observed signal is 11, not a captured OOM termination. Kernel/OOM accounting and native memory diagnostics were not collected, so resource involvement is not categorically excluded. |

Pinned source excerpts are preserved for review. The source's actual `use_lxcache` default is true; its README still describes a false default. Observed configuration and compiled source take precedence over that README sentence. This documentation discrepancy is not a demonstrated crash cause.

## 3. Bounded diagnostic execution

The [plan](../../output/phase9d-p6-crash-diagnostic-2026-10-18/analysis-before-execution.md) was hashed before execution. Only two small serial variants ran, using one fresh disposable PostgreSQL server at a time, the existing three custodian SQL files, existing protocol/signing helpers and existing collector. The full 15-test P6 campaign, concurrent profile race and application migrations were not rerun.

Both variants preload the extension early; profiling is OFF during normal schema/role installation. After installation and counter reset, owner/ingest/signer sessions explicitly use OFF in the control or ON in the profiling variant. Actual backend PIDs and settings are saved. No routine replacement occurs after installation.

Each variant enrolls disposable source/key material, admits/signs one event, rotates serially, submits a correctly MACed but gapped sequence, then retries the valid next event. The control additionally reaches a retired-key rejection, exact duplicate admission and final persisted-count/catalog checks. There is **no overlapping rotation transaction** in this reduced workload. The small synthetic source frame derives from a public accepted fixture event; no application/customer evidence or production database is involved.

| Variant | Result |
| --- | --- |
| Preloaded extension, profiling OFF | **PASS**. Two events, two signatures and one rotation persisted; expected GAP and retired-key 23514 errors; valid retry/duplicate succeeds; eight catalog definitions unchanged. |
| Fresh server, profiling ON | Initial admission/signature and serial rotation succeed. Five native routine observations are saved before the error probe. GAP returns 23514; the same ingestion backend crashes on the valid retry. Remaining retired-key/duplicate/final collection assertions are not reached. **FAIL / INCOMPLETE**. |

These are two diagnostic variants, not a new 15/15 P6 certificate. The process guard exits 1 because the second variant fails. No extra diagnostic was launched after the one new server crash; the planned crash budget was respected.

### New sanitized timeline — UTC

| Time | Observed event |
| --- | --- |
| 11:45:42.735 | Profile-variant server ready. Session PIDs: controller **825**, ingestion **826**, signer **827**; all three workload profiler settings ON. |
| 11:45:43.259 | Serial rotation returns successfully. |
| 11:45:43.317–.320 | Ingestion 826 submits `INGEST_GAP_ERROR` and returns SQLSTATE **23514**, reason **GAP**. Native error origin: `pl_exec.c`, `exec_stmt_raise`, line 3911. Context: `accept(jsonb,text,text)` body line 13, nested `ingest(jsonb)` body line 18. This is the expected SQL exception, not a segfault backtrace. |
| 11:45:43.322 | Same backend 826 starts `INGEST_AFTER_ERROR_RETRY`, the valid next frame. |
| 11:45:45.348 | Client connection closes; postmaster reports **terminated backend PID 826, signal 11** and terminates peers. |
| 11:45:45.351–.380 | Server reinitializes and enters recovery. |
| 11:45:45.826 | Server ready again. A fresh recovery inspection reports `pg_is_in_recovery=false`, one event and one signature. No broad restart/restore certificate follows from this count-only readback. |

The new projection extracts the terminated child PID separately from the reporting PID. Query labels/backend identities come from the owned client transcript; SQL parameters, raw DETAIL and signing material are excluded. Raw log bytes are not exported. Commitments are `5d504769f8ea50301cd47743c5ffac895d01c92bc8f9ea513602dfdec85f140e` before the final recovery readback and `49092b73e8bcc0c497d3df93c46d34afdd25348aa28577c13415f43da6349fb1` afterward. No faulting C stack is available.

### Saved positive-prefix counters

[Raw native trees and prefix observations](../../output/phase9d-p6-crash-diagnostic-2026-10-18/serial-prefix-coverage.json) were written before GAP/retry. Exact compiled shapes reconcile with both native APIs. They represent the successful prefix of a later failed profiling execution; they do not certify its error paths or replace the missing full P6 measurement.

| Custodian routine | Historical S / B | Serial positive-prefix S / B | After error/retry |
| --- | --- | --- | --- |
| `accept(...)` | 11/16; 4/10 | **11/16; 4/10** | Unavailable |
| `ingest(jsonb)` | 9/12; 3/6 | **9/12; 3/6** | Unavailable |
| `rotate(...)` | 0/12; 0/6 | **9/12; 3/6** | Unavailable |
| `store_signature(...)` | 7/9; 2/4 | **7/9; 2/4** | Unavailable |
| `valid_event(...)` | 22/34; 20/32 | **18/34; 16/32** | Unavailable |

S/B are visible native statements / procedural branch outcomes. The smaller valid_event prefix samples a narrower input set; its lower count is not a source regression or a merged whole-SQL percentage. Prefix unhit IDs are retained, not declared unreachable. SQL-language `active_key`, `signable`, `serialize`, embedded Boolean expressions and DDL/ACL invariants have no invented native denominator. The receiver ACK routine is outside this custodian-only diagnostic.

The prefix collector introduces API reads absent from the original pre-crash P6 window. Therefore this reduction is not an exact replay of the original. Original crashes before collector invocation show that explicit collector calls are not necessary for the broader observed failure family. A fresh isolated run would be needed to prove every reduced dependency removable; none was attempted after the new crash.

## 4. Environment, diagnostic facilities and exact identities

| Item | Identity / observation |
| --- | --- |
| Runtime image | `sha256:a2b1801097f195b0a31c9da1c2f9cf2587a542e3c55cbb191b1873667dc45072` — identical to original P6 |
| PostgreSQL / headers | **17.5-1.pgdg110+1**, amd64; header package version independently read from pinned `.deb` control metadata |
| Extension | P6 runtime reports schema **2.10**; identical reused image built from **v2.10.4**, commit `c882056fac65532dee95fc174c4fdc0cc0965293` |
| Vendor archive | `7743f4d8be3415d50f9c1018c7e176c0b16df6760998f3a18ad2a12f2349a1d3` |
| Header package | `9f43e428d4145d3212b68a70970cc5b736ce544b4bec2f1d6f010225787ddef4` |
| Recipe | `efec0774e29a88adb59491b21500577168ed49f9c071658c4e3ff60ffd517903` |
| Docker / Node | Docker **29.8.2**, Node **v24.14.1** |
| Native settings | Preload initialized in both variants; session profiler OFF versus ON; shared stats ON; lxcache ON; JIT ON; max_stack_depth 2048 kB; assertions OFF |
| Container limits | One at a time; **512 MiB, 0.75 CPU**; container-local core soft/hard limit 0; no host bind mounts or production data |
| Debug facilities | `pg_config` present; `gdb`, `eu-stack`, `readelf`, `addr2line` absent from PATH. Build configuration advertises debug compilation, but no debugger/symbolized stack was available or installed. |

The existing kernel core pattern was read as `|/wsl-capture-crash %t %E %p %s`. It was not changed. Container-local core limits were set/read as zero; this is not proof that the host's piped crash handler collected nothing. No Windows/WSL/Docker global dump setting was changed, and no raw memory dump was read or published. SQL JSON logging used verbose error origin, parameter-length limits zero and statement logging none/min-error-statement panic.

| Executed source | SHA-256 |
| --- | --- |
| New `executors/serial-diagnostic.mjs` in evidence directory | `51c5135eb8e7da928bdfd3b9196d94cb03700e8ae743a142f8ba747eb3e3af15` |
| `custody-store.sql` | `81926b3667d6207b0b7c295f391eb4bdce6335e8812444992ed447515a32b4f8` |
| `closure-store.sql` | `e4abc2fea9e838dda12d1f456869ab70e1fb952db3a6c550fb0259504c765fc8` |
| `closure-admission.sql` | `c3873a8085dca77483f2d821bb48f5350a0c641de62ddfeb38fd6eb6f25fa4fc` |
| Unchanged P6 collector | `3eac8aca6fffd8705ed402fc0d3011ae966bc29b02c84b9f4cd13c33055680dd` |

Full protocol/signing input hashes, eight custodian definitions, source-bound transcript/receipt and original-input identities are retained. Both diagnostic catalogs before workload match accepted P6 hashes. The OFF variant's before/after catalog matches; no ON after-crash catalog certificate was manufactured.

## 5. Resolution, continuation and blockers

No harness or product correction was demonstrated. The reduced example establishes a failure associated with enabled profiling across a nested exception/retry, without a concurrent transaction. A symbolized native stack or controlled alternative build is still needed to locate a PostgreSQL/extension defect. No upstream fix/version is asserted.

**Observed workaround:** execute behavioral rejection/retry scenarios with profiling OFF for the entire isolated scenario. The reduced control passes with the extension preloaded, and accepted full P6 behavior already passes without profiling. This avoids claiming native counters for that window. Turning instrumentation off only after an error, or reusing a connection with suspected stale state, was not tested as a workaround.

**Limited continuation:** a successful, separately labelled serial positive prefix can yield saved native observations, as here. There is no established safe recipe for profiling P6's nested error/retry cases. Do not repeatedly rerun the failed concurrent workload, suppress its assertions or modify product SQL to accommodate measurement. Future diagnostics could compare lxcache/shared-statistics settings, connection replacement or a debug runtime, one variable at a time, but these are **untested proposals**, not safe fixes or actions taken here. Obtain appropriate isolated debugging facilities without changing global dump policy or exposing secrets.

**P7 can proceed independently for a separately requested unprofiled behavioral scope**, using disposable servers, existing owner resource controls and source-bound receipts. It must not require P6 profiling success, claim P6 closure, or preload/enable native profiling for the known failing error/retry paths. Any P7 numerical profiling needs its own bounded plan. **P7/P8 were not started.**

Remaining blockers are the unknown native root cause, missing original faulting-PID/raw-stack evidence, uncompleted P6 error/concurrency profiling, unmeasured SQL expressions and the broader whole-SQL/Phase 9D-1 gates. Historical P5 private gaps, prior signal-11 incidents, transport deadlines and ENOSPC remain distinct findings. No signing/verifier trust-root, financial or operational authority changed.

## 6. Host monitoring, preservation and stop point

[Monitoring](../../output/phase9d-p6-crash-diagnostic-2026-10-18/host-summary.json): **57 samples**, minimum free RAM **801.1 MiB**, minimum commit headroom **16,965.0 MiB**, zero sampled heartbeat gaps above eight seconds and zero unresponsive taskbar samples. Owner-approved RAM admission/abort gates remained OFF; deadlines and responsiveness checks remained. Each expensive variant checks recent observer freshness/responsiveness before starting. Same-host probes cannot exclude a complete OS freeze. Space minima: C: **85.91 GiB**, D: **469.67 GiB**; database startup filesystem availability is saved. These are not capacity or ENOSPC recovery tests.

[Cleanup](../../output/phase9d-p6-crash-diagnostic-2026-10-18/cleanup-readback.json) confirms zero running containers and normal Docker shutdown. The owned servers stopped after the bounded run; Dell services remain Running/Auto. No unrelated process/service/container/volume/cache was removed or reconfigured.

[Preservation](../../output/phase9d-p6-crash-diagnostic-2026-10-18/preservation-and-quality.json) verifies **1,941/1,941** pre-existing inventoried files unchanged, **15/15 SQL** unchanged, staged entries and HEAD unchanged, and **147/147** original P6 artifact hashes unchanged. Original repository preservation remains **19/19 local and 23/23 staged**, archive/HEAD unchanged; accepted Clerk **3/3**, frozen V5 **22/22**, custody **28/28**, both worktrees. The original P6 manifest remains `bd274bdde7da43c3d093a3c561a8616c2502a7c03742e272fe10f717f62bd6fa`.

Only this new checkpoint and dedicated ignored evidence/diagnostic files were added. Scoped diagnostic JavaScript lint reports one file, zero errors/warnings; syntax and whitespace checks pass. No product TypeScript changed, so no new backend typecheck/full regression was run. Historical successful P6 behavior and affected regression counts retain their epochs. An initial read-only vendor README print hit Windows console encoding; the baseline had been saved, and the subsequent source inspection used ASCII-safe output. No diagnostic outcome was altered by that read failure.

Frozen V5 remains `e484afc4c7fa724ea29af6edd962c48b814dc73a10e4f4a5e33833ad26afbe75`. No routine-replacement mutation, production connection, live provider/model call, real incident, capsule/full backend campaign, signing/auth/business-policy change, commit, push, merge, deployment or activation occurred. **Stop after this diagnostic. P6 native profiling stays incomplete. Production stays OFF.**
