# Phase 9A/9B — isolated backend lifecycle checkpoint

Date: 9 October 2026. [Infrastructure inventory](phase9-infrastructure-inventory-2026-10-09.md): **Phase 9A COMPLETE**. **Phase 9B INCOMPLETE; first executable vertical slice PASS**. [Owner disposition](../audits/phase82-owner-retirement-2026-10-09.md): **PHASE 8.2: RETIRED — NO RECOVERED SCOPE**. R82-01 is no longer an active blocker. Responsibility Phase 8 COMPLETE for its defined verified scope. Historical audits retain their original findings.

## Executable functionality

Run `npm --prefix backend run test:phase9`. It starts pinned PostgreSQL 17.5/PostGIS 3.5.2, runs real migrations in a new owned database for each scenario, and cleans up the owned databases/container. The existing actor factory, clock, provider fake, application services and financial helpers are reused. General `test:db` excludes this dedicated suite; its separate sanitized runner is mandatory.

**Actual chain:** real scheduled booking/advance intent → fake provider order → signed raw HTTP webhook through the application handler → real confirmation → actual scheduled-assignment sweep/offers → guarded acceptance/deposit transaction → actual driver cancellation/capacity release/evidence collector → unchanged V5 analyst adapter and independent policy gate → persisted advisory shadow result → case/booking state and advance/ledger/zero-consequence assertions.

The V5 transport returns explicit synthetic categorical answers using the exact frozen questions/model/options. It makes **zero live model calls** and does not use benchmark cases/labels. Minimal runtime cancellation evidence lacks affirmative automatic driver-fault authority: the independent gate correctly returns **NEEDS_ADMIN_REVIEW**, with the real case still available to human review and no final decision, liability, compensation, strike, block or appeal window.

The child receives a credential-free environment allowlist, an empty dotenv file, a forbidden application-DB sentinel, and a loopback-only socket fence. Shadow execution imports only the dedicated shadow sweep. Owned-DB triggers reject financial/driver consequence writes, while snapshots verify unchanged payments, wallets, capacities and authority tables. The composed production jobs sweep is excluded. This proves the local simulator boundary; production permissions/activation are future 9D work.

## Verification

| Check | Actual result |
| --- | --- |
| Full backend suite | **1580/1580 PASS**, zero failures/skips/todos |
| Real PostGIS lifecycle scenarios | **12/12 PASS** |
| Scoped regression/coverage run | **47/47 PASS** |
| Coverage | **100% statements/branches/functions/lines** over scheduledOfferAcceptance, driverRideCancellation and phase9Isolation |
| Critical cyclomatic / cognitive / Halstead / CRAP maxima | **10 / 8 / 15.373 / 10** |
| Mutation | **153/153 killed**, zero survivors/timeouts in reconciled current-source results |
| Typecheck / scoped lint | **PASS / PASS** |
| Clone detection | **0**, five slice source modules, five-line/50-token minimum |
| V5 integrity | **22/22 source hashes unchanged**; freeze `e484afc4c7fa724ea29af6edd962c48b814dc73a10e4f4a5e33833ad26afbe75`; no held-out rerun |

Mutation scope is the shared acceptance module, process fence, changed cancellation ownership predicate, scheduled priority predicate, worker injection boundaries and webhook factory. Earlier broad runs/timeouts remain retained. The serialized isolation retest is matched by exact source/location/mutator/replacement and replaces its overlapping cohort; counts are not additive. No equivalents/debt waivers were used.

The full-file static scan also finds **existing getDriver cognitive 32 / Halstead 33.754**, unchanged from October 7; its source identity is retained. The changed claim function is below structural thresholds. Typhon misses one anonymous method in existing assignment and the harness; ESLint remains the authoritative cyclomatic measure. CRAP is established only for the three fully covered critical modules; broader full-source quality is not claimed.

## Defects and permanent regressions

1. **Stale driver cancellation:** status alone allowed an old driver snapshot to cancel a replacement with the same status. The conditional write now binds driver ownership; the regression preserves the replacement and its capacity.
2. **Stale offer acceptance:** an unconditional offer write could overwrite a rejection during a competing acceptance. The shared transaction now requires a pending offer owned by that driver and booking; failure rolls back assignment/deposit/capacity.
3. **Replacement hold ownership:** the legacy one-per-booking deposit event could silently reuse another driver's hold. Acceptance now fails closed with DEPOSIT_OWNER_CONFLICT; the original hold and replacement wallet stay intact. Full release/rehold/refund integration remains incomplete; no transfer policy was invented.
4. **Worker retry priority:** no new RCS candidates was mistaken for no outstanding RCS offer. Pending RCS priority is now preserved; accepted/rejected/withdrawn terminal offers resolve priority for redispatch. Empty-fleet fallback remains available.

The twelve real DB scenarios cover the complete first chain, concurrent duplicate webhooks, invalid signatures, competing acceptances, rejection race, zero capacity, shadow timeout/backoff, crashed lease recovery, stale cancellation after replacement, foreign hold rollback, customer/driver cancellation race and the network/consequence boundary.

## Remaining integration and next steps

1. Complete original/replacement driver operational deposit release/rehold/refund ownership and terminal settlement.
2. Compose complete customer cancellation charge/refund-provider reconciliation.
3. Add trustworthy collectors for the six remaining incident families and richer feasibility/GPS/connectivity/delivery evidence.
4. Join authenticated customer/driver/admin routes and Playwright journeys under Phase 9C.
5. Prepare independent human review and dedicated zero-consequence production shadow permissions/activation proof under Phase 9D.

The current slice adopts the real confirmation timestamp as its clock origin and controls subsequent workers, assignment, cancellation and retry time. Its route/pickup promise is an explicit fixture; richer actual routing/GPS/delivery semantics and terminal settlement remain incomplete. Backend service coverage does not establish Clerk/browser/device journeys or independent human review. Search S5/S6 and Hindi/Hinglish were not advanced or changed.

All source and artifact SHA256 identities, exact coverage counters and active roadmap status are in [continuation-state.json](../../output/phase9-vertical-slice-2026-10-09/continuation-state.json). Raw execution logs and original/reconciled mutation reports are adjacent. No production shadow activation is authorized by this checkpoint.

## Final status

```text
RESPONSIBILITY PHASES 1–7: VERIFIED
RESPONSIBILITY PHASE 8: COMPLETE
HISTORICAL PHASE 8.2: RETIRED FROM ACTIVE ROADMAP
PHASE 9A: COMPLETE
PHASE 9B: INCOMPLETE — FIRST ISOLATED VERTICAL SLICE PASS
PHASE 9C: NOT STARTED
PHASE 9D: NOT STARTED
PRODUCTION SHADOW: OFF
AUTO-ADJUDICATION: OFF
PRODUCTION CONSEQUENCES: OFF
SEARCH ROLLOUT: OFF
PROJECT-WIDE PROOFLOOP: NOT STARTED
PUBLIC PROOFLOOP GENERALIZATION: NOT STARTED
```
