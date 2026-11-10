# Phase 9D-1 — P8 ACK survivor reconciliation

31 October 2026 IST. Continues [Batch 2](phase9d-1-p8-batch2-ack-guards-checkpoint-2026-10-29.md), [Batch 4](phase9d-1-p8-batch4-ack-row-bindings-checkpoint-2026-10-31.md) and the [SQL plan](phase9d-1-sql-coverage-plan.md).

**The four existing ACK survivor instances now have a source-bound redundancy justification for the observation scope below. Their raw runtime classification remains SURVIVED. The enumerated twenty-guard ACK omission register is reconciled; P8, whole-SQL and Phase 9D-1 remain PARTIAL. Production OFF; production deletion DISABLED. Docker/profiler investigation PAUSED.**

Evidence: [manifest](../../output/phase9d-p8-ack-survivor-review-2026-10-31/manifest.json), [equivalence review](../../output/phase9d-p8-ack-survivor-review-2026-10-31/equivalence-review.json), [actual witness](../../output/phase9d-p8-ack-survivor-review-2026-10-31/witness.json), [selected execution](../../output/phase9d-p8-ack-survivor-review-2026-10-31/selected-execution.json), [reviewed ACK register](../../output/phase9d-p8-ack-survivor-review-2026-10-31/ack-omission-register-reviewed.json), [preservation](../../output/phase9d-p8-ack-survivor-review-2026-10-31/preservation.json) and [next target register](../../output/phase9d-p8-ack-survivor-review-2026-10-31/next-target-register.json).

## Why these guards survived

Batch 2 omitted the required-body-fields predicate (ACK09) and signature-type predicate (ACK13), once in each actual source/receiver installation. Other guards rejected every selected seed. This continuation reviews those exact mutant definitions, with matching original and mutant hashes. It adds **zero distinct guard omissions** and does not inflate the forty-instance register by counting this review as four new targets.

The equivalence assessment concerns the boolean return and persisted event effects of the pinned function under ordinary PostgreSQL evaluation of its typed bigint/text/jsonb arguments. It does not claim identical timing, planner/lock activity or behavior under host/resource failures. It is neither cryptographic validity nor a whole-SQL equivalence theorem.

### ACK09: required body fields

With all nine keys present, the original required-field rejection predicate is false. Removing it leaves identical subsequent checks, including checks of extra fields and value types.

When any key is absent, another check necessarily prevents acknowledgement:

| Missing key | Retained reason |
| --- | --- |
| schema, custodian or outcome | `IS DISTINCT FROM` the expected literal is TRUE. |
| custodySequence, receipt or keyId | Missing text coalesces to the empty string and fails its anchored format. |
| source, sequence or hash | Missing text is SQL NULL. Its retained equality in the conjunctive UPDATE is UNKNOWN for every row/argument; no row can match. |

These alternatives cover every nonempty absent-key subset, regardless of the other field values. Root/body validation remains in place; `jsonb_each` operates on an object, and the remaining text extraction/comparison operations do not cast receipt fields to potentially failing numeric/UUID types. Non-string values and extra keys retain their independent checks. No change in missing-field rejection or persisted acknowledgement follows from this particular omission.

Executable support covers all **511 nonempty subsets** of the nine required fields in each installation. Of these, **504** have a definite remaining IF rejection; the other **seven** omit only one or more of the three event-binding fields and have an UNKNOWN comparison that prevents UPDATE. Actual PostgreSQL truth observations, original/mutant/restored replies and complete queue hashes are retained. The finite value fixtures support the source argument; they are not an enumeration of every JSON payload or every argument value.

### ACK13: signature type

For a string, the original type-rejection predicate is false, so removing it changes no subsequent check. For every non-string category, the retained signature-format predicate prevents UPDATE:

- Missing/JSON-null signatures extract SQL NULL, coalesce to empty text and fail the format.
- Boolean and finite JSON-number text cannot have the required trailing `==` padding.
- Array/object text ends with a closing bracket/brace, rather than `==`.

These cases cover the JSONB type partition. The retained anchored pattern requires 86 characters from its base64 alphabet followed by `==`. Twenty negative cases per installation exercise absent/null, booleans, small/large/fractional numbers, arrays/objects containing a valid-looking signature, and malformed strings. Two valid-looking string controls succeed, including exact duplicate checks. This is format redundancy only; no new signature verification is established.

**Review disposition: EQUIVALENT_BY_SOURCE_BOUND_REDUNDANCY for both omissions in both installations.** Original artifacts and raw SURVIVED classifications are unchanged. Keep the explicit product guards: they communicate the contract and remain useful if surrounding checks change.

## Actual execution and preservation

The unchanged native fixture installed separate fresh PostgreSQL **18.4** source and receiver compositions, sequentially. It uses the selected custom SQL and minimal source-table projections, not a full managed deployment. The actual restricted verifier login made calls; fixture-owner connections independently checked persisted rows. Only the two disposable function definitions were replaced, and exact definition/owner/security/search-path/ACL restoration and complete catalog equality were verified.

| Check | Result |
| --- | --- |
| Assertions across both installations | **8,560/8,560 PASS** |
| Negative input instances | **1,062**: 511 missing-field combinations plus 20 signature cases per installation |
| Original, mutant and restored replies | All negative cases return false; full queue unchanged |
| Positive controls | **6 valid-looking receipts and 6 exact duplicate calls succeed** |
| Existing mutant runtime classifications | **4 SURVIVED; zero new kills** |
| New source-bound equivalence reviews | **4**, applied additively |
| SQL/server errors | **0 ERROR/PANIC/unexpected termination lines** |
| Cleanup | Both owned servers stopped; no owned postmaster PID files remain |
| Preservation | **658/658 recorded inputs, HEAD and staging index unchanged** |
| Quality | **4 Python files: Ruff/AST PASS; scoped Git and explicit new-file whitespace PASS** |

Execution ran **30 October 20:49:50.787–20:50:05.801 UTC**, corresponding to **31 October 02:19:50–02:20:05 IST**. Runtime source bindings match current bytes. No JS/TS or existing product implementation changed, so no unrelated backend/typecheck campaign ran.

All forty original ACK installation instances remain accounted for: **36 KILLED**, plus **four raw SURVIVED instances with the source-bound equivalence assessment above**. This reconciles only the enumerated twenty single-guard omissions. Compound omissions, other mutation operators, cryptographic trust, independent status, all concurrency schedules, SQL expressions and database metadata do not become certified by that accounting. Original independent-custody/signing results are reused at their own epochs.

All fifteen original SQL files remain unchanged. `closure-lineage.sql` retains SHA-256 `9e5f62b7f851a8e9c4b37d40105594b91258131e1d896206a7b63662408e38a7`. Both installed ACK definitions retain `f2fa584c01c16ce4ac1e15c8c4f77ffcd85c3f98f08f4076ba522f8a7ecf25c9`. The new assessment preserves all **78 readiness criteria, 20 audit rows and 24 condition families**, with an additive S08 review. Historical checkpoints, including their earlier unresolved classifications, remain unchanged.

| New code only | SHA-256 |
| --- | --- |
| `tools/phase9d/native_p8_ack_survivor_review.py` | `5b5aa68c2fcf8796425d54531f367f1b450a51c1f4ed0ca78f90afa87b247408` |
| `tools/phase9d/p8_ack_survivor_cases.py` | `d2ee5b04f5fc5d692ece060c23e9380e948f81880d6fb8ece0300ae6b6abbf1e` |
| `output/phase9d-p8-ack-survivor-review-2026-10-31/executors/run_job.py` | `70994fc92a7ea51cd1b0aee65c12a38af292079c8a757f18356326c6f1da07c4` |
| `output/phase9d-p8-ack-survivor-review-2026-10-31/executors/finalize.py` | `4779510ebf3cf58a60ea7fe8afb60caf573623f75f42a0d153b81c4417f218fb` |

Shared/session/local preloads were empty; plpgsql_check and its settings were absent. No native counters were collected. The existing 32 MiB shared buffers, 1 MiB work memory, eight connections, 15/5-second statement/lock timeouts and 240-second wrapper deadline were retained. These settings are not a hard process memory quota.

Sixteen host samples recorded minimum available RAM **3,079.79 MiB**, minimum commit headroom **14,292.59 MiB**, zero unresponsive taskbar samples and maximum sample interval **1.001 seconds**. Minimum free disk was C: **92.06 GiB**, D: **477.97 GiB**. Owner-disabled RAM admission thresholds remained disabled; deadlines/responsiveness checks stayed active. Sampling cannot guarantee absence of an OS freeze. No unrelated process or host setting changed.

## Next selected scope and holds

The condition-family review selects **S17 key rotation**, in the custodian installation only: omit the public-SPKI-to-key-ID binding and the unsigned-receipt retirement refusal, one at a time. Existing P6 key-lifecycle tests provide positive/rejection scenarios. The prior custody SQL omissions targeted gap, export-ACK source and pressure checks; the Safety mutation targeted source MAC. These two rotation guards were not in those selected mutation groups.

The next-target register pins the exact current SQL/test sources and predicates. Future execution should use one fresh native unprofiled custodian fixture, synthetic key material, the existing fixture-owner administration boundary, persisted key/history/unsigned-receipt oracles and exact restoration. It must not add service grants or force a private service bypass. **No key-rotation mutation ran in this review.**

Default-cache signal-11 remains **OPEN/PAUSED**; signal-9 remains **SEPARATE/UNATTRIBUTED**. Accepted P6 cache-OFF **16/16** behavior/native and P7 **14/14** behavior/native remain intact. Google/R2 activation, actual off-host recovery, final custodian/key handoff, real provider/copy integration, approved retention periods and deployed storage/alerts remain independent pending gates.

No Docker startup, native crash reproduction, production/customer/provider operation, paid provisioning, product SQL change, commit, push, merge or deployment occurred. Frozen V5, Clerk, signing, guards, financial policy and original migrations retain their protected identities. **This review stops here. Production remains OFF; deletion DISABLED.**
