# Phase 9D-1 ? R2 CLI setup preparation

20 October 2026 IST. **Cloudflare CLI login VERIFIED; R2 setup NOT_COMPLETE. No subscription activation, bucket, object or storage key created. Production OFF; P8 NOT_STARTED.**

## Why R2 is needed

The chosen backup architecture exports selected PostgreSQL data, encrypts it locally with a public age recipient and stores ciphertext outside Supabase. R2 is the object-storage destination for that separate recovery copy. A database loss, destructive migration or accidental deletion should not remove the only backup. A successful upload is not a restore certificate; actual readback/decryption/restore and current hold/tombstone reconciliation remain necessary.

R2 is not the audit custodian and cannot make one unrestricted administrator independent. Rajjudin is the named admin custodian; Divyansh Singh owns offline decryption-key responsibility and initial technical response; the selected alert destination is rcstravels.business@gmail.com. Actual key ceremony, account separation, email delivery and monitoring remain unverified. Database exports do not automatically capture external GCS object bytes or signing secrets.

## Owner-approved choices and concrete plan

- Existing Cloudflare account; owner reports R2 is **not activated**.
- **Asia-Pacific (apac) hint approved for synthetic test backups only.** It is best effort, not an India-only residency guarantee. Production location remains unapproved.
- Proposed bucket: **rcs-proofloop-synthetic-backups**. This is a proposed name, not an existing/provisioned resource.
- Storage class **Standard**; public r2.dev URL and custom domains disabled; no automatic expiration/deletion; no Worker deployment or production backup enablement.
- Separate bucket-scoped object read/write writer and object read-only verifier credentials. Offline production decryption key never goes into R2, backup automation or synthetic CI restore secrets.

The [machine-readable setup plan](../../output/phase9d-r2-setup-2026-10-20/reviewable-setup-plan.json) contains the inspected CLI command shape and explicit acceptance sequence. The create command is **not executed**. No assumption that free allowance is an enforced spending cap is made.

## Actual CLI observations

Wrangler **4.151.3** was resolved through npx outside application dependencies. The CLI installed its optional OS keyring backend in its own tooling/cache location; no application package/lockfile was changed. Browser OAuth completed successfully with requested **account:read/user:read** and offline_access. Windows keyring storage was selected rather than copying credentials into repository configuration.

`whoami --json` reports one accessible account. Only account metadata/scopes are retained in [account inspection](../../output/phase9d-r2-setup-2026-10-20/account-inspection.json), not tokens or a complete raw login transcript. The read-only `r2 bucket list` request exits 1 with provider **10000 authentication/permission error** under those scopes. This is **not proof of an inactive R2 subscription**, not a 10042 enablement result, and not evidence of billing activation. No write or entitlement-changing request followed.

The [R2 request result](../../output/phase9d-r2-setup-2026-10-20/r2-readonly-status.json) retains that distinction. Supabase login/metadata evidence remains separate. The populated dev database has not been exported or declared synthetic while owner data-provenance confirmation is pending.

## Remaining owner and access steps

Cloudflare's [get-started instructions](https://developers.cloudflare.com/r2/get-started/) require an R2 subscription checkout. Included free usage does not eliminate charges beyond allowances; [pricing](https://developers.cloudflare.com/r2/pricing/) distinguishes Standard free allowances from billable usage. The existing instruction prohibits paid resources. Accordingly **no checkout or billing acceptance is performed**. The proprietor/account owner must resolve that subscription decision before bucket creation; the CLI cannot silently waive it.

After activation is confirmed and authorized, obtain appropriately scoped R2 management access through a supported protected local flow. The current account/user read token is insufficient; no broad write escalation or token generation has occurred. Inspect bucket-name availability, create only the reviewed synthetic bucket, read back access/location/class/lifecycle, then test encrypted generated synthetic bytes and least-privilege credentials. Do not paste tokens or keys in chat. Do not upload the dev database merely because its project name contains Dev.

Cloudflare's [location documentation](https://developers.cloudflare.com/r2/reference/data-location/) distinguishes hints from guaranteed jurisdictional restrictions and notes that jurisdiction cannot be changed after creation. Synthetic APAC approval does not supply a legal or production hosting decision. [Public-access documentation](https://developers.cloudflare.com/r2/buckets/public-buckets/) describes separate public access paths; both must be checked rather than assuming a bucket-name/private flag proves confinement.

## Preservation and scope

Only this checkpoint and new setup evidence are written. Existing workflows, source, migrations, SQL functions/permissions, old evidence and database data remain unchanged. No Docker, backup export, email, deployment, commit, push, merge or P8 work runs. This records a blocked external activation/access step; R2 is not falsely marked configured.
