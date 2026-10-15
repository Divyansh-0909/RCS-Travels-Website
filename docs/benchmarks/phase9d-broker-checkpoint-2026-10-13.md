# Phase 9D-1 — standalone offline broker and conservative durable budgets

13 October 2026 IST. Continues the [accepted separate-service transport](phase9d-transport-checkpoint-2026-10-13.md). Evidence: [manifest](../../output/phase9d-broker-2026-10-13/manifest.json), [readiness matrix](../../output/phase9d-broker-2026-10-13/readiness-gates.json), raw execution records and reports beside them. Earlier checkpoints, source epochs and failed trials remain intact.

**PHASE 9D-1: PARTIAL. STANDALONE BROKER: PARTIAL; the supported offline vertical slice works in isolation. PRODUCTION_READY: NO.** This implements receiver-bound broker requests, durable reservations, independent SQL dispatch fencing, separate frozen offline execution and guard identities, and current-generation advisory persistence. It does not certify the complete requested recovery/operations/failure matrix or production readiness.

## Architecture and trust boundaries

Actual committed driver cancellation → existing Phase 7 journal → unchanged outbox → unchanged authenticated HTTP transport → independently committed receiver receipt → broker registration/reservation → offline frozen V5 → separate independent guard → `broker9d.results`.

The sender retains its source database. Broker state resides in the **bare receiver database**, under its own schema and non-login `broker9d_owner`. That database has no application tables. Separate actual login identities are `broker9d_exec`, `broker9d_guard` and `broker9d_ops`. Execution can register/reserve/admit/send/observe/recover; guard can load eligible observations and commit guarded results; operations can change stop generation. None can update configuration, rewrite attempts/audit history or read transport signing secrets. A read-only inspector remains in the same database; this is **not independent external custody**.

`broker-request-v1` binds the exact accepted minimized DTO and receipt UUID to a committed receiver row and immutable payload hash. SQL checks receiver work, original commitment, evidence hash/snapshot, frozen identity and configuration. A client-proposed incident ID cannot substitute for that lineage. `broker-execution-v1` is a bounded local IPC bootstrap protocol; PostgreSQL authenticates each service login. It is not a newly deployed HTTP broker API.

Registration is unique per accepted logical receipt/evidence identity. The request pins **the hash of the complete configuration row**, not only its version. Configuration changes invalidate earlier authorization; budget-denied requests enter MANUAL_REVIEW. Stop/resume cannot revive an old generation. The previous receiver worker's execution entry points are revoked **only in this optional isolated broker installer**. Its retained PENDING receiver row supplies immutable receipt/evidence custody; broker requests are the execution state machine. Existing transport and worker source bytes remain unchanged.

## Durable accounting

`tools/phase9d/broker.sql` adds configuration, control, requests, attempts, advisory results and append-only-to-services events. Current state updates have corresponding durable event records. No service gets direct table writes. PostgreSQL constraints enforce unique logical requests, attempt sequence/token, one result per request, integer reservations and consumed usage bounded by each reservation.

The fixed **synthetic offline configuration** reserves 1,024 input tokens, 256 output tokens and five integer minor units per attempt. Limits are two attempts per logical request, twenty total reservations/attempts, two active reservations and one admitted/unknown in-flight request; total token/minor-unit limits are 20,480/5,120/100. These are illustrative offline fixture budgets, **not approved live pricing or estimates of arbitrary real prompt cost**.

One control-row lock serializes every reservation, dispatch admission, stop update and result commit. All applicable request/concurrency/input/output/currency limits are checked in a single reservation transaction. Real competing connections prove only one can take the final capacity. A released pre-dispatch attempt still counts toward the attempt/request limits.

Before dispatch, an expired RESERVED lease can release its unspent reservation and permit a bounded replacement attempt in the same generation. Once dispatch is admitted, usage becomes UNKNOWN. Timeout, 429, 5xx, malformed/oversized output, missing usage or process death cannot refund it or authorize another automatic dispatch. Such work retains its worst-case reservation and in-flight capacity. Explicit usage reconciliation and operational resolution remain incomplete.

Confirmed synthetic usage is 128 input/32 output tokens/two minor units. Exact duplicate observations do not charge twice; conflicting identities/usage are rejected. **Even confirmed attempts retain their full worst-case reservation in aggregate capacity accounting.** Confirmation is recorded separately. Late observations may update accounting, but cannot bypass stale-generation or stopped-result admission. No broker ledger entry is an application payment, payout or wallet operation.

## Dispatch and result fencing

Dispatch admission linearizes at the committed `broker9d.admit` transaction. It verifies generation, enabled state, pinned configuration, evidence/receipt binding, owner/token/lease, attempt state, reserved capacity, in-flight limit and absent result. `begin_send` repeats admission immediately before execution and records one send attempt; a second replica cannot reuse that transition.

Physical SDK execution happens **outside database transactions**. Stop may commit after send authorization and before physical execution. The recorded generation, admission/send timestamps and `may_have_escaped` flag preserve that uncertainty. Stop cannot retract a provider request. A death after admission but before an observed send is conservatively charged UNKNOWN as well.

Result admission reacquires the control lock and rechecks current generation, stop, lease/token, source/configuration/receipt binding, confirmed usage, exact response identity and independent guard output. Only a separate guard login can commit. Duplicate identical committed results return the existing outcome; conflicting duplicates cannot overwrite it. A stopped or expired/stale attempt cannot create a new current advisory result.

The actual unchanged V5 factory proposes confident DRIVER_CAUSED. The independent factual/policy gate returns **NEEDS_ADMIN_REVIEW** on the minimized evidence. Raw recommendation, validation, guarded routing and absent human authority remain separate. SQL restricts this slice to categorical SHADOW/NEEDS_ADMIN_REVIEW records and validates the bounded V5 envelope. No freeform causal evidence, human finality or executable business tool is added.

## Executed process, SQL and container witnesses

Real disposable PostgreSQL tests execute actual application cancellation and transport services, dedicated authenticated logins, separate broker/guard processes and independent observation clients. Tests cover competing final budgets; duplicate dispatch/send/result; registration forgery; stale configuration; stop before creation/reservation/admission/send; repeated generations; exact lease expiry; unsent reservation crash/replacement; admitted/provider-response crashes; guard-compute versus stop; post-commit death; malformed output/unknown usage; and immutable response accounting.

Controlled barriers inspect PostgreSQL `pg_stat_activity` to confirm real row-lock waits. Stop-before-admission denies dispatch; admission-before-stop remains recorded. Actual SQL denials protect bookings, payments, drivers, source incidents, human reviews, broker budgets/control/history and receipt keys. Financial/authority state is compared after legitimate business cancellation, before and after every broker test.

The selected restricted-container execution runs **four services**: original sender/receiver plus separate broker/guard containers. Broker and guard each pass **17 containment checks and 29 deliberate denials**, including actual source-database table denials. UID/GID 1000, read-only code, no host/Docker-socket mounts, separate PID/IPC, no capabilities/new privileges, seccomp, 64 PIDs, 512 MiB, 0.75 CPU and bounded no-exec tmpfs are observed. SCRAM credentials travel privately; signing/owner/operations credentials do not reach these services. All **51 application tables** retain their independent full-state digest. Owned containers/networks/canary are removed; reproducible images/contexts remain.

The container journal is trusted synthetic SQL bootstrap, **not actual collector execution**; actual committed collectors run in the DB/replay suites. The network proof covers the tested host listener and reserved external address, not every DNS/metadata/kernel route or deployed IAM.

## Saved-input replay

One explicit fresh-database recipe recreates committed journal identities, source financial fixtures, signed transport/lost ACK, sender lease/process recovery, broker registration, actual reservation-process termination, sixty-one-second lease expiry/release, replacement broker execution, separate guard persistence, duplicate denial and durable budget state.

Recording and an independently invoked saved-input replay compare the same canonical financial/source/projection/result and request/attempt/configuration/budget observations. Generated broker request/attempt/token and receipt UUID/MAC identities are excluded from cross-run equality; within-run identity, ownership and receipt binding are asserted. This is **one bounded executable backend recipe**, not the entire broker failure matrix, UI replay or a proof of every possible concurrency schedule. Container runs are separate process recipes.

## Verification and evidence boundaries

Final exact current-source executions are selected in the manifest. Raw failed and mixed-epoch runs retain their original status.

| Check | Completed supported scope |
| --- | --- |
| Broker units | **9/9 PASS** |
| Broker real DB/process suite | **19/19 PASS**, eighteen leaf groups plus parent |
| Transport / outbox / broader DB regressions | **15/15 / 21/21 / 58/58 PASS** |
| Full backend / backend typecheck | **1,824/1,824 PASS**, no skips / **PASS**, current unchanged source epochs |
| Historical paired backend replay | **37/37 PASS**, thirty-six equivalent scenario receipts; separate from broker replay |
| Broker record / independent saved-input replay | **1/1 / 1/1 PASS**, matching canonical outcome |
| Restricted broker/guard containers | **PASS**, seventeen checks/twenty-nine denials per service; unchanged application tables |
| Critical JS coverage | **100% all four measures**, six complete modules; **147 statements/lines, 111 native V8-derived branches, 14 functions** in the selected window |
| Structural maxima | Cyclomatic **7**, cognitive **6**, Halstead Difficulty **23.933**, CRAP **7**, maximum critical source **31 physical lines** |
| Critical clone check | **0**, five-line/fifty-token minimum |
| Native SQL / selected mutation probes | Exact catalog, ACL/search-path/owner definitions and native routine metrics retained; **six selected omissions killed**, catalog restored |
| Framework mutation closure | **358 unique identities: 354 killed, four executable reviewed equivalents**, zero meaningful survivors/timeouts/ignored/errors in reconciled closure |
| Scoped lint / whitespace | **PASS**, exact executions and source hashes selected in manifest |

The six critical modules are `broker-session`, `broker-offline`, `broker-execution`, `broker-guard`, `broker-child`, `broker-replay`. Native V8 counters/source maps are preserved in report copies; raw files remain unchanged. This does not certify orchestration/container scripts, historical large routes or all SQL. Native PL/pgSQL fractions do not establish logical-condition or whole-SQL adequacy. Whole-SQL certification stays PARTIAL. Host subprocesses establish process/database separation; filesystem, cgroup and network containment claims refer specifically to the restricted containers.

Current mutation reconciliation uses exact file/location/mutator/replacement identities across the second full campaign and focused reruns. The first campaign predates the diagnostic-pause refactor and retains its separate source epoch and raw statuses. Independent bounded test observers convert the earlier hanging mutants into executed regression failures; application/model deadlines were not increased. The four executable equivalents cover an internal caught error message, an explicitly returned private filename prefix, and two response-size predicates on the fixed offline provider domain. That provider has no exactly-32,768-byte frame; its only oversized frame is independently invalid for the unchanged adapter. Complete outcomes, SQL operations and phases match in paired execution over every fixed provider fixture. **These size reviews do not apply to arbitrary or live model outputs**; replacing/extending the provider invalidates them. Original guards remain intact, no mutation is ignored, and no threshold is waived.

Discovered corrections have permanent witnesses: missing transitive validation-function grants; configuration version alone insufficient to bind existing authority; immutable budget-denied disposition; test replay assertions confusing collection length with a boolean; and supervisor startup contention. The latter raised only the owned child-startup deadline to sixty seconds; actual model/database deadlines remain two seconds. A diagnostic pause now returns its unresolved promise directly, preserving crash behavior without an unreachable asynchronous continuation. Initial mutation, partial coverage, mixed-source and startup-timeout evidence remain retained.

## Remaining gates

Finish the broader requested failure matrix, including actual database-outage handling across dispatch/observation, additional stop/budget/result interleavings, multi-incident backlog recovery, authenticated usage-receipt reconciliation, explicit manual/terminal operations and terminal payload/accounting retention. The conservative UNKNOWN path deliberately blocks further automatic dispatch rather than inventing reconciliation or zero-cost assumptions. Complete independent adversarial/quality closure for any later extension; a changed composition invalidates reviewed equivalences and prior execution epochs.

Production-compatible clocks, provider worst-case pricing/idempotency/usage attestation, shared-replica capacity, deployed secrets/TLS/IAM/egress/DB grants, external audit custody/denial delivery, privacy purpose/disclosure/retention and independently labelled human evaluation remain separate gates. Shared Clerk fresh admission checks, capacity/availability findings and admission-only in-flight guarantee remain unchanged. No financial/admin execution-time policy is modified.

Frozen Jev V5 remains **`e484afc4c7fa724ea29af6edd962c48b814dc73a10e4f4a5e33833ad26afbe75`**, **22 identities unchanged**; the three accepted auth source identities and seven transport sources are unchanged. Live model/provider calls **ZERO**; offline fake calls are retained in the receipts. No held-out/Luna/Search/Hindi/Hinglish evaluation, real incident collection, phone operation, Vite-cache cleanup bypass, commit, deployment or production switch change occurred.

```powershell
node tools/phase9d/broker-run.mjs unit
node tools/phase9d/broker-run.mjs integration
node tools/phase9d/broker-run.mjs record-replay
node tools/phase9d/broker-run.mjs saved-replay <saved-owned-input-path>
node tools/phase9d/broker-capsule.mjs
```

```text
RESPONSIBILITY PHASES 1–8: VERIFIED FOR APPROVED SCOPE
HISTORICAL PHASE 8.2: RETIRED — NO RECOVERED SCOPE
PHASE 9A / 9B / 9C: COMPLETE FOR APPROVED ISOLATED SCOPE
PHASE 9D-1: PARTIAL
SEPARATE-SERVICE TRANSPORT: VERIFIED_IN_ISOLATION
STANDALONE ANALYST BROKER: PARTIAL — SUPPORTED OFFLINE SLICE PASSES
DURABLE BROKER BUDGETS / DISPATCH ADMISSION / GENERATION-FENCED RESULT: VERIFIED_IN_ISOLATION FOR THE TESTED SLICE
INDEPENDENT EXTERNAL AUDIT CUSTODY / WHOLE-SQL CERTIFICATION: PARTIAL
PRODUCTION_READY: NO
PHASE 9D-2: NOT_STARTED
PRODUCTION DEPLOYMENT: NOT_AUTHORIZED
PRODUCTION SHADOW / AUTO-ADJUDICATION / CONSEQUENCES / SEARCH ROLLOUT: OFF
PROJECT-WIDE PROOFLOOP / PUBLIC GENERALIZATION: NOT_STARTED
```
