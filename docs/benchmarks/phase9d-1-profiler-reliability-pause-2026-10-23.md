# Phase 9D-1 — profiler reliability paused

23 October 2026 IST. **Paused at the owner's request. Original signal-11: OPEN. Signal-9: SEPARATE / UNATTRIBUTED. Cache-OFF results retained.** Evidence: [execution receipt](../../output/phase9d-profiler-reliability-2026-10-23/execution.json), [owner pause](../../output/phase9d-profiler-reliability-2026-10-23/owner-pause.json), [source identities](../../output/phase9d-profiler-reliability-2026-10-23/paused-manifest.json).

## Read-only progress

The pinned v2.10.4 source creates the local transaction cache under TopTransactionContext, uses a static reset callback, and can initialize a new cache when the current local transaction identity changes. Its abort hook finalizes function/statement statistics. The saved default-cache failures follow a nested expected SQL exception; cache OFF remains the accepted workaround for the measured workloads.

An upstream [8 September change](https://github.com/okbob/plpgsql_check/commit/8df27b4b03d63a991adbf1caf0bdabda83639c5b) explicitly addresses statement-abort handling after loss of the local transaction identity and revises cache/callback ownership. A separate [15 September change](https://github.com/okbob/plpgsql_check/commit/57ec8096ddd0b998fa03c326207e82d8af49a898) initializes a mutex in the cached statement merge path. Both postdate the pinned v2.10.4 source. Their exact API responses/diffs are retained. These are relevant candidate fixes, **not proof that either caused this incident**.

A diagnostic-only copy backports just the invalid-transaction guard and its two NULL-cache fallbacks, with an exact source diff and unchanged-file comparison. It is an **experimental partial backport**, not the complete upstream lifecycle fix, an installed replacement, or an approved profiler version. The prepared SQL uses two tiny nested functions and synthetic rows, with no custody/signing material. Its proposed debugger runs PostgreSQL as a child in single-user mode; that is a distinct reduction, not the original multi-session fixture or a new certification epoch.

## Attempt and stop point

The owner allowed one container at a time, 768 MiB/0.75 CPU, two controls followed by at most one failing attempt. The executable preflight started Docker Desktop and then rejected a nonzero running-container count with `UNRELATED_RUNNING_CONTAINERS_REFUSED`.

**No owned container was created, no compiler/build ran, no debugger/SQL control or failing reproduction ran, and no diagnostic memory/CPU cap was actually read back.** Those caps remain a prepared plan. The program records an empty owned-container list and zero variants. Existing running containers were not stopped or removed. A subsequent read-only labelled-container query timed out; it does not supply an independent zero-container readback. Source control flow and the execution receipt establish that this invocation never reached container creation.

The owner then requested pausing this work and switching to ordinary SQL condition/database-metadata checks. No more profiler work will run in that continuation. Prepared sources, upstream responses, failed preflight, host samples and pause state are preserved. No upstream report/message was submitted and no global dump/debug settings changed.

P6 cache-OFF behavior/native 16/16 each and P7 behavior/native 14/14 each remain accepted at their recorded epochs. No symbolized fault stack or tested default-cache fix is claimed. Production OFF; P8 NOT_STARTED.
