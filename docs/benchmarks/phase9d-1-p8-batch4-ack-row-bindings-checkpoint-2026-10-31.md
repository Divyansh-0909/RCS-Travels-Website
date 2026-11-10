# Phase 9D-1 — P8 Batch 4: ACK stored-row argument bindings

31 October 2026 IST. Continues the [SQL plan](phase9d-1-sql-coverage-plan.md), [first P8 batch](phase9d-1-p8-lineage-mutation-checkpoint-2026-10-23.md), [Batch 2](phase9d-1-p8-batch2-ack-guards-checkpoint-2026-10-29.md) and [Batch 3](phase9d-1-p8-batch3-ack-protocol-checkpoint-2026-10-30.md).

**Selected Batch 4 scope: VERIFIED_IN_ISOLATION. P8, whole-SQL and Phase 9D-1: PARTIAL. Production OFF; production deletion DISABLED. Docker/profiler investigation remains PAUSED.**

Evidence: [manifest](../../output/phase9d-p8-batch4-2026-10-31/manifest.json), [actual witness](../../output/phase9d-p8-batch4-2026-10-31/witness.json), [mutation register](../../output/phase9d-p8-batch4-2026-10-31/mutation-register.json), [selected execution](../../output/phase9d-p8-batch4-2026-10-31/selected-execution.json), [preservation](../../output/phase9d-p8-batch4-2026-10-31/preservation.json) and [additive readiness assessment](../../output/phase9d-p8-batch4-2026-10-31/readiness-current.json).

## Scope and discriminating inputs

The owner authorized the recommended two-guard continuation. The target remains `custody_lineage.ack(bigint,text,jsonb)`, installed separately in fresh native PostgreSQL **18.4** source and receiver fixtures, one server at a time. The unchanged metadata fixture supplies the existing custom SQL compositions and minimal application table projections; this is not a full hosted application deployment or independent production administration.

Batch 1 measured receipt-body comparisons against the call arguments. This batch separately omits the retained row's `seq=n` or `hash=h` predicate. Changing only an argument can be masked by the remaining body-to-argument comparison. The discriminating cases therefore change both the argument and its receipt field while preserving the other event bindings. Actual PostgreSQL predicate observations establish that the omitted row predicate is false and the other four identity comparisons are true.

| Omission | Invalid inputs per installation | Actual mutant outcome per installation |
| --- | --- | --- |
| ACK19 stored sequence: `WHERE seq=n AND` → `WHERE true AND` | Five paired sequences: nonexistent positive, another retained event, zero, negative and maximum bigint. Three controls: SQL NULL argument, wrong argument only, wrong body sequence only. | Five invalid receipts persisted on the original event; three controls still rejected. **KILLED.** |
| ACK20 stored hash: `AND hash=h AND` → `AND true AND` | Three paired hash values: different 64-character string, empty string and noncanonical string. Four controls: SQL NULL argument, wrong argument only, wrong body hash only and JSON-null body hash. | Three invalid receipts persisted; four controls still rejected. **KILLED.** |

Both installations execute all fifteen inputs. For NULL arguments the remaining equality is SQL UNKNOWN, which cannot select a row. JSON-null body hash remains rejected by the unchanged body-type contract. These observations distinguish masks on particular inputs from a guard being unnecessary.

## Method and actual results

The harness invokes the actual `custody_lineage_verifier` login. Its non-superuser/non-createdb/non-createrole/non-inherit/non-bypass-RLS flags and lack of direct event UPDATE are checked. Fixture-owner connections separately inspect committed state.

For each omission, a valid receipt and exact duplicate first succeed. The original function then rejects every invalid input without changing the queue. Exactly one uniquely matched predicate is omitted in the disposable function catalog, and its raw SQL/hash is retained. The same inputs run through the verifier; acceptance must persist the exact invalid receipt on the target event. An independently retained sentinel and complete queue comparison verify that no other event changes. The finally path restores the exact definition/metadata; all original rejections run again. Entire before/after fixture catalogs match.

| Check | Accepted result |
| --- | --- |
| Assertions, including controls, persisted state, roles and restoration | **310/310 PASS** |
| Distinct omissions / installation instances | **2 / 4** |
| Mutant classification | **4/4 KILLED; zero survivors** |
| Invalid input instances | **30**: fifteen per installation |
| Mutant replies | **16 persisted invalid ACKs; 14 false/no-write; zero SQL errors** |
| Positive controls | **4 valid receipts and 4 exact duplicate calls succeed** |
| Source stability | Executed source graph unchanged during execution and at final readback |
| Scoped quality | **4 Python files: Ruff and AST PASS; Git and explicit new-file whitespace PASS** |
| Preservation | **602/602 recorded inputs unchanged; HEAD and staging index unchanged** |
| Cleanup/diagnostics | Both owned servers stopped; zero remaining owned PID files; zero ERROR/PANIC/unexpected termination lines; one normal start/shutdown each |

The database workload ran from **30 October 20:36:39.559 to 20:36:55.578 UTC**, corresponding to **31 October 02:06:39–02:06:55 IST**. The original timestamps remain in the receipt. No full backend/typecheck was needed because no JavaScript/TypeScript or product implementation changed. No previous passing batch was rerun.

The synthetic receipt has format-valid signature/key fields but no newly verified cryptographic signature, key registry or remote custody commit. This batch measures the authorized local verifier contract only. Existing genuine signing, historical-key and independent false-ACK evidence remains at its recorded epochs. No acknowledgement gains human-final or financial authority.

## Source and catalog identities

All fifteen original SQL files remain unchanged. `closure-lineage.sql` remains SHA-256 `9e5f62b7f851a8e9c4b37d40105594b91258131e1d896206a7b63662408e38a7`. The exact installed original ACK definition in both fixtures is `f2fa584c01c16ce4ac1e15c8c4f77ffcd85c3f98f08f4076ba522f8a7ecf25c9`, matching the selected Batch 3 identity. Raw historical CRLF identities are not substituted for this LF definition.

| New code only | SHA-256 |
| --- | --- |
| `tools/phase9d/native_p8_ack_batch4.py` | `cc8d856b45c785bd3223b2d44fa2db816c8d51c0ee9a4f69430a71c481aa0874` |
| `tools/phase9d/p8_ack_batch4_cases.py` | `c7bf237664aed29ee20860ecd2f53ed520b9b70b62e65c52cc5083a898b6e0c0` |
| `output/phase9d-p8-batch4-2026-10-31/executors/run_job.py` | `8608ddf809e8cd86717b967d33f0773daafd113e2097d73d9666ffaf0d5a632d` |
| `output/phase9d-p8-batch4-2026-10-31/executors/finalize.py` | `e28bbf345f7cfc0a2d596d4741a17c06e60050b1e57e40f6783a9ba6be2fba7d` |

The ACK19 mutant definition is `58190f4783a5aada2b2cd16d75ec7ebeab625ec33fa6fce14176e5c0fd61bb9e`; ACK20 is `2639f41bc410f34e6f8451183b3a822aa64c2e9878b01e70f989fe4d09c12477`, identical across installations. Complete original/mutant/restored definitions, owners, SECURITY DEFINER, search paths and ACLs are retained. Existing implementation files were not edited. The manifest separately binds this checkpoint, new code, execution tooling, source snapshots and evidence.

All sixty entries in the selected Batch 3 manifest matched before this continuation. Its separately reconstructed Batch 1 prose copy and explanation remain unchanged; no historical checkpoint or manifest was repaired in place. The current assessment preserves all **78 readiness criteria, 20 audit rows and 24 condition families**, adding Batch 4 under S08.

## Resource observations and remaining scope

Shared buffers were 32 MiB, work memory 1 MiB and maximum connections eight; statement/lock timeouts were 15/5 seconds and wrapper deadline 240 seconds. Native PostgreSQL GUCs are not hard process memory quotas. Shared/session/local preloads were empty, plpgsql_check absent and matching profiler settings zero. No profiling or Docker ran.

The observer retained **17 samples**: minimum available RAM **1,654.07 MiB**, minimum commit headroom **14,010.00 MiB**, zero unresponsive taskbar samples and maximum interval **1.002 seconds**. Minimum free disk was C: **92.11 GiB**, D: **477.98 GiB**. Owner-disabled RAM admission/abort thresholds stayed disabled; deadlines and responsiveness checks remained active. Same-host samples do not guarantee absence of an OS freeze. No unrelated process or global setting changed.

Across the four selected ACK batches, twenty distinct omissions have forty installation instances: **36 KILLED and four Batch 2 SURVIVED with observed masking**. Those four remain survivors, with no equivalence claim. These are selected mutation denominators, not a whole-SQL percentage or native procedural measurement. Next work is to strengthen the required-field/signature-type masking justification and review the condition-family map for genuinely uncovered high-risk guards; unchanged historical mutation families should not be repeated for totals.

P6 cache-OFF behavior/native **16/16 each** and P7 behavior/native **14/14 each** remain preserved. Default-cache signal-11 is **OPEN/PAUSED**; signal-9 is **SEPARATE/UNATTRIBUTED**. Google/R2 activation, genuine off-host recovery, final custodian/key handoff, provider/copy integration, approved category retention periods and deployed storage/alerting remain independent pending gates.

No production/customer/provider connection, paid resource, native crash reproducer, broad mutation campaign, commit, push, merge or deployment occurred. Frozen V5, Clerk, signing, guards, financial policy, original migrations and unrelated working changes retain their recorded identities. **Stop after this batch. Production remains OFF; deletion DISABLED.**
