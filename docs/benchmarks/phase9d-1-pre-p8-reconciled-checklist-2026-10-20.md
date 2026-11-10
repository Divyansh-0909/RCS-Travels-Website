# Phase 9D-1 ? reconciled pre-P8 checklist

20 October 2026 IST. **Read-only evidence reconciliation. Phase 9D-1 PARTIAL; whole-SQL certification PARTIAL; P8 NOT_STARTED; production OFF.** This document implements the owner's requested checklist, not the execution of the listed work.

## 1. How to use this checklist

- **C ? accepted isolated work:** preserve its source epoch; repeat only when a changed dependency or a specific missing assertion requires it.
- **E ? engineering remaining:** policy-neutral work that can be prepared locally; any future failure injection needs its own bounded execution plan.
- **O/X ? owner, provider or production gates:** keep open until the specified decision or external evidence exists. Local mocks cannot close these.
- **M ? P8 work:** plan targeted mutations here; execute them only in a separately requested P8 scope.

The [78-row readiness register](../../output/phase9d-storage-retention-remaining-run-2026-10-19/readiness-gates-current.json) and [20-row audit matrix](../../output/phase9d-storage-retention-remaining-run-2026-10-19/audit-coverage-matrix-current.json) are historical layered records. Their original status/remaining text is not uniformly current: later evidence resolves parts of some entries. This review preserves every ID/order and every audit action/order in an [additive mapping](../../output/phase9d-pre-p8-review-2026-10-20/checklist-mapping.json); no original row is rewritten or automatically promoted.

This is a documented synthesis, not a fresh independent certification of every old manifest. Input fingerprints and current backup receipt-source readback are in the [review manifest](../../output/phase9d-pre-p8-review-2026-10-20/manifest.json). CONTEXT.md/ROADMAP.txt still lead with 14 October material; the dated checkpoints below supply later evidence. No product rule changes are inferred from that older summary.

## 2. Completed work to retain

Counts belong to their own recorded executions and are never summed into a whole-SQL score. Numbered Node integration counts include parent groups; the backup count is named script checks.

| ID | Accepted scope | Existing evidence; boundary |
| --- | --- | --- |
| C1 | ICR-1 lineage ACK | [ICR-1](phase9d-1-lineage-ack-checkpoint-2026-10-18.md): targeted 13/13, lineage 7/7, custody units 31/31 at recorded epochs. Preserve exact receipt/key/event validation and trusted-verifier boundary. |
| C2 | P2 capture/consistency | [P2](phase9d-1-p2-capture-consistency-checkpoint-2026-10-18.md): behavior 22/22, profile 22/22, lineage 7/7. Actual INSERT/change/no-change, omission, snapshots, backfill/deferral and limits; installation exclusions remain explicit. |
| C3 | P3 delivery/recovery | [P3](phase9d-1-p3-delivery-recovery-checkpoint-2026-10-18.md): behavior/profile 18/18 each, custody 20/20, lineage 7/7. Four next/retry entries fully observed under their native metric. No lineage retry API or ABA-safe generation is invented. |
| C4 | P4 transport | [P4](phase9d-1-p4-transport-acceptance-checkpoint-2026-10-18.md): behavior/profile 14/14 each; ordinary transport 14/14 and lineage 7/7. Six native entries fully observed. Receipt expression type/range behavior remains its existing contract. |
| C5 | P5 broker/accounting | [P5](phase9d-1-p5-broker-accounting-checkpoint-2026-10-18.md): behavior/profile 16/16 each, selected recovery 7/7 and race regression 8/8. Seventeen routine observations; two private guards remain unhit. |
| C6 | P6 keys/signatures | [P6/P7 closure](phase9d-1-p6-p7-storage-retention-closure-2026-10-18.md): behavior/profile 16/16 each; six native entries fully observed with cache OFF. Historical rotation/retirement/compromise assertions are already tested. |
| C7 | P7 cleanup/pressure/catalogs | Same closure: behavior/profile 14/14 each; ten fresh native entries plus definition-matched historical reuse. Fresh partial ratios are not automatically missing behavior. |
| C8 | Restricted custody and saved-input reconstruction | [Custody checkpoint](phase9d-1-custody-verification-checkpoint-2026-10-18.md): capsule pair and independent saved-input record/reconstruction pass for declared scope. Broader all-fault/all-event/UI replay and independent administration are not claimed. Historical 1,865/1,865 backend pass is retained, not rerun. |
| C9 | Later management and encrypted backup | [Policy-neutral completion](phase9d-1-policy-neutral-completion-checkpoint-2026-10-20.md): 15/15 behavior, 6/6 cache-OFF native; preservation barrier, durable alerts and quarantine reconciliation. [Backup](phase9d-1-encrypted-backup-checkpoint-2026-10-20.md): 23/23 synthetic checks, three isolated restores, actual Prisma migrations/roles/catalogs. Upload target was Moto, not live R2. |

## 3. Remaining engineering, in sequential priority order

Unchecked items mean open. Preparing a plan does not count as executing its acceptance test.

| ID | Priority / work | Concrete completion evidence | Dependencies / limitation |
| --- | --- | --- | --- |
| E1 | First: finish condition-level SQL and catalog gap map | [ ] Per current composed routine, map each supported missing assertion to existing test or small new case; retain raw/native definition identities and documented unreachable paths. Include SQL-language helpers, NULL/type/AND/OR/CASE conditions and DDL/ACL/trigger invariants separately. | Reuse P2-P7 first. Native 100% does not prove every condition. Mutation execution belongs to M1-M3. |
| E2 | Verified physical storage admission/refusal/recovery | [ ] A separately owned finite destination actually refuses a bounded write before host exhaustion; retain measured quota/reserve/usage and graceful refusal/recovery results. Cover persistent PGDATA and the applicable WAL/temp/log destinations. | Prior claimed 256 MiB cap allowed 272 MiB: no hard quota acceptance. Inspect the backend before designing a new attempt. No laptop-wide ENOSPC or repeat of an ineffective option. |
| E3 | Complete retained-storage and recovery mechanism | [ ] Account for history/index/TOAST/catalogs, WAL/slots/archive/temp, artifacts/logs and backup/object copies; demonstrate reserve, stale/missing telemetry refusal and alert delivery in bounded synthetic environments. Include approved archive/restore strategy or explicit unsupported capability. | Queue limits and successful logical restore are already tested but do not bound every physical copy. Deployed quotas/telemetry and actual backup lifecycle depend on O1/O4/O5. |
| E4 | Audit and source-epoch acceptance reconciliation | [ ] For each of the 20 audit actions below, name the trigger/observer, actual occurrence, committed independent record, principal, failure/replay assertion and remaining boundary. Resolve stale BR1/BR2/B4E/AUD5/AUD9 text against newer slices without claiming universal capture or physical-send cancellation. Identify only genuine missing synthetic cases. | No duplicate architecture or blanket rerun. The interrupted management regression without a completion receipt stays unverified; select a narrow rerun only if still required by the changed dependency. |
| E5 | Real-category retention/hold adapter preparation | [ ] Review actual copy selectors, authenticated decisions/fencing, disconnected/partial completion and authoritative restore reconciliation for each category; implement/test approved mappings after policy approval. | Late-hold barrier and synthetic quarantine already pass. Current optional test schemas are not production-category integration. Irreversible production deletion stays disabled. |
| E6 | External object/key/configuration recovery plan | [ ] Inventory necessary GCS objects/versions, external configuration and signing secrets separately from SQL; define key recovery/rotation, current hold/tombstone synchronization and quarantine release checks. | Provider-side export, actual objects, key ceremony and off-host acceptance require O2-O5; no secrets in evidence. |

### Exact remaining native/reliability issues

| Item | Treatment before any closure claim |
| --- | --- |
| P2 source capture invalid/absent lineage outcome | A genuine unmeasured supported outcome: design a deterministic test only if the actual contract permits it. Source/receiver service arms must stay in their valid installations. |
| P5 private observe duplicate return (14/15 statements, 5/6 branches) | Public wrapper already handles duplicates under the same locks. Record wrapper reachability/definition evidence; do not grant private service access to force a percentage. |
| P5 private cleanup no-target return (8/9, 3/4) | Public operation validates/locks target before delegation. Record supported reachability and defense-in-depth exception, or justify an owner-only synthetic probe; no invented public API. |
| P7 fresh partial counters | Reuse only definition-matched P4/P5/P6/historical paths with composition boundaries. Do not add percentages or relabel historical runs as current. |
| Default-cache signal-11 | OPEN. Cache-OFF/shared-statistics workaround has tested native observations. Root-cause closure requires a useful matched native stack or an explicit scoped acceptance of the workaround with the defect retained. No new crash attempt in this review. |
| Signal-9 | SEPARATE / UNATTRIBUTED. Latest retained review cannot identify PID 707's executable or signal sender. Improved external process/signal instrumentation is required before a future justified diagnostic. |

## 4. Owner/provider decisions and production gates

| ID | Required decision/evidence | Present status and authority |
| --- | --- | --- |
| O1 | Approved 20-category purpose, minimization, retention triggers/periods, holds/releases, exceptions and rights handling | Working proposals only. Legal proprietor has final authority, informed by Indian counsel/CA. Synthetic late-hold policy is approved only for tests. |
| O2 | Named admin custodian plus enforced independent access | Admin custody role selected. Individual, project/account, credentials and administration separation remain unconfigured. One unrestricted administrator controlling both stores does not establish independence. |
| O3 | Offline backup decryption-key owner and signing-key recovery responsibility | TBD. Separate offline production decryption key from R2/writer automation; signing-key history and new-signature authority need their own recovery procedure. |
| O4 | Actual hosting and private object destinations | Supabase projects/version/region, private R2 location/privacy/lifecycle and external object inventory unverified. Run authorized disposable hosted migration/role/extension/restore checks before import. pgcrypto namespace placement is a concrete compatibility gap. No three-service Free topology or zero-cost guarantee. |
| O5 | Named technical operator, monitored alert destination and external freshness monitoring | TBD. Technical responder handles first response; proprietor handles legal/irreversible/business decisions. Stub alerts and a same-GitHub watchdog are insufficient deployed outage coverage. |
| O6 | Authority-changing/audit-required result promotion policy | AUD8 remains unimplemented/policy-dependent. Current guarded advisory design stays; no automatic financial or human-final authority is added. |

| ID | Wider readiness work | Closure needs |
| --- | --- | --- |
| X1 | Production adapter, useful approved evidence projection, effective budgets, timeout and stop/dispatch boundaries; deployed IAM/grants/secrets/TLS/topology | Selected actual deployment, reviewed implementation and real effective-principal evidence. Offline broker/accounting passes are retained; they do not certify the deployed graph. |
| X2 | Human-final concurrency, in-flight payout, privileged revocation and approval procedures | Approved policies and targeted authorization/race verification. No financial/authentication redesign is implied by this checklist. |
| X3 | Blind real-human calibration and quantitative acceptance | Approved collection/purpose/disclosures, review/adjudication protocol, labelled incidents, sample-size/threshold decisions and measured error/review performance. Synthetic labels cannot substitute. |
| X4 | Clerk production journeys/capacity, rollout/reconciliation, monitoring/on-call and explicit activation | Production-shaped evidence and separate rollout/activation authorization. Production remains OFF. |

**Backup activation stays OFF:** O2-O5, hosted compatibility, private R2 access, actual GitHub execution, realistic recovery/cost measurements and applicable approvals remain open. No production secret is to be placed in the synthetic restore job. No automatic backup deletion is implemented or approved. Three synthetic temporary directories remain after automatic cleanup rejection; manual private cleanup is documented in the backup checkpoint and is not a certification success/failure.

## 5. Work belonging to P8

The [original SQL plan, P8 row](phase9d-1-sql-coverage-plan.md) assigns targeted mutation after profile closure. Meaningful-mutation completion cannot be required as a completed pre-P8 task when it is the work assigned to P8.

| ID | P8 task | Required boundary |
| --- | --- | --- |
| M1 | Select changed high-risk acceptance/lease/MAC/epoch/cleanup guard omissions from E1 | Clean baseline and test expected to detect each omission; source identity and reason for selection. Do not repeat unchanged P26/O13/T12/B6/R10/Q3 campaigns merely to increase counts. |
| M2 | Execute selected replacements and assess survivors/errors/timeouts | Fresh **unprofiled** database/server/process; no shared profiling environment. Keep failure evidence; no unexplained equivalent/survivor classifications. |
| M3 | Restore and certify selected scope | Exact definition, owner, search path and ACL restored/read back; scoped meaningful mutation/structural findings and residual gaps. No whole-SQL percentage manufactured. |

## 6. Decision on entering P8

**Current decision: HOLD; do not start P8 in this continuation.**

For the owner's requested broad preparation closure: finish or explicitly resolve E1-E6 and the documented storage/reliability exceptions, and keep O/X decisions visible. Existing storage checkpoints explicitly withheld prerequisite closure; this document does not waive that instruction.

A narrower synthetic P8 could be considered separately only after E1 identifies a stable tested scope, baselines/restoration are defined, unprofiled infrastructure has verified resource controls, and the owner explicitly accepts the listed residual prerequisites. The cache-OFF workaround is evidence for its measured scope, not an automatic waiver of the default-cache defect. Hosting purchase, real-data activation and production deployment are not intrinsic requirements of isolated mutations; O/X gates still prevent production or full Phase 9D-1 closure. P8 remains independent of the Supabase purchasing decision.

**Next engineering group: E1**, then a small E2 feasibility/observability assessment. Run one workload at a time when later authorized; honor the owner's RAM admission override while retaining verified per-server budgets, deadlines, disk/commit/responsiveness monitoring and owned cleanup. No monitoring method guarantees absence of a complete host freeze.

## 7. Register navigation (all original criteria retained)

This table is an additive classification, not a replacement certification status. ACCEPTED means only the criterion's recorded isolated scope. Mixed rows explicitly retain external or broader limitations. Full original status and additive assessment fields are in the mapping JSON.

| Original ID | Original criterion | Current checklist classification | References |
| --- | --- | --- | --- |
| A1 | Dedicated effective shadow database permissions | ACCEPTED_ISOLATED_RETAIN | C1-C9; retain original criterion scope |
| A2 | No operative consequence authority | ACCEPTED_ISOLATED_RETAIN | C1-C9; retain original criterion scope |
| A3 | No credential-sharing or hostile-process bypass | ACCEPTED_ISOLATED_RETAIN | C1-C9; retain original criterion scope |
| A4 | Independent audit protection in the database | ACCEPTED_ISOLATED_RETAIN | C1-C9; retain original criterion scope |
| A4E | Independent external audit delivery and denial completeness | ENGINEERING_AND_EXTERNAL | E4 / O2-O5 |
| A5 | Human role and object authorization | ACCEPTED_ISOLATED_RETAIN | C1-C9; retain original criterion scope |
| A6 | Safe secret handling in actual test execution | ACCEPTED_ISOLATED_RETAIN | C1-C9; retain original criterion scope |
| A7 | Deployed effective IAM, DB grants, extensions and secret access | OWNER_PROVIDER_OR_PRODUCTION | O1-O6 / X1-X4 |
| B1 | Durable shadow queue and version/idempotency binding | ACCEPTED_ISOLATED_RETAIN | C1-C9; retain original criterion scope |
| B1E | Durable production export/outbox independent of business workflows | ACCEPTED_SLICE_BROADER_SCOPE_OPEN | C4-C5 / E4 / X1 |
| B2 | Bounded retries and exhaustion | ACCEPTED_ISOLATED_RETAIN | C1-C9; retain original criterion scope |
| B3 | Lease recovery and process restart | ACCEPTED_ISOLATED_RETAIN | C1-C9; retain original criterion scope |
| B4 | Safe pause/stop and in-flight result revocation | ACCEPTED_ISOLATED_RETAIN | C1-C9; retain original criterion scope |
| B5 | Backpressure and disabled backlog | ACCEPTED_ISOLATED_RETAIN | C1-C9; retain original criterion scope |
| B6 | DB/audit/credential failure handling | ACCEPTED_ISOLATED_RETAIN | C1-C9; retain original criterion scope |
| B7 | Production resource/provider budgets | OWNER_PROVIDER_OR_PRODUCTION | O1-O6 / X1-X4 |
| B8 | Production metrics, alerts, on-call and incident response ownership | OWNER_PROVIDER_OR_PRODUCTION | O1-O6 / X1-X4 |
| C1 | Approved real-evidence purpose and lawful basis/notice | OWNER_PROVIDER_OR_PRODUCTION | O1-O6 / X1-X4 |
| C2 | Synthetic evidence minimization/redaction/integrity | ACCEPTED_ISOLATED_RETAIN | C1-C9; retain original criterion scope |
| C2E | Useful approved production causal projection | OWNER_PROVIDER_OR_PRODUCTION | O1-O6 / X1-X4 |
| C3 | External provider disclosure/privacy review | OWNER_PROVIDER_OR_PRODUCTION | O1-O6 / X1-X4 |
| C4 | Real retention/deletion/legal-hold policy | OWNER_PROVIDER_OR_PRODUCTION | O1-O6 / X1-X4 |
| C4I | Isolated authorized payload deletion and custody preservation | ACCEPTED_ISOLATED_RETAIN | C1-C9; retain original criterion scope |
| C5 | Restricted evidence access | ACCEPTED_ISOLATED_RETAIN | C1-C9; retain original criterion scope |
| D1 | Frozen adapter/configuration identity | ACCEPTED_ISOLATED_RETAIN | C1-C9; retain original criterion scope |
| D1E | Production adapter selection | OWNER_PROVIDER_OR_PRODUCTION | O1-O6 / X1-X4 |
| D2 | Unsupported-family and missing/stale/malicious evidence handling | ACCEPTED_ISOLATED_RETAIN | C1-C9; retain original criterion scope |
| D3 | Independent policy guard and zero automatic finality | ACCEPTED_ISOLATED_RETAIN | C1-C9; retain original criterion scope |
| D4 | Provider/model failure containment | ACCEPTED_ISOLATED_RETAIN | C1-C9; retain original criterion scope |
| E1 | Independent review instructions, blind review, disagreement/adjudication protocol | OWNER_PROVIDER_OR_PRODUCTION | O1-O6 / X1-X4 |
| E2 | Independently reviewed real incident labels | OWNER_PROVIDER_OR_PRODUCTION | O1-O6 / X1-X4 |
| E3 | Quantitative acceptance and sample-size plan | OWNER_PROVIDER_OR_PRODUCTION | O1-O6 / X1-X4 |
| E4 | Measured false positives/negatives, review recall/latency and evidence quality | OWNER_PROVIDER_OR_PRODUCTION | O1-O6 / X1-X4 |
| E5 | Human-final execution-time authorization and concurrency assessment | OWNER_PROVIDER_OR_PRODUCTION | O1-O6 / X1-X4 |
| F1 | Separate shadow-only deployment topology | OWNER_PROVIDER_OR_PRODUCTION | O1-O6 / X1-X4 |
| F2 | Safe rollout sequence and reconciliation | OWNER_PROVIDER_OR_PRODUCTION | O1-O6 / X1-X4 |
| F3 | Readiness monitoring and Clerk capacity agreement/measurement | OWNER_PROVIDER_OR_PRODUCTION | O1-O6 / X1-X4 |
| F4 | Isolated stop/restart procedure | ACCEPTED_ISOLATED_RETAIN | C1-C9; retain original criterion scope |
| F5 | Production token/currency cost ceilings and independently enforced provider timeout | OWNER_PROVIDER_OR_PRODUCTION | O1-O6 / X1-X4 |
| F6 | Separate explicit production deployment/activation approval | OWNER_PROVIDER_OR_PRODUCTION | O1-O6 / X1-X4 |
| Q1 | 100% scoped JS coverage and mutation closure | ACCEPTED_ISOLATED_RETAIN | C1-C9; retain original criterion scope |
| Q2 | Full critical entry-point and stored-routine coverage/mutation/structural certificate | ENGINEERING_AND_P8 | E1 / M1-M3 |
| Q3 | Clean current regression/replay acceptance after resource interruptions | ACCEPTED_ISOLATED_RETAIN | C1-C9; retain original criterion scope |
| B4E | Independent broker dispatch/result generation admission, with explicit physical-send uncertainty | ACCEPTED_SLICE_BROADER_SCOPE_OPEN | C4-C5 / E4 / X1 |
| E6 | Privileged role-change/revocation procedures | OWNER_PROVIDER_OR_PRODUCTION | O1-O6 / X1-X4 |
| Q4 | Historical DB fixture/expectation maintenance against the accepted guard | ACCEPTED_ISOLATED_RETAIN | C1-C9; retain original criterion scope |
| Q2P | Native critical PL/pgSQL statement/branch execution | ACCEPTED_ISOLATED_RETAIN | C1-C9; retain original criterion scope |
| OB1 | Bounded inactive source-bound outbox, interruption recovery and restricted inspection | ACCEPTED_ISOLATED_RETAIN | C1-C9; retain original criterion scope |
| OB2 | Fresh saved-input outbox replay | ACCEPTED_ISOLATED_RETAIN | C1-C9; retain original criterion scope |
| BR1 | Standalone offline analyst broker | ACCEPTED_SLICE_BROADER_SCOPE_OPEN | C4-C5 / E4 / X1 |
| BR2 | Independent broker deadline, durable budgets and atomic stop-generation fencing | ACCEPTED_SLICE_BROADER_SCOPE_OPEN | C4-C5 / E4 / X1 |
| TR1 | Separate HTTP transport and independently committed receipt persistence | ACCEPTED_ISOLATED_RETAIN | C1-C9; retain original criterion scope |
| TR2 | Separate transport container containment | ACCEPTED_ISOLATED_RETAIN | C1-C9; retain original criterion scope |
| BR_SLICE | Offline receiver-bound request, durable conservative budgets, generation/lease dispatch and independent guard persistence | ACCEPTED_ISOLATED_RETAIN | C1-C9; retain original criterion scope |
| RECOVERY_A | Fourteen transition inventory entries, including unknown outcome and expired-attempt recovery; current caller/grants, durable state and accepted baseline evidence. | ACCEPTED_ISOLATED_RETAIN | C1-C9; retain original criterion scope |
| RECOVERY_B | Fifteen bounded outage points plus actual PostgreSQL restart; listed legal interleavings, not arbitrary schedules. | ACCEPTED_ISOLATED_RETAIN | C1-C9; retain original criterion scope |
| RECOVERY_C | Authenticated issuer outside execution/guard, strict lifetime accounting, all requested receipt boundaries, actual two-process reconciliation, controlled result conflict and late/server-restart accounting. | ACCEPTED_ISOLATED_RETAIN | C1-C9; retain original criterion scope |
| RECOVERY_D | Protected owned-database CLI, CAS/idempotency/reason/login audit, terminal and cleanup. Login actor rather than independently authenticated human operator. | ACCEPTED_ISOLATED_RETAIN | C1-C9; retain original criterion scope |
| RECOVERY_E | All fifteen requested boundary categories exercised: real process/row-lock race orders, accounting/result separation, manual/retry, lease/observation, ABA/configuration, stop outage, immediate replacement and pending-provider stop. | ACCEPTED_ISOLATED_RETAIN | C1-C9; retain original criterion scope |
| RECOVERY_F | Seven committed supported incidents across six bookings; four competing physical broker processes; different immutable versions on one case; unsupported source filter, heterogeneous reservation values, fast/slow responses, unknown holds, connection/worker recovery and measured throughput/backlog. | ACCEPTED_ISOLATED_RETAIN | C1-C9; retain original criterion scope |
| RECOVERY_G | Guarded-result, manual-review, exhausted, stopped and unknown cleanup; actual stale-process replacement, retained commitments/usage/events, duplicates and late accounting without recreation. | ACCEPTED_ISOLATED_RETAIN | C1-C9; retain original criterion scope |
| RECOVERY_H | Independent reviewer source assessment plus current restricted broker/guard/reconciler capsules and adversarial regressions; token-admission correction and ten meaningful SQL omissions. | ACCEPTED_ISOLATED_RETAIN | C1-C9; retain original criterion scope |
| RECOVERY_I | New explicit-input backend recovery family; independent fresh-process/fresh-database comparison. Generated IDs compared within runs and aliased/omitted across runs. | ACCEPTED_ISOLATED_RETAIN | C1-C9; retain original criterion scope |
| RECOVERY_J | Three complete critical JS modules retain unchanged 100% coverage, 192 reconciled framework identities, thresholds/clones; appropriate native SQL/ten seeded omissions/permissions/concurrency; current DB/replay/container/full/typecheck/lint/whitespace and preserved transport/outbox/historical regressions. | ACCEPTED_ISOLATED_RETAIN | C1-C9; retain original criterion scope |
| RECOVERY_K | Auth/frozen/accepted broker/transport/outbox preservation; no live model/data/production activation or blocked cache cleanup. | ACCEPTED_ISOLATED_RETAIN | C1-C9; retain original criterion scope |
| RECOVERY_L | New checkpoint, transition/outage/criterion matrix, source-bound manifest and preserved failure epochs. | ACCEPTED_ISOLATED_RETAIN | C1-C9; retain original criterion scope |
| AUD1 | Independent custody storage/process and selected broker journal | ACCEPTED_ISOLATED_RETAIN | C1-C9; retain original criterion scope |
| AUD2 | All twenty source audit boundaries | ENGINEERING_AND_EXTERNAL | E4 / O2-O5 |
| AUD3 | Restricted-container custody containment | ACCEPTED_ISOLATED_RETAIN | C1-C9; retain original criterion scope |
| AUD4 | Independent denial observation | ENGINEERING_AND_EXTERNAL | E4 / O2-O5 |
| AUD5 | Durable audit delivery and recovery | ENGINEERING_AND_EXTERNAL | E4 / O2-O5 |
| AUD6 | Total retained backlog/storage bounds | ENGINEERING_AND_APPROVAL | E2-E3 / O1-O5 |
| AUD7 | Receipt verifier trust and key lifecycle | ACCEPTED_LOCAL_EXTERNAL_OPEN | C6 / O2-O3 |
| AUD8 | Audit-required local result promotion | POLICY_DEPENDENT_UNIMPLEMENTED | O6 / X2 |
| AUD9 | Saved-input custody replay and independent repeat | ACCEPTED_SAVED_INPUT_BROADER_SCOPE_OPEN | C8 / E4 |
| AUD10 | Critical JS and SQL numerical/mutation closure | ENGINEERING_AND_P8 | E1 / M1-M3 |
| AUD11 | Privacy/retention/legal hold activation | OWNER_PROVIDER_OR_PRODUCTION | O1-O6 / X1-X4 |
| AUD12 | Off-host/deployed independent administrative custody | OWNER_PROVIDER_OR_PRODUCTION | O1-O6 / X1-X4 |

## 8. Audit action navigation (original 20 actions/order)

Every action retains its existing partial/global boundary; navigation to a batch does not assert universal independent observation. E4 must close the actual remaining per-action assertions, distinguishing committed capture from attempted, suppressed or rolled-back activity.

| Ordinal | Original action | Existing evidence to inspect first | Remaining scope |
| --- | --- | --- | --- |
| 1 | incident/evidence creation | C2/C4/C8 | E4; complete occurrence/delivery/failure evidence and applicable O gates remain open. |
| 2 | source outbox creation | C2/C4/C8 | E4; complete occurrence/delivery/failure evidence and applicable O gates remain open. |
| 3 | transmission admission | C2/C4/C8 | E4; complete occurrence/delivery/failure evidence and applicable O gates remain open. |
| 4 | delivery acceptance | C2/C4/C8 | E4; complete occurrence/delivery/failure evidence and applicable O gates remain open. |
| 5 | receiver receipt | C2/C4/C8 | E4; complete occurrence/delivery/failure evidence and applicable O gates remain open. |
| 6 | duplicate/conflicting rejection | C2/C4/C8 | E4; complete occurrence/delivery/failure evidence and applicable O gates remain open. |
| 7 | broker registration | C5/C8 | E4; complete occurrence/delivery/failure evidence and applicable O gates remain open. |
| 8 | reservation/denial | C5/C8 | E4; complete occurrence/delivery/failure evidence and applicable O gates remain open. |
| 9 | dispatch admission | C5/C8 | E4; complete occurrence/delivery/failure evidence and applicable O gates remain open. |
| 10 | physical-send marker | C5/C8 | E4; complete occurrence/delivery/failure evidence and applicable O gates remain open. |
| 11 | provider observation | C5/C8 | E4; complete occurrence/delivery/failure evidence and applicable O gates remain open. |
| 12 | usage reconciliation | C5/C8 | E4; complete occurrence/delivery/failure evidence and applicable O gates remain open. |
| 13 | stop/resume | C5/C8 | E4; complete occurrence/delivery/failure evidence and applicable O gates remain open. |
| 14 | lease expiration | C5; passive expiration observation | E4; complete occurrence/delivery/failure evidence and applicable O gates remain open. |
| 15 | process recovery | C5/C8 | E4; complete occurrence/delivery/failure evidence and applicable O gates remain open. |
| 16 | guard execution | C5/C8; committed versus uncommitted guard | E4; complete occurrence/delivery/failure evidence and applicable O gates remain open. |
| 17 | guarded persistence | C5/C8 | E4; complete occurrence/delivery/failure evidence and applicable O gates remain open. |
| 18 | manual operations | C7/C9 | E4; complete occurrence/delivery/failure evidence and applicable O gates remain open. |
| 19 | terminal cleanup | C7/C9 | E4; complete occurrence/delivery/failure evidence and applicable O gates remain open. |
| 20 | unauthorized access | C8; selected server denials | E4; complete occurrence/delivery/failure evidence and applicable O gates remain open. |

## 9. Review boundary and preservation

Only this checklist and its new review evidence are written. No application/SQL/workflow/policy/debugger changes, tests, native profiling, mutation, Docker startup, provider calls, deletion, commit, push, merge or deployment occur. Input hashes, Git HEAD/index before/after and the current 419-source backup receipt readback are recorded separately. Hash identity is not fresh test success; historical results stay at their own epochs. No legal requirements were newly researched or approvals inferred in this review.

Stop here. **P8 NOT_STARTED; Phase 9D-1 PARTIAL; production OFF.**
