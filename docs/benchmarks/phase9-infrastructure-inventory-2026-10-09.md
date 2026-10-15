# Phase 9A — existing infrastructure and integration inventory

Date: 9 October 2026. **Phase 9A: COMPLETE** for the requested infrastructure inventory. Current uncommitted code is included. [Owner roadmap disposition](../audits/phase82-owner-retirement-2026-10-09.md): historical Phase 8.2 retired; R82-01 is not an active blocker. Phase 8 COMPLETE for its defined verified scope.

Later same-day continuation: [replacement and financial checkpoint](phase9-financial-lifecycle-checkpoint-2026-10-09.md) closes independent reservation ownership and the supported refund/terminal settlement slice. The original inventory and gap list below retain their first-slice findings; consult the newer checkpoint for current remaining work.

| Surface / boundary | Actual application path reused or mapped | Simulator status |
| --- | --- | --- |
| Customer booking | frontend/src/api/api.js → backend/routes/bookings.js → services/bookingCreation.js; WhatsApp also calls createBookingFromQuote | Real creation service and compensation reservation boundary; synthetic verified quote. Clerk/browser/WhatsApp journeys pending 9C. |
| Customer advance | bookingCreation → scheduledPayments → paymentIntents → payments.createOrderForPayment | Real advance intent/order and integer-paise fields; existing Razorpay fake. |
| Payment webhook | backend/index.js raw-body route → routes/payments.js → payments → razorpayWebhook → scheduledPayments | Same exported HTTP handler factory and HMAC verification; real loopback HTTP, fake signed provider events. |
| Assignment worker | assignScheduledRides.sweepScheduledRides → scheduledOffers.offerScheduledRide → dispatch priority / driverNewWorkEligibility | Actual worker with injected DB/clock and notification sinks; retries and persisted offers exercised. |
| Driver acceptance | driver-app API → protected driver route → claimBookingForDriver → applyScheduledOfferAcceptance | Shared real transaction, durable reliability check, capacity CAS, live wallet check, offer CAS and withdrawal. Clerk/vehicle/pooling route preflight remains 9C. |
| Cancellation / replacement | protected driver route → driverRideCancellation → driverCapacity / driverCancellations | Actual transaction and collector; stale-owner, duplicate/cancellation races tested. Full replacement hold lifecycle remains missing. |
| Customer cancellation | bookings route → customerCancellation / refundScheduledCancellationAdvance | Transaction/capacity race exercised; complete cancellation charge/refund-provider lifecycle not yet composed. |
| Evidence collectors | driverCancellations → responsibilityEvidence journal; locationProvenance, notificationProvenance, routeProvenance | Actual cancellation journal reused. Device GPS, delivery callbacks and route-history helpers exist; not yet joined into the entire lifecycle slice. |
| Frozen analyst and guard | responsibilityJevV5 → evidenceCriteriaV5; responsibilityAnalyst validation → responsibilityPolicyGate / responsibilityEvidenceSafety | Original V5 adapter/questions/options and independent gate unchanged; offline synthetic transport, no live model calls or benchmark rows. |
| Durable shadow worker | responsibilityShadowRepository / responsibilityShadowAdjudication, leases, backoff, versioned evidence/results | Actual repository/sweep in owned DB; timeout retry, crash lease recovery and completed-work idempotency. |
| Admin / appeals | protected responsibilityAdmin routes → review/appeal/notice/finalization services; own-driver appeal route | Mapped existing services and auth; no admin authority/notice/appeal clock executed by the shadow slice. UI/human evaluation pending 9C/9D. |
| Financial / reliability effects | responsibilityConsequences, financial consequences/policy/math/recovery, reliability consequences | Existing implementation retained. Simulator forbids operative writes and verifies zero authority/effects; no financial/rule replacement built. |
| Clock / DB / provider fakes | tests/helpers/testClock, database, postgisEnvironment, scheduledScenario, razorpayFake, razorpayXFake, routing/notification/connectivity helpers, financialInvariants | Reused pinned disposable PostGIS, real migrations, actor factory, provider fake and invariant checks. No production URLs or customer data copied. |
| Job composition | backend/lib/jobs.js combined responsibility sweep invokes shadow, finalization, reliability and finance | Excluded from simulator; a shadow mode flag alone does not isolate this composed job. Dedicated production shadow execution/permissions remain 9D. |

## Integration gaps remaining after this inventory

1. Resolve the legacy scheduled deposit lifecycle across original/replacement drivers, refunds and settlement. The new acceptance guard rejects a foreign driver's existing hold rather than silently reusing it; no transfer/release policy was invented.
2. Compose complete customer cancellation/provider refund reconciliation and terminal ride settlement, not only partial advance/ledger conservation.
3. Add trustworthy creation points/evidence for the six other incident families. Zero-capacity tests currently prove no assignment; no missing production detector is fabricated.
4. Join actual route feasibility, device GPS, connectivity, notification delivery/reminders and deadlines into richer lifecycle scenarios. Current route promise is an explicit local fixture; confirmation wall-clock time is adopted once before controlled worker time.
5. Add authenticated customer/driver/admin HTTP and Playwright journeys, admin UI, human-review calibration, and production shadow permissions/activation/recovery evidence under 9C/9D. Production activation remains separately approval-gated.

The inventory locates working components and their real callers. It does not certify every product VM row or production rollout. The executable vertical slice is `npm --prefix backend run test:phase9`; the [Phase 9 checkpoint](phase9-vertical-slice-checkpoint-2026-10-09.md) records actual outcomes and source-bound artifacts.
