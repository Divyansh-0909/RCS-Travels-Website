# Phase 9D-1 ? current hosted setup checklist

Updated 21 October 2026 IST. Additive continuation of the [pre-P8 checklist](phase9d-1-pre-p8-reconciled-checklist-2026-10-20.md), [Supabase inspection](phase9d-1-supabase-dev-readonly-checkpoint-2026-10-20.md) and [R2 setup plan](phase9d-1-r2-cli-setup-checkpoint-2026-10-20.md). Historical reports and manifests are preserved.

## Cloudflare R2 ? owner deferred

- [x] Cloudflare CLI login completed; account/user read scopes observed.
- [x] Asia-Pacific hint selected for synthetic test backups only; no India-only guarantee or production-location approval.
- [ ] **R2 subscription activation: deferred by owner to 22 October 2026 IST**, because credit-card setup is needed. Planned owner action only; no automatic reminder, checkout, activation or new permission is inferred from the date.
- [ ] Obtain appropriately scoped R2 management access after owner activation; account/user read token is insufficient.
- [ ] Create and verify the private synthetic bucket with public URL/custom domains disabled, Standard storage and no automatic expiration/deletion.
- [ ] Configure separate scoped writer/read-only credentials outside Git and verify encrypted synthetic upload/download/decryption.
- [ ] Keep real-data backups and production workflows disabled pending full configuration/verification and authorization.

**Owner will tell us when ready.** No credit-card data is requested or stored by the agent. No bucket, storage key, subscription or billed resource has been created by this task. The earlier permission error 10000 is not treated as proof of the billing state; the activation deferral is the owner's explicit statement.

## Supabase dev backup before migration ? separate work

- [x] Identified RCS Travels Dev and completed read-only catalog/count inspection.
- [x] Owner authorized making a local backup of the existing dev data, then applying pending migrations. The data is still treated as potentially real; this does not classify it as synthetic or permit destructive experiments/reset.
- [ ] Obtain the correct dev Direct or Session pooler PostgreSQL connection through a protected local prompt. Browser API login does not supply its database password. Other database connection settings will not be reused.
- [ ] Save a protected local backup outside Git/repository evidence, preserve relevant roles/schema/data/configuration and verify archive/integrity coverage before any migration. Managed provider objects/keys remain separate recovery material.
- [ ] Review exact pending migration preconditions and apply only authorized dev migrations after backup acceptance; preserve original records and migration history. No migration reset, forced history repair or production changes.
- [ ] Verify actual installed definitions/permissions and post-migration counts; full Proofloop hosting compatibility remains separate from simply applying Prisma migrations.

No backup, migration or hosted database write has yet occurred. The current read-only recheck reports 59 completed migrations and pgcrypto in extensions. Twenty-four local migrations were absent in the recorded history; line-ending checksum variants are retained separately. A pending-migration source navigation file is preparation, not a safety/restore certificate.

## Responsibilities and remaining configuration

- [x] Rajjudin designated admin custodian; independent credentials/account/access separation remains unverified.
- [x] Divyansh Singh designated offline decryption-key owner and technical responder; actual key storage/recovery procedure remains unconfigured.
- [x] rcstravels.business@gmail.com selected as alert destination; delivery/monitoring and sending transport remain unverified. No message sent.
- [ ] Proprietor-approved production retention/hold/deletion schedule and exceptions, informed by qualified Indian counsel/CA.
- [ ] Actual external object/signing-key/configuration recovery, deployed monitoring and independent custody verification.

**P8 NOT_STARTED. Production OFF.** R2 deferral pauses R2 activation/setup only; it does not imply completion or cancellation of the independent backup/migration request. No automated deletion, paid activation, Docker, profiling, mutation, commit, push, merge or deployment occurs in this checklist update.
