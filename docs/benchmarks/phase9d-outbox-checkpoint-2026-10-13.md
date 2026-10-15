# Phase 9D-1 — committed-journal outbox and interruption recovery

13 October 2026 IST. Continues the [SQL and historical-regression checkpoint](phase9d-1-sql-certification-checkpoint-2026-10-13.md). Evidence: [source-bound manifest](../../output/phase9d-outbox-broker-2026-10-13/manifest.json) and [criterion-level readiness](../../output/phase9d-outbox-broker-2026-10-13/readiness-gates.json).

**Phase 9D-1 remains PARTIAL.** A working, inactive outbox is verified for the bounded isolated **shared-database receiver adapter**. The standalone analyst broker is **NOT_IMPLEMENTED**. This takes the owner's permitted outbox-first checkpoint; it does not represent an existing inline fake transport as a new broker. No further owner decision blocks continued isolated implementation.

## Implemented source-to-result slice

Actual driver cancellation, customer cancellation and ten-minute late-driver recovery services commit their existing case, immutable evidence and Phase 7 work records. The new reconciliation scanner reads those committed records afterward. An uncommitted cancellation is invisible; export becomes eligible after commit. Booking transactions have no new outbox or analyst dependency. Cross-transaction source/outbox atomicity is not claimed.

The source query checks work/evidence/case ownership, booking/user lineage, original cancellation/assignment actor and recorded event, schema and existing contract/config/policy versions. Frozen JS verifies the original evidence hash and UTC generation time. Later evidence produces a distinct source work identity; it cannot silently replace an earlier version. Unsupported incident families, corrupted hashes/ownership/configuration, missing sources and oversized inputs fail closed.

The existing conservative projection is reused. Original values, free text, contact data and instructions are redacted; identities and references use HMAC pseudonyms. Required evidence becomes explicitly unknown/missing. No parallel authoritative original-evidence store is created. Outbox payloads are durable minimized transport copies. `collector: phase7-committed-journal-v1` names the export protocol's journal origin; the original journal does not persist a historical collector binary identity. Current collector/import/schema identities are bound in execution sources, without inventing that historical provenance.

`outbox.sql` adds an exporter login, two private tables and twelve routines to the disposable rehearsal. The non-login owner has explicit source-column SELECT grants and two SELECT-only RLS policies. The exporter can only scan, claim, stage, deliver and fail; it cannot directly read original tables/private configuration or call the unfenced receiver, operations or audit entry points. Existing permissions SQL is unchanged. No production migration or backend startup wiring was added.

Durable states are PENDING, PROCESSING, RETRYABLE, ACKED, MANUAL_REVIEW and REJECTED. Claims use tokens, an owner, a generation and a two-minute lease; failures wait thirty controlled seconds, with four attempts before manual review. Scan batches are bounded at 32; active queue and concurrency caps are checked independently from receiver capacity. Defaults are disabled/stopped. Operational stop uses the existing stop/generation control; changing export configuration admission alone does not cancel already-claimed operations.

Staging independently checks the exact source-derived projection, lineage, provenance, frozen selection and minimized hash in SQL. Delivery rechecks lease/generation/source binding and invokes the certified receiver. **Receiver enqueue and outbox acknowledgement commit in the same database transaction.** This is at-least-once client invocation with deduplication, not an implemented HTTP/separate-database transport or an exactly-once distributed guarantee. Loss of the client acknowledgement preserves the durable receipt. Cleanup deletes minimized payloads only after acknowledged receiver termination; retained identity/receipt tombstones prevent recreation.

The standalone exporter child validates its URI and actual session/effective role, database and privilege flags before work. Real child termination after claim or staging preserves the lease; a new process reclaims it after the fixture clock advances. The existing immutable V5 factory executes through explicit offline transport, the unchanged independent guard returns NEEDS_ADMIN_REVIEW, and one advisory result persists. Another process/worker retry makes no additional analyst call. A real restricted inspector login reads raw classification versus guarded route and cannot read the privacy key. Application financial observations remain unchanged by advisory processing.

## Failures and permanent regressions

- The initial installer attempted to revoke extension-function grants while acting as a non-owner. Revocation now executes after resetting the role; owner execution remains limited to required HMAC.
- Existing application RLS hid source booking/cancellation rows. Rehearsal-only policies permit the non-login owner’s granted columns; exporter direct access remains denied.
- PostgreSQL timestamps without a zone were parsed in Windows local time. Source timestamps now explicitly serialize as UTC. Frozen hash reproduction also correctly excludes `generatedAt`, matching the unchanged contract.
- JSON null/scalar payloads reached a JSONB deletion operator. Explicit object checks reject them before projection/hash operations.
- A pinned-profiler run reproduced PostgreSQL signal 11 during the injected nested receiver trigger failure. The same transaction/failure/retry probe passes with session profiling disabled for that window. Diagnostics preserve the crash; they do not independently identify the offending library. Other paths supply the native coverage below. The actual containment image has no profiler installed.
- Fixture mistakes—duplicate admin-group actors, a wrong booking field, a generation-time-only “new version,” premature terminal deletion, missing child startup readiness and correlated mutation probes—were corrected. Their failed receipts/logs remain distinct from passing executions.

Regressions also cover duplicate scanner/claim/delivery races, newer immutable evidence, source mutation before dispatch, corrupted staged bytes, receiver outage/backpressure, stop before/after claim and staging, stale tokens/generations, capacity saturation, retry/lease exhaustion, source cleanup and tombstone reuse. No financial or Responsibility policy was weakened to pass them.

## Replay and containment

One **bounded saved-input replay** is implemented. Explicit synthetic initial collections, journal identities, clock, event order, key version and current source/schema/configuration hashes are saved. A new process loads them and recreates a fresh migrated database. Wrong source identities, schema/order/key version and oversized inputs fail admission before database creation. Exclusive file creation prevents replacing a saved recipe.

Record and independent saved execution produce identical canonical projection, delivery/receiver statuses and attempts, selected application financial observations and sanitized guarded result. [Comparison](../../output/phase9d-outbox-broker-2026-10-13/saved-replay-comparison.json) binds both outcome hashes. Lease UUIDs, audit wall-clock timestamps and full database contents are outside this comparison. This is not exact UI replay or a new full replay claim over all historical lifecycle scenarios.

The reused containment launcher executes exporter and worker as separate processes under their independent credentials in the restricted image. The selected exporter passes **17 checks and 22 denials**, including wrong exporter-password authentication; the worker passes **17 checks and 16 denials**, then stores one fake advisory result. All **51 application tables** retain their complete independently checked state. The container source fixture is explicitly coherent synthetic setup; actual collector execution is separate database evidence.

The profile retains non-root execution, read-only contents, no mounts to host files/Docker socket, zero capabilities, no-new-privileges, seccomp, 64 PIDs, 512 MiB, 0.75 CPU, bounded non-executable temporary storage and private network/SCRAM authentication. Host-listener positive control and restricted denials remain meaningful. Owned containers, network and canary were removed. Build contexts/images remain. These tests do not certify deployed IAM, metadata/DNS channels, hostile kernels or independent external audit custody.

## Executed verification

| Check | Accepted result |
| --- | --- |
| Full backend | **1,804/1,804 PASS**, no skips; selected unchanged epoch in manifest |
| Broader disposable DB / existing readiness | **58/58 / 20/20 PASS** |
| New outbox DB suite | **21/21 PASS**, including actual process interruption and restricted inspection |
| Focused runtime units | **11/11 PASS** |
| New saved-input replay | Record **1/1**, independent fresh saved execution **1/1 PASS**, identical bounded outcomes |
| Critical JS coverage | **100% all four measures**, six complete modules; **128 statements/lines, 67 branches, 13 functions** |
| Framework mutation closure | **236 unique: 235 killed, one executable reviewed equivalent; zero meaningful survivors/timeouts/ignored/errors** |
| New SQL guards | **13/13 seeded omissions killed**; original twelve routine definitions restored |
| New native PL/pgSQL | Seven routines have native statement/branch ratios **1.0 / 1.0**, captured before mutations; catalog definitions/counters retained |
| Structural maxima | Cyclomatic **11**, cognitive **8**, Halstead Difficulty **19.204**, CRAP **11**, critical source **32 physical lines** |
| Scoped clones / lint / backend typecheck / whitespace | **0 / PASS / PASS / PASS**, selected artifacts in manifest |
| Clerk / frozen V5 | **3/3 / 22/22 source identities preserved** |

Scoped native V8 counters/maps remain verbatim in a fresh report copy, with custody hashes; original raw files are untouched. The one equivalent removes a catch body whose identical retry/return is performed by the following null-receipt branch. Executable witnesses compare complete outcomes and repository effects, including retry-persistence failure. Raw survivor statuses and exact mutation identities remain in [closure](../../output/phase9d-outbox-broker-2026-10-13/mutation-closure.json). Prior 173 JS and 26 SQL/DDL campaigns remain separate accepted evidence; they were not rerun or added to these totals.

Native PL/pgSQL percentages cover the pinned profiler's visible statement/IF/loop metric. They do not count SQL-language expressions, each logical subcondition, grants or whole-SQL structure. **Q2 and WHOLE-SQL CERTIFICATION remain PARTIAL.** Orchestration scripts and historical large application files are not certified by the six-module runtime numbers.

## Next implementation checkpoint

1. Implement separate-service delivery/acknowledgement reconciliation where required; retain the shared-database adapter's precise atomicity boundary. Define production server time, retry/configuration selection and startup integration without enabling it.
2. Implement the actual offline broker with a narrow validated protocol, dedicated principal/process, immutable V5 selection and no operative service imports. Add durable incident/request/concurrency/token/currency reservations, independent deadline and explicit unknown-usage accounting. Duplicates must not double-charge.
3. Fence broker dispatch against stop generation and recheck generation at result commit; hold no database lock across analyst latency. Prove the actual in-flight window with interruption/recovery and adversarial requests/outputs.
4. Existing worker request quotas, local stop gates and fake SDK injection remain reused components, **not completion of those broker requirements**. Extend saved-input replay and quality closure over the new broker's actual source epoch.

Independent external audit custody, approved useful causal projection/privacy/retention, independent human labels, full SQL adequacy, production-shaped Clerk capacity/availability and monitoring, in-flight financial/admin authorization and privileged role-change procedures remain separate criteria. Deployed IAM/grants/egress, stopped-first reconciliation and activation require separate authorization. No live incidents, live Jev/provider evaluation, Phase 9D-2, phone work, Vite-cache cleanup, commit or deployment occurred. Unrelated dirty-tree changes are preserved.

Frozen Jev V5: **`e484afc4c7fa724ea29af6edd962c48b814dc73a10e4f4a5e33833ad26afbe75`**. No held-out, Responsibility Luna, Search or Hindi/Hinglish evaluation was resumed. Shared Clerk admission, owner-approved 0%/10% economics and each original driver's reservation ownership remain unchanged.

```powershell
node tools/phase9d/outbox-run.mjs unit
node tools/phase9d/outbox-run.mjs integration
node tools/phase9d/outbox-run.mjs record-replay
node tools/phase9d/outbox-run.mjs saved-replay <selected-replay-input-path>
node tools/phase9d/capsule.mjs outbox
node tools/phase9d/outbox-finalize.mjs
```

```text
RESPONSIBILITY PHASES 1–8: VERIFIED FOR APPROVED SCOPE
HISTORICAL PHASE 8.2: RETIRED
PHASE 9A / 9B / 9C: COMPLETE FOR APPROVED ISOLATED SCOPE
PHASE 9D-1: PARTIAL
SHADOW OUTBOX: VERIFIED_IN_ISOLATION — BOUNDED SHARED-DATABASE ADAPTER
STANDALONE ANALYST BROKER: PARTIAL — STANDALONE SERVICE NOT_IMPLEMENTED
BROKER STOP/FENCING: PARTIAL — INDEPENDENT BROKER BOUNDARY NOT_IMPLEMENTED
INDEPENDENT EXTERNAL AUDIT CUSTODY: PARTIAL
WHOLE-SQL CERTIFICATION: PARTIAL
PRODUCTION_READY: NO
PHASE 9D-2: NOT STARTED
PRODUCTION DEPLOYMENT: NOT AUTHORIZED
PRODUCTION SHADOW: OFF
AUTO-ADJUDICATION: OFF
PRODUCTION CONSEQUENCES: OFF
SEARCH ROLLOUT: OFF
PROJECT-WIDE PROOFLOOP IMPLEMENTATION: NOT STARTED
PUBLIC PROOFLOOP GENERALIZATION: NOT STARTED
```
