# Phase 9B — replacement reservations, refunds and terminal settlement

9 October 2026. Continues the [first vertical slice](phase9-vertical-slice-checkpoint-2026-10-09.md) and [infrastructure inventory](phase9-infrastructure-inventory-2026-10-09.md). Evidence: `output/phase9-financial-lifecycle-2026-10-09/`. Historical checkpoints and failed trial logs are retained. Phase 8.2 remains **RETIRED — NO RECOVERED SCOPE**, with no active R82-01 blocker.

## I. Replacement lifecycle

Two explicit owner replies govern this continuation: **0%/10% commission**, retaining the existing ₹800 post-coupon floor, pass-through treatment and commission rewards; **retain every driver's deposit until the booking ends**, returning it to its original owner. These supersede the previous 5% commission and resolve the first slice's replacement reservation decision.

`scheduledDepositLifecycle.js` is shared by the actual acceptance, customer cancellation and completion services. The original reservation retains its legacy event key. A replacement uses a deterministic key qualified by its accepted offer; each debit and return has an independent owner. A historical original-driver cancellation must exist before another actor can reserve against that booking. Invalid booking/type/amount/owner, unknown ownership, released reservations and conflicting return entries fail closed. No deposit transfer or responsibility forfeiture was introduced; reservation returns are excluded from liability recovery.

Supported transitions: independent **RESERVED → RELEASED** on completion or customer cancellation; pending acceptance failure rolls back assignment/capacity/reservation; repeated writes cannot debit or release twice. A driver cancellation retains the reservation while dispatch resumes. Automatic expiry, deposit consumption as punishment and unsupported terminal failure dispositions are not implemented.

Real PostgreSQL scenarios cover original cancellation, eligible replacement, occupied capacity, retry after capacity becomes available, a foreign-booking hold, competing replacement drivers, replacement versus cancellation, retained original ownership and cancellation/completion by stale owners. The competing replacements preserve one owner and one additional hold. Customer cancellation after replacement returns both owners' funds. Existing pending-RCS priority regressions remain active; priority was not changed to accommodate a test fixture.

## II. Financial closure

The simulator reuses real payment intents/orders, the signed raw HTTP webhook handler, cancellation policy, refund/reconciliation service, wallet ledger, ride settlement and compensation/recovery services. All actors, providers and database records are synthetic.

Verified flows include:

- Advance capture with failed confirmation transaction, durable rollback and replay of the original signed event; duplicate capture remains one financial effect.
- Full refund, authorized arrival waiver, capped cancellation charge with partial refund, provider pending state and duplicate refund callbacks.
- Lost response, request timeout and crash before provider acknowledgement: stable request identity, one provider refund, reconciliation and eventual processed acknowledgement.
- Terminal provider failure remains unresolved/refund pending. A late pending acknowledgement, contradictory failed callback or delayed payment-failure event cannot erase a successful or in-progress refund.
- Replacement completion, original-driver protection, cash final payment, signed platform final capture, duplicate completion, terminal retry and completion versus unsupported self-cancellation.
- Preexisting compensation is released in full on cancellation and never pays the cancellation charge. On completion it funds normal driver economics and is consumed once. Only a synthetic **preexisting finalized** liability is recovered from controlled earnings; direct final cash does not create a new recovery.

The compensation tests seed a prior human-authorized fixture using the shared Phase 6C fixture. They do not allow an AI or shadow result to create authority. No new payout exception, incident liability formula or production provider call was added.

New permanent corrections: customer cancellation and settlement bind the current driver in their conditional update; customer/driver cancellation reject unsupported terminal/underway states; the driver route and settlement service share the legal stage map; refund acknowledgement locks/reloads the payment and preserves terminal identity/state; delayed payment failure preserves captured/refunding/refunded states. Earlier stale-driver, rejected-offer and priority regressions remain.

## III. Responsibility integration and isolation

The production cancellation collector now retains actual confirmation, assignment, expected-pickup and arrival timestamps, including the recorded arrival-location observation time. Absent timestamps remain explicit nulls. Stable incident identities, immutable evidence versions, provenance and existing completeness/contradiction semantics remain unchanged. Saved receipts also retain payment/provider identities, chronological events, cases, evidence versions, raw shadow results and guarded outcomes.

The actual integrated incident family remains **DRIVER_CANCELLATION**. The offline transport deliberately proposes DRIVER_CAUSED with high confidence; the unchanged independent gate produces **NEEDS_ADMIN_REVIEW** when causal authority is missing. Raw recommendations, guarded eligibility and final human authority remain separate. No new production detector is fabricated for an infeasible assignment or other incident family.

Frozen Jev V5: `e484afc4c7fa724ea29af6edd962c48b814dc73a10e4f4a5e33833ad26afbe75`; all **22 source identities pass**. No held-out, Responsibility Luna API, Search or Hindi/Hinglish evaluation was resumed. No frozen prompts, labels, serializers, model settings, evidence or splits changed.

The dedicated child excludes credentials, uses an empty dotenv file and denied runtime database URLs, permits only loopback sockets and migrates disposable PostGIS databases. Explicit fake provider and notification dependencies are retained. During advisory analysis, owned-database triggers reject financial, finalization, reliability and payout writes, including driver updates and wallet truncation. The combined finalization/reliability/finance job is excluded. These are simulator isolation proofs; they do not certify production shadow deployment permissions.

## IV. Verification and reproducible evidence

| Check | Executed result / artifact |
| --- | --- |
| Full backend | **1,598/1,598 PASS**, no skips/cancellations/todos; `backend-closure.log` |
| `npm --prefix backend run test:phase9` | **35/35 PASS** on real disposable PostgreSQL/PostGIS; `phase9-final.log` |
| Existing focused DB suites | Compensation booking **4/4**, payment reliability **2/2 PASS**; adjacent DB logs |
| Critical coverage | **100% statements/branches/functions/lines**, eleven complete source modules; 948 statements/lines, 334 branches, 53 functions; `coverage-quality-final.log` and saved reports |
| Mutation | **270 unique framework mutants: 268 killed, 2 reviewed equivalent survivors, 0 meaningful survivors/timeouts/ignored/errors**. Separately seeded terminal release omission: **1 killed** by existing regressions. Exact identity reconciliation in `mutation-closure.json`; raw reports retained. |
| Structural quality | Maximum cyclomatic **18**, cognitive **15**, Halstead Difficulty **24.083**, CRAP **18**, critical source **262 LOC**; `quality-closure.json` |
| Typecheck / lint | **PASS**; `typecheck-verified.log`, `lint-closure.log` |
| Clone detection | **0** over eleven modules, minimum five lines/50 tokens; `clones/jscpd-report.json` |
| Frozen V5 | **PASS**, original hash and 22 source identities; integrity witness in focused/full tests |
| Git whitespace check | **PASS**, actual Git exit 0; native PowerShell LF/CRLF warnings retained separately, no source normalization |

`receipt-manifest.json` selects the **23 final financial receipts** by immutable case identity and hashes. They contain initial state, ordered events/race results, final state, provider history and source identities. Earlier trial receipts are retained. `phase9-audit-receipts.mjs` reproduces their wallet, funding, commission and cancellation checks offline: **23/23 PASS**, zero database/provider calls. This is a saved-observation audit, **not full event replay through a new database**.

Two mutation equivalents are explicitly reviewed in `reviewed-equivalences.json`, with executable witnesses in `backend/tests/quality/phase9-reviewed-equivalences.mjs`. One adds a read of the same unique immutable legacy hold under the application booking/actor lock contract; the other removes an already-authorized state from a branch that returns that identical state anyway. Raw survivor statuses are retained. No ignored mutation or numerical threshold waiver was introduced. The aborted initial mutation run was stopped to reduce process contention and contributes no completed score.

Coverage/complexity apply to the eleven critical modules. Existing large route files and unrelated historical complexity debt are not certified by those scoped numbers. No unrelated user edits were reverted.

## V. Remaining work and browser handoff

**Phase 9B remains INCOMPLETE.** This continuation closes the supported replacement/terminal financial slice; it does not establish the full roadmap's incident, device and UI coverage.

1. Connect trustworthy creation points for failed pickup, lateness, offline driver, rider cancellation, assignment failure and replacement failure. Unsupported automatic terminal/refund/liability mappings stay unresolved/manual; a model classification supplies no monetary authorization.
2. Compose real routing feasibility and schedule commitments, GPS observed/received histories, connectivity and notification delivery, deadline/grace handling, later-pickup acceptance/decline and replacement exhaustion. The current pickup promise is an explicit offline fixture, and capacity tests do not prove ETA feasibility.
3. Implement complete event replay from saved initial identities and provider crash/race receipts. Confirmation currently adopts the actual service's wall-clock stamp before subsequent controlled times; no full deterministic replay claim is made.
4. No additional owner decision blocks the implemented scenarios. A new automatic monetary route for an unsupported family needs explicit policy scope; none was invented here.

**Phase 9C handoff:** reuse customer `frontend/src/api/api.js`, `CustomerPaymentPanel.jsx`, `RideDetails.jsx` and `TrackingPage.jsx` for booking/payment, assignment, replacement and refund visibility; reuse captain `driver-app/src/api/api.js` and `RideDetail.tsx` for offers, acceptance and cancellation. Existing protected `backend/routes/responsibilityAdmin.ts` provides case/evidence/review inspection. An admin browser surface, isolated session fixtures and Playwright wiring are still needed. Exercise refresh/retry/duplicates and mobile viewports. No new screen or browser journey was implemented or visually verified.

**Phase 9D prerequisites:** independent human-reviewed incident labels, evidence collection permissions, a dedicated shadow-only worker/database role, recovery/operational checks, and proof that deployed permissions forbid financial/reliability/finality effects. Production activation remains separately approval-gated.

RESPONSIBILITY PHASE 8: COMPLETE

PHASE 9A: COMPLETE

PHASE 9B: INCOMPLETE

PHASE 9C: NOT STARTED

PHASE 9D: NOT STARTED

REAL PRODUCTION SHADOW: OFF

AUTO-ADJUDICATION: OFF

PRODUCTION CONSEQUENCES: OFF

SEARCH ROLLOUT: OFF

PROJECT-WIDE PROOFLOOP: NOT STARTED

PUBLIC PROOFLOOP GENERALIZATION: NOT STARTED
