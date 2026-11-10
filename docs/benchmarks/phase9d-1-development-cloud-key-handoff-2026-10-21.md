# Development cloud inventory and key/custodian handoff

21 October 2026 IST. Continues the [no-Docker closure](phase9d-1-no-docker-closure-2026-10-21.md) and [key/alert handoff](phase9d-1-key-alert-recovery-handoff-2026-10-21.md). This continuation queries Google Cloud metadata and local disk topology only. No database connection, Docker startup, object read/write, email, provisioning, deployment or production activation occurred. P8 remains NOT_STARTED.

## Actual Google Cloud observations

The installed gcloud CLI already has an active login for the selected business account. Another browser login was unnecessary. All commands use explicit project IDs and disable interactive prompts. No Application Default Credentials, account selection, IAM grant, service configuration or API enablement was changed.

| Accessible project | Observed Cloud Run / bucket metadata |
| --- | --- |
| `rcs-phase9-maps-20261011` | Labels identify test / phase9-native-test. No buckets returned. Cloud Run API not confirmed enabled; services were not queried. |
| `rcs-travels-b0d04` | No buckets returned. Cloud Run API not confirmed enabled; services were not queried. |
| `project-0c9e66c4-03f9-4cc0-b53` | Existing `rcs-api` service in `asia-south1`; four existing buckets, including separate driver-document and driver-document-dev names. This is a shared project, not demonstrated independent custody. |
| `rcs-travels-503319` | No buckets returned. Cloud Run API not confirmed enabled; services were not queried. |

Candidate development bucket: **`gs://rcs-travels-driver-documents-dev`**, project **`project-0c9e66c4-03f9-4cc0-b53`**. Existing metadata shows STANDARD storage, ASIA-SOUTH1, uniform bucket-level access enabled and public access prevention enforced. Soft deletion retains deleted objects for **604,800 seconds (seven days)** under its existing provider configuration. This is an observed existing setting, not an approved RCS retention schedule.

The bucket policy contains no `allUsers` or `allAuthenticatedUsers` members in the returned bindings. Role/member counts are retained without individual principal identities. Inherited project/organisation permissions were not enumerated; least privilege and independent administration are not certified. Object versioning/retention/lifecycle fields were absent from the selected projection, so no additional configuration is inferred.

No object names, photos or documents were listed/downloaded. The `-dev` name establishes a candidate, not proof that its contents are entirely synthetic. No new bucket is needed just to identify a development destination. A future recovery test can use a unique synthetic prefix without reading existing objects, subject to the existing cost constraint and explicit test scope. No customer-file backup or recovery result is claimed here.

The repository's Cloud Run fallback targets `rcs-api` / `asia-south1`; `backend/lib/storage.js` selects its bucket from `GCS_BUCKET`. Runtime environment values and secrets were not inspected, so this review does not prove which bucket the running service uses or whether that service is a development deployment. An existing cloud service is an observation, not a deployment performed by this continuation.

No new storage was provisioned: Google documents Cloud Storage Always Free usage only in us-west1, us-central1 and us-east1. An Indian bucket must not be assumed free, and the approved APAC R2 test hint does not authorize moving data to a US GCS region. See [Cloud Storage pricing](https://cloud.google.com/storage/pricing) and [Free Tier locations](https://docs.cloud.google.com/free/docs/free-cloud-features). R2 activation remains separately pending.

## Can D: hold the backup key?

Disk topology readback places C: on disk 1 (WD Blue SN5000) and D: on disk 0 (TOSHIBA MQ04ABF100). Both disks report online; D: is a second internal physical disk, not disconnected storage.

D: can hold an additional protected local copy. It does not provide offline separation from laptop theft, malware or compromise of the same Windows account. The private age identity remains at its existing ACL-protected staging location; it was not copied or deleted. A D: copy would be an online spare and would not close the offline handoff gate. Divyansh still needs a suitably protected removable/disconnected recovery copy and a verified recovery procedure. Disk encryption was not checked in this review.

## What account does Rajjudin need?

Rajjudin needs a separately controlled **infrastructure account and custody environment**, such as a Supabase account/project or another PostgreSQL environment administered under his control. A Clerk administrator login authorizes application features; it does not establish exclusive database, signing-key or account-recovery control.

The intended separation requires Rajjudin to control the custody administration/signing and recovery access, with application/developer access restricted to the agreed protocol. The developer must not retain unrestricted administrator credentials, IAM grants or recovery access that permit rewriting both the application evidence and independent custody records. A separate project under the same unrestricted developer administrator would not meet that requirement. No custodian account was created, invitation sent, or independence asserted by this inventory.

## Email and remaining handoffs

The owner confirmed there is no outbound mail service. `rcstravels.business@gmail.com` is the selected recipient; a sender/provider and protected authentication still need configuration. A question asks whether the business Gmail account should also send alerts. Real sending, inbox delivery and operator acknowledgement remain unverified; production workflows stay disabled. No password or key should be pasted into chat.

| Item | Current decision / next requirement |
| --- | --- |
| Development GCS destination | Existing candidate identified; synthetic object recovery not executed |
| Offline backup key | Divyansh assigned; D: is an online spare option, offline copy still pending |
| Independent custody | Rajjudin assigned; separately controlled account/environment still required |
| Alert transport | Provider/sender selection and protected configuration pending |
| R2 | Owner activation pending; no bucket, upload or key created here |
| Production retention/deletion | Proprietor approval pending; no schedule activated |

## Evidence and preservation

[Metadata evidence](../../output/phase9d-gcp-development-inventory-2026-10-21/manifest.json) binds the executable query scripts, per-project observations, disk topology, reference-source hashes and this checkpoint. CLI failures withhold raw diagnostic payloads. The commands do not list object data, inspect service environment variables or export credentials. Earlier sealed manifests and execution evidence were not rewritten. Existing SQL, migrations, application source, authentication and frozen V5 were not edited.

Accepted P6 cache-OFF 16/16 behavioral and native results and P7 14/14 behavioral and profiling results remain at their original epochs. No new SQL certification is claimed. Default-cache signal-11 remains OPEN; signal-9 remains SEPARATE/UNATTRIBUTED. Storage, retention, custody and restore limitations remain independently tracked. **Production remains OFF; stop after this inventory and handoff clarification.**
