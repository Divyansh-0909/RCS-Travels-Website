# RCS proposed compliance fix plan — Phase 4 approval required

This is a proposal, not implementation authorization. No production code, migration, financial record, external message or published policy was changed. “Safe to implement now” means technically/business-authorized by the supplied matrix once the owner approves Phase 4, not permission to deploy or retrospectively debit anyone. Unsettled legal/tax/product choices remain in their own groups. [Audit](rcs-policy-code-audit.md), [traceability](rcs-requirement-traceability.md), [scenarios](rcs-compliance-scenarios.md).

## Safe to implement now after Phase 4 approval

F-01 — Correct prospective ordinary commission to 10% (RCS-01; S-01/02/03)

1. **Blast radius:** quote/creation snapshots, completed settlement, captain earnings/wallet, finance previews/fixtures. Preserve established pass-through exclusions; do not silently change coupon/loyalty exceptions pending B-01.
2. **All callers/consumers:** `commissionOn` imported by `bookingCreation.js`, `rideSettlement.js`; seed/demo finance and fixtures including `prisma/seed-captain-rides.js`; `walletMoney.test.js`/transaction/payment views; driver API summaries, `RideCompleted`, earnings cards/ride details and any literal 5% copy. Locate direct and literal consumers again against implementation snapshot.
3. **Database:** Booking.commissionPct/commissionAmt are snapshots; WalletEntry posts commission. Define a prospective effective/version boundary so existing uncompleted bookings do not silently receive a different promised rate.
4. **Migration:** no schema change required for constant alone; a rate-version/effective-policy snapshot is advisable. Backfill/versioning must be explicit, never blanket update of historical monetary values.
5. **Webhooks:** final UPI capture credits collection and recovery independently of commission; verify captured-final retry does not recompute/repost historical commission.
6. **Jobs:** coupons/compensation/reliability can affect effective net amount. No dispatch change required; payout/reporting must use recorded settlement.
7. **Frontend assumptions:** show declared ordinary rate/base vs actual loyalty waiver; update all languages/preview data. UI rounding must not become authoritative.
8. **Existing tests:** walletMoney, criticalRideTransactions, scheduledCustomerPayments, driverPaymentView, financial invariants.
9. **Regression tests:** 799/800/801 with immediate/scheduled, toll/airport/carrier, coupon crossing threshold, loyalty waiver, unmatched shared solo fare, direct cash/UPI, repeated completion and final capture.
10. **History:** retain paid/settled 5% records and earned rewards. Owner must choose treatment of open pre-change bookings and any retrospective correction; do not silently collect arrears.

F-02 — Close alternate scheduled claim and enforce shared eligibility contract (RCS-02/03; S-17/29)

1. **Blast radius:** both accept APIs and automatic generic claim; availability/class/offer/document requirements must survive races.
2. **All callers:** `/driver/offers/:id/accept`, `/driver/rides/:id/accept`, `startAssignment`/`assignDriver`, pooling claim helpers, replacement from `/bookings/:id/request-reassignment`, driver-app API offer acceptance and legacy immediate acceptance export.
3. **Database:** guarded Booking status/driver claim, Driver row lock/capacity, owned RideOffer state, required current personal/active-vehicle documents, sanctions and hold in same transaction.
4. **Migration:** no migration for rejecting wrong endpoint; any common assignment identifier added for F-03 requires migration. Existing valid assigned bookings remain owned by their driver.
5. **Webhooks:** booking/payment confirmations must not claim work themselves; late capture still confirms/refunds through guarded states.
6. **Jobs:** scheduledOffers and generic dispatch must call the same authoritative new-work check, without making scheduled offers require online merely to receive them. Acceptance may still require online under current product rule.
7. **Frontend:** pending-owned offer acceptance errors remain actionable; generic endpoint pending-only or delegates to owned offer contract; preserve valid immediate driver UX. Do not derive class/eligibility from client flags.
8. **Existing tests:** hybridAuthSecurity/securityHttp, driverNewWorkEligibility, criticalRideTransactions, scheduledScenario, pooling/geofence tests.
9. **Regression tests:** rejected/withdrawn/unowned offer→generic confirmed accept, offline, class mismatch, insufficient wallet, stale approved cache at expiry, two drivers/requests, suspension/expiry race and pooled host move.
10. **History:** no reassignment of already-held bookings solely because endpoint was wrong. Identify anomalous class/hold records via anonymized aggregate audit for controlled repair.

F-03 — Give every scheduled acceptance hold an owner and lifecycle (RCS-28; S-22)

1. **Blast radius:** wallet funds held/released across customer cancellation, driver cancellation, delayed replacement and completion. Treat a retry of one acceptance differently from a genuinely new accepted assignment.
2. **All callers:** `walletEvent.depositHold/depositRefund`, `/offers/:id/accept` hook, `cancelDriverRideInTransaction`, rider request-reassignment transaction, `cancelCustomerRideInTransaction`, `applyCompletionMoney`, `driverFinance` hold views, wallet entry posting/reconciliation and relevant UI summaries. Generic acceptance must be covered by F-02.
3. **Database:** hold owner/amount/acceptance identifier, release identity and state should be durable. A release must use original held driver, not current Booking.driverId. New assignment gets new hold; reassignment atomically resolves prior hold.
4. **Migration:** introduce assignment/hold identity or explicit hold model with constraints; retain legacy keys, original driverId and amount. Design a compatibility reader for old entries; do not simply rename keys or reset wallet caches.
5. **Webhooks:** customer refunds are independent of driver hold release; final capture/payment retries must not release/collect holds again. RazorpayX payouts must use corrected available wallet without paying an unearned release twice.
6. **Jobs:** replacement/failed-pickup/finalization outcomes must use same hold service. No job may infer ownership from the latest driver; reconciliation should identify open/incorrect legacy holds without mutation until approved.
7. **Frontend:** driverFinance/Wallet must display actual held owner and pending release. Customer fare/refund is unchanged by correct driver hold ownership.
8. **Existing tests:** criticalRideTransactions, walletMoney, scheduledCustomerPayments, driverCancellations, financialInvariants, payout tests.
9. **Regression tests:** A accept→cancel→B accept→complete; rider-reassign variant; customer cancels before/after replacement; same-driver reacceptance; repeat/concurrent cancel/reassign/complete; rollback of hold+claim; payout with open/released hold; old-key compatibility.
10. **History:** detect original debit/incorrect recipient/duplicate suppressed hold using immutable ledger owner fields. Reconcile actual payout exposure before append-only compensating entries. Retrospective corrections need owner/accounting approval and driver notice; never silently deduct B or credit A twice.

F-04 — Enforce current required-document validity at new-work boundaries (RCS-03; S-29)

1. **Blast radius:** going online, candidate lists, normal/generic/pool/replacement acceptance. Current required set only; legal additions belong to L-03.
2. **All callers:** requireDriverForNewWork, `/online`, `newWorkEligibility/recheckDriverNewWorkEligibility`, `claimBookingForDriver`, scheduled candidates and immediate candidates; `verdictFor/recomputeDriverVerification`, vehicle switching and admin document review.
3. **Database:** read current approved/clean/nonexpired personal and active-car required docs in a consistent transaction; keep cached verification as display/cache, not sole validity authority. Check activeVehicle identity after locking too.
4. **Migration:** no required migration for synchronous reads; add relevant validity/assignment snapshot/index only if justified. Keep parked-car vs active-car semantics and replacement slots.
5. **Webhooks:** payment capture must not bypass eligibility; no provider changes.
6. **Jobs:** preserve hourly lapse/reminder sweeps, quiet hours and renewal promotions; missed job must no longer permit expired new work.
7. **Frontend:** expired-document reason/required renewal displayed at online/acceptance; active-ride treatment must not accidentally inherit the new-work gate (B-04/L-03).
8. **Existing tests:** documentPolicy, documentConcurrency, driverNewWorkEligibility and vehicle switching tests.
9. **Regression tests:** expiry crossing immediately before/inside claim/online; sweep down; approved replacement promotion; unrelated parked car expiry; missing expiry/unclean/rejected required row; concurrent active-car/document changes.
10. **History:** no retrospective driver penalty for platform acceptance while cache was stale. Existing active work gets separate explicit resolution, not silent cancellation/fare loss.

F-05 — Guard refund identity and monotonic state (RCS-29; S-15)

1. **Blast radius:** full, scheduled partial and driver-debt-excess refund state; payment/booking views and retries/reconciliation.
2. **All callers:** `applyRefundProviderState` from `razorpayWebhook` and provider refund/reconciliation paths in `payments.js`; `applyRefundedPaymentEffect`; full/partial/debt refund helpers; Payment API/status views. Audit source snapshot again for all direct imports.
3. **Database:** transaction guards require current operation/refund identity and allowed transition; retain failed-attempt identity rather than clearing a successful current attempt. A late failed event cannot resurrect `refunded`.
4. **Migration:** predicate-only repair may need none; multiple attempted refund IDs may require separate RefundAttempt model/history. Single refund fields cannot be assumed an unlimited partial-refund ledger.
5. **Webhooks:** handle distinct event IDs, wrong attempt ID, out-of-order/concurrent events, same event retry, delayed refund after Booking status changes; acknowledge ignored stale events with audit reason.
6. **Jobs:** no regular refund-age retry/sweep was found; any added reconciliation must reuse stable operation identity and fetch ambiguous provider state before mutation/reissue.
7. **Frontend:** requested/provider-identified/succeeded/failed labels reflect actual provider state; no success display on request alone.
8. **Existing tests:** refundProviderState, refundGateway, providerReconciliation, payments, scheduledCustomerPayments, RazorpayBoundary.
9. **Regression tests:** processed→old-failed/wrong-refund-ID, failed-attempt-A→processed-attempt-B→late-A; partial-refund identity preserved; concurrent callbacks; amount/currency mismatch; refund above captured bound; cancellation retry after a completed refund; booking terminal status not resurrected.
10. **History:** preserve provider IDs/evidence; reconcile records regressed to captured against gateway state before repair. Existing requests must not be reissued merely because local status was wrong. No claim that a real double refund already happened.

F-06 — Stop headless location after persistent authoritative refusal (RCS-13; S-32)

1. **Blast radius:** Android task, shared foreground reporter and service lifecycle; avoid defeating optimistic online handshake.
2. **All callers:** `locationTask` module registered by main, `reportFix`, `useDriverLocation` fallback/task starter, OnlineToggle/Home/profile refresh, driver location API response contract.
3. **Database:** no new location collection; server online guard remains authoritative. Clarify server-offline vs transient auth/network response before stop.
4. **Migration:** none.
5. **Webhooks:** none; provider-triggered account state changes still need client state refresh.
6. **Jobs:** document expiry and suspension/offline events can trigger persistent refusal; service must stop even if UI is not mounted.
7. **Frontend/native:** clear local readiness, foreground notification and watcher/task registration appropriately; re-online restarts. Permission denial/session loss also tested; do not silently collect offline. No iOS claim without its target/configuration decision.
8. **Existing tests:** location provenance tests and DA hooks/API tests; no device run in audit.
9. **Regression tests:** one/two/three403, reset on accepted fix, intermittent network error, no-session, logout/delete/suspend, explicit offline, active trip transition, repeated restart, OEM foreground-service device behaviour.
10. **History:** change only future collection; purging historic precise data needs approved retention plan L-04.

F-07 — Establish missed scheduled failure state and idempotent no-driver refund plumbing (RCS-06/23; S-20/21/23)

1. **Blast radius:** scheduled sweep, status polling, offers, replacement dispatch and customer advance refund. Never let a past pickup disappear silently from monitoring.
2. **All callers:** sweepScheduledRides/offerScheduledRide, generic startAssignment/markNoDriver, request-reassignment, driver self-cancel, rider status/cancel, advance capture/refund effects and notifications; dispatch internal job/timer.
3. **Database:** guarded explicit missed/failed outcome and terminal advance disposition; capacity/offers/hold resolution in same transaction. Final no_driver means no cancellation fee or driver-caused strike. A missed pickup detected before a chosen terminal grace can instead be placed in review/escalation.
4. **Migration:** reuse no_driver only if its contract fits; if adding replacement/missed state, update enum/API/types/active/shareable/cancellable lists and historical queries. No unconditional conversion of all confirmed bookings.
5. **Webhooks:** late advance capture on terminal failure must refund rather than confirm; refund identity/retry uses F-05; no commission completion after failure.
6. **Jobs:** include past-due confirmed bookings in monitoring; choose terminal grace/replacement deadline under B-02 before automatic cancellation. Verify scheduler vs interval mode and retry/restart, not just method unit tests.
7. **Frontend:** failed/replacement states, notices and customer choice displayed in website/WhatsApp/driver; stop offering obsolete booking; no endless confirmed poll.
8. **Existing tests:** scheduledScenario, internalJobs, criticalRideTransactions, scheduledCustomerPayments, driverDelay.
9. **Regression tests:** no eligible driver/all rejected/past pickup, driver cancellation after pickup, feasible late replacement vs nofill, late capture, job overlap/crash, cancel/reassign race, no driver hold orphan, no driver-caused sanction for platform absence.
10. **History:** surface already-past unfilled confirmed bookings for auditable review/refund; confirm real paid/refunded totals first. Automatic terminal deadline for historical rides needs explicit owner policy.

F-08 — Add regression assertions and reconcile rendered policy sources (RCS-10/17/18/24; S-09/27/34/35)

1. **Blast radius:** all eight documents, English/Hindi/Hindi-Latin, draft PDF generator, rider/driver external legal links and payment copy.
2. **All callers:** `LegalPage` localized-over-source selection, `legalDocs`, all three legal JSON payloads, `tools/generate-legal-review-pdf.mjs`, driver Legal/signup web links and website signup/cancellation/payment components.
3. **Database:** none for correcting factual draft descriptions; final acceptance/version records belong to L-01/B-05.
4. **Migration:** none for copy; do not hand-edit generated theme/style assets or change product state under a copy fix.
5. **Webhooks:** describe actual platform cash/UPI/advance/refund states but no handler changes in this proposal.
6. **Jobs:** disclose real dispatch/failed-pickup gaps; no promise of automatic remedy before F-07 and legal decision.
7. **Frontend:** one reviewed content source/translation process; server monetary values stay authoritative. DRAFT remains true until owner/counsel sign-off; remove developer implementation instructions from public draft banner only as part of final publication decision.
8. **Existing tests:** translation/content shape tests; no rendered drift test found.
9. **Regression tests:** each language renders eight correct documents; current 10 advance/capped fee/actual cancel states/no raw-count fine; RideNow cash+platformUPI, auto-share, scheduled hold vs advance; visual/readability review at publication.
10. **History:** archive old versions/date/hash; no rewriting historic consent or silently treating drafts as accepted agreements. Confirm `(1)` PDF identity before final policy comparison/replacement.

## Requires business decision

| Proposal | Owner decision required | Blast radius and callers | DB / migration | Webhooks / jobs | Frontend assumptions | Existing tests and required regression | Historical effect |
|---|---|---|---|---|---|---|---|
| B-01 Discounts/loyalty/net base RCS-19/30 | Does ₹800 mean post-coupon driving fare? Are earned free rides an exception to 10%? How does compensation change base/net display? | commissionOn, creation, solo completion repricing, loyalty, recoverable earnings, driverFinance/summary/UI | Booking rate/base/version; free rewards/comp allocations/ledger; migration if versioning | Final capture/recovery/payout/coupon issuance must use same base; no tax redesign | Gross fare/driver share/extras/commission/recovery/net separate | walletMoney/loyalty/payment view; add coupon799/800 crossing, reward consumption, compensation+liability, sharing | No silent reward forfeiture/rebill; open booking rate decision explicit |
| B-02 Short notice/replacement deadline RCS-05/06/23 | Minimum feasible ETA buffer, freshness, turnaround, commitment intervals, failure deadline/grace and customer choice | creation 30-minute guard, scheduled sweep, offers, claim, driverDelay, reassignment/pooling | Feasibility/versioned commitment snapshot/assignment identity; indexes/lock ordering may need migration | Dispatch/replacement timer; late capture terminal refund; no-fault consequence gate | Reject infeasible offer with reason, failed/replacement status and refund notice | scheduledScenario/driverDelay/pooling;30km 10min, overlap, stale location, feasible back-to-back, post-deadline retries | Don't penalize old impossible assignments; reviewed missed bookings/refunds |
| B-03 Advance/payout/hold/fees RCS-07/19/20/28 | Keep 10% new customer advance or choose 15%; scheduled driver hold purpose/amount; payout cycle/minimum/debt handling; provider fee bearer | scheduledPaymentAmounts, booking intents, acceptance holds, settlement, driverPayouts/finance | Versioned obligations; Payment/hold/payout/fee fields; migration only if semantics require | Verify order/capture/refund/payout states, gateway fee availability; payout jobs/operations | Advance vs fee vs hold vs net payout; never label all as deposit | scheduledCustomerPayments/wallet/payout tests;15% historic → capped fee, payout refund/reversal | Record original amount; changing future policy never resizes captured advance/held funds silently |
| B-04 Active work expiry/safety handoff RCS-04 | Supported response for already assigned/en-route/started ride when paperwork invalid; allowed support terminal action/refund/replacement | resolveDriver/assigned work/state change, document recompute, support/admin assignment | Explicit emergency/support resolution evidence; capacity/hold/payment invariants; optional state/audit migration | Expiry sweep must not strand; late capture/refund after support resolution | Accessible support reason/action for rider and driver; do not merely bypass eligibility | documentPolicy+geofence; expiry during each state, support handoff, settlement/capacity cleanup | Review stranded old rides; don't retrospectively blame driver for platform lockout |
| B-05 Grievance operating model/finance disputes RCS-11/12/16 | Named officer/coverage/hours, manual vs digital case queue, staffing/admin console, review authority/refund authority, usable appeals | Complaint/intake/appeal/notice/review APIs, Help/contact, AdminDashboard/DriverReview; distinguish general tickets from responsibility | Case/status/evidence/response/actor/notice/appeal records; migration for broader queue, not raw-count executor | Notice delivery/window and finalized consequence jobs; verified refund separate from future concession | ID/ack/status/evidence/response/escalation and private case ownership | Complaint/lifecycle tests; duplicate report, evidence update, serious safety triage, response/appeal, incorrect fine reversal | Import old complaints as alleged facts; no automatic sanction/backfilled legal deadlines |

Each business proposal requires the stated decision before dependent production edits. All callers are runtime families, not permission to rewrite unrelated modules; implementation must re-run scoped call-site searches because this tree is actively changing.

## Requires lawyer confirmation

| Proposal | Exact confirmation requested | Code/DB/API/UI blast radius and callers | Migration / webhook / job implications | Tests and historical implications |
|---|---|---|---|---|
| L-01 Legal identity/licence/contracts/minors RCS-22 | Which entity operates RCS, what UP licence/conditions apply to this small mixed-ownership fleet, final partner agreement/acceptance evidence, minimum age/guardian/third-party booking rules and effective notices? | All eight policies/PDF/translations/signup/auth/user DOB/booking/WhatsApp; consent/version/entity schema if required | Add immutable accepted-version records only after the chosen process; provider customer identity/notification scope reviewed; no auth bypass | Auth/signup/legal rendering tests, minors/guardian cases; no fabricated historic consent/licence proof |
| L-02 Ownership parity RCS-09 | Can owner/admin/RCS-only queues/15–45min holds operate under final UP rules, and which neutral ETA/fairness/class criteria are permitted? | ownerDriver/group mapping, rankCandidates, eligibleGroup, scheduled offers, generic/replacement/pool dispatch, driver group/UI | Versioned dispatch rules/offer audits if changed; scheduler fairness state; no payment webhook semantics unless hold assignment changes | Same ETA owner/partner, farther owner/nearer partner, empty group/withdrawn offer, deadline; no retroactive reallocation |
| L-03 Vehicle/driver eligibility and active work RCS-14/04 | For actual vehicles/routes, which permits/PUC/CNG/licence/RC/insurance/fitness/tax/background/medical/induction/VAHAN/SARATHI checks and issuer methods are required; expiry day/time and active-trip emergency response? | constants/enum/upload/scan/admin review/expiry/vehicle fuel/online/claim/status/driver checklist | Applicability/training/verification history model/migration; expiry/reminder jobs; privacy/storage retention impacts; no invented API verification | Actual applicability, expire/renew/parked car/active car/active work tests; staged old driver reverify, no fabricated compliance |
| L-04 Privacy/retention/sharing RCS-13/15/24 | Lawful purposes, exact category periods/holds/backups/processor disclosures, access/deletion exceptions/minors, Android background notice, auto-share permission wording and recipient scope? | Location/native permissions/read ACL/share/notification/docs/archive/self-delete/export/grievance and policies | Retention/hold/request audit fields/job; processor contracts outside code; purge must respect payment/dispute evidence and provider hooks | Native shutdown, ACL/terminal tracking, purge after hold, request response; no broad historic deletion before approval |
| L-05 Rider cancellation framework RCS-07/08/19 | Does fare for cap mean gross/driving/post-discount/tax-inclusive? Which valid reasons/proximity/arrival conditions apply; next-booking recovery/concession/carry-forward and failed pickup vs ordinary driver cancellation amounts, causality/notice/refund obligations? | cancellation quote/evidence/driverDelay/incident producer/reassignment/final consequence/compensation/recovery/booking price/UI/policies | Versioned incident/final decision/concession allocations; scheduled failure/refund and capture webhooks; no automatic liability from assignment |2000/300cancel, valid waivers,10min unknown/platform/customer/external, next-booking amount/redemption/expiry; no retrospective penalties |
| L-06 Complaints/safety sanctions/appeals RCS-11/12/25 | What validation/evidence/notice/driver response/admin review standard, serious safety temporary action, thresholds/reinstatement/reversal/termination/appeal and escalation deadlines apply? | complaint/review/notice/appeal/reliability/suspension/admin console/support/policies | Moderation/actor/evidence/version schema; delivery-backed windows/finalization/reliability/financial jobs; refund reversal if approved | Five unverified reports must not punish; upheld/rejected/uncertain, delivery failure, appeal late/owned/unrelated, reversal; old fine review separate |
| L-07 UP↔Delhi and grievance escalation RCS-21/16 | What authorises Delhi-origin bookings and UP→Delhi service separately, which permit coverage/jurisdiction/geofence is required, applicable transport authority and confirmed grievance/privacy/refund timelines? | fare/coordinatebooking/WhatsApp/permit service area/dispatch and grievance pages | Jurisdiction/applicability snapshot/migration; quote/booking/driver eligibility enforced the same way; job/late payment cancellation/refund coherence | Both direction boundary routes, permit class mismatch, no blanket UP licence assumption; old rides retain original route/paid records |
| L-08 Partner relationship control analysis G | Given actual fare/availability/hold/accepted ride/route/vehicle/location/rewards/sanction controls and real off-platform practices, what agreement/operational changes are necessary without asserting employment status here? | Full audit FOR LEGAL SIGN-OFF inventory; code absence of salary/shift/exclusivity cannot prove real practices | Any chosen rules versioned and properly consented; no new payroll/exclusivity controls invented; payouts/reliability jobs affected if rules change | Tests cover chosen operational rules only; review existing contracts and commitments without retrospective classification |

All legal proposals include policy/operational review before code. Exact deadlines are **LEGAL TIMELINE TO CONFIRM**. Central guidelines, a portal UI, comments, or mocked tests are not a substitute for confirming applicable final UP/Delhi requirements.

## Requires CA/tax professional

T-01 — Tax and accounting specification before implementation (RCS-20; S-37)

1. **Decisions:** applicable GST/Section 9(5), commission GST, tax-inclusive/exclusive fare, pass-throughs/safe-route/cancellation/hold/compensation treatment; TDS/194-O or applicable successor/current provision, direct cash/UPI scope/exemptions/identity thresholds and aggregation; provider fee+GST bearer, invoice/credit note and payout/recovery/refund timing/rounding/returns.
2. **Blast radius/all callers:** fareQuote/ridePricing/bookingCreation/commission/rideSettlement, customer final cash/UPI, scheduled advance/refunds, responsibility compensation/liability/recovery, wallet, driverFinance/driverPayouts/RazorpayX reconciliation, statement/export/policy/UI amount lines.
3. **Database:** approved tax identity/registration/base/rate/version/withholding/provider fee/invoice/credit note/settlement fields and immutable line-level accounting; choose model before migration.
4. **Migration:** do not infer PAN/GST/eligibility or backfill fake tax invoices; compatibility for historical tax-unknown bookings and opening ledger balances.
5. **Webhooks:** order amount/currency authoritative with tax snapshot; invoice after correct event, refund credit notes/withholding reversals, payout/provider fee reconciliation; repeated/out-of-order events remain idempotent.
6. **Jobs:** financial period/threshold reconciliation/returns only after CA specification; existing monthly coupon/finalization/payout rules must conserve net/gross amounts.
7. **Frontend:** tax invoice vs provider payment receipt, fare inclusive/exclusive, commission GST/TDS/net payout labels; no frontend-only tax arithmetic.
8. **Existing tests:** walletMoney/financialInvariants/payment/refund/payout suites prove existing non-tax ledger only.
9. **Regression:** 799/800/801 with tax/add-ons/coupons/rewards; direct customer-to-driver cash; tax identity threshold crossing; advance/final cash/UPI; partial/full refund; compensation/recovery/fee/payout reversal; invoice idempotency and credit note conservation.
10. **History:** CA-approved reconciliation/filing/corrections plan for old direct cash/online commissions/refunds; preserve raw records, no retrospective tax deduction by inference.

## Recommended execution order

1. Freeze/document the audited snapshot and confirm PDF version. Resolve critical commercial choices needed for rate boundary and hold ownership; obtain parallel legal/CA decisions rather than blocking unrelated technical bug work.
2. Fix F-02 claim bypass and F-03 hold ownership with isolated database transaction/race/invariant tests, then F-04 expiry checks and explicit active-work resolution. These prevent wrong assignment/money owners before more automation is enabled.
3. Fix F-01 ordinary commission prospectively with open/historic rate policy and loyalty/discount decisions recorded.
4. Fix F-05 refund state identity/order, then F-07 scheduled missed/no-driver monitoring/refund and B-02 neutral acceptance/replacement feasibility. Do not automate punitive failed-pickup outcomes until causality and legal amounts are settled.
5. Fix F-06 headless shutdown, then the approved retention/permission/share disclosures and eligibility additions. Verify Android/device behaviour.
6. Build B-05 usable reviewed complaint/support/appeal/admin workflows under L-06/L-07; verify acknowledgement/delivery/window/response and auditable reversal.
7. Implement lawyer-confirmed ownership/interstate/licence/contract/privacy rules and CA-confirmed tax/invoice/settlement design. Verify applied migrations, scheduler modes/jobs, sandbox provider behaviour and anonymized historical aggregates.
8. Reconcile every rendered locale and reviewed PDF through F-08, validate end-to-end customer/driver/admin scenarios, obtain owner/lawyer/CA sign-off, and only then publish final policies or deploy approved changes. Keep evidence of versions and approvals.

No production changes are proposed as completed. Before executing any item, recheck all callers and dirty-tree changes, compare approved behaviour to the traceability row, then run the relevant isolated tests and surface validation. Production deployment/financial corrections remain distinct from code approval.
