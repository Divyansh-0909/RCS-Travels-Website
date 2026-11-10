# Disabled retention configuration and local cleanup safeguards

31 October 2026 IST. Business decisions originate in the [owner register](../../output/phase9d-retention-owner-decisions-2026-10-31/approval-current.json). Financial retention stays pending CA; this work neither performs that review nor activates production deletion.

## Scope and disabled configuration

The [compiled policy](../../output/phase9d-retention-enforcement-2026-10-31/retention-policy.disabled.json) preserves calendar business targets and explicit exceptions. Automatic cleanup, native-gate installation, provider deletion, real labeling and production deletion are false. It is a review profile, not an automatically loaded application schedule. The three unanswered subtargets remain null/unapproved; their one-year/seven-day/ninety-day recommendations are separate proposal fields. An unanswered question is not consent.

[retention_policy.py](../../tools/backups/retention_policy.py) computes review dates using days/weeks or calendar months/years, including leap-year/month-end handling. Financial records return CA_REVIEW_PENDING. Holds, incomplete inventories, open matters, unapproved periods and absent legal classification block planning progression. Even REVIEW_DUE has deletionAuthorized=false. This does not delay a supported earlier account-erasure request until a minimum 90-day age.

## Account and saved-place request paths

[accountRetention.js](../../backend/services/accountRetention.js) is called by the existing protected DELETE /api/users/me and DELETE /api/users/me/saved-places/:id handlers. Authentication and tenant predicates remain in place. A missing, disabled or unsuitable gate returns RETENTION_REVIEW_REQUIRED before local removal. Other unknown database failures return RETENTION_UNAVAILABLE without raw errors or claims of completion.

For a permitted synthetic account request, a Prisma interactive transaction performs the gate/hold check, active-ride check, saved-place removal, existing profile minimization and durable provider-action insertion together. A failure rolls all local changes back. Ride and financial records are retained. Local account completion returns HTTP 202 with externalCleanup=WAITING_PROVIDER_REVIEW. No Clerk delete is called by this path. The separately reviewed provider worker is absent; no remote erasure is claimed. Existing Clerk read/auth configuration is unchanged.

The gate locks the existing registry configuration first, matching hold/copy operations, then locks the reviewed scope and explicit target rows. Review and execution bind scope epoch, declared inventory hash, policy hash and current row snapshot. Permits are backend/transaction/scope/action specific. A permit from a committed earlier transaction cannot authorize a later write. [Prisma interactive transactions](https://docs.prisma.io/docs/orm/v7/prisma-client/queries/transactions), [PostgreSQL locking](https://www.postgresql.org/docs/18/explicit-locking.html).

## Optional database gate

[application_retention_gate.sql](../../tools/backups/application_retention_gate.sql) creates a new optional schema; it is not a Prisma migration and installs no automatic application trigger/grant. Its configuration defaults disabled and constrains production_deletion=false. Positive operation requires an explicitly enabled **retention_cleanup_lab_*** database, owner bootstrap and synthetic roles. Thus it cannot activate production deletion by an environment flag.

Only the configured proprietor can record a post-hold cleanup review. The execution role cannot place/release holds, declare copy inventories or edit reviews/permits. Current active holds, manual-review state, missing inventory, stale/unknown/provider-held/purged observations, stale review epochs/policies and changed target rows block authorization. Explicit target-row guards reject unreviewed child rows. Local copy observations are trusted controller declarations; neither their hash nor these locks establish exhaustive remote copies or a distributed hold barrier.

Selected fixture trigger attachments protect account profile deletion, saved-place deletion and terminal outbox payload minimization. The original outbox9d.delete_payload definition is unchanged and executed directly under its existing restricted operations login. The optional trigger is an additional local boundary; terminal guards and historical receipt/identity checks are retained.

## Other cleanup paths and activation blockers

- Driver document replacement already archives the original row and preserves its storage object in the same application transaction. It is not silently reclassified as the new one-year archive purge; no archive/object purge is introduced.
- GCS remove, rejected-upload cleanup, provider generations/soft deletion, backup generations and offline/device caches need actual enrolled inventories and provider-specific execution/acknowledgement. No Google/R2 operation or new remote delete runs.
- Native source/outbox acceptance is not receiver/custodian-wide enrollment. The older optional management guards and existing custody evidence retain their own scope. This batch does not attach this new gate to every privileged SQL, application, replica or provider mutation.
- The existing account UI describes immediate erasure, anonymous history and all-device sign-out. Those claims must be reconciled with pending provider cleanup and retained linkable history before activation. The current source gate prevents positive production operation; no frontend/UI/authentication change is made in this task.
- Administrative/seed deletion scripts and expired-location maintenance are separate paths, not an approved production retention mechanism. They were not run or presented as hold-aware. Complete writer/cleanup enrollment and actual operating-role validation remain activation requirements.
- A privileged owner can alter triggers/rows or lie about copy inventory. Independent administration, current authority and provider verification remain required.

## Blind-review pilot

The pilot has three new fictional case cards. Divyansh then Rajuddin enter separate answers through the owned PowerShell form; each explicitly attests no prior reference exposure. Initial forms use CreateNew and are stored in a protected local folder outside source control. A single laptop/user account does not attest independent identities or prevent deliberate inspection.

The collector refuses comparison until both forms exist and checks reviewer, instruction/case bindings and timestamp ordering. Only then may it reveal the precommitted **synthetic reference**. There are no live/fake-provider model calls: this is a process rehearsal, not a test of real AI accuracy. Disagreements remain unresolved without a separate adjudicator. No real-data collection approval, sampling threshold or financial authority follows from the pilot.

See the [checkpoint](../benchmarks/phase9d-1-retention-enforcement-checkpoint-2026-10-31.md) for selected counts, actual pilot status, retained failures and remaining owner inputs. Production OFF; production deletion DISABLED.
