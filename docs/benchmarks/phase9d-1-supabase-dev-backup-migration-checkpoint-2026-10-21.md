# Phase 9D-1 — Supabase dev backup and migration

Completed **21 October 2026 IST**; original UTC timestamps are retained in receipts. Continues the [hosted setup checklist](phase9d-1-hosted-setup-checklist-2026-10-21.md) and [read-only Supabase inspection](phase9d-1-supabase-dev-readonly-checkpoint-2026-10-20.md).

**Dev backup/archive integrity: VERIFIED. Pending Prisma migrations: APPLIED AND VERIFIED. Full restore trial: NOT_RUN. Hosted Proofloop compatibility: PARTIAL. Production OFF. P8 NOT_STARTED.**

Evidence: [accepted result](../../output/phase9d-supabase-dev-backup-migrate-2026-10-21/accepted-result.json), [migration identities/history](../../output/phase9d-supabase-dev-backup-migrate-2026-10-21/applied-migrations.json), [private artifact locators](../../output/phase9d-supabase-dev-backup-migrate-2026-10-21/private-artifact-locators.json), [retained helper failures](../../output/phase9d-supabase-dev-backup-migrate-2026-10-21/retained-helper-failures.json), and [manifest](../../output/phase9d-supabase-dev-backup-migrate-2026-10-21/manifest.json). Earlier evidence and checklists retain their original states; this checkpoint supersedes their pending dev-backup/migration entries only.

## Authorization and target

The owner authorized backing up existing dev data locally, then applying migrations, and supplied a reset dev database password through a hidden local prompt. The fixed target was **RCS Travels Dev**, project **ggpfpszwflvbodrqngkh**, using its Session pooler on port 5432. Existing data was treated as potentially real throughout. No synthetic-data classification, destructive reset or permission to experiment on customer records was inferred.

The connection was stored with Windows account-bound encryption outside the repository. Native tools received credentials through their process environment; no connection URL or password was printed. The migration process explicitly received only the dev connection, with dotenv loading redirected away from the application `.env`. The application's `.env` was not edited, and this execution does not switch application connections to dev or update them after the password reset.

## Backup and recovery material

A full PostgreSQL custom-format `pg_dump` completed before migration, with no schema filters or silently omitted managed tables. An exported REPEATABLE READ, READ ONLY snapshot tied the archive and metadata together. Metadata includes extension/schema identity through the native archive, public table counts and rowset commitments, migration history, role attributes without passwords, role membership and default privileges. Hosted role passwords, provider configuration, external object contents and external signing secrets are separate recovery material.

Tools were native **pg_dump/pg_restore 18.4**, connecting to the existing PostgreSQL 17.6 dev service, and **age 1.3.2**. No Docker was used. Native jobs ran sequentially with deadlines and file/disk guards; Prisma's Node heap was limited to 512 MiB. This is not a claim that host freezing is impossible.

- The archive passed a full `pg_restore` read/decompression to the null device, without executing restore SQL.
- An age-encrypted bundle passed decrypt-to-stream SHA-256 comparison with the original bundle.
- The encrypted file is **758,136 bytes**, SHA-256 **89987a14dbea3fa85c21048f1a736e15b8d101c8db7f0957ce9c26f3d8b9e2d3**.
- Original native dump SHA-256: **30e729211ab934fe269a4f2c6db66d240667cc1f699fae2a44a37ba413b43135**.
- Plaintext dump, bundle and inventory scratch files were removed only after verification. Secure erasure from disk/pagefile is not claimed. Private diagnostic metadata and logs remain access restricted.

Encrypted backup:

```text
C:\Users\singh\AppData\Local\RCSProofloop\local-backups\dev-20261020T202309Z-90796caf\backup.tar.age
```

Decryption key, in a separate account-restricted directory:

```text
C:\Users\singh\AppData\Local\RCSProofloop\offline-key-staging\dev-20261020T202309Z-90796caf\age-identity.txt
```

**The key is still staged on this laptop.** Divyansh Singh remains the designated key owner; an offline handoff and recovery ceremony have not been verified. Preserve both artifacts. Copying the backup elsewhere without its separately protected recovery key is insufficient. A future restore must decrypt into a private scratch directory outside Git, verify the recorded hashes, and restore only into an isolated compatible database with required extensions and role mappings. Do not restore over dev or production as a validation shortcut.

This is one pre-migration recovery point, not a scheduled backup service. Upload, independent copies, full restore execution, RPO/RTO measurement, external objects and provider recovery remain pending. Successful archive reading and decryption do not establish a successful database restore.

## Applied migrations and persisted verification

All **24 exact pending migration files** were reviewed before deploy. They add nullable fields, enums, new tables/indexes/constraints, append-only triggers, vector support and protected policy chunks. Their only data backfill updates consequence tables created empty within this pending set. The precheck confirmed those tables were absent and the owner-driver uniqueness condition was satisfied. No existing booking/payment data deletion, DROP, TRUNCATE, reset, forced history repair or product SQL rewrite was executed.

The installed **Prisma CLI 7.10.0** ran `migrate deploy` once, with the existing configuration/schema and fixed dev credentials. Its return code was zero. Client package 7.8.0 was not regenerated or upgraded.

| Check | Actual result |
| --- | --- |
| Completed migrations | **59 → 83**, all 24 pending applied |
| Remaining pending / unfinished migrations | **0 / 0** |
| Remote migration checksum match | **83/83**, raw or explicitly LF/CRLF-normalized |
| Original application tables / rows | **27 / 62**, original values unchanged |
| Newly created application tables | **23**, all empty after migration |
| Current application tables excluding migration metadata | **50** |
| pgcrypto / PostGIS | Existing **1.3 / 3.3.7**, in `extensions` |
| vector | **0.8.2**, installed in `extensions` |
| policy_chunks | RLS enabled; zero policies; anon/authenticated SELECT denied |
| Bound migration/config/schema/CLI sources | Unchanged during deploy |
| HEAD / staging index | Unchanged from the preserved starting identities |

Row preservation was verified by server-side counts and hashes over each original table's original columns. This comparison deliberately excludes new additive columns and `_prisma_migrations`, whose history changed as intended. No application row contents were written into repository evidence. All 24 migration source hashes remain identical to the earlier task inventory. No application source, frozen V5, authentication source or Proofloop SQL source was edited by this continuation.

No backend regression, profiling or mutation campaign was run for this migration-only task. The historical accepted suites retain their own source epochs. No application service was launched, live provider request made or financial consequence applied.

## Connection checks and retained failures

Earlier supplied passwords were rejected; those attempts performed no migration. After the owner's reset, authentication succeeded. A backup-helper check then incorrectly required the database backend's `pg_stat_ssl` row to describe the client-to-pooler TLS connection. That backend row reports no SSL on the pooler's separate database hop. The helper now checks actual libpq client TLS with **verify-full**, retaining the backend observation separately. This does not certify encryption of the provider-internal hop.

The first Prisma status check returned **P1011**, reporting an untrusted certificate chain. The corrected invocation supplies the specific root from the verified pooler chain as Prisma's extra CA, with **sslmode=require and sslaccept=strict**. The subsequent status check identified exactly 24 pending migrations. No invalid-certificate acceptance, global trust-store installation or product configuration change was used. Source versions and failure annotations are retained separately. Python 3.13's stricter X509 structural check also rejected a CA lacking a key-usage extension; chain inspection used libpq-compatible validation with certificate and hostname verification retained. This did not disable Prisma's strict check.

Reference behavior: [PostgreSQL certificate verification](https://www.postgresql.org/docs/17/libpq-ssl.html), [Supabase connection methods](https://supabase.com/docs/guides/database/connecting-to-postgres), and [Prisma v7 PostgreSQL configuration](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/postgresql). Actual successful execution receipts establish the selected installed behavior.

## Remaining independent work

1. Perform an isolated full restore and measure recovery time; verify managed-role/extension configuration, external objects and separate recovery secrets.
2. Transfer and test the backup decryption key under Divyansh Singh's offline custody procedure; create an independently retained encrypted backup copy.
3. Resume R2 only when the owner confirms subscription activation. The existing planned **22 October 2026 IST** owner action is not an automatic activation. No bucket, billing checkout, access key or upload was created here.
4. Verify full Proofloop custom roles/schemas and source/receiver/custodian topology under hosted permissions. Prisma migration success does not establish independent custody or the accepted profiler version on Supabase. Rajjudin's administrative separation remains unverified.
5. Configure and test scheduled backups, stale/failure alerts and isolated restore validation before real-data automation. The selected email destination has not been tested or sent a message.
6. Obtain the proprietor's production retention/hold/deletion approvals. No automatic backup expiration or customer-data deletion was enabled.

No paid resource, production connection, deployment, commit, push, merge, evidence migration or P8 execution occurred. **Production remains OFF; broader Phase 9D-1 and hosting certification remain PARTIAL.**
