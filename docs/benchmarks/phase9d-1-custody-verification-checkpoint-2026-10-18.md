# Phase 9D-1 ? restricted custody, restart and saved-input verification

18 October 2026 IST. Continues the [database verification checkpoint](phase9d-1-database-verification-checkpoint-2026-10-17.md) and [local quality checkpoint](phase9d-1-audit-custody-local-checkpoint-2026-10-17.md). Executions began on 17 October; their original UTC timestamps and directory date are retained. Evidence: [source-bound manifest](../../output/phase9d-custody-monitored-2026-10-17/manifest.json), [all 78 readiness criteria](../../output/phase9d-custody-monitored-2026-10-17/readiness-gates-current.json), [all 20 audit boundaries](../../output/phase9d-custody-monitored-2026-10-17/audit-coverage-matrix-current.json).

**Requested blocked database/container/replay verification: VERIFIED_IN_ISOLATION for the supported scope. PHASE 9D-1: PARTIAL. PRODUCTION_READY: NO.** Completion of this verification request does not close every Phase 9D-1 implementation or external gate.

## Corrections and actual counterexamples

The previous before-commit capsule crash failure was reproduced in the same runtime image: Node running as container PID 1 survived its own SIGKILL. With Docker `--init`, Node is a child and the same program exits 137. The capsule now requires `HostConfig.Init === true` and Node PID greater than one. Its crash assertions, SQL policy, process budgets and financial guards were preserved. Two complete fresh executions pass. This diagnoses the capsule crash harness, not the owner's earlier whole-laptop freezes. Docker documents the [PID 1 signal behavior and init option](https://docs.docker.com/reference/cli/docker/container/run/).

A separate counterexample used the actual public observation comparison CLI to read an owned synthetic outside JSON through a Windows directory junction. The previously corrected saved-input database loader is a different reader. `audit-replay-compare.mjs` now canonicalizes both selected file and explicitly approved output directory before confinement. The permanent regression first failed, then passed, including direct outside rejection and explicit approved-directory aliases. Three executable omission seeds are killed separately from the retained framework mutation total. No private outside file was read. Original source, failed probes and logs remain intact.

## Actual accepted executions

| Check | Result and boundary |
| --- | --- |
| Restricted custody capsule | Primary and independent repeat PASS: 16 assertion groups, 101 hardened profiles each, matching 194 source identities, image and dependency identities |
| Actual failures/restarts | Ingress death before commit and after commit before signature, source sender SIGKILL/replacement, lost ACK, signer restart/rotation, source and custody PostgreSQL SIGKILL/restart with retained commitments |
| Independent server denial delivery | 28 observations per capsule run; eight requested categories plus generic denial, with observer restart/replay/gap/duplicate witnesses |
| Current-source saved-input reconstruction | Fresh record and independent fresh-process/fresh-database replay PASS; public receipt comparison PASS, canonical outcome `fd73bfd6f12410d781447d2bb0d099fb14680654a33ae8101a3d7be486c8f5bd` |
| Custody / broker / transport / outbox DB | 9/9 / 19/19 / 15/15 / 21/21 PASS at selected recorded epochs |
| Original custody / broader DB / lineage / safety | 20/20 / 58/58 / 7/7 / 8/8 PASS at selected recorded epochs |
| Final current-source custody / related legacy units | 31/31 / 41/41 PASS |
| Final current-source full backend | 1,865/1,865 PASS, no skips |
| Backend typecheck / four changed-file lint / whitespace | PASS; lint zero errors and warnings |
| Corrected public comparison file | 100% native V8/c8 scope: 30 statement/line, 15 branch and one function counters; three separate confinement omission seeds killed |
| New selected SQL security omissions | 3/3 killed, exact restored catalogs/ACLs/search paths retained |
| New native SQL profiling | Recipe PASS, numerical coverage PARTIAL: 28 routines, 11 zero statement ratios and additional unhit branches |
| Independent source review | Complete; no blocker within declared verifier trust model; one moderate open lineage ACK hardening/test finding |

The two capsule executions independently check actual restricted PostgreSQL identities, read-only root filesystems, init/PID boundaries, no host/socket mounts, bounded non-executable temporary storage, dropped capabilities, no-new-privileges, seccomp, CPU/memory/PID budgets and selected denied routes. They preserve the observed post-incident application/financial state. One explicit fake V5-compatible analyst call per supported recipe remains offline; no live provider/model call occurred.

The capsule comparison is a recipe repeat with generated identities. The saved-input record/reconstruction is a separate executed scenario with fixed source inputs and explicit generated-identity equivalence. Both verify signed historical receipts, original source/receipt relationships, accounting, cleanup and zero operative consequences. Neither is UI/OS replay, a byte-identical signature comparison, all possible fault schedules or distributed transaction atomicity.

Eight database modes and SQL witnesses predate the final public-comparison/test correction. The manifest records exact later source differences; their actual application/SQL/fixture hashes remain unchanged. Final replay and CPU results execute the corrected source epoch. Earlier receipts are not rehashed or relabelled as executions of later code. The original SQL profiler and routine-replacement mutation operations remain separate.

## Independent review and remaining implementation

The [separate reviewer report](../../output/phase9d-custody-monitored-2026-10-17/independent-review.md) examined suppression, forged acknowledgements, source/custody mismatch, role escalation, stop races, retention and cleanup. It inspected the final comparison patch and source hashes. It did not independently run services or tests.

The verifier process and credential remain an explicit trusted root. PostgreSQL does not verify Ed25519 in the local ACK routine; a compromised verifier can falsely mark delivery acknowledged. Independent custody inspection detects the demonstrated broker mismatch, and ACK status supplies no final human or financial authority. Review finding ICR-1 retains the lineage variant's weaker receipt shape/key fencing and missing exact forged-lineage-ACK/detection regression as open defense-in-depth work. This continuation does not claim resistance to that trust-root compromise.

All 78 original criterion IDs/order and all 20 audit event rows are reconciled without rewriting historical evidence. AUD3 now records the supported restricted runtime as VERIFIED_IN_ISOLATION. Broader event coverage, universal/pre-collection denial observation, retained history/WAL/index/disk bounds, lineage ACK debt, whole critical JS/SQL quality and wider fault replay remain PARTIAL. Audit-required authority-changing result promotion remains unimplemented and requires an approved policy; no promotion was added.

Ten unchanged core helpers retain the prior 100% coverage scope (249 statement/line, 192 branch and 21 function counters), 661 unique framework identities (650 killed, 11 executable reviewed equivalents), zero meaningful survivors and zero scoped clones. Those completed campaigns were not repeated. The new comparison omission kills and native V8/c8 coverage (30 statement/line, 15 branch and one function counters, 100% at that measurement) are separate. Raw counters and the initial report with an unhit default-root branch remain retained. The final measurement adds an executed missing-default-root denial; it does not prove all Boolean/adversarial semantics. This is not a numerical certificate over capsule/controller/replay orchestration or all SQL. The new native witness's zero/unhit routines are listed explicitly; a passing profiler recipe is not 100% SQL coverage.

External readiness gates remain: lawful evidence purpose/notice/provider disclosure and retention/deletion/hold approvals; blind real-human calibration and quantitative acceptance; production-shaped Clerk journeys, replica-shared capacity and monitoring/on-call ownership; in-flight payout/human-final/privileged-role policy; deployed IAM/egress/secrets/grants; independent administration, off-host custody/anchors/restore; stopped-first rollout and separate deployment/activation authorization. No real incidents were collected.

## Host monitoring, cleanup and preserved evidence

The owner explicitly suspended host RAM admission and abort gates for this continuation. Continuous scripts sampled memory, commit headroom, heartbeat and taskbar responsiveness; deadlines and container resource/security budgets remained active. The recorded minimum available RAM across selected observer windows is 36.2 MiB. There are 0 sampled heartbeat gaps above eight seconds and 0 unresponsive taskbar samples. These same-host observations cannot prove absence of a complete OS freeze, and intervals between observer windows are not monitored. Private process/memory diagnostics are excluded from repository evidence.

Docker was stopped normally after checking that no running containers remained. The two approved Dell services were restored to Running/Auto and independently rechecked; startup settings were never changed. Selected capsule cleanup verifies exact ownership labels before container/network removal. No existing user volume, global prune, unrelated process or rejected Vite-cache cleanup bypass was targeted. The accepted fixture harness retains its existing `docker rm -v` cleanup for newly created disposable anonymous database volumes; this is distinct from the ownership-checked helper cleanup that omits `-v`. No existing Docker data was mounted into these fixtures. The final source wrapper's post-replay assertion failure is retained separately: both inner runs and comparison passed, and later explicit readback/shutdown plus CPU verification completed. Its exact transient assertion cause was not captured. A subsequent unit invocation exposed a relative CLI path in the new test; the corrected test resolves from its own file URL and the complete final source sequence passes. Initial Python symlink privilege failure, the original stuck PID 1 attempt, prior RAM abort, cloud ENOSPC, profiler signal-11 and historical transport deadline remain distinguishable in the reliability register.

Original repository preservation matches 19/19 local files, 23/23 staged contents, archive and HEAD. Accepted Clerk 3/3, frozen V5 22/22 and original custody 28/28 identities match in both worktrees. Frozen V5 remains `e484afc4c7fa724ea29af6edd962c48b814dc73a10e4f4a5e33833ad26afbe75`. No evidence migration, commit, push, merge, deployment, production switch, authentication cache/redesign, finance-policy change, live model/provider call or Phase 9D-2 execution occurred.

```text
REQUESTED ISOLATED DATABASE / CONTAINER / REPLAY VERIFICATION: COMPLETE FOR SUPPORTED SCOPE
RESTRICTED CUSTODY RUNTIME: VERIFIED_IN_ISOLATION
SUPPORTED SAVED-INPUT RECONSTRUCTION: VERIFIED_IN_ISOLATION
INDEPENDENT ADVERSARIAL SOURCE REVIEW: COMPLETE ? ONE NONBLOCKING OPEN FINDING
INDEPENDENT AUDIT CUSTODY / WHOLE SQL / WHOLE CRITICAL CODE: PARTIAL
PHASE 9D-1: PARTIAL
PRODUCTION_READY: NO
PHASE 9D-2: NOT_STARTED
PRODUCTION DEPLOYMENT: NOT_AUTHORIZED
PRODUCTION SHADOW / AUTO-ADJUDICATION / CONSEQUENCES / SEARCH: OFF
```
