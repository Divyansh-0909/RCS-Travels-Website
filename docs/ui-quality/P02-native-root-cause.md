# P02 native root cause

AUTHOR: CODEX
PHASE: P02
DATE: 21 October 2026 (Asia/Kolkata)
EVIDENCE SNAPSHOT: 2026-10-21T12:55:35.152Z

Classification: native test timing and an insufficient expiry assertion; no consistently reproducible production error-state loss was found.

The original runner created a real synthetic scheduled offer before launching a fresh Maestro process. OfferPanel computes its 30-second floating-card lifetime from server-provided offeredAt (RideOffer.createdAt), not from the time Maestro reaches Accept. Starting instrumentation consumes that lifetime. In P01, the flow YAML was written at 07:33:05.224 UTC after offer creation. Therefore its card deadline was no later than 07:33:35.224 UTC, subject to device/host clock alignment. The 503 occurred at 07:33:33.941 UTC; Maestro did not begin checking the error until 07:33:36.936 UTC. The failure screenshot was captured still later. An absent floating card at that point does not prove its error was never rendered.

The unchanged P02 baseline checked the same error earlier and passed. Its screenshot shows the exact error and the still-actionable offer over the ordinary No ride scheduled page. That page describes assigned rides: the controlled gateway failed before assignment, so confirmed/unassigned plus wallet balance 1000 was correct. After panel dismissal, the pending scheduled offer remained in Notifications; its successful retry assigned the correct captain and retained exactly the 100 reservation (balance 900). The original full journey also passed cancellation and its existing guarded follow-up.

Causal path: fixture offer -> GET offers returns offeredAt -> OfferPanel remainingMs/timer -> Accept -> controlled PATCH 503 (before real acceptance) -> refreshOfferAcknowledgement refreshes offers and profile while preserving the failure -> OfferPanel displays failure.error -> timer dismisses only the floating panel -> Notifications retains server offer -> actual retry commits assignment once. Source references: driver-app/src/components/OfferPanel.tsx, driver-app/src/hooks/useOffers.tsx, driver-app/src/lib/offerAcknowledgement.ts, backend/tests/e2e/phase9Native.mjs and backend/tests/helpers/phase9NativeGateway.js.

The old expiry assertion waited for the hint 'Swipe away to hide, it stays in Notifications' to disappear. Rendering an error already removes that hint, so it was insufficient proof of timer expiry. The new flow first asserts the unchanged 503 text, captures it, then waits for that actual error to disappear before opening Notifications. A loopback-only, one-shot test-host rendezvous lets Maestro seed the real fixture offer after its driver is ready. It is not mounted in the app/proxy and does not replace acceptance, change the backend error, or extend a timer. Its failure fails setup and repeated calls cannot reseed.

| Run | Offer time / original YAML upper bound | Error assertion started UTC | Result |
|---|---|---|---|
| priorFailure | 2026-10-21T07:33:05.224Z (offer already created) | 2026-10-21T07:33:36.936Z | FAILED |
| unchangedBaseline | 2026-10-21T10:37:55.546Z (offer already created) | 2026-10-21T10:38:20.777Z | COMPLETED |
| light | 2026-10-21T12:52:32.668Z | 2026-10-21T12:52:43.293Z | COMPLETED |
| dark | 2026-10-21T12:45:11.223Z | 2026-10-21T12:45:22.560Z | COMPLETED |

The original P01 error's exact first-render instant was not captured; no claim is made that it was visible then. Current screenshots, passive response/offer snapshots, fixture event times, complete Maestro command timing and sanitized hierarchy evidence provide the new causal evidence. The production OfferPanel source hash is unchanged from the P02 start snapshot.
