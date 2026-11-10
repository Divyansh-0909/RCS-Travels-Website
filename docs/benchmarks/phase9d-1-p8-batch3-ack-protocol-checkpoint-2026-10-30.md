# Phase 9D-1 - P8 Batch 3: root envelope and protocol constants

30 October 2026 IST. Continues [Batch 1](phase9d-1-p8-lineage-mutation-checkpoint-2026-10-23.md), [Batch 2](phase9d-1-p8-batch2-ack-guards-checkpoint-2026-10-29.md) and the [SQL coverage plan](phase9d-1-sql-coverage-plan.md). Actual execution timestamps remain 29 October UTC, corresponding to 30 October IST.

**Four selected guard omissions: VERIFIED_IN_ISOLATION in both installations. P8, whole-SQL certification and Phase 9D-1 remain PARTIAL. Production OFF; deletion DISABLED. Docker/profiler work remains PAUSED.**

Evidence: [manifest](../../output/phase9d-p8-batch3-2026-10-30/manifest.json), [candidate register](../../output/phase9d-p8-batch3-2026-10-30/candidate-register.json), [actual witness](../../output/phase9d-p8-batch3-2026-10-30/witness.json), [mutation register](../../output/phase9d-p8-batch3-2026-10-30/mutation-register.json), [execution receipt](../../output/phase9d-p8-batch3-2026-10-30/mutation-batch/receipt.json), [current readiness](../../output/phase9d-p8-batch3-2026-10-30/readiness-current.json) and [24-family map](../../output/phase9d-p8-batch3-2026-10-30/condition-family-map-current.json).

## 1. Baseline and authorized scope

The owner requested “do them” after the recommendation to test the four deferred ACK guards. This batch selects the root-envelope object check and the schema/custodian/outcome constants. The fourteen source-matched omissions from the first two batches are explicitly excluded, not repeated to inflate totals. Batch 1's **236/236 assertions / 16 killed instances** and Batch 2's **820/820 assertions / 8 killed and 4 masked survivors** remain separate accepted historical windows.

All **64 Batch 2 manifest entries** and its executable source pins match. Current protected inputs and the staging index were captured before execution. The product file remains SHA-256 `9e5f62b7f851a8e9c4b37d40105594b91258131e1d896206a7b63662408e38a7`; both fresh installed ACK definitions match the accepted LF definition SHA-256 `f2fa584c01c16ce4ac1e15c8c4f77ffcd85c3f98f08f4076ba522f8a7ecf25c9` exactly. Owners, SECURITY DEFINER, search paths, ACLs and complete before/after fixture catalogs are checked independently.

Only disposable native PostgreSQL catalogs are changed. Product SQL, migration sources, permissions, signing, independent verification, application policy and financial authority are unchanged. The original selected source/receiver composition and minimal source application projections are reused; this is not the full deployed application/provider topology or independently administered production custody.

## 2. Guard register and invalid probes

| Candidate / source line | Single omitted OR operand | Selected invalid probes | Remaining overlap |
| --- | --- | --- | --- |
| ACK15 / 89 | Root must be an object | SQL NULL; JSON null/number/boolean/string; empty/nonempty array; empty object | SQL NULL/empty object remain rejected by body-type validation; arrays by the closed-envelope check; scalar JSON operations can raise |
| ACK16 / 95 | schema = custody-receipt-v1 | Empty, unsupported and wrong-case strings; missing field; JSON null/number/object | Required-field and all-string checks remain |
| ACK17 / 95 | custodian = isolated-custody-v1 | Empty, unsupported and wrong-case strings; missing field; JSON null/number/object | Required-field and all-string checks remain |
| ACK18 / 96 | outcome = COMMITTED | Empty, unsupported and wrong-case strings; missing field; JSON null/number/object | Required-field and all-string checks remain |

[p8_ack_batch3_cases.py](../../tools/phase9d/p8_ack_batch3_cases.py) records exact predicates and seeds. Every mutation replaces one uniquely matched guard with false. No second protection is removed to force a kill. SQL NULL is passed as a SQL parameter NULL and JSON null through the JSON adapter; the witness preserves that distinction explicitly.

## 3. Execution and results

[native_p8_ack_batch3.py](../../tools/phase9d/native_p8_ack_batch3.py) runs actual source and receiver installations on separate fresh Windows PostgreSQL **18.4** servers, sequentially. Each uses the real restricted `custody_lineage_verifier` login with no direct events UPDATE privilege. The fixture owner observes actual committed rows.

For every guard, the original accepts a positive receipt and exact duplicate with persisted identity verified, then rejects each selected invalid input without row changes. The uniquely identified mutant is installed, checked for unchanged owner/security/path/ACL metadata, and given those same invalid inputs. Acceptance must persist the exact invalid receipt as ACKED; rejection or an input exception must preserve the complete row. The exact original definition/metadata are restored in a finally path and the original rejection behavior rechecked. Both complete catalogs match before/after and both owned servers stop normally.

| Guard | Probes per installation | Source | Receiver | Observable contract violation |
| --- | ---: | --- | --- | --- |
| Root object | 8 | KILLED | KILLED | Four scalar JSON forms raise 22023 instead of returning false; row remains unchanged |
| Schema constant | 7 | KILLED | KILLED | Three wrong strings persist as ACKED; missing/non-string values remain rejected |
| Custodian constant | 7 | KILLED | KILLED | Three wrong strings persist as ACKED; missing/non-string values remain rejected |
| Outcome constant | 7 | KILLED | KILLED | Three wrong strings persist as ACKED; missing/non-string values remain rejected |

**Actual result: 464/464 assertions PASS; eight selected installation/mutant instances KILLED; no new survivors or equivalence claims.** There are **four distinct omissions**, **29 invalid probes per installation / 58 instances**, and **eight positive receipt controls** with duplicate/persisted-state verification. The 58 mutant replies comprise **18 persisted invalid ACKs, eight SQL input exceptions and 32 false/no-write replies**. Original/restored repetitions of a seed are not extra unique conditions. Assertions include role/control/catalog/row/restoration checks; they are not a whole-SQL denominator.

The eight SQLSTATE **22023** responses occur only after root-object validation is omitted, for JSON null/number/boolean/string inputs. They differ observably from the original routine's false reply, while persisted rows remain unchanged. They are recorded as input-error contract divergence, not server crashes, hidden runner failures or equivalent false returns. SQL NULL, arrays and empty object remain rejected by other checks. The harness would stop on timeout, connection loss or unexpected SQLSTATEs rather than count those as killed mutants.

The three constant omissions demonstrate local SQL contract enforcement. Test signatures/key IDs are well-shaped synthetic verifier inputs; no new cryptographic, remote-commit, signer-registry or independent-custody result is inferred. The accepted ICR-1 genuine signed receipt, key-history and FALSE_ACKNOWLEDGEMENT evidence remains at its own epoch. PostgreSQL 17.5/plpgsql_check native measurements are not replaced by these PG18.4 mutation results.

## 4. Earlier masked survivors and prose reconciliation

The **four Batch 2 SURVIVED instances remain unchanged**, with analysis REDUNDANT/MASKED_ON_TESTED_INPUTS. Required-body and signature-type guards were not removed from product code and are not newly declared equivalent. New per-input overlap observations do not waive broader structural/equivalence work.

The earlier checkpoint prose discrepancy is now exactly explained at the byte level. At byte offset recorded in [the reconciliation](../../output/phase9d-p8-batch3-2026-10-30/historical-readback/batch1-prose-reconciliation.json), `thexearlier` contains 0x78 (`x`) where the sealed version has 0x20 (space). Substituting that one byte in a **separate reconstructed copy** yields the complete original sealed SHA-256 `2dc21f8ff4f584a27e3d2c32553e95e68647bd385c6ffe528398f39d6382cd22` exactly.

The original/current file remains untouched at SHA-256 `5a35ea676f8c01d150f3e33aab33dffbb8adc5f6453a46cbc0b689f2d29b8b3b`; old manifests are unchanged. The reconstructed copy is retained under this batch's historical-readback directory. Who changed the byte and when is not established. This recovers matching historical text without relabelling a new test execution or overwriting a working-tree edit.

## 5. Resource, quality and preservation readback

| Check | Accepted result |
| --- | --- |
| Runtime | PostgreSQL 18.4, loopback SCRAM; one native server at a time |
| Bounds | Eight connections, 32 MiB shared buffers, 1 MiB work memory; 15-second statement/5-second lock timeouts; 240-second job deadline |
| Profiler separation | Shared/session/local preloads empty, extension absent, no matching profiler settings |
| Preflight | Responsive taskbar; **1201.27 MiB available RAM**, **8403.60 MiB commit headroom** |
| Selected monitoring | **22 samples**; minima **397.21 MiB available RAM / 7503.01 MiB commit headroom**; zero unresponsive samples; maximum interval 1.002 seconds |
| Disk observations | Minimum C: **93.53 GiB**, D: **478.20 GiB** during the job |
| Diagnostics | Four expected input-error log lines per server; zero PANIC/unexpected termination lines; normal startup/shutdown |
| Cleanup | Both explicitly owned server IDs stopped; no remaining owned postmaster PID files |
| Quality | Ruff/AST: four new Python files PASS; scoped Git and explicit new-file whitespace PASS |
| Preservation | **540/540 recorded entry-baseline inputs unchanged**, HEAD and staging index unchanged |
| Readiness | All **78 criteria**, **20 audit rows**, **24 condition families** preserved; Batch 3 assessment added |

PostgreSQL GUCs are not hard native-process memory quotas. RAM admission/abort thresholds remain disabled under the existing owner rule; responsiveness/deadline monitoring and bounded workloads remain active. Same-host samples do not prove absence of an OS freeze. No unrelated process was killed, global resource setting changed, Docker engine started or external account queried by this batch.

| New code | SHA-256 |
| --- | --- |
| `tools/phase9d/native_p8_ack_batch3.py` | `0148700d84144a445264cf59b79f360072f8fbf3e2a16f68a952c56e1de0a73b` |
| `tools/phase9d/p8_ack_batch3_cases.py` | `b4f96822cf3ad2e201c0bd7bfeaf18136e6bd1fc43a33297a6b7a8afa1fefbeb` |
| `output/phase9d-p8-batch3-2026-10-30/executors/run_job.py` | `ee86a7674c6eee9daf6b477d805582ca7f00a4bd727c8677990b667c5285d53e` |
| `output/phase9d-p8-batch3-2026-10-30/executors/finalize.py` | `00b94a3434af07af15f67775a25bddd009b6d24cb701c14b95ca720feb6c5e63` |

All changes are new tests/cases, orchestration/evidence, reconstructed prose copy and this checkpoint. No existing implementation file was edited. Original SQL/migrations, frozen V5, selected Clerk identities, signing, accepted guards/permissions and financial/business policy remain protected within the explicit inventory. The case module and executor are source-bound. No application JS/TS changed, so backend typecheck/full regression was not run. No previous mutation/profiling campaign was repeated.

## 6. Remaining P8 scope

These four deferred guards have now been exercised. The next small mutation scope is the atomic row-argument predicates (`seq=n`, `hash=h`): map them separately from the already measured receipt-body bindings and use consistent argument/body mismatches to determine what each predicate contributes. Do not assume those are duplicate/equivalent or weaken another check to manufacture a kill. Other families' genuinely missing acceptance/lease/MAC/epoch/cleanup conditions, private normal-path exclusions, structural/equivalence support and deployed metadata remain broader P8 work requiring a defined scope.

The older 81-declaration/15-source and 99-installed-instance inventories retain their earlier meanings; neither is a count of all logical conditions or mutants. No universal 100% SQL/mutation score is claimed. The four earlier masked instances remain explicit, and broader readiness/legal/provider/storage/deployment gates remain open.

Google/R2, actual off-host recovery, independent custodian/key handoff, real copy/provider integration, approved production retention durations and deployed monitoring remain pending. Original signal-11 is OPEN/PAUSED, signal-9 SEPARATE/UNATTRIBUTED. P6/P7 cache-OFF evidence is preserved. No production/customer/provider operation, paid provisioning, deployment, commit, push or merge occurred.

**The four-guard Batch 3 is complete for its stated scope. P8, whole-SQL and Phase 9D-1 remain PARTIAL. Production OFF; deletion DISABLED.**
