# Phase 9D-1 ? actual local database verification and resource-limited capsule trial

17 October 2026 IST. Continues the [accepted local checkpoint](phase9d-1-audit-custody-local-checkpoint-2026-10-17.md) and [resource preflight](phase9d-1-database-container-preflight-checkpoint-2026-10-17.md). Evidence: [source-bound manifest](../../output/phase9d-custody-db-2026-10-17/manifest.json), [78-criterion readiness](../../output/phase9d-custody-db-2026-10-17/readiness-gates-current.json) and [continuation state](../../output/phase9d-custody-db-2026-10-17/continuation-state.json).

**PHASE 9D-1: PARTIAL. PRODUCTION_READY: NO.** The sequential database stage passed. Restricted capsule acceptance, fresh replay and separate custody SQL verification remain incomplete after an actual memory abort.

## Executed results

| Selected source-stable execution | Actual result |
| --- | --- |
| Custody closure, including current-generation admission pressure | 9/9 PASS |
| Broker database | 19/19 PASS |
| Separate-service transport database | 15/15 PASS |
| Committed-journal outbox database | 21/21 PASS |
| Original custody database regression | 20/20 PASS |
| Broader disposable database | 58/58 PASS |
| Committed lineage | 7/7 PASS |
| Rotation, pressure and concurrent recovery | 8/8 PASS |
| Current custody / related units | 30/30 / 41/41 PASS |
| Full backend | 1,864/1,864 PASS, no skips |
| Backend typecheck / changed-runner strict lint / whitespace | PASS; lint zero errors and warnings |
| Original worktree preservation | 19/19 working files, 23/23 staged contents, archive and HEAD unchanged |
| Accepted auth / frozen V5 / accepted custody | 3/3 / 22/22 / 28/28 identities unchanged in both worktrees |

Each selected execution has its own receipt, source map and integrity hash. The first pressure run and broker/transport repeats precede the final runner directory-preparation edit; their recorded runner hashes are preserved. Their runtime, SQL and fixture identities match current files. Later CPU and database receipts bind the corrected runner. No earlier receipt is relabelled as a later execution.

## Reproduced failures and narrow corrections

The broker's historical 18/19 result reproduced: all eighteen leaf groups passed, then the parent failed writing its witness because the general runner omitted `PHASE9D_BROKER_OUTPUT`. The runner now supplies the existing broker/transport fixture output variables. The outbox fixture requires its original approved evidence directory; its output path assertion remains unchanged.

The first outbox trial passed all twenty leaf groups, then failed with ENOENT writing its witness. That exception bypassed the fixture's subsequent connection cleanup and left the test process alive. Read-only database inspection found idle connections. Only the owned Node test subtree was interrupted; the runner retained buffered failure output and cleaned up its servers. The runner now prepares the exact required outbox directory before starting that fixture. The next actual run passed 21/21. No business SQL, policy or test assertion changed. Original runner bytes, failed receipts and interruption diagnostics remain retained.

The local sequence controller initially matched both a lineage witness and its execution receipt and stopped. Independent receipt inspection verified exit 0, 7/7 and source stability. The selector now requires the runner's `mode` and `sources` fields; the original controller failure remains. Lineage was not rerun to manufacture another score.

## RAM admission and capsule interruption

The owner-approved temporary pause of DellTechHub and SupportAssistAgent preserved their Auto startup settings. Signed diagnostic/display children of the stopped TechHub family were paused; the Dell updater and unrelated services were retained. Docker started only after the unchanged 5 GiB gate admitted 5,120.2 MiB free; it initially had zero running containers. Workloads ran sequentially with a 2 GiB admission floor and a 1 GiB abort floor. Existing WSL limits remained 3 GiB RAM, two CPUs and 1 GiB swap.

After database completion, the capsule waited for memory and admitted at 2,083 MiB. Both curated images built. The separate signer and ingress reached READY, and the first sender/verifier reached RECEIVED/VERIFIED. The watchdog then observed consecutive free-memory samples of **977.3 and 921.4 MiB**. It terminated only its owned verification process tree and requested normal Docker shutdown, which exited 0. No complete capsule receipt was produced. These partial observations are **not a capsule PASS** or a product assertion failure.

Docker was not restarted. Independent readback confirms both Dell services restored to **Running / Auto**, and the durable lease is completed. Available RAM after restoration was **2,810 MiB**, below the 5 GiB Docker startup gate. Owned stopped capsule resources may remain because the killed harness could not finish its cleanup; their exact ownership label and constrained next-start inspection are recorded in `continuation-state.json`. No global prune, unrelated volume deletion, cache-cleanup bypass or WSL reset was attempted. Budget samples do not prove the absence of every possible Windows/UI freeze.

## Remaining scope and quality boundaries

Fresh current-source saved-input record/reconstruction and the separate custody SQL security/native-profiler modes were not executed after the resource abort. Existing database fixture omission/catalog witnesses are actual passing regression evidence; they do not replace those custody SQL modes or establish whole-SQL adequacy. Profiling and routine replacement remain separate. Historical profiler signal-11, cloud ENOSPC and intermittent transport deadlines remain unresolved findings.

The unchanged ten-helper certificate remains 100% scoped coverage, 661 framework identities (650 killed and eleven executable reviewed equivalents), with its original metrics and limitations. Completed campaigns were not repeated. Capsule/controller/replay/orchestration and broader SQL numerical adequacy remain outside that certificate. A lead-agent source review is retained and explicitly does not fulfill the separate independent adversarial-review gate.

All 78 original readiness rows and twenty source audit rows are carried forward. Full capsule faults, restart/denial/rotation/storage acceptance, fresh database replay, affected SQL certification and independent review remain open. Deployed IAM/egress/grants, independent off-host administration, privacy/retention/hold approvals, blind real labels, production-shaped Clerk capacity/monitoring, in-flight financial policy and explicit deployment/activation approval remain separate gates.

Frozen V5 remains `e484afc4c7fa724ea29af6edd962c48b814dc73a10e4f4a5e33833ad26afbe75`. No authentication redesign/cache, financial policy change, live incident collection, paid/live model/provider operation, phone operation, evidence migration, commit, push, deployment, Windows repair or production activation occurred. Unrelated user edits remain preserved.

```text
PHASE 9D-1: PARTIAL
SEQUENTIAL LOCAL DATABASE REGRESSIONS: VERIFIED_IN_ISOLATION
RESTRICTED CUSTODY CAPSULE: INCOMPLETE ? RESOURCE_ABORTED
FRESH CURRENT-SOURCE SAVED-INPUT REPLAY: NOT_EXECUTED
SEPARATE CURRENT CUSTODY SQL / NATIVE PROFILING: NOT_EXECUTED
WHOLE-CRITICAL-CODE / SQL CERTIFICATION: PARTIAL
PRODUCTION_READY: NO
PHASE 9D-2: NOT_STARTED
DOCKER: STOPPED
DELL SERVICES: RESTORED; STARTUP SETTINGS UNCHANGED
PRODUCTION SHADOW / AUTO-ADJUDICATION / CONSEQUENCES / SEARCH: OFF
```
