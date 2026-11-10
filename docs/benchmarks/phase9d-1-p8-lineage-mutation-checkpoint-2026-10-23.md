# Phase 9D-1 - P8 first bounded lineage ACK mutation batch

23 October 2026 IST. Continues the [SQL coverage plan](phase9d-1-sql-coverage-plan.md), [handoff](phase9d-1-chatgpt-handoff-2026-10-23.md), [ICR-1 correction](phase9d-1-lineage-ack-checkpoint-2026-10-18.md), [P6/P7 closure review](phase9d-1-p6-p7-storage-retention-closure-2026-10-18.md) and [SQL conditions/metadata](phase9d-1-sql-conditions-metadata-checkpoint-2026-10-23.md).

**P8: STARTED. First selected omission batch: VERIFIED_IN_ISOLATION. P8 overall: PARTIAL. Whole-SQL and Phase 9D-1: PARTIAL. Production OFF; production deletion DISABLED. Profiler/Docker investigation remains PAUSED.** This additive checkpoint supersedes only thexearlier NOT_STARTED P8 decision; historical reports and results remain unchanged.

Evidence: [manifest](../../output/phase9d-p8-lineage-2026-10-23/manifest.json), [start decision](../../output/phase9d-p8-lineage-2026-10-23/start-decision.json), [actual witness](../../output/phase9d-p8-lineage-2026-10-23/witness.json), [mutation register](../../output/phase9d-p8-lineage-2026-10-23/mutation-register.json), [selected execution](../../output/phase9d-p8-lineage-2026-10-23/selected-executions.json), [routine inventory](../../output/phase9d-p8-lineage-2026-10-23/routine-inventory.json) and [current readiness](../../output/phase9d-p8-lineage-2026-10-23/readiness-current.json).

## 1. P8 prerequisite/start decision

The owner explicitly authorized P8 in the supplied “Start P8 if Unblocked” prompt. The authoritative plan's section 6 P8 and section 7 item 5 require targeted changed/high-risk omissions, a baseline that rejects the seed, fresh unprofiled infrastructure, retained mutant identities and exact restoration. They prohibit repeating unchanged P26/O13/T12/B6/R10/Q3 campaigns merely to increase totals. Those campaigns did not run here.

The selected target is the changed ICR-1 `custody_lineage.ack(bigint,text,jsonb)` receipt contract in its actual source and receiver installations. Its accepted source hash, 13/13 behavioral/catalog evidence and 88 malformed cases per installation are reused. The 23 October 824 metadata/253 condition results and the accepted P2-P7 profiling windows are retained at their stated definitions/epochs, with their exclusions. No new ACK native numerical attribution is inferred from them.

There is no dependency on Google/R2, production policy, off-host recovery or final custody administration for this disposable local omission experiment. The default-cache profiler failure is not needed or enabled: preload settings are empty, the extension is absent and no profiler GUCs exist. This makes separate unprofiled mutation execution possible while the instrumentation investigation stays paused. Full profile/SQL-expression/whole-SQL adequacy is not declared closed as a prerequisite shortcut; those incomplete measurements remain separate sub-scopes.

**Decision: STARTED for this narrow batch, no genuine execution blocker.** Production-only gates and paused investigations remain unchanged. This is not authorization to resume a crash reproducer, deploy, delete production data or certify every remaining family.

## 2. Scope, installation identities and reuse

The source inventory still contains **81 declarations in 15 selected original SQL files, 74 distinct declared qualified names**, plus the existing four broker before_recovery renames and receive_committed rename. The preceding installed metadata inventory has **38 source / 53 receiver / 8 custodian custom runtime instances**, 99 across compositions; extension members are separate. All source/receiver routine definitions in this fresh batch match their selected 23 October metadata identities. Custodian metadata is reused, not re-executed.

The unchanged `native_sql_metadata_fixture.py` installs the existing custom composition and five minimal source application table projections. This is not the full 51-table/PostGIS/provider deployment or independently administered production custody. The two installations run in separate fresh local PostgreSQL **18.4** servers, sequentially; no original dev, hosted customer or production record is touched.

| Evidence scope | Previously accepted | Newly observed here |
| --- | --- | --- |
| ICR-1 receipt contract | 13/13 integration; source/receiver 88 malformed cases each; signed/duplicate/key-history/independent-status observations | Eight targeted guard omissions per installation, original rejection, positive controls, persisted mutant acceptance and exact restoration |
| 24 condition families | Earlier 96/94/77/377 selected expression windows and current 253 checks at their own epochs | S08 gets an additive selected-mutation assessment; other families are not rerun |
| Custom metadata | 824 assertions, 99 custom instances across three compositions | Source/receiver definitions match; restricted verifier and entire before/after fixture catalogs checked |
| Native procedural measurements | Pinned PostgreSQL 17.5/plpgsql_check v2.10.4 windows; final P6/P7 cache OFF and explicit gaps | **No new native counters or percentage**; PG18.4 mutation results are a different measurement |

The current installed ACK definition SHA-256 is `f2fa584c01c16ce4ac1e15c8c4f77ffcd85c3f98f08f4076ba522f8a7ecf25c9` in both installations. The historical ICR-1 raw definition hash remains `25d469fd557ff4e746fb1c8dc9c5872dc7cc91be379e221b4122bafc3f972423`; **normalizing only CRLF to LF produces the current hash exactly**. Neither raw identity is substituted for the other. The product source remains `9e5f62b7f851a8e9c4b37d40105594b91258131e1d896206a7b63662408e38a7`.

## 3. Executed mutation method and results

[native_p8_lineage_mutations.py](../../tools/phase9d/native_p8_lineage_mutations.py) calls the actual restricted `custody_lineage_verifier` login, verified as non-superuser/non-createdb/non-createrole/non-inherit/non-bypass-RLS, without direct table UPDATE. Fixture-owner reads observe persisted outcomes. Only the disposable database's function catalog is replaced; each mutant SQL copy remains in the new evidence directory.

For each case the harness:

1. Proves an ordinary positive receipt and exact duplicate succeed; a conflicting accepted receipt fails. Positive-control transactions roll back and another connection sees no uncommitted ACK.
2. Proves the original definition rejects the selected invalid seed and retains the row. The immutable-receipt case first commits its valid original receipt.
3. Replaces exactly one uniquely identified guard in that disposable installation, retaining the complete mutant, its hash and unchanged owner/security/path/ACL metadata.
4. Submits the same seed through the actual verifier. An ACKED row containing that invalid seed proves that the original contract's rejection oracle detects the omission. This observable contract violation classifies the mutant KILLED.
5. Restores the exact original catalog definition and metadata in a finally path, restores the owned synthetic row to its pre-probe state, and proves the original rejection again. Entire fixture catalogs match before/after the batch.

| Guard omission | Invalid seed | Source | Receiver |
| --- | --- | --- | --- |
| ACK01 root closed fields | Unexpected envelope property | KILLED | KILLED |
| ACK02 body closed fields | Unexpected body property | KILLED | KILLED |
| ACK03 all body scalars strings | Numeric event sequence that text extraction otherwise matches | KILLED | KILLED |
| ACK04 event hash binding | Receipt hash differs from retained event/argument | KILLED | KILLED |
| ACK05 event sequence binding | Receipt sequence differs from selected event | KILLED | KILLED |
| ACK06 event source binding | Receipt source differs from retained event | KILLED | KILLED |
| ACK07 key-ID syntax | Noncanonical key identifier | KILLED | KILLED |
| ACK08 accepted receipt immutability | Different receipt UUID overwrites accepted history if guard omitted | KILLED | KILLED |

**Actual accepted result: 236/236 assertions PASS; 16/16 selected installation/mutant instances KILLED; zero survivors, mutation errors or equivalence claims.** Eight guard omissions exercised twice is the complete denominator for this batch. It is not 16 distinct product guards, all SQL mutants, a native branch score or a whole-SQL percentage. The 236 includes baseline/control/row/catalog/restoration assertions, not 236 independently falsified conditions or integration leaf tests.

Receipts are intentionally well-shaped synthetic verifier inputs, with a format-valid synthetic signature/key identity. **No cryptographic signature, independent remote commit or key-registry acceptance is established by this new batch.** SQL still trusts the authorized verifier. The existing genuine signed-receipt, retired/compromised-key and FALSE_ACKNOWLEDGEMENT tests are reused at their own epochs; no new local crypto, custody authority or repair behavior is added.

## 4. Environment, quality, monitoring and preservation

| Check | Accepted observation |
| --- | --- |
| Native environment | PostgreSQL 18.4; loopback SCRAM; one server at a time; eight maximum connections |
| Work bounds | 32 MiB shared buffers, 1 MiB work memory; 15-second statement/5-second lock timeouts; 240-second wrapper deadline |
| Profiler separation | Shared/session/local preloads empty; plpgsql_check extension absent; zero matching settings in each server |
| Quality | Ruff and AST: three new Python files PASS; scoped Git and explicit new-file whitespace PASS |
| Cleanup | Both owned servers stopped; no remaining owned postmaster PID files |
| Diagnostics | One normal start/shutdown per server; zero ERROR/PANIC/unexpected termination lines in the sanitized projections |
| Preservation | **381/381** recorded inputs unchanged, including original SQL/migration inputs and selected V5/Clerk sources; HEAD and staging index unchanged |
| Matrices | All **78 criteria**, **20 audit rows** and **24 condition families** preserved; new assessments are additive |

PostgreSQL settings are not hard native-process memory quotas. The preflight recorded **168.33 MiB available RAM / 3169.47 MiB commit headroom**, with a responsive taskbar. During the selected 22-sample job, minima were **640.24 MiB available RAM / 2943.62 MiB commit headroom**, zero unresponsive taskbar samples and a maximum sample interval of 1.001 seconds. Different times and unrelated host activity explain why these are separate observations; no claim is made that this job increased free RAM or that sampling proves no OS freeze. Owner-disabled RAM admission/abort thresholds remained disabled. Work remained a bounded native job, without compiler/Docker/concurrent campaign overhead.

The first launcher used system Python and failed importing psycopg **before database creation**. Its receipt/stdout/stderr/source snapshot remain unselected. The accepted run uses the existing protected backup-tools environment: Python **3.13.5**, psycopg **3.2.12**. Initial scoped lint found import/closure-binding and later finalizer-style issues; pre-fix source/quality records are retained. No product SQL was changed, no surviving mutant was hidden and no database failure was erased by these corrections.

Immediately before this P8 prompt, the earlier owner-authorized Docker preparation stopped five NVIDIA overlay processes and WidgetBoard, and temporarily reduced the dormant WSL ceiling. The new P8 instruction superseded that work **before any Docker startup or diagnostic**. The original WSL configuration was restored byte-for-byte; preparation and pause records remain under `output/phase9d-profiler-resume-2026-10-23/`. No further unrelated process termination, new global resource setting or Docker workload occurred for P8.

| New code | SHA-256 |
| --- | --- |
| `tools/phase9d/native_p8_lineage_mutations.py` | `3eb927463d83556d19eeaca8269f217820975ca65d70daf84f11e456454c620d` |
| `output/phase9d-p8-lineage-2026-10-23/executors/run_job.py` | `92629044a82167ba3e0fa9955a904084e76e48e49d337d79498cb4b96447a6f9` |
| `output/phase9d-p8-lineage-2026-10-23/executors/finalize.py` | `c4fa3780d66214529e027ef9c03ddf574ba02b9125a3312e54f9a661064f83a1` |

No existing implementation file was edited by P8. The manifest separately binds this checkpoint, current assessments, exact SQL mutants, source snapshots, witnesses, predecessor identities and execution/quality tooling. The original dirty working tree was preserved within the stated inventories; this is not a claim over every unrelated editor file. Application JS/TS did not change, so backend typecheck/full regression was not run. Frozen V5, Clerk, signing, independent guards, business/financial policy and original migrations retain their protected identities/scope.

## 5. Remaining scope and next smallest step

This starts P8; it does not complete it. Required-field redundancy, other shape/value/NULL boundary omissions, remaining acceptance/lease/MAC/epoch/cleanup predicates, private normal-path exclusions, deployment-specific metadata and structural/equivalence analysis remain explicitly outside this selected denominator. A future survivor is unresolved unless a source-bound equivalence/reachability proof supports another classification. No native coverage exists for SQL-language/DDL operands merely because this omission batch passed.

The next smallest justified P8 step is a separate short ACK sub-batch for the remaining required-field, custody-sequence, receipt/signature-format checks, reusing the current positive/rejection controls. Review overlapping predicates first: a required-field-check omission may be masked by individual value/type/binding checks; test all affected missing fields and retain any survivor rather than treating redundancy as a defect or claiming equivalence without proof. Then prioritize only genuinely uncovered changed acceptance guards from the 24-family map. Do not repeat unchanged historical campaigns or force private service bypasses for a score.

Google/R2 activation, off-host recovery, final custodian/key handoff, real provider/copy integration, approved retention durations, deployed storage/monitoring and production readiness remain independent pending gates. P6 cache-OFF **16/16** behavior/native and P7 **14/14** behavior/native are preserved. Default-cache signal-11 remains **OPEN/PAUSED**; signal-9 **SEPARATE/UNATTRIBUTED**. No held investigation resumed.

**Stop after this first bounded P8 batch. P8 is STARTED/PARTIAL, whole-SQL and Phase 9D-1 remain PARTIAL. No production/customer/provider operation, paid provisioning, application deployment, commit, push or merge occurred. Production remains OFF; deletion DISABLED.**
