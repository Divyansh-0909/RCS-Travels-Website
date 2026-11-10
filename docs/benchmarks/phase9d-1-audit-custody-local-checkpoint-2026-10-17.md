# Phase 9D-1 — local mutation closure and actual replay-loader confinement

17 October 2026 IST. Continues the [local integration checkpoint](phase9d-1-audit-custody-local-checkpoint-2026-10-16.md) and accepted [custody checkpoint](phase9d-1-audit-custody-checkpoint-2026-10-14.md). Evidence: [current manifest](../../output/phase9d-custody-local-2026-10-17/manifest.json). **PHASE 9D-1: PARTIAL. PRODUCTION_READY: NO.**

## Implemented and actually verified

- Ten unchanged core helper modules: **661 unique framework mutation identities, 650 killed and 11 executable reviewed equivalents**, zero meaningful survivors/timeouts/ignored/errors. All 24 targeted meaningful survivors were killed. Raw reports are unchanged; focused identities reconcile by file, location, mutator and replacement. The initially incorrect selector and interrupted trial remain excluded evidence.
- Native V8-derived scoped coverage is **100% statements, branches, functions and lines**, with **249 statement/line, 192 branch and 21 function counters** in the selected measurement. Structural maxima: cyclomatic **15**, cognitive **12**, Halstead Difficulty **33.967**, CRAP **15**, source **50 physical lines**. Scoped clone count is **0**, at five-line/50-token minimum. Halstead carries the retained tool-advisory limitation. Critical core helper hashes are unchanged. Scope excludes capsule/controller/replay/orchestration and SQL certification gaps.
- Current custody units: **# tests 30; # pass 30; # fail 0; # skipped 0**. Related legacy units: **41/41 PASS**. Current full backend: **# tests 1864; # pass 1864; # fail 0; # skipped 0**. Backend typecheck, strict scoped lint and whitespace checks pass in the selected unchanged source epoch. The preceding 1,863-test PASS predates the loader correction and is preserved separately.
- A real synthetic counterexample admitted an outside saved input through a directory junction in **the loader actually called by the database runner**. Its old textual path check is preserved. The permanent regression first failed with a missing rejection. `audit-replay.mjs` now canonicalizes both selected file and approved directory before confinement, permits aliases of an explicitly approved directory, and rejects outside/junction paths. **Three separate executable omission seeds are killed**; they are not added to the framework mutation total. No database or private outside file was read by the counterexample.
- Original repository preservation: **19/19 local files, 23/23 staged contents, archive and HEAD unchanged**. Accepted auth **3/3**, frozen V5 **22/22** and accepted custody **28/28** identities match in both worktrees. The original evidence-migration operation remains unperformed.

## Boundaries and remaining execution

No Docker/container/database/replay acceptance was obtained in this continuation. The [current readiness register](../../output/phase9d-custody-local-2026-10-17/readiness-gates-current.json) retains all **78** original criterion rows and lists remaining current work. Actual custody/broker DB regressions, complete restricted capsules and crash/restart/denial/storage/rotation cases, fresh saved-input DB record/reconstruction, affected SQL certification, broader critical JS numerical adequacy and separate independent adversarial review remain open. The current-generation pressure fixture is prepared but not certified by a database execution.

Scripts monitor only owned verification processes. The Docker admission gate remains 5 GiB available RAM; Docker and its workloads were not started below it. Small checks preserve their stated admission floors and 1 GiB abort threshold. Resource refusal is recorded separately from a product/test failure. Private host memory snapshots are outside repository evidence. Windows repair remains canceled.

Historical cloud failures, incomplete aggregation, ENOSPC, profiler signal-11 and intermittent transport deadlines remain separate findings. Current passes do not establish their root causes. Native profiling and routine-replacement mutations must remain separate pending investigation. Readiness requiring deployed permissions, independent administration/off-host custody, legal/privacy approval, blind real human labels, Clerk production capacity/monitoring and in-flight financial policy is not established locally.

No live incidents, paid/live analyst/provider evaluations, production switches, auth cache/redesign, financial policy changes, rejected cleanup bypass, commit or deployment occurred. Frozen V5 remains `e484afc4c7fa724ea29af6edd962c48b814dc73a10e4f4a5e33833ad26afbe75`.

```text
PHASE 9D-1: PARTIAL
TEN CORE HELPER QUALITY: VERIFIED_IN_ISOLATION
ACTUAL SAVED-INPUT LOADER PATH BOUNDARY: VERIFIED_IN_ISOLATION
RESTRICTED CUSTODY / FULL AUDIT CLOSURE: PARTIAL
WHOLE-SQL / WHOLE-CRITICAL-CODE CERTIFICATION: PARTIAL
PRODUCTION_READY: NO
PHASE 9D-2: NOT_STARTED
PRODUCTION DEPLOYMENT: NOT_AUTHORIZED
PRODUCTION SHADOW / AUTO-ADJUDICATION / CONSEQUENCES / SEARCH: OFF
```
