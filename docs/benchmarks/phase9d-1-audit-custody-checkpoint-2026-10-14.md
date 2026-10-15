# Phase 9D-1 — separate audit custody for committed broker events

14 October 2026 IST. Continues the [broker recovery checkpoint](phase9d-broker-recovery-checkpoint-2026-10-14.md). Evidence: `output/phase9d-audit-custody-2026-10-14/`. **PHASE 9D-1: PARTIAL. INDEPENDENT AUDIT CUSTODY: PARTIAL. PRODUCTION_READY: NO.** The first supported broker-journal custody path is implemented and verified in disposable infrastructure. The remaining prompt requirements are explicit gates; this checkpoint does not certify the entire audit system.

## Architecture and trust

The accepted application source/outbox and bare receiver/broker databases remain in their existing fixture cluster. Custody uses an additional PostgreSQL server/container and a separate ingress process. Its non-login `custody_owner`, restricted `custody_ingest` and read-only `custody_inspector` are independent of the receiver's schema owners. Neither migration-owner credentials nor receipt signing material is given to the broker, guard or delivery worker.

The receiver adds `custody_source_owner`, `custody_sender`, `custody_verifier` and `custody_operator`. An AFTER INSERT trigger on the actual `broker9d.events` journal captures a minimized commitment in the same local transaction. The trigger pins UTC serialization, including when the caller selects another timezone. A separate sender receives signed frames from a narrow routine; its login cannot read the source signing secret or acknowledge delivery. The custodian checks transport authentication, the sealed source frame, the closed protocol and source identity before committing. A separate verifier checks an Ed25519 receipt using public verification material before invoking the narrow acknowledgement routine.

**The verifier process and its credential are trusted.** PostgreSQL does not itself verify Ed25519 inside `custody_export.ack`. A compromised verifier credential could store false acknowledgement JSON. Public receipt verification and independent custodian inspection remain necessary; the implementation does not claim resistance to that trust-root compromise. The custodian's ingest process, signer, migration owners and host log observer are also trusted roots.

These are actual host child processes and restricted database logins. They are **not** the newly requested restricted runtime capsules. The accepted earlier broker capsules remain separate evidence and are not relabelled as custody executions. Both PostgreSQL containers share one Docker host/administrator. A compromised host/kernel or administrator controlling both databases and all retained heads is outside the verified boundary. Separate cloud-account administration, deployed IAM/TLS, off-host anchors and disaster recovery remain unverified.

## Integrity, delivery and privacy

`custody-event-v1` binds the source-chain UUID, service and database identities, local event ID/sequence, previous commitment, immutable source-row hash, actor/action, request/attempt/transport receipt, evidence version/hash, configuration, bound generation, frozen V5 identity and observed time. Missing request-associated values remain null. This is a bounded operational projection; it is not a complete control-state or human-authorization projection.

The independent receipt binds source/sequence, event hash, custody identity/sequence, receipt UUID, key ID and COMMITTED outcome. Ed25519 private material stays with the custodian; public keys and accepted receipt proofs are retained in selected synthetic witnesses. The source has no credential capable of signing custody receipts. Source sequence and previous-hash validation reject gaps and conflicting duplicates. Exact duplicates reuse their original durable receipt identity. Global database identity allocation may have gaps after rollbacks; it is not a distributed ordering or exactly-once guarantee.

Delivery is at least once. Three failed sends enter REVIEW. A separate operator can authorize a CAS-fenced, UUID-idempotent recovery, at most three recovery cycles, subject to pending admission capacity. A REVIEW entry deliberately blocks later chronological delivery until resolved. The manual recovery record is local; its own independent custody envelope is still missing. The pending admission cap does not bound total retained REVIEW history or disk consumption. Storage limits, retention policy and alert ownership remain gates.

Existing broker dispatch, guard, usage accounting and result semantics are preserved. Audit acknowledgement does not promote or authorize a financial/human-final decision. Locally guarded results are not labelled externally audited by the broker. An externally acknowledged current-result promotion protocol and its stop/generation races have not been implemented. Remote custody outages leave local committed evidence and pending commitments intact; they do not block the tested operator STOP. Existing application booking/payment transactions do not call the custody service.

Existing authorized payload cleanup retains exported commitments, transport/request/attempt identities and accounting. Delayed custody delivery after cleanup succeeds without recreating work. The field-level `privacy-inventory.json` classifies linkable identities/hashes, operational metadata, public receipt keys and minimal actor/SQLSTATE diagnostics. No JWTs, contact details, raw locations, payment secrets, source/custody signing keys or model answers enter custody envelopes. No lawful retention period, live collection purpose, legal-hold policy or permanent real-user retention rule was invented.

Key rotation is deliberately **unsupported** in this version. Re-signing an old receipt with a new key while retaining its old key ID fails verification. Historical signer epochs, key retirement and rotation replay require implementation and proof before activation.

## Executed verification

The source-bound manifest selects exact executions and artifact identities; earlier epochs and failures remain intact.

| Check | Supported result |
| --- | --- |
| Audit protocol/session/HTTP/process units | 5/5 PASS |
| Separate-server custody DB/process recipe | 20/20 PASS per selected fresh execution |
| Broker, transport, outbox regressions | 9/9 broker units; 19/19 broker DB; 15/15 transport; 21/21 outbox PASS |
| Broader disposable DB | 58/58 PASS |
| Full backend | 1,834/1,834 PASS in selected closure execution |
| Four complete critical JS modules | 100% statements/branches/functions/lines; 96 statement/line counters, 70 native V8 branches, 15 functions |
| Structural maxima | Cyclomatic 13, cognitive 13, Halstead Difficulty 18.182, CRAP 13, source 41 physical lines |
| Scoped clone detection | 0 across the four stated modules; no project-wide clone certificate |
| Framework mutation reconciliation | 329 unique: 319 killed, 10 executable reviewed equivalents; zero final meaningful survivors/timeouts/ignored/errors |
| New SQL omissions | 3/3 killed; exact routine definitions restored; catalog hashes/ACL/search paths retained |

Actual witnesses cover a committed source event with unavailable custody, custodian process death before commit and after durable commit, duplicate receipt reconciliation, forged/substituted receipts, conflicting signed evidence/actor/action, missing/reordered sequence, physical pending-row deletion and head-gap detection, retry exhaustion/operator recovery, selected concurrent duplicates, source and audit privilege attacks, incorrect-password authentication, pending backpressure with STOP, payload cleanup before acknowledgement and delayed delivery. Independent source and custody clients inspect persisted state. Real booking cancellation, outbox/transport, one fake V5-compatible analyst call, signed usage reconciliation and the independent guard execute. One guarded NEEDS_ADMIN_REVIEW result is retained, with unchanged observed financial/booking/driver state and zero new operative consequences.

Restricted-role probes include broker, guard, reconciler, receiver and exporter role names independently credentialed on the custody server; source-service credentials and the new custody sender/verifier identities remain separate. They are privilege tests, not a substitute for hostile-process capsule containment. PostgreSQL owner-role escalation, custody update/delete/truncate, configuration edits, future PUBLIC execution and source signing-secret reads are denied.

The trusted host collector reads the two owned servers' actual logs independently of the denied actor. Selected 42501/28P01 observations retain only server identity, actor and SQLSTATE. No SQL parameters or raw log text are exported. This proves selected server-denial observation. It does not prove every rejection is observed or that these observations have their own external custody delivery.

`custody-receipt-audit.mjs` verifies saved public receipt proofs, source/remote event bindings and chronological commitments with zero database/provider calls. It is a saved-observation audit. The fresh-process recipe comparison checks ordered actions/generations, accounting and financial observations while identifying generated UUIDs, signing keys, database identities and wall clocks as distinct. **Exact saved-input custody event replay is NOT_IMPLEMENTED.** Historical backend replay remains different evidence.

The initial mutation report contains 234 Killed, 81 Survived and 14 Timeout. Strengthened permanent witnesses close meaningful variants. Two focused runs used incomplete column selection; their raw reports remain, and exact identity reconciliation prevents them from being treated as complete coverage. Correct zero-based range selection and subsequent targeted execution reconcile every original identity. The ten reviewed equivalents depend on unique Object.entries keys, the retained Date ISO equality, the closed ASCII scalar frame size bound, public KeyObject trust roots, the no-fault selector and the stated native HTTP behavior. A changed composition invalidates those reviews. Raw V8 counters/maps and mutation statuses are retained without score editing.

New critical SQL has real privileges, catalog/search-path/default-execution and targeted transaction/omission witnesses. Native PL/pgSQL profiling, full logical-condition/DDL adequacy and SQL structural measurement for these new routines remain open. Prior eight-routine native coverage does not certify this new SQL. Whole-SQL certification remains PARTIAL.

## Retained corrections and reliability debt

The first interrupted trial selected unresumed broker work and then waited for a crash that was never reached; it records its nonzero exit and source drift. A clean subsequent trial correctly failed registration while the fixture's broker was stopped. The fixture now resets the accepted isolated broker before installing custody capture. A later recipe incorrectly attempted TERMINATE on an already guarded result; it now uses the existing legal CLEAN transition. Another recipe accidentally shadowed the source database object with its UUID and failed the actual application-write probe; that fixture name collision is corrected.

Security corrections include role-specific IPC that excludes source signing keys from sender/verifier, and role-only test-environment database URLs that exclude disposable owner credentials from custody children. Earlier receipts predate those corrections and cannot certify current containment. Public proof audit initially compared PostgreSQL JSON numeric identities with text receipt identities; it now checks safe integers and converts that explicitly defined field. These failed observations remain distinguishable from product permission or finance failures.

The prior intermittent TRANSPORT_CHILD_DEADLINE, profiling-enabled PostgreSQL crash, interrupted broader DB execution and Docker startup failure remain in the broker recovery manifest and debt register. Passing current regressions do not establish their root causes. Profiling was not activated on the new custody servers, and no unrelated orchestration was rewritten to suppress those findings.

## Remaining implementation and readiness

`readiness-gates.json` carries every preceding criterion forward and appends custody criteria. `audit-coverage-matrix-current.json` corrects the initial overly broad actor-rights statement: trusted fixture administrators can rewrite local history, and deployed application privileges remain unverified. Restricted shadow principals have the demonstrated custody denials; owner rights are a separate trust boundary.

Remaining authorized isolated work includes complete source/outbox/receiver/guard/denial audit coverage; independently delivered manual recovery and server-denial records; real source/custodian database restart and source receipt-before-ack crash witnesses; complete failure/race coverage and total backlog/storage bounds; restricted custody capsules; explicit saved inputs and independent full event replay; historical signer selection/key-rotation proof; audit-required promotion/stop/evidence-generation races if that policy is adopted; and new SQL native/logical/structural certification. No owner decision is needed to continue ordinary isolated implementation.

External gates remain real-evidence purpose/notice/provider disclosure and retention/deletion/hold approval, blind independent human labels, production-shaped Clerk capacity/availability, operational alert ownership, in-flight financial/admin authorization policy, deployed IAM/egress/grants, independent administrative custody/anchors, stopped-first rollout and separate deployment/activation authorization. No real incident, paid model or production provider call was made. No phone was required. No commit, deployment, instance-setting change, rejected cache-cleanup bypass or unrelated user-edit reversal occurred.

Frozen V5 remains `e484afc4c7fa724ea29af6edd962c48b814dc73a10e4f4a5e33833ad26afbe75`, all 22 source identities unchanged. The three accepted auth identities remain unchanged. No authentication redesign/cache, finance/commission/deposit-policy change, held-out evaluation, Luna/Search/Hindi-Hinglish work or historical Phase 8.2 investigation was resumed.

```powershell
node tools/phase9d/custody-run.mjs unit
node tools/phase9d/custody-run.mjs db
node tools/phase9d/custody-run.mjs full
node tools/phase9d/custody-run.mjs typecheck
node tools/phase9d/custody-equivalences.mjs
node tools/phase9d/custody-receipt-audit.mjs <selected-witness-path>
```

```text
RESPONSIBILITY PHASES 1–8: VERIFIED FOR APPROVED SCOPE
HISTORICAL PHASE 8.2: RETIRED
PHASE 9A / 9B / 9C: COMPLETE FOR APPROVED ISOLATED SCOPE
PHASE 9D-1: PARTIAL
SEPARATE-SERVICE TRANSPORT: VERIFIED_IN_ISOLATION
STANDALONE BROKER / BROKER RECOVERY: VERIFIED_IN_ISOLATION FOR APPROVED OFFLINE SCOPE
INDEPENDENT AUDIT CUSTODY: PARTIAL — SUPPORTED BROKER JOURNAL VERIFIED_IN_ISOLATION
INDEPENDENT DENIAL OBSERVATION: PARTIAL — SELECTED SERVER DENIALS VERIFIED_IN_ISOLATION
AUDIT DELIVERY/RECONCILIATION: PARTIAL — SUPPORTED PROCESS/RECEIPT PATH VERIFIED_IN_ISOLATION
WHOLE-SQL CERTIFICATION: PARTIAL
PRODUCTION-SHAPED CAPACITY: PARTIAL
PRODUCTION_READY: NO
PHASE 9D-2: NOT_STARTED
PRODUCTION DEPLOYMENT: NOT_AUTHORIZED
PRODUCTION SHADOW / AUTO-ADJUDICATION / PRODUCTION CONSEQUENCES / SEARCH ROLLOUT: OFF
PROJECT-WIDE PROOFLOOP / PUBLIC GENERALIZATION: NOT_STARTED
```
