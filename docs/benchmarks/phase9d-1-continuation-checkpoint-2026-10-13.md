# Phase 9D-1 — worker admission, database authentication and process containment

13 October 2026 IST. Continues the [first isolated readiness checkpoint](phase9d-1-checkpoint-2026-10-12.md), whose scheduled execution began at 21:22 IST on 12 October. The [accepted session-revocation implementation](session-revocation-checkpoint-2026-10-12.md) is preserved. **PHASE 9D-1: PARTIAL. PRODUCTION_READY: NO.**

Current evidence: [manifest](../../output/phase9d-1-continuation-2026-10-13/manifest.json), [readiness criteria](../../output/phase9d-1-continuation-2026-10-13/readiness-gates.json) and adjacent original executions. The previous manifest, raw reports and failed trials remain intact. No production role, deployment, switch, provider setting or financial policy was changed.

## Corrections with executable witnesses

1. **Worker admission.** The earlier worker reported inherited privileged variables after processing; it did not refuse them. PostgreSQL URI query parameters can override the visible URI user/host. The rehearsal now refuses its known privileged variables before creating a client, accepts only the owned loopback PostgreSQL URI with no query/fragment, and verifies the actual session/effective role, database and privilege flags before claiming work. Normal completion and error paths close the client. Diagnostic claim/crash mode retains the connection for the supervisor's actual termination proof.
2. **Impossible dates.** A real disposable regression demonstrated that the SQL privacy validator admitted `2026-02-30`. The original SQL bytes and failing execution are retained. The isolated validator now combines its bounded UTC shape with PostgreSQL calendar validation and rejects hour 24, rather than letting PostgreSQL normalize it into another day. No production evidence schema or frozen benchmark input changed.
3. **Container database authentication.** An independent legacy fixture reproduces superuser authentication over loopback with an incorrect password. Its actual HBA rules contain `trust`. Merely providing a dedicated worker login did not establish containment in a shared network namespace. The corrected rehearsal initializes every TCP HBA entry with SCRAM, generates an independent random owner password, and gives the worker only its random dedicated login through stdin. Owner credentials reach only the disposable database and a separate migration container, through private environment transport. They are absent from image contents, command arguments and saved reports. Wrong-password attempts for owner, worker and operations identities are rejected with `28P01`.

The earlier container PASS receipts certify their recorded checks only. They predate the authentication attack and are excluded from final containment selection. The new negative probes are permanent recipe assertions.

## Actual restricted worker execution

The selected fresh-process pair is named by `capsule-repeat-comparison.json`. Both use the same immutable Node image identity, **23 local source identities**, the same schema and **83 actual migrations**, dependency versions and resource profile. Both recreate their own disposable database. This is a recipe repeat, not saved-input event replay.

The real frozen-V5-compatible worker runs with:

- UID/GID 1000, read-only image contents, no host filesystem or Docker-socket mounts, separate PID/IPC namespaces, zero capabilities, no-new-privileges and active seccomp.
- Actual cgroup limits: 64 PIDs, 512 MiB memory and 0.75 CPU. The only writable mount is bounded, non-executable temporary memory storage.
- A private internal network namespace with its PostgreSQL fixture, inhibited bridge IPv4 gateway assignment and no published database port. Migration/inspection use separate owned Docker channels.
- No production credentials. A private synthetic host canary is excluded from the image, inaccessible inside it, unchanged after execution and removed afterward.

Each run passes **17 process/resource/filesystem/network checks** and **16 deliberate denials**: three invalid-password admissions; booking, payment, wallet, human-final and audit writes; operations control; owner-role/session escalation; server-file read/import; server program execution; password-catalog reads; and role grants. An unrestricted disposable control first reaches the synthetic host listener; the restricted worker cannot reach that same address/port. A reserved external-address connection is also denied. This tests those routes; it does not certify every DNS channel or a hostile-kernel exploit boundary.

The actual V5 factory and independent guard execute with the explicit offline SDK transport. Each run makes one **fake** analyst request and saves one categorical **SHADOW / NEEDS_ADMIN_REVIEW** result. All **51 application tables** retain their independently checked state. The worker cannot supply final human authority. Real model/provider evaluation calls are **zero**.

The parent verifies ownership labels before removing its containers/networks. Selected runs also remove the synthetic canary. Build contexts/images remain as reproducible evidence. No Vite-cache cleanup or alternate cleanup bypass was attempted. These local Docker proofs do not establish deployed IAM, cloud metadata protection, a live analyst broker or external audit custody.

## Executed verification and scope

| Check | Accepted result |
| --- | --- |
| Full backend unit suite | **1,793/1,793 PASS**, serial process execution; selected source epoch/log in manifest |
| Readiness/worker units | **16/16 PASS** |
| Real disposable readiness PostgreSQL suite | **20/20 PASS**, 19 leaf groups plus parent; **436 permission denials**, real service-mediated denials and actual lease/process recovery |
| Restricted container worker | **Primary/repeat PASS**, 17 checks and 16 denials each; one advisory result and unchanged application tables |
| Legacy authentication attack | **BYPASS_REPRODUCED**, incorrect password admits the old fixture's owner; no application writes |
| Four critical JavaScript modules | **100% statements/branches/functions/lines**; exact native V8 counters and report denominators in manifest |
| JavaScript mutations | **173 unique: 171 killed, two executable reviewed equivalents**, zero meaningful survivors/timeouts/ignored/errors |
| Seeded SQL mutations | **9/9 killed**, including calendar and hour-24 omissions; separate from framework mutation totals |
| Critical structural maxima | Cyclomatic **7**, cognitive **3**, Halstead Difficulty **18.791**, CRAP **7**, source **54 physical lines** |
| Scoped lint / backend typecheck / whitespace | **PASS**, exact executions selected by manifest |
| Scoped clone detection | **0**, four-module scope, five-line/50-token minimum |
| Accepted auth / frozen V5 | **3/3 auth source identities / 22/22 frozen identities unchanged** |

Coverage and structural certification cover `privacy.mjs`, `repository.mjs`, `worker-core.mjs` and the IPC `worker.mjs`. Raw scoped V8 counters/maps are copied verbatim into a report copy; original files remain untouched. Native V8-derived branch denominators are recorded from the actual selected execution windows. There is no full SQL statement/branch/structural certificate, and container orchestration is executed fixture evidence rather than a full coverage certificate. **Q2 therefore remains open.**

The two raw mutation survivors remove internal assertions on frozen question definitions and zero retry options. Executable paired witnesses compare complete outcomes, queries and analysis envelopes with each omission. Only the unchanged V5 factory supplies those inputs. A change to that composition invalidates the equivalence reviews. Original statuses and exact file/location/mutator/replacement identities are retained in the reconciliation.

Failed trials remain distinguishable: the original calendar admission failure; a full-test invocation from the wrong working directory whose child probes could not resolve `tsx`; a package-export metadata lookup; the internal-network host-port assumption; a missing SDK dependency in the staged image; and an initial legacy-auth probe made before final TCP startup. An execution with intervening test-source edits is not counted as an unchanged-source acceptance. Corrected executions have their own source epochs.

## Authentication and historical database findings

The shared auth middleware was neither duplicated nor redesigned. Protected human requests still perform a fresh authoritative session lookup; there is no cross-request positive cache or JWT-only fallback. The prior measured latency/deadline, 100-outstanding cap, provider-wide budget and request-admission guarantee remain the contract. Earlier four-replica synthetic guard load evidence is linked through the original readiness manifest. Complete production-shaped HTTP journeys, production peak capacity, replica-shared Clerk budgets, live alerts and operational ownership remain unverified.

The four wider-DB failures remain preserved: three leaf route assertions plus their failed Phase 7 parent. The historical generic `recorded:true` fixtures provide no independent causal authority. Their current review route is consistent with the owner-accepted 8 October evidence guard. This is established by `historical-analysis.mjs`, source identities and the [guard-closure checkpoint](responsibility-guard-closure-checkpoint-2026-10-08.md). Policy, expected results and frozen V5 were not changed to make those tests pass. Their downstream obsolete-assertion paths remain unexecuted; fixture maintenance is still Q4. They are not attributed to Clerk remediation.

Payout dispatch and human-final decision execution retain their existing authorization. Fresh admission does not cancel an admitted operation waiting on locks or dispatch. An execution-time authorization policy, role-change procedures and concurrency/idempotency proof remain separate readiness gates; no financial behavior was changed here.

## Remaining blockers and next implementation

The complete criterion-level list is in `readiness-gates.json`. Outstanding work includes:

1. Full critical SQL coverage, structural measurement and mutation certification; historical fixture/downstream regression maintenance.
2. A production-compatible export/outbox, useful approved causal evidence projection, explicit production V5 selection and server-time/retry contract. The current fully minimized payload intentionally cannot establish causal entitlement.
3. A separately privileged analyst broker with independent timeout, atomic stop/request admission, token/currency budgets and approved deployed egress/secret/IAM/database grants. Current processing is offline only.
4. Independent external audit custody, complete denial delivery, reconciliation and approved retention/deletion/legal-hold controls.
5. Production-shaped authentication journey/load/availability measurement, shared Clerk capacity agreement, telemetry/alerts and named operational owners.
6. In-flight human-financial authorization and privileged role-change policy/concurrency verification.
7. Approved real-evidence purpose/notice and provider disclosure; blind independent review, quantitative sampling/acceptance approval and real human labels. No real incidents were collected.
8. Stopped-first deployed rollout/reconciliation proof and separate explicit deployment/activation approval.

Next implementation remains isolated: certify the SQL boundary, maintain versioned historical regression witnesses without weakening the guard, then build the bounded broker/outbox and external custody exercises. Readiness gates requiring actual deployment, live data or owner policy stay closed.

```powershell
node tools/phase9d/continue.mjs unit
node tools/phase9d/continue.mjs db
node tools/phase9d/continue.mjs capsule
node tools/phase9d/continue.mjs legacy-auth
node tools/phase9d/worker-equivalences.mjs
```

The legacy command intentionally demonstrates the retired fixture defect in a network-isolated disposable database. It does not alter an existing database. No phone is required.

```text
RESPONSIBILITY PHASES 1–8: VERIFIED / COMPLETE FOR APPROVED SCOPE
HISTORICAL PHASE 8.2: RETIRED — NO RECOVERED SCOPE
PHASE 9A / 9B / 9C: COMPLETE FOR APPROVED ISOLATED SCOPE
PHASE 9D-1: PARTIAL
SUPPORTED DATABASE / WORKER / PROCESS CONTROLS: VERIFIED_IN_ISOLATION
PRODUCTION_READY: NO
PHASE 9D-2: NOT STARTED
PRODUCTION DEPLOYMENT: NOT AUTHORIZED
PRODUCTION SHADOW / AUTO-ADJUDICATION / CONSEQUENCES / SEARCH ROLLOUT: OFF
PROJECT-WIDE PROOFLOOP / PUBLIC GENERALIZATION: NOT STARTED
```

Isolation mechanics reference the [official Docker bridge documentation](https://docs.docker.com/engine/network/drivers/bridge/). Calendar-validation behavior uses PostgreSQL 17's [input-validation functions](https://www.postgresql.org/docs/17/functions-info.html). Passing results above are local execution observations, not inferred deployment guarantees.
