# Audit boundary, discovery methods and reproduction

The audit begins from the dirty working tree, not HEAD alone. [repository-inventory.json](../../../output/proofloop-project-wide-audit-2026-10-11/repository-inventory.json) binds HEAD, original porcelain status and 1,444 content hashes plus metadata/exclusion records. The live read ledger is not an atomic snapshot. [evidence-verification.json](../../../output/proofloop-project-wide-audit-2026-10-11/evidence-verification.json) recomputes content identities, marks concurrent changes and checks historical evidence without executing it. Restricted environment/key/profile/production-data content is never read. Binary/generated/vendor paths are counted or metadata-accounted instead of semantically parsed.

Independent passes: filesystem/package-root discovery; TypeScript AST imports/dynamic-import literals; entrypoint-root import closure; literal Express registration/middleware mounts; a bounded audit copy of Code Atlas symbol/call/reference/Prisma/UI discovery; a second actual-router AST parser; Prisma delegates and financial data keys; raw SQL/schema/migration/trigger candidates; timer/queue registrations; provider imports/calls; environment-key and alias/client-config references; documentation/policy/owner-source recovery; and source test/assertion discovery. Actual relevant code ranges are inspected for money, auth, transactions, eligibility, cancellation, onboarding, search, messages and evidence decisions.

The unmodified Atlas attempt hit the 4GiB V8 heap limit after including retained mutation directories. An audit-only copy excludes .stryker-tmp/.expo and implicit dependency/library loading. The original scanner stays unchanged. Adaptation/original byte hashes and remaining diagnostics are in [static-dependency-graph.json](../../../output/proofloop-project-wide-audit-2026-10-11/static-dependency-graph.json). The independent route count still matches 105/105. The broad UI path-object heuristic is independently corrected: 28 objects outside router registration and eight missing pathless layouts; actual-router denominator 54. [navigation-reconciliation.json](../../../output/proofloop-project-wide-audit-2026-10-11/navigation-reconciliation.json) preserves each disposition; legal/tab navigation-link data remains in source/UI discovery. [subproject-inventory.json](../../../output/proofloop-project-wide-audit-2026-10-11/subproject-inventory.json) records package roots and script names without executing them. Repeated policy statements retain separate source-occurrence IDs in [policy-occurrence-reconciliation.json](../../../output/proofloop-project-wide-audit-2026-10-11/policy-occurrence-reconciliation.json).

The Supabase and Postgres skills were used for static connection/privilege/transaction review. The [official connection guide](https://supabase.com/docs/guides/database/connecting-to-postgres) was consulted; the skill's Markdown changelog lookup returned an unsupported content type. No Supabase project, database, deployed grant or provider account was accessed.

## Reproduction

The following commands only write within the audit folders and do not load application modules, run tests, create a DB, execute receipts or call providers:

```powershell
node docs/audits/proofloop-project-wide/discover.mjs
node docs/audits/proofloop-project-wide/atlas-adapter.mjs
node docs/audits/proofloop-project-wide/enrich.mjs
node docs/audits/proofloop-project-wide/compile.mjs
node docs/audits/proofloop-project-wide/evidence.mjs
node docs/audits/proofloop-project-wide/reconcile.mjs
node docs/audits/proofloop-project-wide/reports.mjs
node docs/audits/proofloop-project-wide/validate.mjs
```

Preserve this run before reproducing: discover rewrites its audit baseline. On a large dirty workspace, use the bounded adapter instead of discover's final unmodified graph stage. No reproduction command is a production authorization. Existing code/test checks were not rerun because application surfaces were not changed. The audit validator checks references/counts/IDs/hash identities and report consistency only.

## Explicit limits

Runtime-reference evidence is static registration/call/import resolution, not a live deployment attestation. Dynamic/computed routes, callbacks, dependency injection, aliased ORM stores, SQL function bodies/dynamic statements, notification event ordering and deployed config/grants retain uncertainty. Statements inside policy/implementation documents are rule candidates until approved provenance and current enforcement agree. Legal conclusions/provider certification/physical issuing-authority truth/real device conditions require the proper external authority.

The UNKNOWN/UNMAPPED denominator is not one bucket of low-risk features: [unmapped.json](../../../output/proofloop-project-wide-audit-2026-10-11/unmapped.json) records distinct UI handlers, internal units, configuration/rule candidates and SQL candidates with source-specific reasons. Explicit unknown discovery accounting does not establish exhaustive semantic closure. The full audit therefore remains PARTIAL even though every statically registered API/job/router construct is reconciled.

The existing evidence manifests bind historical source versions. Current source drift and mutable pointers are separately reported. Active Phase 9C form/review/device recipe source was re-read after detecting change; no completion claim was advanced from unexecuted code. Only the audit folders were written; no code, policy, schema, frozen model, flag, tests, deployed workflow or production data were changed by this task.
