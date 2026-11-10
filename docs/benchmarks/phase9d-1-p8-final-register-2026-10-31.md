# Phase 9D-1 — P8 high-risk review, exclusions and final selected register

31 October 2026 IST. Continues the [SQL plan](phase9d-1-sql-coverage-plan.md), [ACK survivor reconciliation](phase9d-1-p8-ack-survivor-review-2026-10-31.md) and earlier P8 batches.

**The three requested tasks are completed: all 24 condition families reviewed, private-path exclusions documented, and the supported targeted P8 register finalized. Eight new omissions are detected in isolation. There are zero unresolved instances in that selected register. Wider P8/whole-SQL/Phase 9D-1 remain PARTIAL outside the enumerated scope. Production OFF; production deletion DISABLED. Docker/profiler investigation PAUSED.**

Evidence: [manifest](../../output/phase9d-p8-final-review-2026-10-31/manifest.json), [family audit](../../output/phase9d-p8-final-review-2026-10-31/family-review.json), [historical reuse](../../output/phase9d-p8-final-review-2026-10-31/historical-reuse-register.json), [exclusions](../../output/phase9d-p8-final-review-2026-10-31/exclusion-register.json), [final P8 register](../../output/phase9d-p8-final-review-2026-10-31/p8-register-final.json), [actual new witness](../../output/phase9d-p8-final-review-2026-10-31/verified/witness.json) and [selected receipt](../../output/phase9d-p8-final-review-2026-10-31/selected-execution.json).

## 1. High-risk review and reused evidence

The review checks the exact current source against the existing P/O/T/B/R/Q, P2–P7, condition and metadata evidence. Original P26/O13/T12/B6/R10/Q3 selected mutation groups are retained, together with the earlier Safety source-MAC omission and its accepted 8/8 receipt. None of those campaigns ran again. Their original denominators, hashes, composition differences and timestamps remain separate; their counts are not added into a combined percentage.

| Area | Decision |
| --- | --- |
| Acceptance and transport binding | Reuse T12 original receipt/payload/evidence binding and P4 cases. Add enrolled custody service binding and the later wrapper's rejection-journal omission. |
| Lease, generation and dispatch | Reuse P26 permit/complete guards, B6 stop/generation/token/expiry/source/send guards and R10 terminal/version/ownership fences. Add the export recovery API's stale-attempt omission. |
| MAC/authenticated accounting | Reuse T12 receipt MAC, R10 usage MAC/configuration/dispatch/request/no-dispatch omissions, and the existing custody source-MAC omission. The current installed custody.ingest definition exactly matches that Safety witness's original hash. |
| Key epochs and trust | Add public-material binding, unsigned-receipt retirement, expected-epoch fencing and compromised registry-key ACK refusal. Reuse genuine P6 signing/history/race behavior. |
| Cleanup and rollback | Reuse P/O/T terminal deletion and R10 recovery/operation behavior. Add omission of the public CLEAN caller's delegation-failure rollback. |
| Metadata and other families | Reuse the saved 824 metadata assertions and selected current catalogs. Capture/consistency/emit and optional management/retention/backup families retain explicitly limited behavioral or separate evidence. No new whole-family mutation certificate is inferred. |

The machine-readable audit has a decision for every one of the **24 families**, with exact current source hashes and specific reuse/new-scope boundaries. An old S24 backup-tool pin differs from current bytes. Later accepted **17-case local restore** and **15-case encrypted-retention** results bind the current backup tool and their entire source graphs still match. This reconciles the stale map without editing its historical fields or rerunning backups. Actual off-host acceptance in that later evidence is explicitly false.

## 2. Eight genuine gaps: actual outcomes

Fresh native PostgreSQL **18.4** custodian and receiver fixtures ran sequentially. The unchanged metadata fixture installs the selected custom composition; source application projections and optional management/provider deployment are not newly certified here. Each case proves a legal positive outcome, the original negative contract, the selected omission's committed divergence, exact restoration, and the original negative contract again.

| New omission | Original contract | Actual mutant divergence |
| --- | --- | --- |
| KEY01 public SPKI/key-ID binding | Unique ID that disagrees with valid supplied material returns false; key history unchanged. | Rotation commits a key whose ID does not hash to its public material. **KILLED.** |
| KEY02 unsigned retirement | A committed unsigned receipt prevents retiring its active key. | Rotation retires the old key while its receipt remains unsigned. **KILLED.** |
| KEY03 expected epoch | Expected epoch 99 against current epoch 1 returns false. | Rotation advances directly to epoch 100 and writes history. **KILLED.** |
| ACCEPT01 enrolled service | A valid source MAC with another event service is rejected with 23514; source sequence stays zero. | Restricted ingestion commits the foreign service and advances sequence to one. **KILLED.** |
| EXPORT01 compromised key | Local export ACK using a COMPROMISED registry key returns false. RETIRED remains supported by the positive control. | Restricted verifier persists ACKED with the compromised key still recorded. **KILLED.** |
| CLEAN01 delegation rollback | Missing linked receiver work raises 23514 and retains payload, revision and operation history. | Public CLEAN commits payload removal and operation history despite missing work. **KILLED.** |
| JOURNAL01 rejection journal | A changed payload at a retained key returns NULL and appends one binding-rejection audit record. | Return remains NULL and original binding/receipt remain intact, but the required journal is missing. **KILLED.** |
| RETRY01 attempt-count CAS | Expected count 2 against REVIEW/attempts 3 returns false without recovery history. | Authorized recovery commits PENDING/attempts 0 and records expected count 2. **KILLED.** |

**Selected result: 111/111 assertions PASS; 8/8 new omission instances KILLED; zero survivors or unresolved selected mutation errors.** Seven violations are wrong committed transitions; the eighth is the missing required committed journal. Counts include setup, caller, positive/negative, state, metadata and restoration assertions; they are not 111 independently falsified SQL conditions.

Actual restricted logins execute ingestion, export ACK, capture, operator cleanup and retry. Rotation uses the existing trusted fixture-owner key-administration boundary, without adding a service grant. Role flags and lack of direct event UPDATE are checked; only the current case's required connections stay open. Public Ed25519 material is generated with Node's standard crypto library; private keys are not exported. Source MACs use the existing protocol with standard HMAC. The signature persistence control uses a format-valid synthetic signature and establishes no new Ed25519 verification. Genuine signed receipts and independent status remain the accepted historical P6/ICR-1 scope.

The selected execution ran **30 October 21:24:03.712–21:24:28.829 UTC**, corresponding to **31 October 02:54:03–02:54:28 IST**. No product SQL, budget, signing implementation, financial authority or application migration changed.

## 3. Resolved exclusions and masked mutations

**EX01 — private observe duplicate return.** Public observe locks broker control and the attempt, then returns immediately if response_hash exists. Delegation therefore reaches the same locked attempt with a NULL hash; another session cannot change that row between the wrapper check and private call. The installed call graph has only that wrapper invoking the private alias, and service EXECUTE is revoked. Its native duplicate branch remains unhit. This is a service-composition reachability exclusion, not an equivalent-mutant claim or a grant to bypass the wrapper.

**EX02 — private cleanup no-eligible-target return.** Public operate locks and validates the request, requires terminal/guarded status for CLEAN, and sets cleaned=true before delegation. The helper reads that same locked row; work_id is NOT NULL. Its no-eligible-target return is excluded on this path. The separate missing receiver-work return is reachable: P5 exercises rollback, and CLEAN01 now detects omission of the caller's rollback guard. Only operate calls the helper in the reviewed installed graph; the service has no direct helper grant.

Both exclusions are bound to exact current definitions, grants, table DDL and call ordering. Direct trusted-owner manipulation or changed wrappers/triggers/ACLs require review again. Optional hold/capture topologies retain their separate evidence; these exclusions are not universal claims over arbitrary deployments.

The earlier four ACK survivor instances retain raw **SURVIVED** classifications and their source-bound redundancy reviews. No new survivor appeared. The reviewed ACK register's scope and proof limitations are unchanged.

## 4. Final register and honest completion scope

The finalized new-P8 register has **28 distinct selected guards / 48 installation instances: 44 KILLED and four raw SURVIVED with reviewed equivalence; zero unresolved selected instances**. This includes the twenty ACK guards across both installations and these eight single-installation guards. The separate historical P/O/T/B/R/Q/S-MAC families are reuse evidence, not additional new-P8 targets or an inflated combined denominator.

This completes the requested review/exclusion/finalization work and closes the enumerated supported mutation register. It does not certify every AND/OR/NULL/CASE operand, all mutation operators or combinations, every race, or all optional management/retention/backup code. Those families have explicit limits in the audit. Native gaps stay unhit where excluded; SQL expressions and DDL receive no invented profiler denominator. Whole-SQL and the wider P8 label remain PARTIAL outside this register. No further mutation batch is automatically started.

## 5. Restoration, retained failures and preservation

Each omitted definition is retained as raw SQL with its original/mutant hashes. Owner, SECURITY DEFINER, path and ACL metadata remain equal. The controller restores the owned synthetic rows and sequence values from memory, using transaction-local capture suppression during restoration; settings return to origin and full row/sequence fingerprints are compared. No plaintext data dump is written. Entire selected before/after catalogs match, both selected servers stop, and all six owned servers across rehearsals are confirmed stopped.

Two original source-bound harness failures remain intact:

1. **52 assertions passed before a 42501 probe error.** The metadata privilege check attempted schema-name resolution through a role denied that schema. The corrected probe uses the owner-resolved table OID, without adding grants.
2. **57 assertions passed before connection refusal.** Opening all roles together exceeded the existing eight-connection budget/reserved slots. The correction validates roles one at a time and opens only the roles needed by the current case. No connection limit was raised.

Both failed attempts completed/restored their four custodian omissions before stopping in receiver setup. They are not selected as full passing executions. Their original witnesses, stdout/stderr, source snapshots and annotations remain in their original new evidence paths. The selected current run passes all eight. Its four ERROR lines are the intended original/restored 23514 service and cleanup rejections; it has zero FATAL/PANIC/unexpected termination lines. The earlier slot-refusal FATAL is retained as a harness observation, not a server crash or a suppressed product failure.

Initial finalization also stopped on the stale S24 pin and a scoped lint alias. The original builder and annotation are retained. Later matching evidence reconciles S24; the active builder uses the explicit regex flag. No database outcome changed.

**727/727 entry-baseline inputs, HEAD and staging index remain unchanged.** All fifteen original SQL hashes match the accepted composed P4 source pins. Frozen V5, Clerk, original migrations, guard/accounting policy and earlier evidence retain their recorded identities. Preservation is scoped to the recorded inventory; unrelated editor contents are not claimed as newly certified. Only new test/evidence files were written. No JS/TS changed; no unrelated backend/typecheck campaign ran.

| New active code | SHA-256 |
| --- | --- |
| `tools/phase9d/native_p8_highrisk_mutations.py` | `9c10414a78539599ae32a80cbf4aed8e94e7eca258be970695725007501dd86a` |
| `tools/phase9d/p8_highrisk_cases.py` | `36b70ff7d36892ec115dd871d22e902776cc565be5970c16c8818b989cc001b2` |
| `output/phase9d-p8-final-review-2026-10-31/executors/run_job.py` | `ee5c70b989f153840a40fe9ec651e630a41600722c13f9ae40fd1a2472248bf1` |
| `output/phase9d-p8-final-review-2026-10-31/executors/finalize.py` | `4431994fdfe5981a0db068a7b7bb7f7fcc9f4692d15b02aa53abcaa8bbeb3f18` |

Scoped Ruff, AST and Git/explicit new-file whitespace checks cover these four active Python files and the checkpoint. Historical failing source snapshots remain evidence, not passing current implementation. The manifest separately binds the checkpoint, registers, exact catalogs, source snapshots, selected receipt, failures and execution tooling.

## 6. Resource observations and independent holds

Servers ran sequentially with 32 MiB shared buffers, 1 MiB work memory, eight connections, 15/5-second statement/lock limits and a 240-second wrapper deadline. Shared/session/local preloads are empty, plpgsql_check absent and matching profiler settings zero. No native profiling or routine replacement on a profiled server occurred. These native settings are not hard process RAM quotas.

The selected job retained **26 samples**, minimum available RAM **3,745.46 MiB** and minimum commit headroom **13,883.71 MiB**. Across all **58 samples** from the three attempts, minimum available RAM was **3,511.93 MiB**, with zero unresponsive taskbar samples. Maximum selected sample gap was **1.001 seconds**. Minimum free disk was C: **91.81 GiB**, D: **477.97 GiB**. Owner-disabled RAM admission thresholds stayed disabled; deadlines and responsiveness checks remained active. Sampling cannot guarantee absence of an OS freeze. No unrelated app/service or global setting changed.

Default-cache signal-11 remains **OPEN/PAUSED**; signal-9 remains **SEPARATE/UNATTRIBUTED**. Accepted P6 cache-OFF 16/16 behavior/native and P7 14/14 behavior/native remain preserved. Google/R2 activation, actual off-host restore, final independent custodian/key handoff, real provider/copy integration, approved retention periods, deployed capacity/alerts and other production gates remain pending independently of this register.

No Docker startup, crash reproduction, hosted/customer/provider operation, paid resource, production deletion, commit, push, merge or deployment occurred. All 78 readiness criteria, 20 audit rows and 24 condition families retain their original fields/order with additive assessments. **Production remains OFF; deletion DISABLED. Stop after this review.**
