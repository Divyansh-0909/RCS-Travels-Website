# Phase 9D-1 — SQL conditions and database metadata continuation

23 October 2026 IST. Continues the [SQL plan](phase9d-1-sql-coverage-plan.md), [current retention work](phase9d-1-retention-integration-checkpoint-2026-10-22.md) and [storage safeguards](phase9d-1-storage-safeguards-checkpoint-2026-10-23.md). **Selected conditions and custom metadata: VERIFIED_IN_ISOLATION. Whole-SQL certification: PARTIAL. P8: NOT_STARTED. Production OFF. Profiler investigation: PAUSED by owner.**

Evidence: [manifest](../../output/phase9d-sql-conditions-metadata-2026-10-23/manifest.json), [selected executions](../../output/phase9d-sql-conditions-metadata-2026-10-23/selected-executions.json), [metadata witness](../../output/phase9d-sql-conditions-metadata-2026-10-23/metadata-accepted.json), [condition witness](../../output/phase9d-sql-conditions-metadata-2026-10-23/conditions-accepted.json), [24-family reconciliation](../../output/phase9d-sql-conditions-metadata-2026-10-23/condition-family-map-current.json), [quality](../../output/phase9d-sql-conditions-metadata-2026-10-23/quality.json).

## 1. Actual environment and source composition

The new native fixture installs the complete custom SQL composition selected from **15 original SQL files**, including source outbox/transport, receiver broker/recovery/custody capture, lineage and independent custodian admission/key tables. Original source application dependencies are **five minimal table projections**, with the two rehearsal RLS policies and an explicitly synthetic ungranted-column probe. They do not reproduce the full 51-table application/PostGIS schema or certify deployed policies.

Each composition uses its own fresh Windows PostgreSQL **18.4** server. Servers run sequentially, with loopback SCRAM, eight maximum connections, 32 MiB shared buffers and 1 MiB work memory. Shared administration on this laptop is not independent production custody. No profiler library, mutation helper, routine replacement during observation, Docker workload, provider login, live model call or full backend suite runs in this batch. Original SQL, application transactions, accounting/signing implementations, Clerk and frozen V5 are unchanged.

| Installation | Custom routine instances | Explicit non-internal triggers | Accepted result |
| --- | ---: | ---: | --- |
| Source | 38 | 2 | Exact source files, source-only grants/columns, lineage capture |
| Receiver | 53 | 10 | Composed wrappers/private aliases, revision/capture/admission triggers |
| Custodian | 8 | 0 | Custom custody/key/admission/signature interfaces |

These **99 runtime instances** include distinct source/receiver copies and renamed originals. They are not a new count of source declarations or functions installed in one database. Extension members are inventoried separately and excluded from this custom denominator. The witness retains complete selected definitions and SHA-256 identities, owners, SECURITY DEFINER, volatility, settings/paths, ACLs, tables/RLS flags, constraints, triggers and owner default privileges.

## 2. Database metadata and real principal checks — 824/824 PASS

`native_sql_metadata_cases.py` checks every custom routine's declared owner, explicit pg_catalog-first/pg_temp-last search path and absent PUBLIC EXECUTE. Every selected constraint is validated and every expected trigger enabled; before/after catalogs are identical. Receiver dispatch/send WHEN clauses are checked separately. The optional management-retention topology and deployed application policies retain their earlier separate scopes; this fixture does not silently certify them.

For every custom owner, future functions are created in the existing schema and a new owner-controlled schema. Effective PUBLIC execution is denied in both. A real untrusted login receives schema usage only in the disposable probe schema and still gets **42501** on the future function, proving execution denial separately from schema hiding. Probe functions/schemas are then removed; no accepted routine is replaced.

Every selected service login authenticates over SCRAM and is checked for privileged flags and owner-role membership. Actual temporary-table creation, role creation/escalation and direct secret reads are denied. Direct table/column mutation rights are absent. Private helper EXECUTE is checked independently for each login, including all four broker recovery aliases, private cleanup, legacy stop and receive_committed. Actual selected private calls return 42501. The legitimate sender can call its empty next API; the opposite installation's sender remains denied.

Inspector access retains allowed minimized columns while secret columns are refused. Source-owner column grants permit the selected booking ID but deny the synthetic ungranted column. Extension/installer-root defaults, provider-reserved ownership, actual application-policy deployment and root compromise are separate trust boundaries. Ordinary service denials do not constrain a superuser.

## 3. Additional conditions and persisted results — 253/253 PASS

`native_sql_condition_followup.py` runs exact current definitions under both source and receiver compositions. It does not replace SQL with JavaScript mocks or force an invalid service mode.

| Scope | New positive/negative observations |
| --- | --- |
| S07 emit evidence | Camel-case, snake-case and nested payload precedence; absent/JSON-null evidence; empty string does not fall through COALESCE; numeric input is text-extracted. The emitter is a private owner routine, not a new arbitrary-input service API. Existing semantics are observed, not strengthened. |
| S07 identity/metadata | NULL/empty/nonempty owner HMAC behavior, NULL actor, observed receipt and numeric generation text; original-row commitment and event hash. Same identity plus same original reuses the retained sequence without rewriting action/owner/actor. Changed original raises 23514 and leaves head/sequence unchanged. Deduplication is keyed by identity/original, not every optional metadata argument. |
| Source/receiver config | Each installation's configured transport service produces one stable configuration commitment. The two compositions have their own transport dependencies; no opposite-service branch is fabricated. Different sampled service IDs also contribute to the differing commitments. |
| S02 permit | Valid permission; SQL NULL/wrong token, missing work, wrong/NULL lease owner or epoch, expired/equality-boundary/NULL lease, wrong status, STOP and equal/exceeded request budget. Actual authenticated worker replies, persisted request-count delta and retained work rows are asserted. Owner-seeded NULL lease states test the helper expression; they are not claims that ordinary claim creates those states. |
| S06 expected-source pair | One valid committed source is missing until observed. Correct identity with wrong evidence remains missing. Another row with correct evidence but another identity does not satisfy the pair. Both operands must match one record. Rolled-back owner probes restore the head. The existing deferred capture observes the original and yields CAPTURE_CONSISTENT. It remains a later observation, not original-time capture. |
| S14 accounting | Empty aggregates; UNKNOWN, CONFIRMED, RELEASED, conflicted and reserved rows; lifetime sums, confirmed/unknown/disputed/held/available amounts, active/backlog/reconciliation counts and oldest REGISTER among pending requests. UNKNOWN is not zero; disputed UNKNOWN is not double-counted in the OR filter. Owner-created rows test aggregation, not signature authorization or real spending. |
| S14 inspection | Missing/NULL request returns SQL NULL. Actual operator inspection omits request payload, attempt token/response and receipt MAC; synthetic private values are absent. Original receipt bodies/configuration remain within the existing minimized interface, not newly claimed anonymous data. |

The accounting timestamp comparison uses the same instant normalized to UTC; a local +05:30 display is not another event. No confidence range, receipt field type or lease/generation rule was invented. Native PL/pgSQL branch metrics do not measure these SQL expression operands; **no fresh native percentage is claimed**.

## 4. Reuse, failures and preservation

Existing ICR-1/P2–P7, original permissions/outbox/transport/broker evidence, earlier 96 expression checks, 94 helper checks, 77 broker predicate checks, 377 source-lineage checks, 79 capacity checks, and selected key/pressure/retention/restore results retain their own source epochs. They were not repeated to inflate totals. In particular, the old source invalid-lineage question already has later behavioral evidence; its original P2 counters stay unchanged.

Retained failures in this batch:

1. Metadata rehearsal incorrectly treated both sender role names as authorized in one installation. The real permission denial was correct. The assertion now verifies the opposite sender is denied; no grant changed. The first 555/555 passing metadata window remains at its narrower epoch, followed by the selected 824/824 private-helper matrix.
2. The condition seed omitted the broker event's mandatory authenticated actor; PostgreSQL correctly refused it. The fixture now records session_user.
3. The next condition rehearsal compared a displayed timestamp to a UTC text prefix. It now compares timezone-aware instants. Original failed witnesses, raw logs and exact executed source snapshots are preserved.

Final receipts bind current sources, SQL inputs and fixtures and report sourcesUnchanged=true. Scoped Python Ruff/syntax and Git/new-file whitespace checks pass. No application JS/TS changed, so backend typecheck/full regression is not claimed. [Changed code hashes](../../output/phase9d-sql-conditions-metadata-2026-10-23/changed-code.json), [preservation](../../output/phase9d-sql-conditions-metadata-2026-10-23/preservation.json), [host monitoring](../../output/phase9d-sql-conditions-metadata-2026-10-23/host-monitoring-summary.json) and [owned-server cleanup](../../output/phase9d-sql-conditions-metadata-2026-10-23/cleanup-readback.json) retain the exact boundary. All **175 preceding manifest entries**, **103 SQL/migration inputs**, HEAD and staging index are checked unchanged.

The profiler attempt was [paused separately](phase9d-1-profiler-reliability-pause-2026-10-23.md): its preflight refused existing running containers before creating any owned diagnostic container or executing SQL. Existing containers were left untouched. The current SQL tests use native PostgreSQL only. Owner-disabled RAM admission/abort thresholds remain off; deadlines and same-host responsiveness/RAM/commit/disk samples are retained. Sampling does not guarantee absence of an OS freeze.

## 5. Certification status and remaining scope

The listed condition/metadata scope is verified in isolation. All original **78 readiness criteria**, **20 audit rows** and **24 condition families** are preserved; current assessments are additive. Counts are assertions, not independent Boolean combinations, total SQL statements or a project-wide quality score.

Whole-SQL remains PARTIAL because full compound-predicate adequacy beyond these enumerated cases, deployment/provider/application metadata, installation-specific native exclusions and the private observe-duplicate/cleanup-no-target guards are not erased by this result. Those private normal-service exceptions remain protected by actual alias/execute denials; no bypass was granted to force a counter. Meaningful mutation/structural adequacy remains separately pending **P8**, not silently completed by ordinary row probes.

Broader storage quotas/deployed monitoring, real retention/copy/provider activation, Google/R2, off-host acceptance and independent administration retain their separate gates. Profiler default-cache signal-11 remains OPEN and paused; signal-9 remains SEPARATE/UNATTRIBUTED. No legal/policy approval, production deployment or authority is created by this checkpoint.

No production/customer connection, commit, push, merge, mutation campaign or deployment occurred. **Stop after this batch. P8 NOT_STARTED. Production stays OFF.**
