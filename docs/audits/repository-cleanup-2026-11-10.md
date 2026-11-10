# Repository cleanup and continuation preservation

10 November 2026. Approved cleanup and consolidation of the RCS Travels website
worktree and the separate Proofloop continuation. This is source preservation,
not production activation or completion of Phase 9D-1 or Search rollout.
Final review continued on 11 November 2026.

## Source comparison and reconciliation

- Website base: `2ff51e7d9dade932cd21dfe5d836488d4b9a700a`.
- Proofloop worktree HEAD: `8cb24fd359ecd17573897fab5fb702daa7e3aef3`, plus
  its uncommitted continuation.
- Initial nonignored comparison: 216 paths only in Proofloop, 763 only in the
  website, and 156 common paths with content differences after CRLF comparison.
  Three Proofloop-only paths were generated Python bytecode and were excluded.
- Five additional SQL source/helper files were hidden by the database-dump
  ignore rule. Exact exceptions now preserve those reviewed source paths.
- All 19 website custody continuation files exactly matched the preserved
  October 16 archive. The 12 differing shared continuation paths therefore
  advance that snapshot without discarding later website custody edits.
- The import receipt records 243 source/document paths and their exact hashes:
  [proofloop-continuation-import-2026-11-10.json](proofloop-continuation-import-2026-11-10.json).
- The original Proofloop worktree was not edited. Its committed history remains
  available through its existing branch and worktree.

## Approved organization

Independent projects were transferred to separate sibling folders. Each
transfer was verified byte-for-byte before its source directory was removed:

| Original group | Sibling destination | Original files verified |
| --- | --- | ---: |
| Python search assignment | `../Search-Algorithms-Assignment/` | 6 |
| StudyAI experiment | `../StudyAI/` | 27 |
| Responsive-design founder notes | `../Responsive-Design-Founder-Notes/` | 8 |
| General Codex review plugin | `../You-Should-Know-Plugin/` | 11 |
| Job-site browser research | `../Joblet-Browser-Research/` | 192 |
| Resume sources, PDFs and previews | `../Personal-Career-Materials/` | 26 |

StudyAI has its own dependency manifest and notes about its existing unfinished
graph return type and ingestion path. No environment credentials were copied.
The backend's original manifest and lockfile bytes are retained because the
source-bound Search registrations verify that exact lockfile identity. Removing
the declarations would invalidate preserved replay evidence.

The unique historical session-guard audit test was copied into `backend/tests/`
and verified independently. Its original ignored evidence copy remains intact.
Theme preview images and the theme ZIP moved under `output/design-exports/theme/`.
Both legal-workbench release ZIPs moved under `output/releases/legal-workbench/`.
Future Playwright JSON reports now resolve explicitly under root `output/handoff/`.

The approved 24 root captures/one-off QA files and three closed browser profiles
were removed after verified recovery copies. Five approved empty directories
were removed only while empty.

## Evidence and recovery

- 9,297 missing Proofloop evidence files were copied and hash-verified; 3,059
  already-present files were identical. No evidence variant was overwritten.
- Approximately 3,958 MiB was copied. One dependency-link boundary remains
  preserved in the original worktree and is recorded in the transfer receipt.
- All six protected historical baseline files were identical across worktrees.
- Raw evidence, private runtime/configuration, dependencies and browser state
  remain excluded from Git. The old 7,159-file evidence-transfer proposal was
  not activated by this cleanup.
- Recovery data and exact transfer receipts remain locally under
  `output/cleanup-recovery-2026-11-10/`. This includes the original 2,650-file
  website source snapshot and original index copy.
- Comparing those original files after cleanup found 28 approved content
  changes and 58 approved removals, with no unexpected source changes.

No blanket removal of `output/`, `backend/coverage/`, mutation sandboxes,
native build/release material, localization/compliance scratch work or Git
objects was performed. These retain their previously identified review needs.

## Validation and limits

| Check | Result |
| --- | --- |
| Website production build | PASS |
| Website unit tests | 109 passed |
| Backend typecheck | PASS after StudyAI relocation |
| Backend suite, concurrency 4 and bounded tests | 2,011 passed; 2 historical test-file failures |
| Captain-app lint | PASS; 0 errors and 7 existing warnings |
| Backup/retention offline unit tests | 135 passed |
| Isolated native PostgreSQL account/retention checks | 49/49 passed; owned server stopped; sources unchanged |
| Promoted historical session-guard audit | 4 passed |
| Handoff tooling tests | 29 passed, 1 skipped |
| Legal workbench tests | 11 passed |
| Python syntax and backup workflow YAML | 70 Python files and 3 workflows parsed |
| Playwright report destination contract | PASS |
| Additional Code Atlas CI | FAIL: scanner exceeded Node's approximately 4 GiB heap limit |

The two backend failures are `rideSearchV6Executor.test.js` and
`rideSearchV6Retry.test.js`, retaining their previously documented
`SOURCE_DRIFT` refusal. Their guards, historical registrations, source hashes
and provider authorizations were not weakened or rewritten to obtain a pass.
The initial broad run also exposed the lockfile identity dependency; restoring
the preserved manifest/lockfile removed that cleanup-induced drift. A native
race deadline seen under the heavily concurrent initial run passed in the final
bounded run.

The unchanged Code Atlas scanner passed its first five checks, then exhausted
the default JavaScript heap during its repository-wide source-indexing test
after approximately seven minutes. Its build step was consequently not run.
No scanner assertion or memory setting was changed as part of this cleanup.

The account-retention execution used a fresh isolated output directory and owned
loopback PostgreSQL. It exercised the imported Prisma cleanup/hold logic and
original outbox cleanup without changing production schemas, contacting Clerk,
deleting provider data, or enabling retention schedules. Backup workflows remain
explicitly gated. No production deployment, migration, activation or merge to
main is part of this cleanup.

Validation logs and witnesses remain under `output/cleanup-validation-2026-11-10/`.
