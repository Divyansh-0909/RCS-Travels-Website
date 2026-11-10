# Phase 9D-1 — one bounded debugger retry

19 October 2026 IST. Requested by the owner during the engineering continuation. Evidence: [source-bound diagnostic receipt](../../output/phase9d-engineering-closure-2026-10-19/diagnostics/crash-retry/serial-diagnostic-receipt.json) and [query timeline](../../output/phase9d-engineering-closure-2026-10-19/diagnostics/crash-retry/query-transcript.jsonl). **Original signal-11 root cause remains unresolved. This attempt did not reproduce that signal.**

The single fresh disposable diagnostic used the previously built `proofloop-p6-debug:20261018` image, PostgreSQL 17.5 and pinned plpgsql_check v2.10.4, default transaction cache ON and profiling ON. It used synthetic signing material, no routine replacement and a verified 512 MiB container memory limit / 0.75 CPU. A debugger attach marker was observed before the planned nested ingestion rejection. No global Windows/WSL/Docker crash-dump setting changed, and no memory dump, credential or private key was exported.

| Actual UTC time, 18 October | Observation |
| --- | --- |
| 21:11:27.305 | Serial rotation completed; controller PID 787. First event and its signature were already committed. |
| 21:11:28.008 | PostgreSQL reports **PID 840 terminated by signal 9**, followed by peer termination. This differs from the intended ingestion backend **PID 796** and from the historical signal 11. |
| 21:11:28.612 | Server reinitialization recorded. |
| 21:11:28.614 | Client begins the planned GAP query, after the signal-9 observation. |
| 21:11:28.617 | Client receives a connection failure rather than the expected SQLSTATE 23514. The diagnostic assertion fails. |
| 21:11:29.156 | Server is ready again. Independent readback finds one committed event and one signature, not an in-recovery server. |

The debugger was launched with argument/local printing disabled and a 25-second process deadline. The early connection/assertion failure bypassed the script's later debugger-result collection. **No stack was retained**, even though the attach marker was observed. This is an instrumentation collection limitation, not a passing debugger result. The server diagnostic projection and hashes are preserved; the receipt's generic `crashObserved` flag means a server-process signal and must not be read as “SIGSEGV reproduced.”

Signal 9 under a memory-bounded debug container is compatible with resource pressure, an external kill or another forced-termination mechanism. Gdb overhead is a hypothesis. Cgroup OOM counters/kernel kill attribution were not captured before cleanup, so OOM is **not established**. The signal precedes the new GAP query and cannot establish a fault in that SQL statement. No causal C instruction or PostgreSQL/profiler defect was localized by this attempt.

The one-attempt budget was reached and the owned container was stopped. No repeat, concurrent profiling campaign or second error-injection probe followed. The original default-cache SIGSEGV finding and accepted cache-OFF P6 measurements remain separate. Ordinary engineering verification uses profiling OFF; all shared runner native modes retain the cache-OFF workaround.

A separately approved future diagnostic should collect debugger completion in a `finally` path before container cleanup, record cgroup `memory.events`/peak and process-signal provenance, and verify debugger resource headroom before permitting the SQL probe. Matching symbols and attach-before-error remain required for native localization. This report does not authorize another attempt or change host quotas/dump policies. Production remains OFF; P8 was not started.
