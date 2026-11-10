# Phase 9D-1 — isolated finite-volume refusal and recovery

22 October 2026 IST. Follows the [remaining engineering checkpoint](phase9d-1-open-gates-continuation-2026-10-22.md) and the owner's approval of the specific new 384 MiB virtual disk. **Bounded local ENOSPC/recovery: VERIFIED_IN_ISOLATION, 9/9 PASS. Universal storage bound and whole-SQL certification: PARTIAL. P8: NOT_STARTED. Production: OFF.**

Evidence: [manifest](../../output/phase9d-finite-volume-2026-10-22/manifest.json), [actual execution receipt](../../output/phase9d-finite-volume-2026-10-22/finite-volume-1/receipt.json), [database/volume witness and sanitized diagnostics](../../output/phase9d-finite-volume-2026-10-22/volume-enospc.json), [verified cleanup](../../output/phase9d-finite-volume-2026-10-22/cleanup-readback.json).

## Approved isolation and initial fixture failure

The owner approved opening UAC for only `D:\RCSProofloop-IsolatedTests\f2b988ffa6aa4e0eb7e41bc6005c9f17\synthetic-volume.vhd`. The fixed virtual disk has a 384 MiB virtual capacity; its retained VHD file is **402,653,696 bytes**, including container overhead. Formatting produced an NTFS volume of **385,806,336 bytes**, label `RCS_TEST_f2b988ff`.

The first elevated creation stopped **before initialization/formatting or database execution**: this host's Storage CIM object exposes BusType as the display string `File Backed Virtual`, and the prepared guard attempted an integer cast. [Failure receipt](../../output/phase9d-finite-volume-2026-10-22/create-failure.json) and the original launcher/source remain preserved. Its failure cleanup attempted to detach that exact image.

The corrected [compatibility resume script](../../output/phase9d-finite-volume-2026-10-22/executors/resume_volume.ps1) normalized the observed bus-type string. After the second UAC approval, it resumed **the same new image**, requiring its exact approved paths/owner/size, one bound disk, RAW state, FileBackedVirtual bus, online state and non-boot/non-system identity before formatting. It did not select an existing physical disk for formatting. The original prepared helper is preserved at its earlier hash; the successful creation/resume implementation is explicitly the compatibility script, not a claim that the failed integer cast worked.

No PostgreSQL SQL probe ran in the failed creation phase. Only **one database full-volume probe** ran afterward. PostgreSQL itself ran as the normal user, with its private data directory inside the verified mounted volume; only the storage lifecycle required elevation.

## Actual test and results

The [probe source](../../output/phase9d-finite-volume-2026-10-22/executors/volume_probe.py) uses the existing native PostgreSQL fixture and the prepared test logic. It adds a bounded 4 KiB tail fill after the 256 KiB bulk-fill refusal, so leftover space cannot accidentally accommodate a fresh relation page. The tail is limited to 65 writes and the same 120-second filling deadline. This is filesystem filling inside the approved volume, not repeated SQL or crash reproduction.

| Check | Observed result |
| --- | --- |
| Original committed row | ID 1 / synthetic payload persisted before filling and CHECKPOINT |
| Real filesystem refusal | Bulk and tail writes returned **errno 28 / ENOSPC** |
| Finite volume exhausted | **0 free bytes**; filler held **309,469,184 bytes** |
| Single database write | CREATE TABLE AS failed with **SQLSTATE 53100 / DiskFull** |
| Space reclamation | Exact owned emergency-reserve and filler files removed; more than 16 MiB free afterward |
| Existing data | Original committed row unchanged after refusal/reclamation |
| Normal restart | Original row survived stop/start; server reported not in recovery |
| Subsequent write | New ID 2 committed successfully |
| Final cleanup | Database stopped, no active elevated session, exact image **detached** |

There are **nine passing assertions** in the actual witness; some table rows summarize multiple related observations. The SQL failure occurred while extending catalog file `base/5/1249`—before the new relation could be completed. This is a real allocation refusal, not proof of every possible table/TOAST/index/WAL exhaustion path. The existing original-row and new-write assertions establish the stated preservation/recovery outcome; no power-loss or full-database corruption scenario was injected.

The selected job began **05:09:14 UTC / 10:39:14 IST**, took **58.053 seconds** including process supervision, and did not hit its 240-second deadline. The probe's own window was **57.513 seconds**. Sanitized server diagnostics retain the disk-full error at **10:40:06 IST** and the normal shutdown/startup sequence. No profiling extension or routine replacement was loaded. This is separate from the unresolved original profiler signal-11 defect and separate/unattributed signal-9 incident; neither was reproduced or resolved here.

## Environment, source identity and preservation

Runtime: Windows native PostgreSQL **18.4**, loopback SCRAM, eight maximum connections, **32 MiB shared buffers**, **1 MiB work memory**, JIT/parallel workers disabled by the existing fixture. These GUCs are not a hard total-memory quota. The volume is the actual enforced filesystem boundary for this test; no global Windows disk quota, Docker/WSL setting or existing storage volume was changed.

[Source identities](../../output/phase9d-finite-volume-2026-10-22/source-identities.json) distinguish the entry-point hash recorded by the job, probe/dependency hashes recorded during execution, and control-script hashes sealed at finalization. The launcher, resume/readback scripts, corrected probe and unchanged original helpers are all bound by the new manifest. The wrapper only selects the new probe/evidence directory; it does not alter SQL outcomes or disable assertions.

The prior **164 sealed artifacts**, the earlier **237 sealed artifacts**, all **103 inventoried SQL/migration files**, HEAD and staging index match their preceding identities. No earlier evidence or report was overwritten. The earlier checkpoint's NOT_RUN/pending-UAC state remains a historical snapshot; this new checkpoint supersedes that specific acceptance gap. No application, SQL, permissions, Clerk, frozen V5, financial or signing implementation was edited.

Scoped Ruff, Python syntax, PowerShell syntax and Git/new-file whitespace checks are in [quality](../../output/phase9d-finite-volume-2026-10-22/quality.json). No unrelated full backend suite or application typecheck ran; no application JS/TS changed.

The observer retained **58 samples**, minimum available RAM **609.48 MiB**, minimum commit headroom **13,546.13 MiB**, and zero sampled unresponsive taskbars. Minimum host drive free space was **87.599 GiB on C:** and **479.937 GiB on D:**. RAM admission/abort thresholds stayed disabled under the existing owner instruction. These are sampled observations, not a guarantee against an OS freeze; monitoring covered the database job, not every UAC/finalization interval. No unrelated application or service was terminated.

## Cleanup and remaining gates

Final readback at **05:13:00 UTC / 10:43:00 IST** confirms the database stopped, the image detached, and the elevated session exited. The synthetic VHD is retained outside source control; its private database/log files were not exported or claimed securely erased. No second database probe or reattachment ran after cleanup.

This closes the **one bounded local physical ENOSPC/refusal/restart acceptance gap**. The previous base-backup/archive refusal/drain/named-WAL recovery evidence remains separate. Still open are:

- Universal retained-history and operational WAL/slot/temp/log/artifact/backup limits, deployed reserve/admission/alerts and off-host recovery acceptance.
- Full provider/external-object recovery and supported service configuration; the zero managed-row snapshot is not a complete Supabase project restore certificate.
- Approved real retention schedules/holds/exceptions, complete reviewed copy selectors, provider/backup acknowledgements and verified independent custody/key handoff.
- Google verification and R2 activation, both pending by owner instruction; remaining SQL/DDL adequacy and separately requested P8.

The additive [readiness register](../../output/phase9d-finite-volume-2026-10-22/readiness-current.json) preserves all **78 criteria** and **20 audit rows**; the [condition register](../../output/phase9d-finite-volume-2026-10-22/condition-family-map-current.json) preserves all **24 families**. No production gate is waived by this local pass.

No Docker, paid provisioning, production connection, customer-data mutation, commit, push, merge, deployment or production activation occurred. **Production remains OFF. P8 has not started.**
