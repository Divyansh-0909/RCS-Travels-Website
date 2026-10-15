# Phase 9B — incident integration, executable replay and recovery closure

10 October 2026 (IST). Continues the [financial lifecycle checkpoint](phase9-financial-lifecycle-checkpoint-2026-10-09.md). Evidence directory: `output/phase9-final-integration-2026-10-09/`; its name retains the implementation start date. Historical checkpoints, failed trials and raw mutation reports are preserved.

**Phase 9B: COMPLETE for the approved supported, isolated backend simulation scope.** The requested acceptance permits explicit unsupported incident boundaries and observation/manual fallback where feasibility policy is unresolved. Those boundaries below remain part of the contract. Phase 9C/9D are not started; this completion supplies no production activation permission.

## I — Incident coverage

| Canonical family | Trustworthy creation point / boundary |
| --- | --- |
| `DRIVER_CANCELLATION` | Existing committed driver cancellation transaction; collector now includes persisted lifecycle observations. |
| `RIDER_CANCELLATION` | Actual customer cancellation succeeds in its conditional financial/state transaction; stable `rider-cancellation:<booking>` identity. |
| `DRIVER_LATE` | Customer commits the existing ten-minute late-driver recovery transition. Identity includes booking, previous driver and pickup promise. This records recovery/lateness, with fault `UNDETERMINED`; it is not an autonomous fault detector. |
| `FAILED_PICKUP` | Unsupported: failure-to-arrive cannot be established from absent/stale observations alone. |
| `DRIVER_OFFLINE` | Unsupported: the account online flag and failed delivery do not establish historical reachability or wrongdoing. |
| `PLATFORM_ASSIGNMENT_FAILURE` | Unsupported: empty candidates, unavailable capacity or worker failure do not independently establish platform causality. |
| `REPLACEMENT_FAILURE` | Unsupported: no authoritative replacement-exhaustion/deadline policy or committed failure disposition was recovered. |

`customerLifecycleIncidents.js` performs the actual cancellation/recovery transactions. `lifecycleIncidentEvidence.js` stores the original evidence snapshot with an immutable upsert and queues the real Phase 7 shadow work. Duplicate transitions, stale ownership and worker retries do not create another case/evidence version. Evidence persistence failure rolls back cancellation and deposit returns together. Observed missing signals create no fabricated unsupported-family case.

The six non-driver-cancellation financial families remain unsupported by the existing financial executor, including the newly observed rider/late families. Permanent negative tests verify no authoritative financial writes. No refund, fine, strike, block, liability or final disposition is authorized by a model result.

## II — Device and routing evidence

Actual GPS persistence, Google routing parsing/provenance, PostGIS candidate selection, priority ranking, pool geometry/route constraints and offer persistence are reused. Controlled routing responses supply observations; application assignment decisions execute through the real services.

Arrival and cancellation-location freshness now use **device observation time**, finite coordinates and accuracy, rather than treating a recent receipt/update as a recent fix. Existing 30-second age, five-second future skew, 100-metre accuracy and 500-metre pickup rules are retained. Regressions cover stale/delayed/unknown/missing/inaccurate fixes, malformed coordinates, valid arrival and exact boundaries. The protected location route shares `driverLocationUpdate.js` with the simulator; observed and received timestamps remain distinct.

Cases retain confirmation/assignment/pickup/arrival chronology, persisted routes/traffic, notification attempt/status timestamps and current/future booking commitments. Later delivery callbacks cannot rewrite an earlier incident snapshot. Traffic worsening after acceptance, late assignment, capacity exhaustion, arrival versus rejected arrival, late recovery and replacement use permanent integrated scenarios.

Existing future scheduled pickup promises remain the scheduled time; immediate/past-due promises use actual routing and the existing fallback. Whole-calendar ETA feasibility remains **UNASSESSED**. Connectivity remains account intent with **UNKNOWN reachability / UNAVAILABLE history**. Latest GPS plus immutable snapshots are available; a full production device-history journal is not supplied. No universal buffer, new cutoff, traffic-blame rule or punishment was introduced. These are explicit observation/fallback boundaries, not additional owner decisions.

Owner-approved economics remain **0%/10%** at the existing post-coupon ₹800 floor, preserving pass-through/rewards. Every replacement retains an independent deposit until booking termination, returned to its original owner. A committed late-recovery identity permits a new reservation without transferring or forfeiting the original hold.

## III — Executable replay

**Full event replay implemented: YES, for 36 bounded scenarios.** Twenty-three financial scenarios and thirteen device/incident scenarios execute actual services and signed fake HTTP webhooks from explicit initial state and ordered external inputs in fresh disposable databases.

- Paired fresh-database execution: **36/36 equivalent**, plus the integrity regression; **37/37 tests pass**, `replay-current.log`.
- Independent command/new process, loading saved inputs: **36/36 pass**, `saved-replay-final.log` and the selected run's `saved-replay-report.json`.
- Selected receipts: `receipt-manifest.json`, run `20261009210428937-3573a99b-f811-45d2-9830-feaff324ae68`; **205 source/config/schema identities**, frozen configuration, provider fixture versions, input and outcome hashes.

Replay compares complete canonical initial state, ordered outcomes, final financial/application/evidence/provider histories and digests. Explicit injective aliases handle generated identities; values, amounts, timestamps, nulls and unknown identities remain checked. Raw evidence and analysis hashes are validated before identity-dependent canonical hashes are derived. Missing inputs, wrong identities/configuration/provider fixtures, unsupported events and invalid order fail integrity validation before database creation.

Corrections discovered during replay: short OTP aliases could alter unrelated years/tokens; forward ledger aliases could leave a generated earning identity unresolved. Both have permanent regressions, including overlapping aliases and bounded cyclic mappings. Source loading binds transitive local imports, TypeScript resolution, migrations and data; it preserves the loaded process identity and rejects namespace escapes.

Duplicates, reordered callbacks, confirmation rollback, provider timeout/lost response/crash before acknowledgement, foreign holds, original-driver ownership, compensation, refunds and terminal settlement are replayed. Races use two actual committed transactions with a recorded row-lock order. This proves those legal interleavings, not every possible schedule.

The original **23 historical receipts retain their hashes** (`historical-receipt-linkage.json`). They are linked to regenerated explicit-input scenarios; their incomplete historical wall-clock inputs are not silently treated as exact old event replay.

Actual process recovery is additionally verified by `worker-process-crash-verified.log`: terminate a child after its real lease commits, preserve durable pending work, reclaim after the existing lease expires in a **new process**, create one frozen-V5 guarded result, retry in another process with zero extra calls/results, and preserve financial state. The recipe event named `restart` is a database-client reconnect. The independent saved replay starts a new process from initial state; arbitrary mid-request backend-server restart is not claimed.

## IV — Safety and isolation

Frozen Jev V5: **`e484afc4c7fa724ea29af6edd962c48b814dc73a10e4f4a5e33833ad26afbe75`**, **22/22 source identities unchanged**. No held-out evaluation, Responsibility Luna comparison, Search or Hindi/Hinglish evaluation was resumed. Model/provider evaluation calls: **0**.

The explicit offline V5 transport proposes confident `DRIVER_CAUSED` outcomes. Raw recommendations, real independent guarded eligibility (`NEEDS_ADMIN_REVIEW` for these incident witnesses), and human final authority remain separate. Synthetic preexisting human-authorized compensation/liability fixtures remain the only prior authority used by the financial scenarios. This is integration evidence, not a new model-quality or human-calibration measurement.

Dedicated children exclude production credentials, use empty dotenv and denied runtime URLs, and allow only loopback sockets. Database creation/migration/cleanup are restricted to owned `rcs_verify_*` names. Fake payment/routing/notification providers are explicit. During advisory evaluation, owned-database triggers deny financial, booking, payment, driver, finalization, reliability, payout and other consequence writes; insert/delete/update/truncate negative tests execute. Combined operative jobs are excluded.

Disabled shadow processing preserves its durable backlog and makes no analyst call. Concurrent resumption commits one result without financial effects. These are simulator isolation proofs; deployed database-role permissions and live production activation remain Phase 9D work.

The current uncommitted RAG migration requires pgvector. Its schema/access rules were preserved. The isolated image adds pinned **pgvector 0.8.6** while retaining **PostgreSQL 17.5 / PostGIS 3.5.2**. The authenticated Bullseye PGDG packages use the [official archive](https://wiki.postgresql.org/wiki/Apt). Docker recipe and every migration are replay-bound; no production database was contacted.

## V — Quality and execution evidence

| Check | Executed result / artifact |
| --- | --- |
| Full backend | **1,666/1,666 PASS**, no skips/cancellations/todos; `backend-source-bound-final.log` |
| Real disposable PostgreSQL/PostGIS | **50/50 PASS**, `phase9-db-closure.log`; updated actual process-crash witness also independently passed, `worker-process-crash-verified.log` |
| Executable replay | **37/37 PASS** paired suite; **36/36 PASS** independent saved-receipt suite |
| Critical coverage | **100% statements/branches/functions/lines**, 25 complete modules; **2,064 statements/lines, 907 branches, 133 functions**; `coverage-final/` |
| Current mutation closure | **1,475 unique: 1,462 killed, 13 reviewed equivalent; zero meaningful survivors/timeouts/ignored/errors**; `mutation-closure.json` |
| Structural maxima | Cyclomatic **18**, cognitive **20**, Halstead Difficulty **25.413**, CRAP **18**, critical source **262 LOC**; `quality-final.json` |
| Typecheck / scoped lint / whitespace | **PASS**, source-bound execution manifest selects the final logs |
| Clone detection | **0**, 25 modules, five-line/50-token minimum; `clones-final/jscpd-report.json` |
| Frozen V5 / replay sources | **22/22 / 205/205 PASS** |

Mutation totals reconcile exact file/location/mutator/replacement identities across initial and focused runs; raw survivor/timeout statuses remain preserved. Eight routing variants and five replay variants have executable equivalence witnesses. Replay equivalents are two anchored-prefix checks on SHA-bound manifest paths, redundant migration sorting before sorted hash output, and authority sorting/comparison on the supported zero-or-one preexisting-authority fixture. No numerical threshold waiver or ignored mutation was introduced. Earlier financial mutation evidence is referenced separately and not added to the current total.

A report copy removes unrelated SDK/CLI coverage entries for c8 processing; **every scoped V8 counter and source map is retained verbatim**, with hashes in `coverage-curated-final-manifest.json`. Original V8 files remain intact. Coverage/complexity certify the stated 25-module scope; existing large routes and unrelated historical debt are not certified by these numbers. No unrelated user changes were reverted.

## VI — Acceptance and next implementation

The Phase 9B acceptance items are satisfied for supported lifecycle/financial slices, incident boundaries, real observation services, executable replay, ownership/financial invariants, isolation and permanent DB/concurrency/recovery regressions. The historical R9 matrix is preserved. R9-01 and R9-05 have backend witnesses; R9-06–08 have simulator exclusion/retry/replay/stop/recovery witnesses. R9-02–04 require Phase 9C application journeys; deployed permissions and R9-09 human-final evaluation remain Phase 9D. Overall Phase 9 completion (R9-10) is not claimed.

**Phase 9C handoff:** customer `/booking/:id` uses `TrackingPage`, `RideDetails`, `CustomerPaymentPanel` and the real booking/payment/reassignment API. Captain `/rides/:id` uses `RideDetail`, real offer acceptance/cancellation and location APIs. Website `/dashboard` has an admin boundary, while `/api/admin/responsibility/cases/:caseId` supplies protected case/evidence/guard/review data; an actual Responsibility review screen still needs implementation. Backend `protect`/`protectAdmin` and app sessions must remain active.

First isolated journey: customer scheduled booking/advance → signed fake capture → captain offer/accept/cancel → customer replacement/refund visibility → admin case/evidence/raw-versus-guarded inspection. Reuse this database/provider harness, add isolated authenticated session fixtures and Playwright wiring, exercise refresh/retry/duplicates and mobile sizes. Native location, background connectivity, permissions and device-specific behavior require a device/emulator boundary. No browser journey or visual verification was performed here.

Phase 9D requires independent human-reviewed incidents, collection permissions, a dedicated shadow-only deployed role, operational recovery checks and consequence-denial proofs. Activation remains separately approval-gated.

RESPONSIBILITY PHASES 1–7: VERIFIED

RESPONSIBILITY PHASE 8: COMPLETE

HISTORICAL PHASE 8.2: RETIRED — NO RECOVERED SCOPE

PHASE 9A: COMPLETE

PHASE 9B: COMPLETE

PHASE 9C: NOT STARTED

PHASE 9D: NOT STARTED

PRODUCTION SHADOW: OFF

AUTO-ADJUDICATION: OFF

PRODUCTION CONSEQUENCES: OFF

SEARCH ROLLOUT: OFF

PROJECT-WIDE PROOFLOOP: NOT STARTED

PUBLIC PROOFLOOP GENERALIZATION: NOT STARTED
