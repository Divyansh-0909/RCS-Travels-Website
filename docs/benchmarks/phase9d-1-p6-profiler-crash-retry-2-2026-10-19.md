# Phase 9D-1 — debugger separation and uncapped diagnostic

19 October 2026 IST. One fresh local attempt, using synthetic records and a disposable PostgreSQL database. Evidence: [receipt](../../output/phase9d-p6-crash-retry-2-2026-10-19/serial-diagnostic-receipt.json), [timeline](../../output/phase9d-p6-crash-retry-2-2026-10-19/query-transcript.jsonl), [sanitized debugger output](../../output/phase9d-p6-crash-retry-2-2026-10-19/sanitized-backtrace.txt), [manifest](../../output/phase9d-p6-crash-retry-2-2026-10-19/manifest.json).

**Result: the original signal-11 defect was not reproduced or resolved. A different PostgreSQL process received signal 9 before the intended rejection query.** No root-cause claim or successful profiling certificate follows from this attempt.

## Question and method

The preceding debugger attempt shared one 512 MiB allowance between PostgreSQL and GDB and recorded signal 9 without OOM counters. The new attempt separated GDB into its own container/cgroup, sharing only the PostgreSQL PID namespace. The owner then explicitly requested removal of limits. Before the probe, Docker readback confirmed **Memory=0 and NanoCpus=0 in both containers**, with cgroup memory.max=max. These remove container-specific RAM/CPU caps; Docker VM and host capacity still exist. No global Windows/WSL/Docker configuration or application budget was changed.

The PostgreSQL container had no added ptrace capability. Only the debugger had SYS_PTRACE, no network, a read-only root filesystem and temporary scratch storage. Both retained zero core ulimits; no process memory dump, credential or private signing material was exported. A single-attempt stop, debugger/process deadlines and owned cleanup remained. The existing shared runner's cache-OFF setting was untouched; this was a separately authorized default-cache diagnostic.

The fixture installed the original custody store/admission SQL, generated fresh synthetic source/MAC/signing identities, ingested and signed the first event, and completed serial key rotation. It then loaded the saved native observation and attempted to attach the debugger before the planned GAP rejection. Unlike the preceding script, debugger collection ran from finally even when attachment/query prerequisites failed. No mutation, replacement, full backend test or second rejection was executed.

## Observed timeline

Times below are **18 October UTC**, corresponding to 19 October IST.

| UTC | Observation |
| --- | --- |
| 21:40:29.885 | First ingestion completed in backend **664**. |
| 21:40:29.892 | First signature completed in backend **665**. |
| 21:40:29.899 | Serial rotation completed in controller backend **662**. |
| 21:40:31.048 | Postmaster reports **PID 707 terminated by signal 9**, then terminates peers. |
| 21:40:31.070 | PostgreSQL reinitialization recorded. |
| 21:40:31.500 | PostgreSQL ready again. |
| Final readback | One committed event and one signature remain; server is not in recovery. |

The debugger-ready marker was **not observed**. The script failed its readiness assertion and **did not submit the planned GAP query**. GDB retained a SIGQUIT stop and three unresolved stack frames, not a SIGSEGV stack. The server's peer-termination sequence is consistent with SIGQUIT reaching another backend, but the origin of PID 707's SIGKILL is not established. Its role was not identified by the retained projection.

## Resource evidence and interpretation

| Observation | PostgreSQL | Debugger |
| --- | ---: | ---: |
| Docker RAM cap | 0 (no container-specific cap) | 0 |
| Docker CPU cap | 0 NanoCPUs | 0 NanoCPUs |
| Recorded memory peak | 386,768,896 bytes | 43,249,664 bytes |
| memory.events oom | 0 | 0 |
| memory.events oom_kill | 0 | 0 |
| Docker OOMKilled readback | false | false |

These observations provide **no evidence of a cgroup OOM kill in this run**. They weaken an explanation based solely on the old per-container memory cap; they do not retroactively diagnose the preceding run or identify who sent signal 9. Host/VM-level or external termination attribution was not captured. No kernel/global dump setting was changed to obtain it.

The intended SQL error path was not reached, so this run cannot establish whether that path faults with the current runtime. The SIGQUIT frames contain no useful symbols and cannot localize a PostgreSQL or profiler instruction. No sanitizer, native patch or upstream correction was evaluated. The historical nested-error/default-cache signal11 finding remains open; accepted cache-OFF P6 results remain separate.

## Exact current environment and preservation

Both containers resolved `proofloop-p6-debug:20261018` to image **sha256:84dea4eaac748731f6a722a1b65a0a1ba80b2d1ffa863c4ad3730fc6b4cff686**. The receipt retains PostgreSQL version/build facilities, profiler settings, catalog definitions, source/vendor hashes and generated public evidence. The current resolved image identity is not substituted into historical receipts that recorded another image or only a tag.

All executed bound sources record sourcesUnchanged=true. Product SQL, frozen V5, Clerk authentication, business/financial policies, working changes, staged contents and previous evidence were not edited by this retry. The earlier 227-artifact engineering manifest is checked separately. New files are diagnostic orchestration, evidence and this report only. No production connection, real customer data, provider/model evaluation, commit, push, merge, deployment or P8 execution occurred.

## Cleanup and next diagnostic requirements

The owned debugger was removed after collection and the owned database container stopped. Final readback found zero running containers and stopped Docker normally. DellTechHub and SupportAssistAgent stayed Running/Auto; no unrelated service or existing volume was changed. The observer retained **535 samples**, minimum available RAM **137.9 MiB**, minimum commit headroom **7,448.9 MiB**, zero sampled heartbeat gaps above eight seconds and zero unresponsive taskbars. Same-host sampling cannot exclude a complete OS freeze. The engine remained idle after the short diagnostic until cleanup while the owner asked about the platform notice.

Before another justified reproduction, identify the signal-9 victim and termination source using narrowly sanitized process-role/lifecycle observations. A matched serial run without debugger attachment could distinguish debugger interaction from an independent termination, but it has **not been run in this report**. Obtaining a symbolized signal11 stack still requires a successful attachment before the SQL error or a separately approved external debugging environment. No further attempt is automatically authorized by this document.

The separate OpenAI content notice concerns platform cybersecurity safeguards; it is not a PostgreSQL error or evidence of the source of SIGKILL. No attempt is made to disguise this work or bypass that restriction. Production remains OFF; Phase 9D-1 remains PARTIAL.
