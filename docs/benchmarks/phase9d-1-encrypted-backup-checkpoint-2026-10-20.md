# Phase 9D-1 — encrypted backup and isolated restore checkpoint

20 October 2026 IST. **Local synthetic backup workflow: VERIFIED_IN_ISOLATION. Supabase Free / live R2 compatibility and production recovery: NOT VERIFIED. Phase 9D-1 and whole-SQL certification remain PARTIAL. Production OFF. P8 NOT_STARTED.**

Evidence: [manifest](../../output/phase9d-backup-2026-10-20/manifest.json), [selected source-bound execution](../../output/phase9d-backup-2026-10-20/execution-134104.json), [23-check receipt](../../output/phase9d-backup-2026-10-20/synthetic-134104.json), [quality](../../output/phase9d-backup-2026-10-20/quality.json), [preservation readback](../../output/phase9d-backup-2026-10-20/preservation-readback.json), [design and activation requirements](phase9d-1-supabase-backup-design-2026-10-20.md).

## Implemented and actually executed

The owner-selected strategy is Supabase Free PostgreSQL, scheduled GitHub Actions exports, public-recipient age encryption and private Cloudflare R2. New tooling and disabled workflow templates implement that path without provisioning accounts or contacting hosted databases/R2. **The actual upload target in this test is a loopback Moto S3 emulator, not Cloudflare.**

`test_synthetic.py` reuses the existing custody-lineage fixture and its actual Prisma deployment of **83 migration SQL files**, actual restricted Proofloop roles/functions, source/receiver databases and a physically separate synthetic custodian server. Synthetic Unicode/binary probe data supplies independently checked restored content. The source/receiver cluster and custodian are stopped before restore servers start. Each restore gets a fresh cluster and genuinely empty template0 database.

**23/23 named end-to-end checks PASS**, in **53.412 seconds** for this small recipe. These are script checkpoint groups, not twenty-three Node test-runner cases or a whole-project regression. The selected receipt binds **419 source identities**, including recursively discovered application/fixture imports, explicitly launched transport/broker/custody children, SQL, migrations and package manifests. Sources stayed unchanged during execution and match final readback.

| Scope | Ciphertext bytes | Export/encrypt/upload/readback seconds | Restored table counts checked | Restore/validation seconds |
| --- | ---: | ---: | ---: | ---: |
| Source | 348,440 | 0.643 | 62 | 1.245 |
| Receiver | 194,792 | 0.425 | 22 | 0.530 |
| Custodian | 61,640 | 0.484 | 6 | 0.323 |

Restore timings exclude fresh-server creation and are **not production RTOs**. These tiny archives do not model a 500 MB project, external objects, provider creation, offline-key retrieval or legal/receipt reconciliation.

The accepted execution verifies:

- Actual read-only REPEATABLE READ snapshot settings; consistent inventory and native custom-format export; encryption before upload; downloaded SHA-256 before success-pointer publication.
- All three fresh restores: table counts, extension versions/namespaces, schema ownership/ACLs, owner-wide default privileges and explicit ADMIN/INHERIT/SET membership options. Custom roles remain NOLOGIN. Exact custom function definitions and selected actual payloads match.
- A genuine export followed by injected upload failure leaves the prior successful pointer unchanged. Stale completion/recovery points, same-length corruption, changed age ciphertext, wrong private key and remote restore targets are rejected.
- Object storage contains three encrypted archives and three metadata pointers, with no plaintext dump/key object. Retention remains plan-only. Disabled/unapproved configurations and transaction pooling are refused.
- Generic alert payload and missing-route refusal through a stub transport. **No live alert recipient or human acknowledgement is claimed.** Hourly metadata freshness and daily downloaded integrity are explicitly different checks.

The Windows native client is **PostgreSQL 18.4** against the pinned **17.5** server image, `sha256:a2b1801097f195b0a31c9da1c2f9cf2587a542e3c55cbb191b1873667dc45072`. age is **1.3.2**; Python **3.13.5**, psycopg **3.2.12**, boto3 **1.40.57**, Moto **5.1.15**, Node **24.14.1**. Installed Prisma CLI/engines are **7.10.0**, client **7.8.0**; that observed combination completed this fixture, without a dependency upgrade by this task. CI templates install client 17; actual GitHub-hosted execution remains unperformed. Full package/tool versions and hashes are retained.

## Corrections and retained failed evidence

Original failures remain alongside the selected receipt, at their original hashes. They are not counted as successes:

1. Moto rejected the R2 `auto` region in its synthetic create-bucket call; the local-only client now uses us-east-1 while real R2 uses auto.
2. An internal Docker bridge did not expose the requested loopback port. The final owned bridge publishes loopback only; **outbound egress is not fenced**. No global Docker/Windows security change was made.
3. The initial fixture omitted the accepted runner's anon/authenticated bootstrap roles; the actual revocation migration failed with P3018/42704. The fixture now supplies the unchanged prerequisite. An IPv4 hostname substitution then failed an existing localhost-only transport guard; its original hostname requirement was preserved.
4. Launcher readiness/error collection and shutdown were made bounded: private temporary readiness file, stdin EOF/closure and explicit child lifecycle. Manually stopped setup runs have no fabricated passing receipt.
5. A controlled local connection observation measured default localhost at 5.090 seconds versus 0.014 seconds with explicit IPv4/local transport. All new Python connections are bounded; loopback-only clients avoid unnecessary local SSL/GSS negotiation. Hosted connections still require verify-full. This is evidence for a local configuration improvement, not a diagnosis of Windows memory/driver behavior.
6. The runtime image pre-populates its initial PostGIS database. Restore correctly refused that nonempty target; a fresh template0 database now satisfies the guard. Positive schema-selected dumps then collided with public and exposed **missing owner-wide default ACLs**. The final database-minus-reviewed-exclusions export preserves those ACLs; final restore checks remain strict and old failed layouts are refused.
7. Initial quality collection assumed Git Bash under Program Files; this host uses D:\Git. The original collector is retained and final Bash syntax verification passes.

No product SQL, application migration, signing rule, ACK validation, evidence policy, broker accounting or financial behavior was modified to make these tests pass. There was **no native profiling, routine replacement, mutation campaign or crash reproduction** in this task.

## Resource controls, quality and preservation

The `freemem` import and five-GiB management-remaining RAM gate were removed from `closure-run.mjs` as authorized. Historical evidence/executors retain their original bytes. New execution has **no RAM admission/abort threshold**; commit/disk/responsiveness checks and deadlines remain. Database servers have verified **768 MiB, 0.75 CPU and 128 PID** limits. Jobs ran sequentially; the supported topology requires two original servers concurrently, followed by one restore server at a time.

Selected monitoring: **20 samples**, minimum available RAM **612.8 MiB**, minimum commit headroom **11,061.7 MiB**, zero unresponsive-taskbar samples and zero gaps over eight seconds (maximum 3.003278 seconds). These same-host samples do not prove absence of a complete freeze or cover idle intervals between jobs.

Final scoped validation passes: Python AST and E9/F lint, two MJS syntax checks, strict two-file JavaScript lint, Bash syntax, three parsed/gated workflow templates and tracked/new-file whitespace. No application TypeScript was changed; backend typecheck/full regressions were not rerun or relabelled. Earlier accepted backend and P2–P7 results retain their own epochs.

Of **1,972 pre-existing working files**, only the authorized shared-runner RAM-check removal differs. HEAD and the staging index are unchanged; all **20 pre-existing Phase 9D SQL files** match the task baseline. Clerk **3/3**, frozen V5 **22/22** and original custody **28/28** identities match in **both worktrees**. Frozen V5 remains `e484afc4c7fa724ea29af6edd962c48b814dc73a10e4f4a5e33833ad26afbe75`.

Runner before SHA-256: `371d85de3b4cda801e81889e5fcf5eeaee1f802a03f3dc3b6ca497f2fea3bf58`; after: `c2e4b2f07e49ffc04feea7faa32875049ff440685900d3b36267b78213bcd7d9`. All new backup/workflow/checkpoint hashes are listed in the manifest and quality record. The [earlier policy-neutral completion](phase9d-1-policy-neutral-completion-checkpoint-2026-10-20.md) separately reconciles the existing 15/15 behavioral and 6/6 cache-OFF native results; these were not repeated here.

Owned Docker cleanup verifies exact labels/names, removes only newly owned resources and leaves zero running containers; the idle engine was stopped normally. Automatic approval review rejected recursive task-temporary-directory deletion with “blocked by policy.” **Three private synthetic temporary directories remain outside the repository**, with a private path inventory under `C:\Users\singh\Documents\Codex\2026-10-15\continue\backup-tools\temporary-residuals.json` for manual cleanup. No alternate deletion mechanism was attempted. No production key/customer record is involved; no secure-erase claim is made.

## Decisions and remaining activation gates

The owner kept the current guarded cancellation-review architecture and designated the **admin custody role**. Named individual, independently enforced access separation, project/account and custody administration remain unconfigured. A single unrestricted admin controlling both application and custody cannot be labelled independent. The proprietor retains final retention/deletion/hold-policy approval authority.

**R2 location, offline decryption-key owner and monitored alert destination/responder remain TBD.** Real-data backup creation, encryption, alerts and restore jobs stay disabled until explicitly configured and verified. The synthetic-only CI restore template must never receive the offline production key. No retention duration, automatic deletion or legal approval was activated.

Supabase Free is **not accepted as a drop-in Proofloop deployment**: verify pgcrypto schema placement, restricted role/ownership/SET ROLE behavior, managed schemas/extensions/default privileges, connection modes and physical-telemetry differences. Published two-project/free-capacity limits do not provide three independently administered services. Daily exports and Actions runtime can exhaust free allowances; no zero-cost guarantee is inferred.

The remaining gates include hosted compatibility testing on explicitly authorized disposable projects; actual private R2 access tests; independent custody controls; external object/key/configuration recovery; offline production restore drills and current hold/tombstone reconciliation; approved retention/holds and real alert routing; total retained storage/quota/ENOSPC/archive/PITR acceptance; and the unresolved default-cache signal-11/separate signal-9 findings. Production remains OFF. **No paid resource, provider deployment, full backend campaign, commit, push, merge, evidence migration or P8 execution occurred.**
