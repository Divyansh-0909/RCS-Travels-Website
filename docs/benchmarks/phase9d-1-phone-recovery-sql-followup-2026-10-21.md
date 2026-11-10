# Phone recovery, SQL expression checks and custody setup

21 October 2026 IST. Additive continuation of the [no-Docker checkpoint](phase9d-1-no-docker-closure-2026-10-21.md), [cloud/key handoff](phase9d-1-development-cloud-key-handoff-2026-10-21.md) and [Gmail preparation](phase9d-1-gmail-alert-handoff-2026-10-21.md). **Phone recovery VERIFIED; offline separation pending USB disconnection. Selected SQL expressions VERIFIED_IN_ISOLATION. Whole-SQL / Phase 9D-1 PARTIAL; P8 NOT_STARTED; production OFF.**

## Completed phone recovery

The owner selected the connected Android phone and explicitly stated it has no internet connection. ADB observed one authorised Samsung SM-A528B, Android 14, security patch 2025-09-01, reporting encrypted/file-based storage. These are device properties, not independent verification of all network paths, patch adequacy or physical security. No network setting, driver app, USB debugging permission or phone account was changed.

The owned folder is `Internal storage/Documents/RCSProofloopRecovery/c5a5d4fe680b4f748ba119c20fd03522`. It contains the original encrypted `backup.tar.age`, a separately passphrase-encrypted `key-passphrase.age`, and a non-secret recovery note. No plaintext SQL dump or plaintext private key was pushed to the phone. The owner entered the passphrase into age locally; it was not provided to the assistant or stored by these scripts. It must remain separate from this phone.

Actual [archive-copy receipt](../../output/phase9d-phone-recovery-2026-10-21/phone-archive-stage.json) and [key recovery receipt](../../output/phase9d-phone-recovery-2026-10-21/phone-key-recovery.json) establish:

- Phone-side SHA-256 and pulled-back ciphertext hashes matched the original encrypted archive.
- The passphrase-encrypted key was copied to the phone and read back exactly, then decrypted through the owner's interactive passphrase prompt.
- The recovered key matched the original identity and derived public age recipient.
- The phone's archive decrypted with that recovered key; the contained PostgreSQL dump SHA-256 matched the original private backup receipt. Decrypted SQL remained in process memory.
- The newly created plaintext key scratch was removed and its absence checked. This is ordinary file unlinking, not a secure-erasure claim. Original laptop keys, encrypted archive and previous evidence remain preserved.

Archive SHA-256: `89987a14dbea3fa85c21048f1a736e15b8d101c8db7f0957ce9c26f3d8b9e2d3`. Wrapped-key ciphertext SHA-256: `af76909066ff921987903a0e713b5905b9b1723f90bb4c58c3cefcb3bdffab7e`. These are ciphertext identities, not passwords or private-key contents.

This is the existing **pre-migration dev backup**; its 59-migration source epoch is retained. It is not relabelled as a new post-migration 83-migration snapshot or a running daily backup service. Current dev's earlier 83 completed migrations and preserved 62 original rows remain separate accepted observations.

At the owner's latest response the phone remains USB-connected for driver testing. Recovery is verified, but offline separation is not marked complete. Unplug USB when testing permits and keep the phone internet-disconnected; a later network/USB reconnection changes its isolation. Original laptop staging is still online, so exclusive offline custody of every key copy is not claimed.

## New selected SQL-expression evidence

[native_expression_cases.py](../../tools/phase9d/native_expression_cases.py) ran once in a fresh owned Windows PostgreSQL **18.4** instance using the existing small [native fixture](../../tools/backups/native_postgres.py). **96/96 named checks PASS**, server stopped, no skips or retained test failure. See [witness](../../output/phase9d-native-expressions-2026-10-21/attempt-1/witness.json) and [execution/resource receipt](../../output/phase9d-native-expressions-2026-10-21/execution-receipt.json).

| Selected checks | Actual count / scope |
| --- | --- |
| `broker9d.valid_envelope(jsonb,text)` | **56**: SQL/JSON NULL, scalar roots, required/extra fields, protocol/model/provider/identity, output types, empty-evidence arrays, categorical alternatives, exact explanation and current numeric-confidence behaviour |
| `outbox9d.valid_remote_receipt(jsonb,jsonb)` | **38**: SQL/JSON NULL, scalars, required/extra outer/body fields, real HMAC, service/key/payload binding, receipt UUID, work-ID pattern, statuses and missing configuration |
| Catalog preservation | **1**: all three installed helper definitions/owners/ACLs/search paths unchanged |
| Fixture configuration restoration | **1**: synthetic configuration row restored after the missing-configuration rollback probe |

Three exact original helper declarations are installed: the two predicates plus `outbox9d.binding(jsonb)`. The transport configuration table uses its original DDL and real pgcrypto HMAC. Queries run as the relevant owner; no private helper service grant was invented. This deliberately small composition does not install the complete broker, transport, custody or application topology. It measures expression outcomes, not native procedural percentages or full service authorisation.

Observed existing boundaries are preserved explicitly: envelope confidence accepts numeric -1 and 2 because this helper has no range predicate; receipt work-ID extraction accepts JSON number 1 and a 19-digit string beyond bigint range because its predicate is textual/regex-based. Missing transport configuration returns SQL NULL. These are current helper observations, not new application acceptance policies; upstream producer constraints and downstream independent guards remain separate. No product SQL was weakened or changed to make a test pass.

Catalog definition SHA-256 identities are `55b1cbb6cb554592c674301460014c66de77c5ff2866edc1c0e67710c4332d86` (envelope), `69813b4674675e55876d0e750871514e9bb3c881dd8599ac6d4e81430a9fcc41` (receipt), and `1ee80f826c2aeb039fb94720cc332ff79604bdef4e8068b2ed650e9261558330` (binding). Full definitions and source identities are in the witness. These PG18.4 catalogs do not substitute for pinned PG17.5 native profiling observations.

Before/after checks preserve **103 Phase9D SQL / Prisma migration inputs**. Host RAM and C:/D: space were sampled during the one sequential native job. RAM admission thresholds remain owner-disabled; PostgreSQL's 32 MiB shared buffers / 1 MiB work memory / eight connections are bounded settings, not an OS hard process-memory quota or proof against every host freeze. Docker, profiling, replacements, hosted database queries and Google/R2 workloads were absent from this execution.

## Supabase business-account setup and handoff

The owner explicitly selected `rcstravels.business@gmail.com` for Rajjudin's eventual custody administration and authorised temporary developer setup access. The intended handoff includes logout and password changes after development. Until actual access revocation/readback, independence is **PLANNED, NOT_VERIFIED**. Before claiming independent production custody, Rajjudin must control account/recovery, custody administration and signing; developer PATs, sessions, database/service credentials, CI and other administrator paths must be revoked or appropriately restricted. An email password change alone is not evidence that all those paths were removed. If the proprietor retains root access to both sides, that trusted-root boundary remains explicit.

The existing developer CLI 2.121.0 credential was preserved. A separate credential target was authenticated through an interactive local window. The first login still reached the developer account; its metadata showed two active projects and one inactive project. Those projects were not changed. After the owner explicitly signed into the business dashboard and repeated CLI login, retained organisation/member metadata confirmed **Rajju Org**, `smvlxfusrwkhrpvphtau`, Free plan, with the business mailbox as its sole owner. See [account-check evidence](../../output/phase9d-custodian-account-check-2026-10-21/).

The first organisation-members projection incorrectly looked for `role` rather than `role_name`; the retained shape review corrects that interpretation without rewriting its original projection. CLI `whoami` returned nonzero in this installed version; it is not substituted for successful identity proof. No API keys, tokens or other member email addresses were exported.

A first CLI launch had quoting problems; a subsequent `--profile` argument failed because it was a name without a configuration extension. Inspection of the pinned [CLI profile loader](https://github.com/supabase/cli/blob/8a549dffa6bc5c88069c61c1f55ef55ad9b82ae2/apps/cli-go/internal/utils/profile.go) established the required config-file form. A corrected non-secret profile and protected local login wrapper were prepared outside the repository, syntax-checked and run by the owner. Two automatic combined launch commands were rejected with only `blocked by policy`; those rejections do not establish authentication or resource creation. The later successful credential-presence check and metadata calls identify the actual completed login scope.

Free capacity and the intended owner were checked before one project-creation request. **RCS Proofloop Custodian Test**, `itwepbryqixmlyqallia`, was created in **ap-south-1**, with Free-plan and ACTIVE_HEALTHY readback. The organisation's existing Tokyo project was untouched. No upgrade, paid resource or production application activation was requested. Free-service availability remains a production planning question.

### Actual hosted compatibility and restricted-login verification

The new empty synthetic project runs **PostgreSQL 17.11**, with provider-managed pgcrypto 1.3 in `extensions`. An unchanged-installer transaction failed with **42501** at the new owner's role/ownership boundary, then rolled back. Thus unchanged Proofloop installation is **not** claimed compatible out of the box.

The explicit test bootstrap grants the setup `postgres` role SET/INHERIT membership during installation and restores INHERIT false afterward. SET access remains a trusted setup-root path pending handoff. The provider extension remains in place. [supabase_custody_crypto.sql](../../tools/backups/supabase_custody_crypto.sql) grants only the new custody owner schema USAGE and creates an invoker SQL alias to native `extensions.hmac`; PUBLIC execution on the alias is revoked. The original admission install omits only its incompatible extension-creation DDL. **Eight original custody routine bodies match source exactly after line-ending normalization**; no cryptographic implementation, accepted routine body or application grant was rewritten. This additional alias is separately inventoried and does not close whole-SQL certification.

The selected [hosted execution](../../output/phase9d-custodian-account-check-2026-10-21/hosted-custodian-probe-attempt-5.json) passes **33/33 checks**: actual session-pooler port-5432 logins over verify-full TLS as custody_ingest, custody_signer and custody_inspector; private-table/function denials; MAC/shape/GAP rejection; committed event and exact duplicate identity; durable signature and duplicate signature identity; independent inspector observations; and unchanged definitions/owners/ACLs/search paths. Fresh synthetic private signing material exists only in the bounded child process. After it exits, a separate public-only verifier validates the retained receipt against the event and public key registry. A further offline replay of that public evidence is recorded separately; it is not another database campaign.

Cleanup removed this initially empty project's synthetic event/signature/source/key rows and set all three service roles **NOLOGIN / password cleared**. Schemas and restricted definitions remain installed, with no enrolled source, active key or deployed ingress service. Bootstrap credentials remain protected locally by current-user DPAPI. This tests custody installation only; it does not establish three independently administered source/receiver/custodian deployments, production key management, off-host operation or final handoff.

Retained attempts are separate source epochs: initial bootstrap guard failure (missing owner schema USAGE, rolled back); **32/32 PASS** with runtime public verification but an incomplete exported public registry; recorder FileExistsError before service tests; and OperationalError on reused disabled roles. The last fixture error is directly explained by cleanup issuing NOLOGIN while reuse changed only passwords. The selected correction explicitly restores LOGIN and reads back all three flags before connection: false before activation, true afterward, false after cleanup. It changes test orchestration only. No provider auth-cache defect is asserted. Earlier failing sources and results remain preserved.

## What remains genuinely open

The [additive reconciliation](../../output/phase9d-offline-followup-2026-10-21/readiness-current.json) preserves the original 78 criteria and 20 audit rows and extends S11/S14 with these selected expression cases. No historical status is silently promoted.

1. **Phone isolation:** USB disconnection and separately retained passphrase/recovery arrangements; original online key staging remains preserved.
2. **Custody independence:** identity, Free provisioning and the stated adapted hosted installation/service-login checks are complete. Rajjudin's final account/recovery/signing control, developer-token/session/database/CI revocation, independent operational administration and production suitability remain unverified.
3. **Gmail:** Google account-verification block prevents sender authentication. SMTP/inbox/operator acknowledgement and independent freshness monitoring remain unverified. Sending and production workflows remain disabled.
4. **R2:** owner activation and private destination/credentials/upload/restore acceptance remain deferred. No credit-card setup or paid service was activated.
5. **Full managed restore:** reserved owners, default grants and provider-managed function settings require a supported baseline/mapping. The accepted 28-table content restore is retained, not expanded into a complete managed-project restore claim.
6. **Retention:** real category/hold/deletion integration requires reviewed mappings and proprietor/counsel/CA approvals; proposals and synthetic results are not production approval. No arbitrary TTL, customer deletion or legal conclusion is activated.
7. **Other SQL/storage/reliability:** S05's supported invalid-lineage question, private-path exceptions, broader predicate/DDL adequacy, verified finite-volume refusal/recovery and actual archive/restore/capacity requirements remain at their documented scopes. Default-cache signal-11 stays OPEN; signal-9 stays SEPARATE/UNATTRIBUTED. No new failure reproduction ran.

New files include the phone helpers, selected expression test, explicit provider bootstrap alias, synthetic signing/public-verification children, current report and execution/evidence tooling. Exact hashes and quality/preservation readback are in the [source-bound manifest](../../output/phase9d-offline-followup-2026-10-21/manifest.json). Existing application JS/TS, frozen V5, Clerk, financial policy, accepted guards, product SQL, migrations, staged changes and historical evidence are preserved within the recorded source inventories. Scoped Ruff/Node/PowerShell and whitespace checks do not imply a full backend run. **No production connection, paid resource, application deployment, commit, push, merge or P8 execution occurred.**
