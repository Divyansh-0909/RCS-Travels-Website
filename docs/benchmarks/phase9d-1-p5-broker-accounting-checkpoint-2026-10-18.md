# Phase 9D-1 — P5 broker state and durable accounting

18 October 2026 IST. Continues the [SQL plan](phase9d-1-sql-coverage-plan.md), [P4 checkpoint](phase9d-1-p4-transport-acceptance-checkpoint-2026-10-18.md), [accepted broker](phase9d-broker-checkpoint-2026-10-13.md) and [accepted recovery](phase9d-broker-recovery-checkpoint-2026-10-14.md). **P5 supported state/accounting behavior: VERIFIED_IN_ISOLATION. WHOLE-SQL CERTIFICATION: PARTIAL. PHASE 9D-1: PARTIAL. PRODUCTION_READY: NO.**

Evidence: [source-bound manifest](../../output/phase9d-p5-2026-10-18/manifest.json), [acceptance matrix](../../output/phase9d-p5-2026-10-18/acceptance-matrix.json), [before/after native observations](../../output/phase9d-p5-2026-10-18/coverage-comparison.json), [catalogs](../../output/phase9d-p5-2026-10-18/catalog-definitions.json), [selected executions](../../output/phase9d-p5-2026-10-18/selected-acceptance.json). Original actual UTC timestamps are retained.

## Accepted composition and unchanged implementation

**All fifteen SQL files remain byte-identical to the task baseline.** No broker implementation, default budget, frozen V5, authentication, signing, independent guard, business policy or production configuration changed. The new test, measurement helper and runner modes are the only code additions/changes. No transport or custody architecture was rebuilt.

The unchanged `recoveryFixture` installs permissions/transport, broker.sql and broker-recovery.sql in the bare receiver, with a separate migrated synthetic source database. The latter supplies committed source/outbox/receiver evidence and actual application consequence comparisons. This fixture does not install the later optional custody capture/admission adapters; its native counts certify the specified broker/recovery bodies, not every surrounding custody topology. P2–P4 and accepted custody evidence remain separate.

| Final composition | Identity, caller and behavior |
| --- | --- |
| `register(jsonb)` → `register_before_recovery(jsonb)` | Public execution login invokes the recovery wrapper; private original validates the accepted transport receipt/work/payload/configuration. Cleaned tombstones have their own exact-binding duplicate path. |
| `allowed(uuid,uuid,text[])` → `allowed_before_recovery(uuid,uuid,text[])` | SQL-language internal helpers. Recovery adds terminal/cleaned/conflict and independently accepted SUCCESS receipt fences to the original lease/generation/evidence/configuration predicates. |
| `observe(uuid,uuid,jsonb)` → `observe_before_recovery(uuid,uuid,jsonb)` | Actual broker9d_exec login; wrapper fences actor/token/terminal/cleanup/duplicate and receipt-to-response binding. Worker observations remain UNKNOWN until authenticated usage is accepted. |
| `recover(uuid)` → `recover_before_recovery(uuid)` | Recovery wrapper handles terminal unsent leases; private original handles ordinary expiry. Unresolved dispatched attempts remain held and cannot be silently retried. |
| `reserve`, `admit`, `begin_send`, `unknown` | Original definitions remain installed; their SQL calls dynamically use the composed `allowed()` helper. Control locking serializes reservations and dispatch admission. |
| `guard_input`, `commit_result` | Separate broker9d_guard login; current evidence/generation, confirmed bound usage and the existing independent NEEDS_ADMIN_REVIEW result contract remain required. |
| `reconcile`, `operate`, `inspect`, `accounting`, `revision` | Authenticated accounting, versioned/idempotent operations, minimized inspection/accounting SQL helpers and request revision trigger. Receipt issuer is the trusted synthetic offline harness, not worker usage fields. |
| `set_stop(boolean)` | Retained legacy definition; broker9d_ops EXECUTE is revoked. Services use `operate()` for STOP/RESUME. Its new native observation is an explicit owner-only, rolled-back fixture probe, not a new service grant or operational API. |
| `shadow9d.broker_payload_cleanup(uuid)` | Restricted cross-schema helper owned by shadow9d_owner, executed from broker-owned operations. Only the linked cleaned terminal/guarded receiver work can be cleared. |

The catalog retains **22 broker routines (16 PL/pgSQL, six SQL-language), plus the one PL/pgSQL cleanup helper**. Event append, allowed helpers, valid_envelope, inspect and accounting are included as dependencies; native procedural percentages do not apply to SQL-language expressions. Private aliases remain private. Actual execution, guard, reconciler and operations identities retain their existing permissions, owners, search paths and SECURITY DEFINER settings.

## New and reused behavioral verification

[phase9dCustodyP5.test.js](../../backend/tests/integration/phase9dCustodyP5.test.js) adds fifteen leaf groups and their parent, using existing fixtures, actual PostgreSQL connections, existing offline V5 responses, signed synthetic usage and independently guarded results. Every group compares actual application consequences to the post-incident baseline.

| Family | Executed persisted-state outcome |
| --- | --- |
| Registration | Malformed/wrong protocol/foreign receipt/evidence rejected; exact original registration reused. A bounded trusted-owner inconsistent retained binding probe reaches the existing conflict arm. |
| Lease / token / attempt bound | Wrong/NULL tokens, current-versus-expired unsent leases, missing attempts and stale tokens reject appropriately. Expired unsent attempts release; two attempts exhaust the approved limit, leave MANUAL_REVIEW, and retain lifetime reservation totals. |
| STOP / resume / dispatch | STOP before admission and after admission denies further dispatch; RESUME does not revive old generation work. An admitted unresolved request retains UNKNOWN usage and its full reservation. |
| Competing execution processes | Five accepted disposable limit recipes independently bound input, output, integer minor units, request count and concurrency. Two actual authenticated execution processes block on the control lock; exactly one reserves the final slot. PID identities and accounting are retained. Temporary configuration rows are restored exactly; approved SQL/default budgets and per-attempt reserve amounts remain unchanged. |
| Observation / current result | Pre-send observation is rejected without persisted changes. Malformed, wrong-token, duplicate and conflicting responses execute. Worker usage does not supply accounting authority. A signed SUCCESS receipt arriving before observation permits only the exact later response. Wrong-token/authority-changing results fail; one valid advisory result is persisted and exact duplicate reused. |
| Signed accounting | Closed fields, malformed body/UUID/numeric types, MAC, configuration/dispatch/request/generation and excessive usage cases preserve uncertainty. Exact receipt duplicates deduplicate; conflicting authenticated observations retain original usage and mark dispute. |
| Held spending | UNKNOWN is not zero: minor_used remains null and the full five-minor-unit hold remains. Signed zero-charge BILLED_FAILURE still holds the reservation. Only authenticated NO_DISPATCH with no recorded send and zero usage releases it. Confirmed consumption continues to hold the full worst-case reservation. |
| Late generation / cleanup | Old-generation authenticated costs are accepted without current result authority. Terminal cleanup preserves request/dispatch identities, response commitments, receipt/accounting history and spending. Late billed usage after cleanup remains accountable; no retry/reopened result follows. Never-admitted terminal release waits for expiry. |
| Operations / rollback | Invalid/stale requests, UUID idempotency and conflicting arguments execute. The revision trigger denies terminal reopening. A trusted fixture controller temporarily removes/restores one synthetic receiver row: CLEAN raises 23514 and rolls back request/payload/accounting changes; restoration permits the unchanged legal cleanup. |
| Principal/catalog preservation | Actual service callers are denied direct legacy stop/private aliases. Before/after definitions, owner/SECURITY DEFINER/search-path/ACL catalogs and the complete default configuration row match. |

No provider price, new lease semantics, cryptographic protocol, operational authority or automatic consequence was introduced. A previously authorized external request is not claimed physically retractable. UNKNOWN and late observation/accounting are distinct from permission to commit a current result.

### Unchanged regression scenarios reused

The selected six leaf groups from [phase9dRecovery.test.js](../../backend/tests/integration/phase9dRecovery.test.js) pass **7/7 including parent**: conflicting/concurrent receipt deduplication; zero-charge versus maximal usage; authenticated no-send release; terminal cleanup/late reconciliation; actual registration/reservation rollback versus lost ACK; and observation/accounting/result rollback versus lost ACK. Its mutation group, CLI/unrelated scenarios and separate full-server restart test are excluded. The saved witness contains no sqlMutations field. Its native reads have profiling disabled and are not used as numerical coverage.

The selected seven leaf groups from [phase9dRecoveryClosure.test.js](../../backend/tests/integration/phase9dRecoveryClosure.test.js) pass **8/8 including parent**: independently connected reconciler processes; both STOP/begin_send commit orders; both STOP/signed-accounting orders; and both conflicting-receipt/result orders. Original tests/helpers are unchanged. Exact selection/exclusion patterns are retained in regression-selection.json and the runner source.

The recovery subset deliberately terminates **10 owned backend connections** using pg_terminate_backend/57P01, distinguishing rollback from durable commit with lost response. These are injected connection interruptions, not whole-server restart, a new outage diagnosis or suppressed failures. The new P5 ordinary/profile witnesses each record **4 fake offline analyst calls**; reused tests use their existing offline fixtures. Live/paid model/provider calls are zero. Earlier P2/P3/P4/ICR-1 and full backend results remain at their original epochs and were not rerun.

## Dedicated profiling and before/after counts

The fresh `p5-profile` environment uses PostgreSQL **17.5**, plpgsql_check extension schema **2.10**, source **v2.10.4**, commit `c882056fac65532dee95fc174c4fdc0cc0965293`, the accepted SHA-pinned vendor/headers and runtime image. Baseline schema composition precedes counter reset. The entire P5 workload executes in its own profiling-only server/process setup. No routine-replacement mutation, mutant helper invocation or full-server crash probe runs there.

[phase9dP5Profile.js](../../backend/tests/helpers/phase9dP5Profile.js) preserves every raw native tree before denominator assertions. It reconstructs visible statements, IF/ELSIF/explicit and implicit ELSE branches, and FOREACH bodies for the exact compiled shapes, then checks both native coverage APIs. The same reconstruction independently reconciles all sixteen saved recovery-native entries. Before definitions match current composed definitions after LF/CRLF normalization. No superseded base-broker definition is substituted for a recovery wrapper. NR means no selected historical native attribution.

| Installed routine | Before statements | P5 statements | Before branches | P5 branches |
| --- | ---: | ---: | ---: | ---: |
| `broker9d.admit(uuid,uuid)` | 10/10 | **10/10** | 2/2 | **2/2** |
| `broker9d.begin_send(uuid,uuid)` | 8/8 | **8/8** | 2/2 | **2/2** |
| `broker9d.commit_result(uuid,uuid,jsonb)` | 16/17 | **17/17** | 5/6 | **6/6** |
| `broker9d.guard_input(uuid,uuid)` | 4/4 | **4/4** | 2/2 | **2/2** |
| `broker9d.observe_before_recovery(uuid,uuid,jsonb)` | 12/15 | **14/15** | 3/6 | **5/6** |
| `broker9d.observe(uuid,uuid,jsonb)` | 14/18 | **18/18** | 6/11 | **11/11** |
| `broker9d.operate(uuid,uuid,text,bigint,text)` | 26/31 | **31/31** | 14/19 | **19/19** |
| `broker9d.reconcile(jsonb)` | 35/37 | **37/37** | 20/22 | **22/22** |
| `broker9d.recover_before_recovery(uuid)` | 11/13 | **13/13** | 3/5 | **5/5** |
| `broker9d.recover(uuid)` | 11/11 | **11/11** | 4/4 | **4/4** |
| `broker9d.register_before_recovery(jsonb)` | 16/18 | **18/18** | 6/8 | **8/8** |
| `broker9d.register(jsonb)` | 7/8 | **8/8** | 3/4 | **4/4** |
| `broker9d.reserve(uuid)` | 15/15 | **15/15** | 4/4 | **4/4** |
| `broker9d.revision()` | 4/5 | **5/5** | 1/2 | **2/2** |
| `broker9d.set_stop(boolean)` | 0/4 | **4/4** | 0/0 | **0/0** |
| `broker9d.unknown(uuid,uuid)` | 8/9 | **9/9** | 1/2 | **2/2** |
| `shadow9d.broker_payload_cleanup(uuid)` | NR | **8/9** | NR | **3/4** |

The comparison artifact lists newly observed statement IDs/branch arms and all unhit native nodes; it does not merge historical and new windows into a score. `set_stop` has **zero procedural branches**; its API convention of one for an empty denominator is reported as 0/0, not fictional outcomes.

### Remaining paths and expression limits

1. Private `observe_before_recovery`: statement **8**, body line **8**, is its duplicate-response return. The public wrapper returns earlier whenever response_hash exists, under the same control/attempt locks; actual public duplicate and conflicting observations are tested. No private service bypass is granted to force this counter. Its earlier pre-send guard is now measured through a real authorized service rejection. The private alias measures 14/15 statements and 5/6 native branches.
2. Private cleanup helper: statement **4**, body line **5**, returns false when no cleaned terminal target is found. Ordinary operate already locks and validates that request and sets its cleaned state before delegation. The missing receiver-work branch and transaction rollback are measured. The missing-target private guard remains unhit (8/9 statements, 3/4 branches); no fabricated service API is added.
3. All other fifteen measured entries have every visible statement and available native branch observed in this window. This is not a whole-SQL certificate. Individual AND/OR/NULL/CASE/WHERE/join operands, receipt envelope truth tables and SQL-language allowed/valid_envelope/inspection/accounting expressions have no native denominator. Attempt exhaustion, final-budget and accounting outcomes are asserted, without claiming independent Boolean adequacy for every operand or every fault schedule.
4. Catalogs, constraints, trigger attachment, default privileges, configuration and actual role denials remain separate invariants. This batch verifies its selected installed metadata and caller boundaries; it is not a project-wide DDL/default-grant or mutation campaign. The later custody admission/capture composition retains its own existing verification scope.

The historical profiler-enabled signal-11 defect remains unresolved. Selected profiling diagnostics contain no new crash/recovery observation; a passing isolated run does not establish root cause. Future routine replacement must remain in a separate unprofiled server/process.

## Actual selected results and retained failures

| Check | Accepted result |
| --- | --- |
| Final P5 behavior | **16/16 PASS**, no skips |
| Final fresh P5 profiling-only | **16/16 PASS**, no skips; 17 routine observations |
| Selected unchanged recovery regression | **7/7 PASS**, no skips |
| Selected unchanged process-race regression | **8/8 PASS**, no skips |
| Backend typecheck | **PASS** |
| Scoped lint | **3 files; zero errors/warnings** |
| Scoped Git / new-file whitespace | **PASS** |
| SQL sources | **15/15 unchanged** |
| Original local/staged/archive/HEAD | **19/19 / 23/23**, archive/HEAD unchanged |
| Accepted Clerk / frozen V5 / original custody | **3/3 / 22/22 / 28/28**, both worktrees |

The first rehearsal records 4 PASS / 2 FAIL across six reported tests: an unresolved dispatch correctly occupied max_inflight=1, so the next independent probe needed a fixture reset. The second records 14 PASS / 2 FAIL across sixteen: the cleanup rollback check succeeded but fixture restoration attempted an explicit GENERATED ALWAYS identity without OVERRIDING SYSTEM VALUE. Each failure count includes one failed leaf and its parent. Both source-stable raw failures and original test bytes remain intact; no product SQL was changed to make them pass. Initial manifest assembly also stopped when a raw native JSON array was treated as a receipt object; the typed receipt filter correction and original builder are retained, with no change to test results or counters.

The first passing pair is retained at its earlier test epoch. Raw counters then exposed a missing legitimate pre-send observation rejection; the final pair adds that assertion and raises the private alias's measured coverage. Core P5/profile/typecheck receipts bind current sources. The two unchanged legacy selections predate this new-P5-test-only assertion; their actual runtime, SQL, fixture and own test hashes are unchanged. The exact later difference remains explicit in selected-acceptance.json. All selected executions record sourcesUnchanged:true. Dynamically launched recovery-action and broker children are explicitly source-bound. Database jobs ran sequentially.

## Changed files and exact catalog hashes

| New/changed code | SHA-256 |
| --- | --- |
| `backend/tests/integration/phase9dCustodyP5.test.js` | `26663e4c3b590cdae2b2f2a2ff5971afa0863b386553667ba9f6ce5ca9c63903` |
| `backend/tests/helpers/phase9dP5Profile.js` | `16135449482bdbe0a81fcaa58cb4d89ad40ee232283879e3dfb7759c33004b24` |
| `tools/phase9d/closure-run.mjs` | `8e4def9cbb8dd407ca96f0055f46bc7dbfeb0610d4319017ebee7dca264bcfc3` |

Only closure-run.mjs changed among **1934** pre-existing working files. Its byte-exact before version is preserved under historical-source/closure-run-before-p5.mjs with hash `234853509b2ae5d149e045069db9db19f416ec754c124a85c03d941c29d69235`. Runner changes add P5 modes/scope, explicit child binding, narrow regression selection and startup filesystem observations. The staging index and HEAD are unchanged. The manifest separately binds this checkpoint, acceptance/comparison/catalog artifacts, original failures, raw counters, executor/quality/monitoring files and source receipts.

| Installed catalog definition | SHA-256 |
| --- | --- |
| `broker9d.accounting()` | `9b5843c389578bf7b0f31ee29ddb675425eab8faffd0cf873a0fcf820d270438` |
| `broker9d.admit(uuid,uuid)` | `78abf862c53377a96dedf7e3a7d2f23235550837e628e56c80a71b8ee722df55` |
| `broker9d.allowed_before_recovery(uuid,uuid,text[])` | `3cd31fd11f255efeccbf9114c835723981c3b2b6add4d92f4908811ecf2b8ed4` |
| `broker9d.allowed(uuid,uuid,text[])` | `c6350986429ed730fffc69ad2457da4e05658eea1d60deb909eb903f8a8fefab` |
| `broker9d.begin_send(uuid,uuid)` | `acfe1f65d80abbedad924190718d5cc36d04ac8927669665cfbf1438093e9048` |
| `broker9d.commit_result(uuid,uuid,jsonb)` | `2a433c3d8a3c5c1a6db8a85c9e6a7744ffbca865df887943792bbfcc7f29693a` |
| `broker9d.event(text,uuid,uuid)` | `df1d182cb9aa8a5c308bd4e7d13bee9db99ce1589ea27507873ae1eb133a1761` |
| `broker9d.guard_input(uuid,uuid)` | `8021070251d6e78bca5929569f60f0e9cf0abc1eb8e40dd1917ed0c8fcab567d` |
| `broker9d.inspect(uuid)` | `866b1603f3d5625f2051997bf78252ac6708a0b871d744e782533331de63dfd6` |
| `broker9d.observe_before_recovery(uuid,uuid,jsonb)` | `885bf76fe4f09b5f063a582c0096f2b345e2571e150bc7cf88da19ca622b8f85` |
| `broker9d.observe(uuid,uuid,jsonb)` | `187dff29b5f9c78810cc17fbefdc8673b0a1823fd6535e138d85afed47303785` |
| `broker9d.operate(uuid,uuid,text,bigint,text)` | `b01351fb6cbdfc703ac5854a842340a62c0b1d614a7d5079e450c2fced9280ba` |
| `broker9d.reconcile(jsonb)` | `a643beade284a4bf027ce3a75f0b44fae2f5b6676688ccbe941780ef78db8a0d` |
| `broker9d.recover_before_recovery(uuid)` | `eeb8576bfc597355894a2e1d3618c08b8f863b733df593e96baf4393726e8b0c` |
| `broker9d.recover(uuid)` | `a9438e874bb80b3c5c8efd512eb15baf19b711d9f9d4dc3b4a505462ed36d920` |
| `broker9d.register_before_recovery(jsonb)` | `86c10d2dd010f01e905eaae54d3be81c4f47e06842e65c7e63d27795dbc78c54` |
| `broker9d.register(jsonb)` | `b1b884f5cbf5977c0db5dadd4232acb40573a5f526593a5da414467811424103` |
| `broker9d.reserve(uuid)` | `2ec9e1c588ed5bb101d652f12a2cd61153cba11285e2793b5feec3752a4c073b` |
| `broker9d.revision()` | `4f351007feebe4443dc4bd1c5764fae7dea48d9d4e8d978dcb9b7643797f8b76` |
| `broker9d.set_stop(boolean)` | `1bf8678b3b74e6935005daf1deb0e4f01dfb5d0d184fe5e54611ee930f21ecce` |
| `broker9d.unknown(uuid,uuid)` | `600aae1a5ea2d4cfa8690ce67e9a6e2ea2549ed6687efdef49f2d0eef5967d54` |
| `broker9d.valid_envelope(jsonb,text)` | `55b1cbb6cb554592c674301460014c66de77c5ff2866edc1c0e67710c4332d86` |
| `shadow9d.broker_payload_cleanup(uuid)` | `49cbf4274cc4bef061a2b959b18aca279cd65d651c2853af1d37bf62e96c0801` |

## Host monitoring, storage and cleanup

Owner-approved host RAM admission/abort thresholds remained disabled; deadlines and existing execution controls were retained. The completed scripted observer saved **389 samples**, minimum available RAM **997.8 MiB**, minimum commit headroom **16755.3 MiB**. It recorded **1 heartbeat gap(s)** over eight seconds (9.118 seconds) and **0 unresponsive taskbar samples**. The heartbeat gap is retained as an observation, not diagnosed as an OS freeze or discarded. Monitoring completed by its stop sentinel; same-host samples cannot rule out a complete freeze.

Host drive space was sampled periodically (minimum C: 86.04 GiB; D: 469.74 GiB). Selected owned PostgreSQL containers also record actual startup filesystem availability. These are storage observations, not full-disk, WAL/index bounds, production capacity or ENOSPC recovery proofs. No new server interruption was observed beyond the explicitly injected ordinary connection faults. Historical ENOSPC, profiler crash and transport deadline findings remain open.

Final readback found zero running containers; Docker stopped normally. DellTechHub and SupportAssistAgent remain Running/Auto, with no service changes. No unrelated process/service was terminated, existing Docker volume removed, global prune/cache cleanup performed or production setting altered. Owned disposable fixture cleanup used the accepted harness only.

## SQL status and separately requested P6

P5's supported lease/generation, authenticated accounting, spending retention, current-result and recovery outcomes are verified in isolation. Its exact native gaps and expression limitations remain explicit. Whole-SQL certification and Phase 9D-1 stay PARTIAL; original readiness criteria, trust-root/privacy/retention/capacity and deployment gates remain open.

P6 should next reconcile custody key epochs and historical receipt trust: key-ID/public material mismatch; unsigned receipt retirement refusal; concurrent epoch fencing; original durable receipt reuse; retired keys cannot issue new receipts; compromised signatures can be mathematically valid but currently untrusted. Reuse CC/S/X witnesses first and collect rotation/signature native failure arms in fresh profiling-only infrastructure. Preserve synthetic key ownership and keep any later approved replacement testing separate. **P6 was not started.**

Frozen V5 remains `e484afc4c7fa724ea29af6edd962c48b814dc73a10e4f4a5e33833ad26afbe75`. No real incident, live/paid provider/model evaluation, full backend run, JavaScript mutation campaign, restricted capsule campaign, guard/finance/auth change, commit, push, merge, deployment or activation occurred. **Production remains OFF. Stop after P5.**
