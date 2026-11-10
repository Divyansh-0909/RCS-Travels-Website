# Phase 9D-1 — read-only signal-9 attribution review

19 October 2026 IST. Reviews the [debugger separation attempt](phase9d-1-p6-profiler-crash-retry-2-2026-10-19.md) using retained files only. **Conclusion C: UNATTRIBUTED TERMINATION.** Neither PID 707's executable nor its signal sender can be established. No new database, Docker, debugger, profiling or test execution occurred.

Evidence: [original manifest](../../output/phase9d-p6-crash-retry-2-2026-10-19/manifest.json), [execution receipt](../../output/phase9d-p6-crash-retry-2-2026-10-19/serial-diagnostic-receipt.json), [query timeline](../../output/phase9d-p6-crash-retry-2-2026-10-19/query-transcript.jsonl), [sanitized debugger output](../../output/phase9d-p6-crash-retry-2-2026-10-19/sanitized-backtrace.txt), and this review's [input fingerprints and integrity manifest](../../output/phase9d-signal9-attribution-review-2026-10-19/manifest.json).

## Process ownership and namespace limits

The PostgreSQL container is `5085617c6e2a…`; the debugger container is `65517c822f60…`. Full identities are retained in the receipt. PostgreSQL uses its own PID namespace; the debugger explicitly joins it with `--pid container:<PostgreSQL ID>`, while retaining a separate cgroup. Linux PIDs below are namespace-relative, with no retained mapping to Docker VM/host or Windows PIDs.

| PID / process | Established identity | Missing evidence |
| --- | --- | --- |
| 1 | Runtime PostgreSQL postmaster log reporter: ready, child death, peer termination and reinitialization. | No saved executable/PPID process map. |
| 201 | Earlier startup-ready log reporter. | Exact startup role and lifetime unavailable. |
| 662 | Controller SQL session, from `pg_backend_pid()`. | PPID/start time unavailable. |
| 664 | `custody_ingest` SQL session; the script's sole configured GDB attach target. | Successful attach/inferior identity not independently retained. |
| 665 | `custody_signer` SQL session. | PPID/start time unavailable. |
| **707** | Postmaster reports a server process terminated by signal 9 at 21:40:31.048 UTC. | **Executable, role, birth time, parent, process group and signal sender unavailable.** |
| 712 | Recovery-message reporter after reinitialization. | Exact executable/parent unavailable. |
| GDB, `timeout`, debugger shell, host Node | Commands and container relationship are retained. | Actual PIDs, PPIDs, process groups, start times and namespace mappings unavailable. |

The projector's field name `terminatedBackendPid` does not establish that 707 was a client SQL backend. Its first retained appearance is the death notification; PID ordering cannot establish its creation time. A postmaster-child relationship is consistent with that notification, but no independent PPID record survives.

## Timeline and debugger lifecycle

Times are **18 October UTC**, retained from the execution; the local date is 19 October IST.

| UTC | Retained observation |
| --- | --- |
| 21:40:23.775 | Diagnostic variant starts. |
| 21:40:29.885 / .892 / .899 | First ingestion (664), signature (665), then serial rotation (662) complete. |
| After rotation | Native counters are read, then the script creates/starts GDB. These operations lack individual timestamps. |
| 21:40:31.048 | Postmaster reports 707 killed by signal 9 and terminates peers. |
| 21:40:31.070 / .500 | Reinitialization / ready again. |
| 21:40:31.780 | Misnamed `cgroupBeforeError` sample: actually **after** signal 9 and recovery-ready. |
| 21:40:34.981 | Variant finishes; one committed event and signature survive, `in_recovery=false`. |
| 21:57:17.637 onward | Later cleanup readback finds zero running containers and stops Docker Desktop. |

The [executed script](../../output/phase9d-p6-crash-retry-2-2026-10-19/executors/crash-diagnostic.mjs#L99) configures `attach 664`, selected library loading, a readiness marker, `continue`, backtrace, `detach`, then `quit`. The marker was not observed. The guard at line 118 prevents the GAP query at line 121; `gapSubmitted` is absent and the transcript has no GAP operation. Marker failure does not prove attachment never occurred: the debugger could exit before polling observed it.

GDB retained **SIGQUIT**, three unresolved frames and shell exit code 0. There is no timestamp, inferior PID banner, signal sender, detach confirmation or symbolized fault instruction. The output filter discards many command/error banners; a raw-output hash cannot recover them. Exit 0 therefore does not certify every GDB command succeeded. SIGQUIT is consistent with the postmaster's peer-termination sequence, but its sender and recipient are not independently established. It is not a SIGSEGV observation.

### Could orchestration have sent the signal?

| Path in exact saved source | Finding |
| --- | --- |
| Shell `timeout --signal=INT --kill-after=5s 35s gdb …` (line 104) | Can eventually interrupt/escalate termination. **Scheduled expiry cannot explain this death:** only 7.273 seconds elapsed since variant start, and GDB setup follows rotation by at most 1.149 seconds before the death. No process-group record establishes additional recipients or early signal forwarding. |
| GDB `detach; quit` | No explicit `kill`, SIGKILL or SIGQUIT command. A failed detach/lifecycle interaction is unverified; the configured inferior is 664, not 707. |
| `docker wait` 45-second fallback to `docker stop --time 2` (lines 132–133) | No retained wait-error field; final debugger state is exited, code 0. Scheduled timeout is incompatible with this short run. |
| Final client close, debugger stop/removal and Testcontainers stop (lines 154–156) | Follow server-log collection containing the signal-9 record. That later cleanup cannot originate the earlier recorded death. Exact delegated stop signals are not retained. |
| [Windows wrapper](../../output/phase9d-p6-crash-retry-2-2026-10-19/executors/run-crash-diagnostic.py) | `taskkill /T /F` is conditional on 180-second timeout. Actual duration 21.605 seconds, code 1 rather than timeout code 124: that branch is not evidenced. Its target is the owned Windows Node process, whose PID was not saved. |
| [Observer](../../output/phase9d-p6-crash-retry-2-2026-10-19/executors/host-observer.py), readiness and [later cleanup](../../output/phase9d-p6-crash-retry-2-2026-10-19/executors/cleanup-readback.py) | Observer samples resources; later engine shutdown is approximately 17 minutes after the event. No demonstrated signal-9 origin here. |

The command log's untimed “container … is not running” refers to the debugger sidecar and is consistent with readiness polling after exit. It does not establish who killed 707. These findings exclude particular scheduled/later paths, **not every possible debugger, runtime or external interaction**.

## Resource evidence, with timing corrections

Both containers read back `Memory=0`, `NanoCpus=0` and `memory.max=max`: no container-specific RAM/NanoCPU cap was established. Ancestor cgroups, Docker VM and host resources remain finite and were not mapped.

| Retained metric | PostgreSQL | Debugger |
| --- | ---: | ---: |
| Cgroup memory peak, bytes | 386,768,896 | 43,249,664 |
| `memory.events` oom / oom_kill | 0 / 0 | 0 / 0 |
| Docker `OOMKilled=false` | **Early, before workload failure** | Final exited-state inspection |

The cgroup counters provide no recorded cgroup OOM-kill attribution. They do not identify a signal sender or comprehensively exclude ancestor/VM/host pressure or external termination. In particular, PostgreSQL's early Docker state must not be described as a post-failure OOM readback. The “before error” sample at 31.780 is also post-recovery, not a pre-SIGKILL measurement.

Nearby Windows samples show 590.0 MiB free at 29.727 and 594.5 MiB at 31.771; neither measures the exact death instant or Linux VM headroom. Across 535 samples, minimum available RAM was 137.9 MiB and minimum commit headroom 7,448.9 MiB, with no sampled heartbeat gap above eight seconds or unresponsive taskbar. These do not exclude an unsampled complete freeze. Disk observations are retained separately. There is **no saved kernel termination log, signal audit, Docker event stream, ancestor-cgroup record or process-lifecycle trace** to resolve attribution.

## Environment, hypotheses and next diagnostic decision

Both containers resolve to image `sha256:84dea4eaac748731f6a722a1b65a0a1ba80b2d1ffa863c4ad3730fc6b4cff686`, PostgreSQL 17.5 (Debian 17.5-1.pgdg110+1), pinned plpgsql_check v2.10.4. Cache and shared statistics are ON; the three SQL sessions explicitly enable profiling after the earlier settings snapshot showed it OFF. Core limits are zero. The saved piped core-pattern configuration is not evidence that a handler ran or sent a signal. Build flags/tools exist, but matching loaded binary/symbol identities and a useful stack were not captured.

The [earlier serial SIGSEGV](phase9d-1-p6-profiler-crash-diagnostic-2026-10-18.md) killed ingestion backend 826 after GAP/23514. A later retained default-cache probe similarly killed ingestion backend 776 after that rejection. This run killed an unidentified 707 **before GAP submission**. Shared environment alone does not establish a shared cause.

Debugger lifecycle/process-group interaction and external/VM termination remain hypotheses. Neither has the process/sender evidence needed for conclusion A or a strong attribution under B. No repeat of the present experiment is justified without improved observability.

A future, separately approved diagnostic should use an independently owned disposable Linux environment with finite, read-back-verified RAM/CPU/disk budgets and an external observer. First collect benign orchestration lifecycle data: PID/PPID/PGID/SID, executable/build identity, start time, `NSpid`, cgroup, GDB inferior/attach/detach results, and timestamped Docker lifecycle events. Add approved signal-generation/delivery metadata (sender/target, signal and namespace), kernel OOM records and ancestor/VM metrics, excluding SQL parameters, credentials, private keys and memory dumps. A benign control and then a separately justified serial comparison without debugger attachment could distinguish an attachment interaction. They are **proposals, not executions or authorizations**.

Future cleanup must target verified owned process groups/containers, confirm debugger detach, and stop after one unexpected termination; deadlines and external host-abort controls must remain explicit. Keep profiling separate from routine replacement, preserve the cache-OFF normal runner, and avoid global dump/security changes or unrelated cleanup.

## Preserved certification and stop point

P6 cache-OFF behavior/native **16/16 each** and P7 behavior/native **14/14 each** remain accepted at their recorded epochs; their selected receipt hashes are rechecked, not rerun. Original default-cache signal-11: **OPEN**. Latest signal-9: **SEPARATE / UNATTRIBUTED**. Storage/retention requirements remain independently tracked. Whole-SQL and Phase 9D-1 remain PARTIAL; **P8 NOT_STARTED; production OFF**.

The review adds only this report and its fingerprint/integrity records. The original 23 artifacts, 12 source pins, prior report and 227-artifact engineering inventory are checked without rewriting evidence. HEAD and staged-content identity remain unchanged. No SQL/application/debugger script modification, test, Docker startup, evidence migration, commit, push, merge or deployment occurred. **Stop after this read-only review.**
