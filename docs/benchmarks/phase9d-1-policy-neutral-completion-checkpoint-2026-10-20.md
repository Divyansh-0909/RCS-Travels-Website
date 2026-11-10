# Phase 9D-1 — policy-neutral preservation, alerts and restore quarantine

20 October 2026 IST. Reconciles the completed **19 October** executions in [completion evidence](../../output/phase9d-completion-local-2026-10-19/). This is a current readback of historical results, not a new execution or production activation. **Phase 9D-1 PARTIAL; production OFF; P8 NOT_STARTED.**

## Executed engineering scope

The optional disposable management extension now has a durable preservation barrier for a late hold. Once one copy is erased, it reports the conflict, blocks further deletion on reachable remaining copies and requires manual review. Unreachable nodes remain explicitly pending and retryable. Clearing ordinary holds cannot bypass this barrier. It cannot recover erased data or establish an atomic global hold across disconnected nodes. This implements the owner's selected **synthetic-test policy only**, not a production retention approval.

Alerts have persisted PENDING/IN_FLIGHT/DELIVERED/REVIEW records, bounded attempts and leases, exact destination/token/actor acknowledgement, duplicate reuse and explicit exhausted-ledger refusal. Missing production routing leaves pending work. The relay's local synthetic receiver is not a configured production channel or a real on-call ownership certificate.

The local logical-backup helper produces a bounded custom-format archive, verifies its hash, restores into a newly created quarantine database inaccessible to ordinary application roles, and compares restored scopes against newer authoritative holds, tombstones and policy versions. Its archive is synthetic/local and distinct from the new age/R2 exporter. Its trusted local controller does not become independently administered/off-host authority. Stale restores never release application traffic automatically.

| Saved selected execution | Recorded outcome |
| --- | --- |
| [Management completion receipt](../../output/phase9d-completion-local-2026-10-19/executions/management-completion-1792429451064-b6dbe361-bcc6-423f-a419-ba7ac731442c.json) | **15/15 PASS**, no skips; fourteen leaf groups and parent |
| [Persisted completion witness](../../output/phase9d-completion-local-2026-10-19/executions/management-completion-witness-d08ec454-d6ad-4829-9b8d-e3a766260b43.json) | Actual node/payload/receipt/alert/quarantine observations; production deletion false |
| [Native-only receipt](../../output/phase9d-completion-local-2026-10-19/executions/management-native-safe-1792429547409-7858e57c-d033-49e1-a39b-6a16506696f5.json) | **6/6 PASS**, no skips; fresh cache-OFF profiling environment, no routine replacements |
| [Native witness](../../output/phase9d-completion-local-2026-10-19/executions/management-native-witness-5806804e-83e7-42ec-b255-cac0aa0a1ca2.json) | Five optional routines measured separately in each of three installations |

Native visible statements/branches per installation: preserve_remaining **18/18, 8/8**; enforce_preservation_barrier **4/4, 2/2**; queue_alerts **10/10, 5/5**; claim_alert **9/9, 4/4**; finish_alert **5/5, 2/2**. These are exact per-routine windows, not SQL-expression/DDL/whole-SQL percentages or meaningful-mutation certificates. The successful cache-OFF measurement does not fix the open default-cache native crash.

## Source epochs and retained failures

[Current reconciliation](../../output/phase9d-backup-2026-10-20/earlier-completion-reconciliation.json) rechecks every receipt-bound source. The only current difference from those two selected receipts is `tools/phase9d/closure-run.mjs`: the owner's latest instruction removed its `freemem` import and management-remaining RAM gate. SQL, management implementation, fixtures and tests still match the recorded execution bytes. The old receipts are not rewritten as executions of this later runner.

Changed/new implementation from that task: `management-completion.sql`, `management-completion.mjs`, `management-backup.mjs`, `management-native.mjs`, `phase9dManagementCompletion.test.js`, `phase9dManagementNative.test.js` and runner modes. They remain separate from application migrations, frozen V5, Clerk and financial policy. Actual hashes are inventoried in the new task manifest and the historical source-bound receipts.

The initial missing-password fixture failure and its original source remain retained. A later regression invocation began but produced no accepted completion receipt; it is **not counted as a pass**. Earlier management **18/18**, typecheck and scoped lint successes remain at their own recorded epochs. The attempted final sequence stopped after its accepted native run; this report does not invent an uninterrupted final campaign or complete monitoring window.

The quota-enforcement probe accepted a claimed 256 MiB storage setting but an owned 272 MiB write succeeded. It therefore **did not establish a hard physical disk bound**. The observed container storage backend must not be treated as an enforced quota merely because Docker accepted the option. No existing user volume or global storage was pruned.

## Remaining gates

- Actual physical quota-controlled ENOSPC/archive/PITR/off-host restore acceptance; total WAL/index/history/log/artifact/backup bounds and deployed alerts.
- Approved category retention/holds/deletion integration, authoritative cross-system hold/deletion/restore coordination, provider object/backup erasure and irreversible-deletion ownership.
- Named live alert operator/destination and verified hosting/regions. The proprietor is final retention-policy authority; no complete schedule is approved.
- Default-cache signal-11 root cause OPEN; later signal-9 separate/unattributed; source/SQL-expression/critical-code and external readiness boundaries remain as recorded.

The newly chosen Supabase/GitHub/R2 strategy is handled separately in [the backup design](phase9d-1-supabase-backup-design-2026-10-20.md). No production deletion, financial consequence, commit, push, merge, deployment, provider call or P8 campaign is authorized or claimed here.
