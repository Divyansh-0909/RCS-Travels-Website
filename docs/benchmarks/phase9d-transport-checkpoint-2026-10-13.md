# Phase 9D-1 — separate HTTP transport and independent receipt persistence

13 October 2026 IST. Continues the [accepted committed-journal outbox](phase9d-outbox-checkpoint-2026-10-13.md). New evidence: [manifest](../../output/phase9d-transport-2026-10-13/manifest.json) and [readiness gates](../../output/phase9d-transport-2026-10-13/readiness-gates.json). Original checkpoints, manifests, raw reports and failed trials remain intact.

**PHASE 9D-1: PARTIAL.** The separate-service transport is implemented for the bounded isolated scope below. **Standalone analyst broker: NOT_IMPLEMENTED.** This is the requested honest component checkpoint; receiver work quotas and the existing offline worker are not represented as durable broker budgets. Continued isolated broker implementation needs no new owner decision. Production readiness and activation remain closed.

## Source-grounded implementation map

| Component / files | Actual boundary and changes |
| --- | --- |
| Existing `outbox.sql`, `export-projection.mjs`, `export-repository.mjs`, `export-pump.mjs`, `export-core.mjs` | Preserved original bytes and shared-database adapter. Actual Phase 7 journal remains the only original evidence source. Its source/ownership/hash/UTC/projection checks, scan limits, leases, four-attempt recovery and tombstones are reused. |
| `transport-sender.sql` | Optional isolated installer: private receipt-key/service configuration and signed remote receipt table; transmission admission, local acknowledgement and terminal cleanup routines. This adapter revokes the exporter’s shared-database delivery entry point in its own fixture. The unchanged original installer still selects the original path in a separate fixture. |
| `transport-receiver.sql` | Installed in a distinct database with **no application tables**. Strict envelope/lineage/privacy/hash validation, immutable payload binding, durable UUID receipt, existing receiver queue admission and SQL-held receipt signing key. Only the capture login may receive; direct unfenced enqueue is revoked. |
| `transport-protocol.mjs`, `transport-http.mjs`, `transport-service.mjs` | Versioned POST protocol, body-bound HMAC authentication, exact field/version checks, pinned loopback endpoint, bounded UTF-8 request/response bodies, caller/body/SQL deadlines and service concurrency. No paid analyst transport. |
| `transport-database.mjs`, `transport-pump.mjs`, `transport-child.mjs` | Real dedicated logins, URI/session/effective-role/privilege checks, installed-adapter check, separately executable sender and receiver, staged delivery, uncertainty retry and local signed acknowledgement. Diagnostic interruption hooks belong to the isolated harness. |
| `transport-replay.mjs` and integration replay | Saved explicit initial state/source identities/events, actual service cancellation, child termination, independent receiver commit, lost acknowledgement, process replacement, retry, existing frozen offline worker and cleanup. |
| `transport-capsule.mjs`, `transport-capsule-entry.mjs` | Two actual restricted service containers, separate credentials/databases and private loopback HTTP. Reuses the accepted namespace/resource/authentication harness. |
| New unit/integration tests, mutation helper, runner/quality/lint/finalizer scripts | Executable transport, permission, concurrency, recovery, replay and source-bound verification. No application route, startup, migration, UI or financial policy change. |

The HTTP DTO retains the accepted schema, source-work HMAC identity, original actor/event/evidence lineage, minimized evidence hash, original-evidence HMAC commitment and frozen selection. The receiver trusts the authenticated exporter’s committed-journal attestation; it cannot independently inspect the original journal. `collector: phase7-committed-journal-v1` retains its protocol-origin meaning and does not fabricate historical collector-binary provenance. Raw values, free text, contact data and privacy key never reach this receiver.

## Delivery, receipts and cleanup

The sender and receiver execute in **distinct processes with distinct credentials and distinct databases**. Acceptance uses independently committed receiver state. The container proof uses two restricted containers; both databases reside in one disposable PostgreSQL instance. Cross-host or independent PostgreSQL-server failure isolation is not claimed.

`POST /v1/shadow/deliveries` authenticates the exact bytes and method/path domain before processing. The receiver validates known versions/fields, three supported families, hashed lineage, minimized privacy structure and canonical evidence hash. It atomically commits one receiver work row and one receipt row. Exact duplicates return the same receipt; conflicting immutable bindings are rejected. Existing receipts can be reconciled while receipt ingestion is stopped, without creating work.

The receipt includes a pinned service UUID, logical key, payload binding, receipt UUID, receiver work identity and state. Its MAC is made inside the receiver SQL boundary. The sender’s SQL validator checks that signature and exact staged-payload binding; its login cannot read the receipt key. Request authentication, receipt signing and original-evidence pseudonymization use distinct keys. Private transport configuration is provided only to owned fixtures; production key provisioning, rotation, TLS and deployment remain unimplemented.

HTTP bodies are limited to 65,536 bytes and responses to 4,096 bytes. SQL independently limits the JSONB text representation to 65,536 bytes; its added spacing can make that boundary stricter than compact wire JSON. Passing the wire bound alone does not guarantee SQL admission. Caller/body/database deadlines are two/one/two seconds, with at most eight receiver requests outstanding. These are isolated bounded defaults, not production throughput measurements.

**Guarantee: at-least-once transport attempts with durable idempotent receiver processing**, under the tested database durability, retained-tombstone, trusted-exporter and key/configuration assumptions. There is no distributed exactly-once guarantee or cross-database transaction. An uncertain acknowledgement retries the same staged immutable payload; it cannot create another analyst work item. Network/capacity/stop/ambiguous receipt failures use existing bounded retries; definitive protocol/authentication failures enter manual review. The fourth retry reports the same manual-review state that SQL persists.

Terminal cleanup requires an authenticated terminal receipt with the same immutable receipt identity. It retains source and receiver receipt metadata. The original shared-database cleanup cannot accidentally join a remote work ID: remote acknowledgement leaves the original `receiver_id` null. Receiver payload cleanup retains its work status and receipt tombstone. Delayed duplicates after cleanup/restart/stop return the original identity.

## Stop and authorization linearization

1. Source transmission admission locks the source control record and checks stop, generation, owner, token, lease, staged payload and current source binding. Its transaction ends before HTTP.
2. Receiver receipt/queue admission locks its own control record and commits locally. New work is denied when that receiver is stopped; exact previously committed receipts remain reconcilable.
3. Local source acknowledgement reacquires its source control lock, repeats admission/source checks and verifies the signed receipt before committing ACKED.

Actual concurrent connections prove stop committed before transmission admission is denied, and acknowledgement committed before stop remains durable. Expired leases, altered source, forged receipts and stale generations are denied. These are **transport fences**, not the missing broker dispatch/result protocol.

The gap between transmission authorization and physical HTTP send is explicit. A source stop cannot retract a request already authorized or prevent an independent receiver commit in that window. An acknowledgement can then be denied while a receiver receipt already exists. No lock/transaction spans remote latency. No cancellation of already-sent provider requests, global atomic stop, broker budget reservation or accepted broker result fencing is claimed. Those remain the next implementation boundary.

## Executed verification

Final selected executions and hashes are in the manifest. The completed transport checks include:

| Check | Result / exact scope |
| --- | --- |
| Real source/receiver PostgreSQL and HTTP processes | **15/15 PASS**, fourteen leaf groups plus parent; current unchanged epoch selected |
| Protocol/HTTP/admission/IPC/replay units | **11/11 PASS** |
| Restricted service containers | **PASS**, seventeen containment checks each; sender **23**, receiver **17** deliberate denials; all **51 application tables unchanged** |
| Saved-input transport replay | Record **1/1**, independent fresh process/database replay **1/1 PASS**, same bounded canonical outcome |
| Critical JS coverage | **100% statements/branches/functions/lines**, seven complete modules; **177 statements/lines, 147 native V8-derived branches, 17 functions** in the selected execution windows |
| Structural maxima | Cyclomatic **16**, cognitive **15**, Halstead Difficulty **22.5**, CRAP **16**, source **33 physical lines** |
| Clone detection | **0**, seven-module scope, five-line/fifty-token minimum |
| Selected SQL guard mutations | **12/12 KILLED**, original catalog restored; separate selected seeds, not whole-SQL certification |
| Full backend / original outbox / broader DB | **1,815/1,815 / 21/21 / 58/58 PASS**, no skips; exact current-source executions selected in the manifest |
| Framework mutation closure | **514 unique identities: 508 killed, six executable reviewed equivalents**, zero meaningful survivors/timeouts/ignored/errors in the reconciled closure |
| Backend typecheck / scoped lint / whitespace | **PASS**, exact executions and sources bound by the manifest |

Tests cover sender termination before transmission, receiver termination before/after durable receipt, lost acknowledgement, duplicates/reordering/conflicts, disconnected network, expired lease/process replacement, receiver saturation, retry exhaustion, protocol/authentication/UTF-8/body/hash/privacy rejection, wrong database, stale/forged acknowledgements, altered source, concurrent stop ordering and cleanup/reconciliation. Every leaf compares source financial/authority observations after legitimate business setup. The container test independently hashes all application tables before and after HTTP delivery.

The capsule uses UID/GID 1000, read-only code, no host/Docker-socket mounts, separate PID/IPC namespaces, zero capabilities, no-new-privileges, seccomp, 64 PIDs, 512 MiB and 0.75 CPU per service, bounded non-executable tmpfs, internal network and SCRAM TCP authentication. A positive host-listener control precedes negative route checks. Actual source fixture creation inside that capsule is trusted synthetic SQL bootstrap, explicitly marked **not actual collector execution**; actual committed application collectors run in the database/replay suites. No analyst runs inside this new container proof; receiver work ends PENDING.

Coverage counter/source-map copies preserve selected scoped native V8 bytes; original coverage remains unchanged. Metrics cover the seven named critical modules, not fixture/container orchestration, historical application routes or SQL. The new SQL has negative probes and twelve seeded omissions; no full SQL logical-condition, structural or mutation-adequacy certificate is claimed. **Whole-SQL certification remains PARTIAL.** Framework mutation totals remain distinct from previous campaigns and from SQL seeds.

Replay compares explicit initial/final financial observations, committed source state, ordered external actions, minimized payload, sender attempt/state, receiver advisory result/attempt/state and cleanup. Generated receipt UUID/MAC, database names/ports, lease tokens and audit wall-clock fields are excluded from cross-run canonical equality; each run checks authenticated receipt identity internally. This is one bounded transport recipe, not UI replay or the complete Phase 9B recipe set. The analyst step reuses the existing frozen V5 factory/offline transport and independent guard; it is **not a standalone broker** or human/model calibration.

Failed/trial evidence remains distinct: initial JSONB expression-precedence error, mixed source epochs, an IPC unit fixture that attempted to mock an immutable namespace export, a lint-only missing-yield fixture correction and an interrupted mutation invocation with no completed score. The original outbox and historical reports are preserved. A retry-exhaustion regression corrected the new pump’s reported state to match existing SQL manual review. No business rule or guard was weakened.

The six framework equivalents have executable paired witnesses: two internal error messages, a type predicate implied by exact envelope validation, generated recipe filename punctuation, null versus undefined for the internal fault callback, and an unused stream resume after Node 24 destroys an oversized request. These reviews apply only to the recorded composition and runtime. Earlier raw survivor/timeout statuses remain intact. An initial focused selection used report columns as source-selection columns; corrected reruns reconcile every identity by file, location, mutator and replacement. No mutation was ignored or given a numerical waiver.

The original outbox manifest and 55 immutable selected artifacts still match their saved hashes. `CONTEXT.md` and `ROADMAP.txt` are mutable active references: their authorized checkpoint updates have new hashes, with both old and current identities recorded in the new manifest. An initial finalizer wrongly required those two references to retain their old hashes and stopped before writing the manifest; the corrected verifier continues to require exact preservation of historical evidence and runtime sources.

## Remaining gates and next checkpoint

**Next: build the standalone offline analyst broker.** Add its separate login/service, immutable request/configuration binding, durable incident/request/attempt/reservation/outcome records, atomic incident/request/concurrency/token/currency reservations, conservative unknown-usage accounting, deadline/reconciliation/manual paths, and generation-fenced dispatch/result admission. Prove reservation and stop races and process death before/after reservation, dispatch and result commit. Reuse this transport and the frozen factory/independent guard; do not reuse worker-local quotas as broker accounting. Do not hold database locks across analyst latency.

Other gates remain: production-compatible committed export wiring/server-time/retry/configuration contract; approved useful causal evidence projection; independent external audit custody and denial reconciliation; comprehensive SQL certification; production-shaped authenticated journey/load/availability measurement and replica-shared Clerk capacity/alerts/owners; in-flight financial/admin/role-change authorization policy; approved privacy purpose/disclosure/retention/deletion/legal hold and independent blind human labels; deployed IAM/grants/egress/TLS/secrets and stopped-first rollout/reconciliation; separate deployment/activation approval. No real incidents, live Jev or paid providers were used. Phase 9D-2 is not started.

The accepted shared Clerk middleware remains unchanged: fresh authoritative session lookup for each protected human request, no positive cache, admission-only revocation, original deadline/outstanding limit and fail-closed behavior. Its capacity and in-flight limitations remain open readiness findings. The reconciled historical current-policy regression contract is preserved.

Frozen V5 remains **`e484afc4c7fa724ea29af6edd962c48b814dc73a10e4f4a5e33833ad26afbe75`**, all **22** identities unchanged. Authentication’s **three** accepted source identities and original outbox sources remain unchanged. No held-out/Luna/Search/Hindi/Hinglish evaluation, phone operation, production provider call, financial-policy change, unrelated edit reversal, Vite-cache cleanup bypass, commit, push or deployment occurred.

```powershell
node tools/phase9d/transport-run.mjs unit
node tools/phase9d/transport-run.mjs integration
node tools/phase9d/transport-run.mjs record-replay
node tools/phase9d/transport-run.mjs saved-replay <saved-private-fixture-input-path>
node tools/phase9d/transport-capsule.mjs
```

```text
RESPONSIBILITY PHASES 1–8: VERIFIED / COMPLETE FOR APPROVED SCOPE
HISTORICAL PHASE 8.2: RETIRED — NO RECOVERED SCOPE
PHASE 9A / 9B / 9C: COMPLETE FOR APPROVED ISOLATED SCOPE
PHASE 9D-1: PARTIAL
SEPARATE-SERVICE TRANSPORT: VERIFIED_IN_ISOLATION (bounded loopback/shared-server scope)
STANDALONE ANALYST BROKER: NOT_IMPLEMENTED
BROKER DURABLE BUDGETS / STOP FENCING: NOT_IMPLEMENTED
INDEPENDENT EXTERNAL AUDIT CUSTODY / WHOLE-SQL CERTIFICATION: PARTIAL
PRODUCTION_READY: NO
PHASE 9D-2: NOT_STARTED
PRODUCTION DEPLOYMENT: NOT_AUTHORIZED
PRODUCTION SHADOW / AUTO-ADJUDICATION / CONSEQUENCES / SEARCH ROLLOUT: OFF
PROJECT-WIDE PROOFLOOP / PUBLIC GENERALIZATION: NOT_STARTED
```
