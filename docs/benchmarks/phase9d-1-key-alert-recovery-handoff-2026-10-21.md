# Backup key, alerts and external recovery handoff

21 October 2026 IST. Companion to the [no-Docker continuation](phase9d-1-no-docker-closure-2026-10-21.md). **Preparation is complete; physical key handoff and real alert delivery are not verified. Production workflows remain disabled.**

## Responsibilities

| Responsibility | Owner decision | Verification still needed |
| --- | --- | --- |
| Admin custodian | Rajjudin | Separately controlled account, credentials, recovery and audit administration |
| Offline backup decryption key | Divyansh Singh | Actual offline media/location, usable spare and recovery procedure |
| Technical first response | Divyansh Singh | Monitoring coverage, delivery and acknowledgement |
| Alert recipient | rcstravels.business@gmail.com | Authorized sender/transport and inbox test |
| Retention/holds/deletion and exceptions | Legal proprietor, informed by Indian counsel/CA | Formal category approvals; none inferred from tests |

## Offline key handoff

Current encrypted archive:

```text
C:\Users\singh\AppData\Local\RCSProofloop\local-backups\dev-20261020T202309Z-90796caf\backup.tar.age
```

Current age private identity:

```text
C:\Users\singh\AppData\Local\RCSProofloop\offline-key-staging\dev-20261020T202309Z-90796caf\age-identity.txt
```

The identity is a private file protected by the current-user/SYSTEM directory ACL, not a completed offline ceremony. Disk-encryption status is unverified. Both recovery materials remain on one laptop, so laptop/account compromise or loss remains a shared failure mode. No key was copied to removable media during this task.

1. Divyansh supplies an identified offline destination with suitable access protection. Do not format a drive or overwrite an existing key as part of handoff.
2. Copy recovery material under the owner's control; keep the private identity separate from R2, backup writer automation and the only archive copy. Do not paste it into chat, Git, email or CI artifacts.
3. Check the derived **public** age recipient against the private backup receipt. The initial backup/decrypt roundtrip already verified the staged key; a copied key still needs its own check.
4. Verify an archive copy's SHA-256 against `89987a14dbea3fa85c21048f1a736e15b8d101c8db7f0957ce9c26f3d8b9e2d3`. Decrypt only through a protected scratch/owned restore process outside the repository.
5. Record who tested the copied key, which recovery copy was used and what scope restored. Disconnect the offline medium. Establish a spare/loss/rotation procedure before any decision to remove the staged original. No original deletion is authorized by this checklist.

Restoring SQL does not recover external signing private keys. Historical signing public keys and receipts must remain identifiable; a new signer cannot stand in for an old key. Rajjudin's signing recovery and independent administration remain separate work.

## Email route configuration

The selected Gmail address can receive alerts. It does not, by itself, configure or authorize an outbound sender. Use the selected mail provider's supported SMTP account/credential; do not reuse the database password.

The new route is explicit and disabled by default. Configure the following in the appropriate protected GitHub environment, or in a private one-time local test process:

| Setting | Meaning |
| --- | --- |
| `BACKUP_ALERT_TRANSPORT` | `smtp`, or retain the existing `webhook` route |
| `BACKUP_EMAIL_ALERTS_ENABLED` | Must explicitly be `true` for SMTP; leave unset until configured |
| `BACKUP_SMTP_HOST` | Confirmed provider hostname |
| `BACKUP_SMTP_PORT` | `587` with STARTTLS, or `465` with implicit TLS |
| `BACKUP_SMTP_USERNAME` | Protected sender login |
| `BACKUP_SMTP_PASSWORD` | Secret credential; never a repository variable or committed value |
| `BACKUP_ALERT_FROM` | Provider-authorized sender address |
| `BACKUP_ALERT_TO` | `rcstravels.business@gmail.com` |
| `BACKUP_ALERT_KIND` | Closed backup/stale/restore event category; workflows supply it |

Both TLS modes retain certificate/hostname validation and a 15-second network timeout. No plaintext SMTP mode is supported. The generic email omits SQL, row contents, exception text, database passwords and signing material.

Configuration-only check, which never sends or opens a network connection:

```powershell
python tools/backups/notify.py --check
```

`ALERT_ROUTE_CONFIGURED_NOT_DELIVERY_VERIFIED` means local configuration parsed successfully. A later authorized synthetic test must exercise the actual sender and verify receipt, spam handling and a human acknowledgement. `ALERT_ACCEPTED_BY_SMTP` only means the SMTP server accepted the message. No real email or webhook was sent in this continuation.

The backup, watchdog and restore workflow environment blocks now support this route. Existing activation expressions and schedules are unchanged. Do not set `BACKUP_WORKFLOWS_ENABLED` or `BACKUP_RESTORE_VALIDATION_ENABLED` merely because local alert tests passed. Real backup jobs still require the separately pending destination, credentials, ownership and restore configuration. The existing CI restore harness uses a disposable container and was not launched here.

A watchdog hosted on GitHub alone cannot establish detection of a complete GitHub outage. Independent freshness monitoring and response coverage remain operational decisions. Legal, irreversible-deletion and business-impact decisions escalate from Divyansh to the proprietor.

## External recovery material

The [source-bound inventory](../../output/phase9d-no-docker-closure-2026-10-21/reconciliation-current/external-recovery-inventory.json) distinguishes repository integrations from actual deployments. Supabase dev currently has zero Storage buckets/object metadata records; this says nothing about GCS object contents. `backend/lib/storage.js` implements GCS object access. A confirmed development Google Cloud project/bucket is required before inspecting/exporting document or photo objects. No production bucket is assumed.

For each authorized external destination, record object versions/generations, hashes, location, permissions, holds, soft-deletion behavior and a lawful export/recovery procedure. Keep actual object names and customer contents in protected storage, not public checkpoint logs. Clerk, payment/payout, WhatsApp, push, maps and model-service configuration/recovery remain separate from a PostgreSQL archive. Provider accounts, final production regions and backup locations are not established by source references.

R2 remains unconfigured, with owner activation previously planned for **22 October 2026 IST**. No subscription, bucket, key, upload or automatic action was created. Production retention/deletion approvals remain pending; these instructions activate no deletion schedule.
