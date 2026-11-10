# Phase 9D-1 - P8 Batch 2: remaining ACK guards

29 October 2026 IST. Continues the [accepted first P8 batch](phase9d-1-p8-lineage-mutation-checkpoint-2026-10-23.md), [SQL plan](phase9d-1-sql-coverage-plan.md), [ICR-1 correction](phase9d-1-lineage-ack-checkpoint-2026-10-18.md) and [October 23 SQL checks](phase9d-1-sql-conditions-metadata-checkpoint-2026-10-23.md).

**Batch 2 selected scope: VERIFIED_IN_ISOLATION. P8, whole-SQL certification and Phase 9D-1: PARTIAL. Production OFF; production deletion DISABLED. Docker/profiler investigation remains PAUSED.** Six new guard omissions run in both actual installations; four surviving instances remain explicitly SURVIVED with observed masking, not EQUIVALENT.

Evidence: [manifest](../../output/phase9d-p8-batch2-2026-10-29/manifest.json), [candidate register](../../output/phase9d-p8-batch2-2026-10-29/candidate-register.json), [actual witness](../../output/phase9d-p8-batch2-2026-10-29/witness.json), [mutation register](../../output/phase9d-p8-batch2-2026-10-29/mutation-register.json), [masking observations](../../output/phase9d-p8-batch2-2026-10-29/masking-analysis.json), [execution receipt](../../output/phase9d-p8-batch2-2026-10-29/mutation-batch/receipt.json), [current readiness](../../output/phase9d-p8-batch2-2026-10-29/readiness-current.json) and [24-family map](../../output/phase9d-p8-batch2-2026-10-29/condition-family-map-current.json).

## 1. Baseline, source identity and a retained discrepancy

The owner authorized this bounded second batch and subsequently requested continuation. Batch 1's **236/236 assertions and 16/16 killed instances across eight distinct guards** remain accepted at their recorded source epoch. Its executable SQL/source pins, witness, mutant definitions, catalogs, execution/quality/preservation records and current definition identities match. That batch was not rerun.

Readback found **one mismatch among the prior manifest's 91 entries**: its prose checkpoint has changed since sealing. Expected SHA-256 is `2dc21f8ff4f584a27e3d2c32553e95e68647bd385c6ffe528398f39d6382cd22`; observed SHA-256 is `5a35ea676f8c01d150f3e33aab33dffbb8adc5f6453a46cbc0b689f2d29b8b3b`. Both byte lengths are 14,682; LF/CRLF normalization does not explain it. The cause is not established. The current document and original manifest were copied into the new historical-readback directory, and neither original was rewritten or re-certified. The **other 90 entries and executable source pins match**, so actual Batch 1 runtime evidence remains reusable independently of this unresolved prose discrepancy.

Product `closure-lineage.sql` remains SHA-256 `9e5f62b7f851a8e9c4b37d40105594b91258131e1d896206a7b63662408e38a7`. Both fresh ACK catalog definitions match Batch 1 exactly: `f2fa584c01c16ce4ac1e15c8c4f77ffcd85c3f98f08f4076ba522f8a7ecf25c9`. The raw historical ICR-1 definition and its documented LF normalization remain separate identities.

## 2. Candidate selection and exact scope

The [case module](../../tools/phase9d/p8_ack_batch2_cases.py) records source lines, complete guard text, invalid seeds, overlap rationale and existing evidence. Every selected omission replaces **one uniquely matched OR operand with false**, in a disposable catalog only. It never removes an additional masking predicate to force a kill.

| Candidate / source line | Selected omission | New evidence / remaining overlap |
| --- | --- | --- |
| ACK09 / 93 | Required nine-body-field presence predicate | All nine individual omissions, empty body and missing source/sequence/hash together; other constants, formats and binding comparisons remain |
| ACK10 / 96 | Canonical positive 1-to-15-digit custodySequence format | Ten malformed strings plus missing/NULL/numeric boundaries; required-field and all-string checks still reject the latter |
| ACK11 / 97 | Lowercase hexadecimal UUID-shaped receipt format | Five malformed string forms plus missing/NULL/numeric boundaries; no UUID version/non-nil policy invented |
| ACK12 / 98 | Signature string format, 86 base64-alphabet characters plus == | Empty/wrong-length/wrong-padding/wrong-alphabet strings, missing/NULL/numeric values; type guard remains |
| ACK13 / 90 | Envelope signature presence/type check | Missing signature and five non-string forms; the separate signature text-format predicate remains |
| ACK14 / 90 | Envelope body presence/object-type check | Missing body, JSON null/number/boolean/string/array/empty object; other checks remain and scalar operations can expose exceptions |

All eight Batch 1 guards are excluded as duplicates with their exact predicate identities. Root-envelope object-type and schema/custodian/outcome constant omissions are deferred to another small batch. The code contains no additional explicit envelope-presence predicate to invent or mutate.

There is **no new equality rule between custodySequence and the local event sequence**. The SQL validates the documented custody-sequence syntax; independent remote identity/signature verification remains separate. Positive controls observe the existing acceptance of `1`, `17` and the 15-digit upper-format boundary, plus the existing receipt syntax's nil-shaped UUID. These are local syntax observations, not new cryptographic or operational policy.

## 3. Execution method and actual results

[native_p8_ack_batch2.py](../../tools/phase9d/native_p8_ack_batch2.py) reuses the unchanged minimal source/receiver composition and owned Windows PostgreSQL fixture. Each installation uses a separate fresh PostgreSQL **18.4** server, run sequentially. The actual `custody_lineage_verifier` authenticates with restricted role flags and no direct events-table UPDATE. Fixture-owner reads verify committed persisted state. Synthetic well-shaped signatures and key IDs are format controls, not genuine cryptographic proofs; earlier ICR-1 signed/independent-status results are retained, not rerun.

For each candidate:

1. Valid receipt controls commit an ACK and owner inspection sees the exact persisted receipt. Exact duplicates return true without changing the row. The owned fixture then restores its pending row.
2. Every invalid probe returns false under the original and retains the complete row commitment.
3. One guard is omitted; its exact SQL/hash and unchanged owner/security/path/ACL metadata are retained. Every probe is submitted through the verifier and persisted state inspected. Accepted invalid receipts must actually be stored as ACKED. Rejected/error probes must leave the row unchanged.
4. The exact original definition and metadata are restored in a finally path. The original then rejects every invalid probe again. Complete fixture catalogs match before/after, and both servers stop.

| Candidate | Invalid probes per installation | Source | Receiver | Observed distinction |
| --- | ---: | --- | --- | --- |
| ACK09 required body fields | 11 | SURVIVED / MASKED | SURVIVED / MASKED | All probes still reject; remaining predicates observed below |
| ACK10 custodySequence format | 13 | KILLED | KILLED | Ten malformed strings become persisted ACKs per installation; missing/NULL/numeric still reject |
| ACK11 receipt UUID format | 8 | KILLED | KILLED | Five malformed strings become persisted ACKs per installation; missing/NULL/numeric still reject |
| ACK12 signature format | 8 | KILLED | KILLED | Five malformed strings become persisted ACKs per installation; missing/NULL/numeric still reject |
| ACK13 signature type | 6 | SURVIVED / MASKED | SURVIVED / MASKED | Remaining format predicate rejects all selected non-string/missing forms |
| ACK14 body object type | 7 | KILLED | KILLED | Four scalar forms raise 22023 instead of returning false per installation; missing/array/empty-object still reject |

**Actual accepted result: 820/820 assertions PASS; 12 selected mutant instances, 8 KILLED and 4 SURVIVED with tested masking; zero EQUIVALENT claims.** There are **six distinct omissions**, **53 invalid probes per installation / 106 instances**, and **18 valid receipt controls**, each with exact-duplicate and persisted-state checks. Original/restored submissions are repeated observations of those same probes, not extra unique cases. Forty mutant submissions persist an invalid ACK, eight produce a SQL input exception and 58 remain false/no-write. The successful harness result means these outcomes were correctly observed and classified, not that mutant acceptance is valid.

Eight SQLSTATE **22023** responses are intentional observations of the body-object omission, not timeouts, compiler failures, process crashes or ignored failures. JSON null, number, boolean and string bodies reach a scalar JSON operation that the original type guard prevents. Original and restored definitions return false; mutant calls raise, with unchanged persisted rows. This violates the tested boolean-rejection contract and kills those two instances. The harness records the exception separately rather than converting it into false. It would stop on timeout, connection loss or other unexpected SQLSTATEs.

The denominator is only the six selected omissions in two installations. No mutation score for all SQL, new native coverage percentage, full Boolean truth table or additional P0-P7 campaign is claimed. PostgreSQL 17.5/plpgsql_check measurements and PG18.4 ordinary/mutation results remain distinct.

## 4. Survivors and masking evidence

The four surviving instances remain in the register as **SURVIVED**; their analysis is **REDUNDANT/MASKED_ON_TESTED_INPUTS**. No production guard is removed and no universal equivalence certificate is inferred.

| Omitted check / missing field | Remaining observed predicate | Actual SQL effect |
| --- | --- | --- |
| Required body: schema/custodian/outcome | IS DISTINCT FROM required constant | TRUE rejection predicate |
| Required body: custodySequence/receipt/keyId | COALESCE(value,'') does not match the required format | TRUE rejection predicate |
| Required body: source/sequence/hash | Atomic UPDATE equality against retained event/arguments | SQL UNKNOWN, so the row cannot match |
| Required body: all fields absent | Schema constant check | TRUE rejection predicate |
| Required body: all three event bindings absent | Source equality | SQL UNKNOWN; no ACK row update |
| Signature type: missing/null/number/boolean/array/object | Remaining signature text-extraction/format check | TRUE rejection predicate |

Each listed blocker was evaluated on actual PostgreSQL data and retained with its TRUE/NULL result, alongside original/mutant/restored replies and row commitments. This supports the stated overlap for these probes. Broader semantic proof and other mutant/operator classes remain outside this batch. Defense in depth is preserved even where overlap appears sufficient.

## 5. Resources, quality, cleanup and protected assets

| Check | Accepted observation |
| --- | --- |
| Separation | No Docker activity or profiler; preload settings empty, extension absent and no matching GUCs in both servers |
| Bounds | One server at a time; eight connections, 32 MiB shared buffers, 1 MiB work memory; 15-second statement/5-second lock timeouts; 240-second wrapper deadline |
| Monitoring | 29 samples, minimum available RAM **939.75 MiB**, commit headroom **10406.20 MiB**; zero unresponsive taskbar samples; maximum interval 1.002 seconds |
| Preflight | **250.05 MiB** available RAM / **10140.57 MiB** commit headroom; taskbar responsive; RAM gate remains owner-disabled |
| Disk observations during job | Minimum C: **93.85 GiB**, D: **478.96 GiB** |
| Server diagnostics | Four expected input-error log lines per installation, eight total; zero PANIC/unexpected termination lines; one normal start/shutdown each |
| Cleanup | Both explicit owned fixture IDs stopped, no postmaster PID files; watchdog cleanup uses only the harness's owned-server ledger |
| Quality | Ruff and AST **four new Python files PASS**; scoped Git plus explicit new-file whitespace PASS |
| Preservation | **475/475 current-entry-baseline inputs unchanged during Batch 2**, HEAD and staging index unchanged; prior prose discrepancy retained separately |
| Reconciliation | All original **78 criteria**, **20 audit rows**, **24 condition families** preserved; new S08/readiness assessment added |

The preflight and execution minima are different windows, not evidence that this job increased free RAM. PostgreSQL GUCs are not hard native-process memory quotas, and same-host sampling cannot rule out every OS freeze. No unrelated process was terminated, global setting changed, VHD attached or external service contacted. There was one accepted bounded database job, with no first-batch repetition or new failure-reproduction attempt.

| New code | SHA-256 |
| --- | --- |
| `tools/phase9d/native_p8_ack_batch2.py` | `389675a1c3db557231cc0c74465fc077ae01809c8591042bb49079ba52018d74` |
| `tools/phase9d/p8_ack_batch2_cases.py` | `0924fe74c41d27e0e017952d45abadcaa4adf021af109ada4d75070a54c36ab2` |
| `output/phase9d-p8-batch2-2026-10-29/executors/run_job.py` | `0f2ba4e6393736252d23cc0ba58911f1ec69bccb0da4f3644dd3c081365f377b` |
| `output/phase9d-p8-batch2-2026-10-29/executors/finalize.py` | `1eb8c3b693f590ceea870534f0119bc5e27a1c011092b7781bc14c9425d84907` |

All changes are new scoped tests, case definitions, evidence/orchestration and this checkpoint. Original product SQL/migrations, accepted guards/permissions/signing, frozen V5 and selected Clerk identities were not edited; preservation is for the explicit captured inventory, not every unrelated editor file. Original evidence files and their accepted source epochs remain untouched. Application JS/TS did not change, so backend typecheck/full regression was not run. Code/receipt source hashes were rechecked against current bytes; the case module and executor are explicitly bound.

## 6. Remaining work and stop point

The next smallest justified P8 batch is the deferred root-envelope type guard and schema/custodian/outcome constant omissions, with the same original-positive/rejection and exact-restoration controls. Preserve any exception differences and masked survivors. Atomic row-argument bindings, other families' genuinely uncovered guards, private normal-path exceptions, structural/equivalence adequacy and deployment metadata remain broader separately scoped work. Do not repeat the unchanged historical campaigns for a larger total or weaken other guards to force a kill.

The old checkpoint prose discrepancy remains unresolved; obtain an authoritative historical copy before claiming its original text was recovered. Its execution evidence remains separately source-matched. Google/R2, actual off-host recovery, final independent custodian/key handoff, complete real copy/provider integration, approved production retention periods and deployed monitoring/storage gates remain pending. The proprietor's approved hold procedure is not a production deletion schedule.

P6 cache-OFF 16/16 behavior/native and P7 14/14 behavior/native remain accepted at their recorded epochs. Original default-cache signal-11 stays **OPEN/PAUSED** and signal-9 **SEPARATE/UNATTRIBUTED**. No Docker, profiler, hosted/customer mutation, paid resource, production connection, activation, deployment, commit, push or merge occurred.

**Stop after Batch 2. P8, whole-SQL and Phase 9D-1 remain PARTIAL. Production OFF; deletion DISABLED.**
