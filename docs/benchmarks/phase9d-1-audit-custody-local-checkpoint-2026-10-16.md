# Phase 9D-1 local custody checkpoint — 16 October 2026

**Stage checkpoint, not acceptance. Isolated custody closure and overall Phase 9D-1 remain PARTIAL.** Database/container execution is blocked by Docker Desktop startup failure. A subsequent local executable-startup stall also prevents final numerical, mutation, typecheck and full regression verification. No subsequent workstream is activated.

## Source custody

- Original worktree: `D:/Downloads/Repos/RCS-Travels-Website`, branch `codex/proofloop-evidence-migration-20261016`, HEAD `2ff51e7d9dade932cd21dfe5d836488d4b9a700a`. Its migration preparation remains staged and its 19 continuation files remain in place.
- Integration worktree: `D:/Downloads/Repos/RCS-proofloop-local-20261016`, branch `codex/phase9d1-custody-local-20261016`, HEAD `8cb24fd359ecd17573897fab5fb702daa7e3aef3`. New integration changes remain uncommitted and unstaged.
- Despite the report that cloud work was unpublished, the exact cloud continuation was already present in `origin/work/phase9d1-custody-closure`. Its parent is the handoff HEAD. No fetch, merge, reset, clean, rebase, commit or push was used during this continuation.
- The archive SHA-256 and all 19 archived/working-file hashes passed, including all nine untracked files. The 23 staged migration paths were recorded before integration in `output/phase9d-custody-local-2026-10-16/preserved-state.json`.
- A new checkout initially converted line endings. It was restored from the exact cloud commit with conversion disabled before the successful cloud baseline run. Original evidence was never normalized or rewritten.
- Existing backend dependencies are accessed through a directory junction. No dependency installation or generated Prisma replacement was performed. Six baseline files were copied byte-for-byte into this worktree; other historical evidence remains at its original laptop location.

## Reconciliation and requirement matrix

| Component / exact paths | Integrated source | Current decision / missing verification |
| --- | --- | --- |
| `closure-ingress.mjs` | Cloud SIGKILL selection plus local explicit non-fallthrough boundary; retained local closed event validation. | Unit witnesses pass, including delayed signal delivery with no commit/signing fallthrough. Real before/after-commit capsule failure is **unreproduced historical**, not declared resolved. |
| `phase9dCustodyClosureTransport.test.js` | Three-way reconciliation retained local principal/path, handler deadline and real child probes, with cloud bounded HTTP client/assertions. | A mock PG socket failed to drain startup bytes and blocked teardown; `socket.resume()` fixes the fixture. Source-stable 26/26 and then 27/27 units passed. |
| `closure-capsule.mjs` | Cloud separate networks/UIDs, canary, runtime/controller images, dynamic children and restart recipe; local disabled Docker logs assertion and source-drift exit fence retained. | **PARTIAL**. Real execution requires working Docker. No successful capsule or container isolation claim. |
| `closure-run.mjs` | Cloud DB/safety/SQL/replay modes plus local child/replay-input binding. Default output is the new local directory. Test file concurrency capped at one. | Full-suite binding reproduced a false dependency from adversarial import strings. Full mode now directly hashes tracked checkout files instead of parsing those test strings. The correction still needs full-suite execution. |
| `closure-{source-lineage,lineage,transport,consistency}.sql` | Exact cloud implementation retained; original source/outbox/transport/broker contracts preserved. | **PARTIAL**. Supported committed capture, deferred snapshots, bounded consistency and manual recovery exist; fresh DB witnesses pending. Missing occurrence and capture together remain unobservable. |
| `closure-{keys,status,rotation,store,source,admission}.*` | Cloud/local key epochs, independent durable receipt/signature verification, ACK identity fencing and SQL admission retained. | Core units pass; real SQL ACL/default PUBLIC/search-path and concurrency/rotation verification pending. Owner, signer and host remain trust roots. |
| `closure-{observer,denial-contract}.mjs` | Local minimized closed denial schema, spool integrity/count/byte bounds and cloud real-log capsule/replay integration retained. | Parser/spool units pass. Independent delivery of all denial classes and observer container restart remain **PARTIAL**. Suppression before collection remains outside observation. |
| `audit-replay*.mjs`, `phase9dCustodyReplay*`, local `closure-replay-input.mjs` | Cloud executable saved-input reconstruction and local strict separate input validator both preserved. The two input schemas are distinct; neither silently replaces historical input. | **PARTIAL**. Fresh process/database record and reconstruction, outcome comparison and required additional fault scenarios pending. Cloud raw replay output is unavailable locally. |
| `phase9dCustodySafety.test.js`, pressure/admission SQL | Cloud five-dimension pressure, cleanup and recovery probes retained. | **PARTIAL**. Current DB saturation failure must be reproduced before changing assertions or SQL. No total physical disk-exhaustion guarantee. |
| `closure-quality.mjs`, `closure-scope.mjs` | Ten-helper scope includes both local denial contract and cloud client. Coverage collector now supports per-execution raw-counter subdirectories. | **PARTIAL**. c8 stalled before a completed report. No current 100%/structural/clone or zero-survivor claim. Capsule entry/proxy and replay orchestration remain separate scope gaps. |

The remaining 15 non-overlapping local files were copied at their preserved exact bytes. The four overlap patches and three-way candidates remain under `output/phase9d-custody-local-2026-10-16/reconciliation/`. No cloud change was blindly applied over the original dirty checkout.

## Historical verification

The six original baseline SHA-256 checks passed. The successful runners reverified all three accepted Clerk identities and all 22 frozen V5 identities, including the original freeze body hash. The local checkpoint manifest separately checks the 28 accepted custody identities and original accepted artifact bindings. Historical counters and the 329-mutant reconciliation (319 killed, ten reviewed equivalents) certify only their original source epoch.

The original readiness gates and coverage matrix are retained byte-for-byte. Cloud-only ignored outputs were not retrieved by fetching source and remain unavailable. No old passing replay/mutation result certifies the changed integration source.

## Executed local receipts

Paths below are relative to `output/phase9d-custody-local-2026-10-16/`.

| Execution | Result | Source eligibility |
| --- | --- | --- |
| `cloud-before-reconciliation/unit-1792157736086-4b88d5d1-7b03-40e6-8a12-1f1419c45fc9.json` | 19/19 pass | Exact cloud source, before local reconciliation. |
| `unit-1792157841610-e4d783d2-02ae-49f9-8779-edfa8dcabfb6.json` | Interrupted: 24 pass, one file failure after owned test process termination | Retained hung mock-socket trial; not an ordinary assertion failure or accepted run. |
| `unit-1792158023564-d4a2712f-8b90-4cb0-abf3-1a9823065205.json` | 26/26 pass, source stable | Earlier integrated epoch. |
| `unit-1792158217146-6d75c231-ee43-44a0-9dde-534de6c86b90.json` | 27/27 pass, source stable | Latest integrated unit epoch; checkpoint manifest compares current file hashes. |
| `regression-units-1792158113382-de9b81a5-b4ae-42ba-8fd4-599b6369dd85.json` | 41/41 pass, source stable | Earlier epoch; later runner/boundary-test changes require final repeat. |
| `lint-initial.json` | Zero reported errors/warnings in the executed configured scope | Earlier epoch before the last boundary witness; final strict lint still required. |
| `quality-1792158240303-f2f735e7-0d01-49c4-8dcd-4981863b55d1/` | INCOMPLETE | c8 child stopped progressing; interruption recorded separately. No final quality manifest. |

Full-suite preflight also failed before test launch on `backend/tests/src/main`, a fabricated import discovered in a test string by the dependency scanner. No full backend pass/fail count exists for this attempt. A source fix is prepared, not verified by an invented completion receipt.

## Failure triage

| Cloud finding | Local classification / disposition |
| --- | --- |
| Closure DB 7/9; broker DB 18/19 | Unreproduced historical failures; Docker unavailable. Do not weaken saturation assertions. |
| Legacy units 40/41 | 41/41 locally at recorded integrated epoch; original cloud failure not reproduced. Final repeat remains. |
| Full backend 1,823/1,845 | Unreproduced historical failures. Many cloud inputs exist locally, but this worktree initially restores only six baselines. Full run blocked at harness preflight, then executable startup. |
| Capsule before-commit assertion | Unreproduced historical failure. Non-fallthrough guard and paired unit boundary witness prepared; actual capsule root cause not certified. |
| 22 focused mutation survivors | Unavailable cloud raw report and source-epoch difference; fresh current-source mutation campaign required. No equivalence declarations added. |
| Two strict lint errors | Not reproduced by the initial configured local lint check; later changes require final lint. |
| Aggregate DB regression incomplete | Still incomplete; no local aggregate result. |
| Profiler-enabled signal-11 crash | Historical infrastructure/tooling failure, not reproduced locally. Dedicated profiler probe must run separately from SQL mutations. |
| Docker ENOSPC | Historical cloud infrastructure failure. Local D: had approximately 517 GB free; Docker storage could not be inspected without a running engine. |
| Current Docker startup | Reproduced local infrastructure failure: Secrets Engine cannot rename inaccessible `engine.sock`. Normal start attempted; no reset, socket deletion or unrelated cleanup. |
| Current executable stall | New Node/Python processes stopped progressing; prevents completed quality/typecheck/mutation/full execution. Owned interrupted attempts retained. |

## Bounded resume order

1. Restore normal Docker and Node startup; check memory, engine storage and free disk. Do not run full suites and mutations concurrently. No protected socket/cache deletion or factory reset is authorized here.
2. From this integration worktree, repeat `node tools/phase9d/closure-run.mjs unit` and `regression-units`; verify current source hashes and stable receipts.
3. Run `db`, then `lineage`, then `safety`, one server pair/suite at a time. Reproduce and classify each failure before correcting affected source or expectations.
4. Run `node tools/phase9d/closure-capsule.mjs`; diagnose actual before/after-commit and restart witnesses from its new source-bound receipt. Require all profiles, checks and owned-resource cleanup to finish.
5. Run `replay-record`, then `replay <saved-input-path>` in a fresh process/database and compare with `audit-replay-compare.mjs`. Preserve failed/interrupted recipes and expand only required isolated fault coverage.
6. Run affected `sql` witnesses and seeded mutations; run native/profile probes separately. Preserve profiler crash evidence and exact restored routine definitions. Whole-project SQL is not certified by selected routine probes.
7. Run final scoped lint, typecheck, ten-helper coverage/metrics/clones and mutation reconciliation. Include critical orchestration/input/capsule scope gaps before isolated acceptance. Add meaningful permanent witnesses, not score edits or assertion weakening.
8. Restore only necessary historical full-suite fixtures, then full backend and affected sequential legacy DB regressions. Produce a new source-bound acceptance manifest/readiness matrix only when every required isolated gate has valid evidence.

No migration commit, force-add or push was performed. Existing production switches remain OFF. Phase 9D-2, project-wide implementation and public generalization remain NOT_IMPLEMENTED for this continuation. Deployment and production activation remain REQUIRES_OWNER_APPROVAL; real human/privacy/IAM/admin custody/capacity evidence remains BLOCKED_EXTERNAL.
