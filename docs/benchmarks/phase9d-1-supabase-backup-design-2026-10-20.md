# Phase 9D-1 — Supabase Free and encrypted offsite backups

20 October 2026 IST. Engineering design and local synthetic verification; **production OFF, hosted compatibility NOT VERIFIED, P8 NOT_STARTED**. No provider resource is provisioned by this change. Execution results belong in the accompanying checkpoint, not inferred from this design.

## 1. Compatibility decision before provisioning

**Supabase Free is a candidate for application PostgreSQL, not an accepted drop-in replacement for the entire Proofloop topology.** Current published Free capacity is 500 MB database, shared CPU/500 MB RAM, 5 GB egress and two active projects; inactive projects can pause after a week. Those limits do not establish suitable production capacity or independently administered custody. Three separately controlled projects cannot be assumed available under one Free allowance. [Supabase pricing](https://supabase.com/pricing).

| Repository requirement | Source evidence | Decision / necessary verification |
| --- | --- | --- |
| Prisma PostgreSQL migrations | `backend/prisma/schema.prisma`, all checked-in migration SQL, isolated `backend/tests/prisma.config.js` | Use reviewed `migrate deploy` on a disposable project before any customer import. Do not point `migrate dev` or the local CREATE DATABASE fixture at production. Current local migration success is not hosted permission evidence. |
| PostGIS and vector | `20260813150000_driver_location_postgis`, `20261009201254_create_policy_chunks` create extensions in `extensions` | Supabase lists these extensions. Check exact available versions, schema placement, ownership and privileges before replaying migrations. [Extension catalogue](https://supabase.com/docs/guides/database/extensions). |
| pgcrypto placement | `outbox.sql:5`, `transport-receiver.sql:4`, `closure-admission.sql:2` create pgcrypto in **outbox9d / transport9d / custody**, and callers qualify hmac with those schemas | A preinstalled pgcrypto elsewhere causes CREATE EXTENSION conflict and qualified-function failures. Supabase commonly places extensions in `extensions`. Inspect the actual project; do not move managed extensions, strip guards or silently rewrite these accepted definitions. This is a concrete compatibility blocker until reconciled and tested. |
| Restricted custom roles and SET ROLE | `permissions.sql`, broker/custody/lineage SQL, grants in fixtures | Supabase's postgres is not a true superuser. Custom-role creation alone does not prove owner membership, SET ROLE, SECURITY DEFINER/search paths, default PUBLIC denial, RLS or restricted logins work identically. Verify effective privileges and service-role denials in each disposable project. [Hosted role limitations](https://supabase.com/docs/guides/database/postgres/roles-superuser). |
| Source versus receiver | Existing fixtures use two databases on a local cluster | Prefer separately configured projects/connections if hosted service separation requires it. Sharing a project/administrator is a changed trust boundary requiring explicit review. No cross-project atomic snapshot is supplied by these backups. |
| Independent custodian | Separate physical PostgreSQL server in accepted fixture, independent signed records | Separate administration, account/repository, bucket scope, credentials and decryption control are required. Three archives in one administrator's bucket do not establish independence. Await owner's custodian decision. |
| Physical capacity/WAL diagnostics | `management-capacity.sql` calls pg_ls_waldir/pg_ls_tmpdir and assumes selected cluster visibility | Hosted permissions/physical telemetry differ. Do not fake inaccessible WAL/temp accounting as zero or relax admission. Provider telemetry integration remains separate engineering work. |
| Native profiler and debugger | P6 pinned native extension and debugger image | Hosted native binary installation/debug privileges are not assumed. Keep numerical profiling on the accepted isolated runtime with cache OFF; default-cache signal-11 remains OPEN and signal-9 remains separate/unattributed. |

Supabase documents direct connections for native dumps/migrations; session pooler is the IPv4 alternative where supported. Transaction pooling is refused by this tool. Prisma development shadow databases are a separate requirement, not a backup feature. [Connection guide](https://supabase.com/docs/guides/database/connecting-to-postgres), [Prisma guidance](https://supabase.com/docs/guides/database/prisma), [Prisma shadow database](https://www.prisma.io/docs/orm/prisma-migrate/understanding-prisma-migrate/shadow-database).

`tools/backups/preflight.sql` is a read-only catalogue worksheet for a later explicitly authorized disposable hosted project. It does not test CREATE ROLE/SET ROLE/restore privileges by changing grants, and has not been run against Supabase. The native exporter refuses hosted connections without `sslmode=verify-full`; configure a trusted CA/root certificate for the actual endpoint, not TLS verification bypasses.

## 2. Implemented backup boundaries

`tools/backups/backup.py` takes one explicitly configured source, receiver or custodian database per invocation. Configuration starts **disabled**, with hosting/private-bucket confirmation false. Scheduled GitHub jobs also require explicit repository variables. No workflow is activated locally or remotely.

The exporter uses PostgreSQL's supported `pg_dump -Fc`, preserving owners and ACLs, an exported REPEATABLE READ snapshot shared with its table inventory, inventoried schemas/extensions, large objects and lock/command deadlines. It dumps the database **minus explicitly reviewed schema exclusions**, rather than positive `--schema`/`--extension` filtering, to retain owner-wide default privileges. It does not use `--no-owner` or `--no-acl` to conceal unsupported permissions. Schema/extension set mismatches and exclusion of a required extension namespace fail. `pg_dump` is the supported logical-export primitive; Supabase's CLI additionally supplies provider-aware role/schema/data recipes. This implementation is an **application-scope native export**, not a claim of byte-for-byte equivalence to the Supabase CLI or a full managed-project backup. [PostgreSQL pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html), [Supabase export/restore recipe](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).

The current collector requires PostgreSQL 16 or newer so ADMIN/INHERIT/SET role-membership options are retained explicitly. Its supplied CI tools are PostgreSQL 17; select matching approved clients if the actual hosted server is newer. The local installed client version and server version are recorded separately. An older hosted database is not silently exported with incomplete membership metadata.

The encrypted bundle contains:

- Custom-format schema/data archive, including `_prisma_migrations` when public is selected, function definitions, triggers, sequences, constraints, ownership, ACLs and default privileges.
- Explicit restricted custom-role DDL **without passwords**, role attributes, memberships, extension names/versions/namespaces, schema ownership/ACLs, table counts, database/role settings and dump SHA-256.
- Source scope, snapshot identity, creation time and tool version. Configuration and database role settings remain reviewable restore inputs; they are not arbitrary commands automatically executed against a hosted project.

Any unexpected custom schema fails until included or explicitly reviewed as excluded. The supplied source configuration is an example, not an authoritative inventory for every topology. Each receiver/custodian needs its own actual schema/role/extension inventory. Reserved Supabase roles, managed auth/storage/realtime schemas, provider migrations/configuration, tablespaces, subscriptions, grants to managed principals and managed-schema customizations need a separately reviewed Supabase-native restore procedure. **Excluding a schema is an explicit recovery gap.** No production configuration should be approved with unexplained exclusions.

Global role metadata is not protected by the database MVCC snapshot. Freeze administrative DDL/role changes during a backup, or reconcile definitions/memberships separately. Separate source/receiver/custodian snapshots are not distributed transaction atomicity; retain receipt/commitment reconciliation and stopped-first recovery.

## 3. Encryption, keys and object integrity

The public age recipient encrypts the tar bundle using the upstream **age 1.3.2** tool. The backup writer does not need the private identity. The installer verifies the Linux release archive SHA-256; local verification uses the separately verified Windows release. No custom encryption protocol is introduced. [Upstream age release](https://github.com/FiloSottile/age/releases/tag/v1.3.2).

Plaintext exists transiently in a private OS temporary directory outside the repository while exporting/restoring. It is removed on normal exit; this is not a secure erase guarantee for runner disks, swap or abrupt process death. Use ephemeral runners, no cache/artifact upload of scratch, no shell tracing and no persistent self-hosted runner without a separately approved encrypted-disk lifecycle. Never put private signing material, age identities, URLs, SQL dumps or R2 secrets in configuration committed to Git.

Only `.tar.age` ciphertext is uploaded. The tool downloads it and checks SHA-256 before publishing `latest.json`. The pointer contains scope, opaque object key, checksum, size and completion time. A failed upload does not publish success. The watchdog checks time, object existence/metadata and actual downloaded bytes. Age authentication also rejects changed ciphertext during decryption.

SHA-256 and age encryption do not authenticate an independent custodian or prevent a compromised writer from replacing both archive and pointer with a new encrypted archive. Preserve independent source hashes/receipt trust and separately controlled custody. There is no object-lock/immutability certificate here.

Use bucket-scoped R2 Object Read & Write credentials for the writer and Object Read only credentials for watchdog/restore. Cloudflare describes these scopes and the account S3 endpoint; confirm actual bucket privacy, public development URL/custom-domain settings, lifecycle rules, location and account access before activation. The S3 client cannot prove every R2 public-access setting; `private_bucket_confirmed` is an operator attestation. A read/write token may permit deletion even though this code has no delete API. [R2 tokens](https://developers.cloudflare.com/r2/api/tokens/), [S3 endpoint](https://developers.cloudflare.com/r2/get-started/s3/).

## 4. Workflows and secrets

| Workflow | Intended operation | Current activation |
| --- | --- | --- |
| `database-backup.yml` | Daily 03:17 UTC export/encrypt/upload/readback/freshness | OFF unless `BACKUP_WORKFLOWS_ENABLED=true`; protected `backup` environment |
| `database-backup-watchdog.yml` | Hourly at minute 7, read-only freshness/object-metadata check, generic failure webhook | Same OFF switch; separate read-only `backup-watchdog` environment; full downloaded integrity remains the daily verification step |
| `database-restore-validation.yml` | Manual **synthetic-only** restore drill, finite owned server, loopback-only endpoint, no remote destination input | OFF unless `BACKUP_RESTORE_VALIDATION_ENABLED=true`; protected `backup-restore-synthetic` environment and explicit pinned-image approval |

Checkout and setup actions are pinned to inspected official commit SHAs with persistence of Git credentials disabled. Workflows contain no artifact upload or cache step. Actual workflow dispatch on GitHub has not occurred. The PostgreSQL installer intentionally runs only on a GitHub Linux runner and does not reconfigure this Windows host.

Configure via the appropriate protected environments:

- `BACKUP_CONFIG_JSON` variable: reviewed configuration, public age recipient, one scope only.
- `BACKUP_DATABASE_URL` secret: authorized export connection; hosted TLS and certificate verification must be validated. Password stays in process environment, not command arguments or printed subprocess errors.
- `R2_ENDPOINT`, `R2_WRITE_ACCESS_KEY_ID` / `R2_WRITE_SECRET_ACCESS_KEY`; separate `R2_READ_ACCESS_KEY_ID` / `R2_READ_SECRET_ACCESS_KEY`.
- `BACKUP_ALERT_WEBHOOK`: approved HTTPS receiver. Job failures send a generic message, repository and run ID; endpoint and exception details are withheld. Missing routing fails rather than pretending notification delivery.
- Synthetic CI restore only: `AGE_SYNTHETIC_RESTORE_IDENTITY` secret, with configuration `synthetic_validation_only=true`. Never put the offline production identity into this secret. `BACKUP_RESTORE_IMAGE` must be a qualified image digest containing approved versions of required extensions; `BACKUP_RESTORE_ENVIRONMENT_APPROVED=true`. Real-data restore validation requires the separately approved offline/custodian-controlled procedure, not this synthetic CI key. The backup writer receives no identity. The custodian should use a separately controlled repository/environment, not the same administrator's three environment names.

The default restore server is 768 MiB, 0.75 CPU, 128 PIDs with verified Docker readback, an owned volume/network and no source credentials mounted inside. Published PostgreSQL is loopback-only. **The owned bridge is not an outbound network fence.** Dumps execute trusted-source code; high-assurance native debugging or adversarial dump analysis belongs on a separate disposable VM with an externally enforced egress policy. No host/global Docker security settings are changed. Restore never activates application jobs, logins, financial decisions or custody authority.

## 5. Restore validation and recovery limits

Restoration refuses a non-loopback target, a database not prefixed `rcs_restore_`, a nonempty target or pre-existing custom roles. A fresh cluster is mandatory. The encrypted inventory is integrity-checked; archive extraction rejects unexpected members. Selected custom roles are recreated restricted and **NOLOGIN**, then application SQL is restored transactionally with owners/ACLs retained. Counts, extensions, schema owners/ACLs and default ACLs are compared. Synthetic tests additionally compare exact custom function definitions and actual Unicode/binary payloads. Cross-scope/admin memberships and database role settings are reported for reviewed mapping, not silently claimed restored. Real role passwords must be reset through a separate credential process.

The owned image initializes PostGIS in its initial database. The restore job therefore creates a separate `template0` database and checks that only the ordinary empty public schema and plpgsql extension exist. The final database export uses PostgreSQL's normal public-schema restore handling. An earlier positive-schema export collided with public and subsequently exposed missing global default ACLs; those failed layouts remain historical and are refused by the final restore-layout check. No source schema is removed, the nonempty-target guard remains, and no broad `--clean` restore runs.

This restores a quarantined logical database. It is not a hosted Supabase control-plane/Auth/Storage restoration, provider credential recovery, actual legal-hold reconciliation or an approved production runbook. Reapply current independent hold/tombstone authority **before any release**; the prior `management-backup.mjs` quarantine/restore comparisons remain a separate local mechanism. Recreated historical data must not override current deletion/hold state.

Daily schedules suggest about 24 hours of data loss only when every export completes; this is not a guaranteed RPO. GitHub schedules can be delayed or dropped and the project/network/bucket can be unavailable. Default staleness is 30 hours, a configurable operational proposal, not a legal retention duration. An hourly watchdog on the same GitHub platform cannot alert during complete GitHub failure: an independently hosted heartbeat/freshness monitor and named responder remain required. No end-to-end production RTO is established by a small local synthetic restore. Include provider creation, extensions/roles, key retrieval, download, restore, receipt/hold reconciliation, application validation and proprietor activation in that measurement. [GitHub schedule limitations](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows).

The pointer retains both completion time and the source transaction's recovery-point timestamp. Freshness rejects a stale/future timestamp in either field, so a newly uploaded old snapshot cannot reset the freshness window. This is still a per-database MVCC recovery point, not a cross-service consistency proof.

The hourly watchdog does not download every full archive. It checks the pointer, recovery/completion ages, object size and stored checksum metadata. It cannot detect a same-size content corruption with unchanged metadata until full verification/restore. Daily backup readback and the explicit `verify` command do download and hash the ciphertext. This distinction bounds work and avoids treating metadata as a full integrity certificate.

### Cost boundary

Free tiers are not a zero-cost guarantee. Daily full exports consume Supabase egress before client-side compression, alongside application traffic. As a scale illustration, 500 MB transferred thirty times is 15 GB, already above the published 5 GB Free allowance; actual logical export transfer must be measured. Measure Actions runtime as well: private GitHub Free repositories currently have a 2,000-minute monthly allowance shared with other jobs. Hourly checks plus backups/restores can exhaust it; configure spending controls separately before activation. No billing or paid-resource setting was changed. [GitHub Actions allowances](https://docs.github.com/en/billing/concepts/product-billing/github-actions), [Supabase capacity](https://supabase.com/pricing).

## 6. Retention and external objects

`retention_days=null` means keep all archives. A positive value only lists candidate counts; **no deletion API is implemented**, even if a configuration flag says approved. Disable R2 expiration/lifecycle rules until approved. Unbounded backups grow and can exceed free storage/operation quotas; no paid resource or billing guarantee is created. A future hold-aware deletion implementation requires proprietor approval and qualified legal/CA advice. Existing twenty-category proposals remain unapproved.

| External material | Repository indication | Backup scope / next requirement |
| --- | --- | --- |
| Driver documents/photos and archived objects | `backend/lib/storage.js`, `documentScan.js`, `driverPhoto.js`, GCS_BUCKET | Current storage implementation is GCS. Database metadata is not object bytes. Inventory actual bucket/object versions, hashes, regions, IAM, deletion/holds and export mechanism separately. No object account queried. |
| Supabase Storage | Historical references and possible managed storage metadata | No actual bucket adoption confirmed. Logical database backups exclude object bytes. [Supabase backup boundary](https://supabase.com/docs/guides/platform/backups). |
| Clerk identity; Razorpay/X; WhatsApp/Meta; Firebase/FCM; Maps/Routes | Existing integration source/configuration | Provider-side records, keys and control-plane configuration are not restored by pg_dump. Determine required lawful export/configuration/credential recovery individually. No provider calls. |
| Proofloop signed receipts/evidence/artifacts | Separate source/receiver/custodian and output evidence | Logical selected schemas are included; off-host artifacts, independently administered anchors and repository historical evidence need separate inventory/custody. No evidence migration or replacement occurred. |
| Custodian private signing keys / provider secrets | Existing synthetic signer keeps private material outside PostgreSQL; public registry/receipts are retained in SQL | A database dump does not recover an external signing private key or deployed secret store. Define separately controlled encrypted key recovery and rotation; do not export signing keys into GitHub artifacts or treat a fresh key as the historical signer. Historical public signature verification and permission to issue new signatures remain separate. |

## 7. Owner decisions still required

1. **Latest custodian designation: the admin custody role**, replacing the earlier developer/proprietor operational designations. The named individual is TBD; the proprietor may occupy that role if its access separation is established. Actual custody account/project and enforced separation from developer/application administration remain unconfigured and unverified. This role assignment does not grant database permissions or establish independent administration. Offline backup-key ownership is still TBD and separate from this designation. Final legal retention/deletion approval remains with the proprietor. The owner explicitly retained the current guarded Proofloop review design rather than switching to confidence-only adjudication.
2. Actual Supabase projects/regions/database versions and R2 private bucket location/privacy/lifecycle; provider contracts and transfers remain TBD.
3. Offline decryption-key custodian and recovery/rotation ceremony. Avoid putting the only private identity in GitHub.
4. Named technical operator, actual alert destination and independent watchdog location.
5. Approved purposes/retention/holds/deletion exceptions and production activation, all still pending.

These decisions do not block policy-neutral synthetic verification. P8 remains independent of hosting; it is neither started nor made conditional on buying resources.

### Explicit owner configuration decision

R2 location, offline backup decryption-key owner and monitored alert destination/responder are **all TBD**. The owner explicitly requires backup creation, encryption, alerts and restore verification for real production data to stay disabled until configured and verified. No bucket or production workflow has been provisioned. The only copy of a decryption key must not be stored alongside backups; successful upload alone is insufficient recovery evidence. No old backup is automatically deleted before approved retention policy.
