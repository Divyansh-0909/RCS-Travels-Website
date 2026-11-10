# Phase 9D-1 ? Supabase dev read-only preflight and owner assignments

20 October 2026 IST. **Hosted metadata inspection complete; full compatibility PARTIAL; data provenance UNCONFIRMED. No migrations, data edits, permission changes or workflow activation. P8 NOT_STARTED; production OFF.**

## Owner assignments now recorded

| Responsibility | Owner-selected assignment | Actual configuration boundary |
| --- | --- | --- |
| Admin custodian | **Rajjudin** | Named responsibility only; independent account, credentials/access and recovery administration not configured or verified. |
| Offline backup decryption-key owner | **Divyansh Singh** | Actual offline key storage, recovery/rotation procedure and separation from writer/R2 remain unverified. |
| Technical responder | **Divyansh Singh** | Operational response coverage and tested alert receipt still need verification. |
| Selected alert email | **rcstravels.business@gmail.com** | No email sent; mailbox access, monitoring, delivery and routing are unverified. No mail provider/OAuth/SMTP secret configured. |

The proprietor retains final retention/hold/deletion/exception approval informed by qualified Indian counsel/CA. The full production schedule remains unapproved. R2 location/bucket/privacy remains unconfigured. Earlier documents marking these names TBD are historical; this additive [assignment record](../../output/phase9d-supabase-dev-preflight-2026-10-20/owner-assignments.json) supplies the current owner choices without rewriting old evidence. Selection is not activation.

## Exact inspected project and method

- Project **RCS Travels Dev**, reference `ggpfpszwflvbodrqngkh`, provider region code **ap-south-1**, status **ACTIVE_HEALTHY** at inspection.
- CLI **2.121.0**, resolved/pinned through npx cache outside application dependencies; no repository package/lockfile install or local Supabase init/link/start.
- Provider database build **17.6.1.166**; SQL `server_version` **17.6**.
- Owner completed browser login in a separate interactive terminal. Windows native credential storage supplies the token only in process memory; token, verification code, private key and authorization header are absent from report/evidence.
- Project identity was matched exactly before database requests. All nine recorded probes use only the fixed dev project's `/database/query/read-only` endpoint. Session is **supabase_read_only_user**, with **transaction_read_only=on**. No write endpoint was called.

The [read-only API](https://supabase.com/docs/reference/api/v1-read-only-query) is documented as beta and requires qualified entity references. Read-only query authority is not the `postgres` administrator's execution authority; this inspection cannot test CREATE ROLE, SET ROLE, installation, denied service logins or restore ownership simply by seeing catalog flags.

## Actual findings

| Boundary | Direct observation | Consequence |
| --- | --- | --- |
| Existing data | **27 inspected public application tables**, **12 visibly populated**; observed bookings **9**, drivers **6**, driver_documents **7**, payments **3**, users **1**. Counts are bounded at 1,001 and subject to role/RLS visibility. | Dev is not an empty fixture. Counts cannot establish synthetic provenance, disposability or permission to overwrite. The owner has been asked whether this is synthetic or includes real/copied data. |
| Migration history | **59 remote records** versus **83 local migration files**; **24 local migration names absent** remotely; no remote-only names or unfinished non-rolled-back entries in the inspected set. | Existing dev migration history does not prove current 83-migration deployment or safe replay. Missing list includes later cancellation/payment/responsibility/shadow and policy_chunks changes. No migration applied/repaired/reset. |
| Migration bytes | **37 exact raw checksum matches**; **22 other checksums match the CRLF variant** of current local bytes. **Zero unexplained mismatches** after LF/CRLF analysis. | Retain raw and normalized identities separately. Do not call these 22 product-content drifts or rewrite historical checksums. This comparison does not inspect every actual installed object definition. |
| Crypto placement | pgcrypto **1.3** in **extensions**; observed hmac functions only in extensions. | Current Proofloop SQL calls service-schema crypto and creates pgcrypto in outbox9d/transport9d/custody. Existing hosted placement is a confirmed compatibility discrepancy; no extension relocation, alias or guard change made. |
| PostGIS | Installed **3.3.7**, schema extensions. | Namespace agrees with the relevant application migration pattern; full migration/restore acceptance still unexecuted. |
| Vector | Available **0.8.2**, **not installed**. | Later policy_chunks migration is absent. Availability does not prove permission or successful migration; no extension enabled. |
| Native profiler | Available plpgsql_check **2.8**, not installed. | This differs from the accepted pinned v2.10.4 profiler runtime. No hosted profiler/crash reproduction attempted; do not transfer local native counters to this host. |
| Proofloop topology | No observed outbox9d/transport9d/broker9d/audit9d/shadow9d/custody/custody_export/custody_lineage/retention9d/capacity9d schemas; no matching custom Proofloop roles in the selected catalog query. | This hosted project has not supplied installed Proofloop topology/custody acceptance. One dev database is not three independent services. |
| Administrative role | postgres catalog flags: superuser **false**, create-role **true**, create-db **true**, bypass-RLS **true**. | Flags are metadata, not an actual role/ownership/SET ROLE/restore trial. The inspection session remains the separate read-only role. |

Supabase documents [extensions commonly under extensions](https://supabase.com/docs/guides/database/extensions) and [managed superuser restrictions](https://supabase.com/docs/guides/database/postgres/roles-superuser). The discrepancy above is supported by actual project observations, rather than inferred solely from those docs. Provider region is observed for this dev database only; backup/R2/object locations and any production arrangement remain TBD/unverified.

## Read scope and limits

Only catalog metadata, table sizes/RLS/ownership flags, bounded counts and migration names/checksums/status flags were retrieved. No customer names, phone numbers, addresses, object contents, document scans, payment payloads, API keys or role passwords were retrieved/exported. Selecting COUNT over a bounded SELECT 1 does not prove that a record is fake. Private storage/Auth contents and other providers were not inspected; no complete data inventory or compliance claim follows.

Nine successful probe groups are **metadata inspection results, not nine passing integration tests**. API request shapes, UTC execution timestamps, sanitized results and fixed-project executor hash are retained in the [execution receipt](../../output/phase9d-supabase-dev-preflight-2026-10-20/read-only-execution.json). Original source/query hashes, [migration line-ending analysis](../../output/phase9d-supabase-dev-preflight-2026-10-20/migration-checksum-analysis.json) and [compatibility observations](../../output/phase9d-supabase-dev-preflight-2026-10-20/compatibility-observations.json) are separate.

## Next safe decisions

1. Owner must clarify whether existing dev rows contain real/copied details, whether its working data must be preserved, and whether its active developers depend on it. Current state stays read-only. Synthetic classification alone does not authorize a blanket reset or destructive tests.
2. If using this populated dev project later, review exact pending migrations and an approved backup/recovery plan first. Any compatibility test that installs roles/schemas/extensions or replays migrations needs a separate concrete, reversible scope. No production project access is needed for that.
3. Reconcile service-specific crypto with managed extension placement in an isolated design/test scope. Do not silently move extensions, create production aliases or weaken accepted guards to obtain a pass.
4. Verify effective administrative role memberships/default grants/ownership and actual source/receiver/custodian separation. Rajjudin's designated responsibility must correspond to independently enforced access; the assignment alone does not establish it.
5. Select/configure private R2 and offline-key recovery separately. Select an email transport/routing mechanism and verify the mailbox is monitored before any authorized test email. No token/password should be posted in chat. All real backup/encryption/alert/restore workflows remain OFF.

## Preservation and stop point

Only new inspection orchestration, evidence, owner assignment and this checkpoint are written. No application SQL, migration, authentication, frozen V5, signing/ACK/financial policy, existing source/evidence, database grant, customer record or production configuration is changed. Source inputs, HEAD and staging are fingerprinted; hash identity is not an execution certificate. No Docker, native profiler, mutation, backup/export, email, paid resource, commit, push, merge, deployment or P8 execution occurs.

**Hosted compatibility PARTIAL; existing dev data synthetic/disposable status UNCONFIRMED; owner roles/email SELECTED but operationally UNVERIFIED; production OFF.**
