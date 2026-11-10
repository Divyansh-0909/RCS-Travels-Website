# Phase 9D-1 — ICR-1 lineage ACK validation

18 October 2026 IST. Continues the [custody verification checkpoint](phase9d-1-custody-verification-checkpoint-2026-10-18.md) and the focused P1 group in the [SQL coverage plan](phase9d-1-sql-coverage-plan.md). **ICR-1 receipt validation and independent mismatch detection: VERIFIED_IN_ISOLATION under the existing trusted-verifier model. PHASE 9D-1: PARTIAL. PRODUCTION_READY: NO.**

Evidence: [source-bound manifest](../../output/phase9d-icr1-fix-2026-10-18/manifest.json), [catalog reconciliation](../../output/phase9d-icr1-fix-2026-10-18/catalog-reconciliation.json), and [selected synthetic witness](../../output/phase9d-icr1-fix-2026-10-18/icr1-witness-b897cef5-0320-4756-b6b5-00f1699e09d7.json). Original execution timestamps are UTC on 17 October; this checkpoint uses the local IST date.

## Reproduced defect and correction

The [original failing PostgreSQL receipt](../../output/phase9d-lineage-ack-2026-10-18/lineage-ack-1792274425933-208b7009-b94e-4d42-b3c5-b6b61d3c9a4b.json) remains unchanged. A [fresh reproduction](../../output/phase9d-icr1-fix-2026-10-18/lineage-ack-1792275912000-61b5c398-1543-4129-9b69-ce267fb1eec9.json) again fails the extra-field assertion: `LINEAGE_ACK_MUST_REJECT_OPEN_RECEIPT`, expected false / actual true, **0/1 PASS**, with unchanged sources during execution. Copies of the original SQL, uncommitted test and runner are retained beside the new evidence.

Only `custody_lineage.ack()` changes in [closure-lineage.sql](../../tools/phase9d/closure-lineage.sql), apart from LF-to-CRLF serialization. It now enforces the structure already defined by `custody-protocol.mjs::verifyReceipt`:

- Exactly `body` and `signature` at the receipt root; an object body and string signature.
- Exactly nine required body fields, all strings; the existing schema, custodian and COMMITTED outcome constants.
- Canonical positive custody sequence, receipt UUID, hexadecimal key identity and existing signature format.
- Matching source, event sequence and commitment in the same atomic UPDATE as the ACK. An accepted receipt remains immutable; its exact duplicate continues to succeed.

No table, role, grant, signing registry, cryptographic implementation or operational authority is added. Both installations retain owner `shadow9d_owner`, SECURITY DEFINER, the explicit `pg_catalog, custody_lineage, pg_temp` search path and the original execute ACL. The actual verifier cannot directly update the table; the sender's ACK attempt returns `42501`.

## Executed verification

All selected executions have `sourcesUnchanged: true`; their bound files still match the final checkpoint sources. The tests use the existing disposable PostgreSQL infrastructure and actual restricted logins.

| Check | Actual result |
| --- | --- |
| Expanded ICR-1 integration | **13/13 PASS**, no skips: twelve leaf groups and their parent, source and receiver installations |
| Existing committed-lineage integration | **7/7 PASS**, no skips |
| Existing custody units | **31/31 PASS**, no skips |
| Backend typecheck | **PASS** |
| Scoped test/runner lint | **0 errors, 0 warnings**, two files |
| Scoped Git whitespace and untracked test whitespace | **PASS** |
| Catalog comparison | Both ACK definitions match; owner, SECURITY DEFINER, search path and ACL match their historical catalog entries |
| Preservation | Original 19/19 local files, 23/23 staged contents, archive and HEAD unchanged; accepted auth 3/3, frozen V5 22/22 and original custody 28/28 match in both worktrees |

Each installation rejects **88** malformed receipt/argument cases without modifying the target row. These are looped assertions within the integration groups, not 176 additional tests. Cases cover extra root/body fields, each missing required field, scalar/array/null/type errors, mismatched source/sequence/hash, malformed key/receipt/custody-sequence/signature values and wrong/null row arguments.

Positive cases use genuinely signed receipts for independently committed synthetic events. Exact duplicates preserve their receipt and row identity. Conflicting receipt UUID, custody sequence or key identity cannot overwrite an accepted ACK. Existing rotation retires the old signer; its original durable receipts and exact duplicate ACKs remain valid, while new events use the new signer. A compromised historical key remains mathematically valid but independently untrusted.

The first expanded trial passed the positive and independent-status groups but failed two malformed-input groups because the test passed a raw JavaScript string through the PostgreSQL parameter adapter. Explicit JSON encoding corrects that fixture error; SQL NULL and JSON null are tested separately. That **10/13** failed execution and its prematurely labelled PASS observation witness remain intact and are **excluded from acceptance**. The corrected witness requires all twelve groups to complete. An initial scoped lint invocation failed to resolve its configuration import; the corrected lint run supplies acceptance. The failed aggregate wrapper is retained, with the later quality completion recorded separately.

No native profiler, routine replacement, mutation campaign, capsule build, broad database suite or full backend regression was run. This is behavioral and catalog verification, not a new SQL numerical coverage certificate.

## Independent custody status and trust boundary

For each service, the authorized verifier deliberately submits a well-shaped false ACK for an event with **zero matching independent custody rows**. Local SQL accepts it, as the existing trust model permits; unchanged `custodyStatus(..., {lineage: true})` reports **FALSE_ACKNOWLEDGEMENT**, `remotelyVerified: false`. After the real remote commit arrives, the conflicting accepted fake receipt still cannot be overwritten and independent inspection still reports false acknowledgement. No automatic repair policy was introduced.

Lineage SQL has no trusted signing-key registry. It validates key-ID syntax and immutable accepted-receipt identity; the authorized verifier and the independent public-key/signature comparison enforce key trust. A well-shaped fabricated or unknown-key receipt submitted by a compromised authorized verifier can therefore still mark local delivery ACKED. It cannot become independently verified through that local flag. The tests also distinguish retired trusted signers from compromised signers. No claim of SQL-native Ed25519 verification, verifier-compromise prevention or signer-registry propagation is made.

The independent status implementation and receipt protocol were not modified. Source and receiver application/financial observations remain unchanged. ACK status supplies no human-final, financial or operational authority.

## Source identities and preservation

| File / definition | Before SHA-256 | After SHA-256 |
| --- | --- | --- |
| `tools/phase9d/closure-lineage.sql` | `f97bbfdd800d49bc492597ae67109804cb338d6c597a7e165c8fd33cb75b66bb` | `9e5f62b7f851a8e9c4b37d40105594b91258131e1d896206a7b63662408e38a7` |
| `backend/tests/integration/phase9dCustodyLineageAck.test.js` | `a843d5dfa9c7245fb52bbfe6f28109f6be208f99ce375af91aa6700fa3de18b5` | `e8936ec17cb18d7d91050d4c0f7b0af5a3a35bf03c74c4a658fe743969fbc806` |
| Installed ACK catalog definition, both databases | `1d3aec29803da13133df6dbf64402ba492b0be3c4708744edd1993b103897552` | `25d469fd557ff4e746fb1c8dc9c5872dc7cc91be379e221b4122bafc3f972423` |

The catalog's before definition comes from the accepted historical SQL witness; the fresh RED execution separately binds the unchanged before source. After definitions are read from both actual tested installations. Full definitions and metadata are retained in the reconciliation.

The already-uncommitted `closure-run.mjs` ACK modes and source inventory were preserved and exercised, SHA-256 `d0f1ccaece9631dc4b7232f91a8daf244590fe892e227db0238be599aa1e26af`. The fixture, receipt protocol and independent status helper retain their baseline hashes. New checkpoint, scoped configuration and execution/manifest tooling are inventoried separately. Existing staged migration contents and historical reports were not rewritten.

The latest explicit owner instruction disables host RAM admission/abort thresholds for subsequent session work; script monitoring, deadlines and container limits remain. [Host observation summary](../../output/phase9d-icr1-fix-2026-10-18/host-observer-summary.json) and [cleanup readback](../../output/phase9d-icr1-fix-2026-10-18/cleanup-readback.json) retain actual outcomes. Same-host sampling cannot certify absence of a complete OS freeze. No unrelated app or Dell service was terminated by this task.

Frozen V5 remains `e484afc4c7fa724ea29af6edd962c48b814dc73a10e4f4a5e33833ad26afbe75`. No live model/provider evaluation, real incident collection, Clerk change, financial policy/accounting/guard change, commit, push, merge or deployment occurred. Production remains OFF.

**Stop point:** the requested ICR-1 maintenance is complete for the declared isolated scope. Broader SQL certification, remaining Phase 9D-1 implementation and external readiness gates remain open. No broader campaign or Phase 9D-2 was started.
