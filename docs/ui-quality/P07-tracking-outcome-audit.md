# P07 — tracking and outcome audit

29 October 2026 IST. **APPROVAL_REQUIRED. Audit complete within the stated fixture scope; product fixes NOT_CHANGED.**

Approved prompt: [handoff document](https://docs.google.com/document/d/1mfFSj9kbob7mAE5CuUW9aR1LBnoHjVS0vb6w91KvzJ8). [Drive evidence folder](https://drive.google.com/drive/folders/1qP4Ig18YTCtjqNGqbXWoSPbrEoTW30lz). Local raw evidence: `output/handoff/P07-2026-10-29/`. This is P07, separate from the earlier unnumbered consistency work.

| ID | Finding | Severity | Evidence |
|---|---|---|---|
| P07-B02-01 | Partial refund status stops refreshing | MEDIUM | functional.json (twice) |
| P07-B02-02 | Failed settlement confirmation has no visible feedback | HIGH | functional.json (twice) |
| P07-B02-03 | Recovered update notice leaves an invisible Tab stop | MEDIUM | transitions.json (twice) |
| P07-B02-04 | Large text puts Contact support under the receipt | MEDIUM | large-text-support.json (twice) |

## Journey/state coverage

| Source-backed state family | Exercised fixture | Result / boundary |
|---|---|---|
| Initial loading | delayed status GET | Loading ride status and skeleton observed; later response intentionally not awaited in that one capture |
| Assigned / arrival / underway | assigned, en_route, reached, started | Actual headings, driver/contact controls, OTP and status-dependent copy observed; contact intents intercepted |
| Unassigned / scheduled | searching(pending), confirmed | Actual searching/confirmed branch observed; no driver allocation or dispatch |
| Advance needed / missing financial fields | advance, payment-missing | Amount/capability follows response; no advance order/provider success; denied local order shows failure |
| Completed / remaining amount | completed, completed-scheduled | Receipt and payment choices visible; response-controlled amounts only |
| Cash-only / paid methods | cash-only, cash-paid, upi-paid | Capability omitted/false fails closed for UPI; paid state has status feedback and removes pay controls |
| Cancelled without advance | cancel-no-advance | Ride ended, no active assignment; no fabricated refund card |
| Refund dispositions | refund-pending, partial-refund-pending, refunded, partial-refunded, retained | Pending vs processed text distinct. Partial pending stops polling: issue01; manual refresh recovers |
| No driver | no-driver | Actual source branch observed; no dispatch promise inferred |
| Initial API failure / denial | failure503, denied404 | Actual failure presentation; initial failure→retry→assigned tested2×; denial does not retain old ride |
| Stale update / recovery | existing data→503→started | Existing state retained with notice; success clears visual notice, but hidden Dismiss remains tabbable: issue03 |
| Concurrent response order | delayed older assigned vs newer started | Newer started state retained in selected ordering2×; not exhaustive concurrency proof |
| Duplicate activation | native double click on cash choice | One local409 attempt while busy2×; no idempotency claim for a later deliberate retry/provider |
| Amount/method/duplicate updates | completed→changed amount→paid method→repeat | UI follows authoritative synthetic read and duplicate presentation is stable; no financial validation |
| Navigation | distinct synthetic IDs, Back/Forward/reload, denial | Repeated2×; old state does not leak across tested IDs; RideDetails opens and closes at390/1440 |
| No-ID/no-status empty branch | source TrackingPage:989 | NOT_RUN through real /booking/:id: route requires an ID. Not invented as reachable customer journey |
| Cancellation confirmation / provider / external share | source-traced only where applicable | Writes/real external dialogs NOT_RUN; exact native back/gesture/keyboard behavior not certified |

## Reproducible findings and owner choices

### P07-B02-01 — Partial refund status stops refreshing

**MEDIUM; FUNCTIONAL; reproduced2×.** A supported partial_refund_pending result stops automatic polling. Full refund_pending continues and observes the processed state. Manual refresh recovers the partial result. No ledger or provider result is inferred.

Source: frontend/src/lib/paymentUi.js:34; frontend/src/lib/trackingPoll.js:4; frontend/src/pages/TrackingPage.jsx:439. [Actual/reference board](http://127.0.0.1:4317/p07?issue=P07-B02-01&width=390).

1. Open the partial-refund fixture
2. Wait 7 seconds: it still says Partial refund pending
3. Compare full refund pending, which updates after its next poll
4. Refresh payment status manually to observe the queued processed fixture

Expected: Every supported pending disposition continues refreshing until processed or an explicit manual-refresh policy is communicated.

Impact: Riders can miss a processed partial refund until manually refreshing.

- A: include the already-supported partial pending state in the refresh predicate; retain backoff and stop on processed state.
- B: keep the current manual-refresh behavior and approve explicit copy for it.

Selector: `[data-testid="cancelled-booking"]`. For04 choose1440px and200% text; a generic button selector is not an automated fix locator. All fixes remain NOT_CHANGED; recommended A is a proposal, not approval.

### P07-B02-02 — Failed settlement confirmation has no visible feedback

**HIGH; FUNCTIONAL_USABILITY; reproduced2×.** Click Pay with cash in this fixture. Its write is deliberately denied. The buttons become enabled again without an alert, failure explanation or status-recovery action; the advance-payment component has an explicit failure presentation. The denial is a fixture condition, not evidence of a real payment failure.

Source: frontend/src/pages/TrackingPage.jsx:828-868; frontend/src/components/RideSettlementPanel.jsx:7. [Actual/reference board](http://127.0.0.1:4317/p07?issue=P07-B02-02&width=390).

1. Open completed ride
2. Click Pay with cash: the local fixture returns a denied request
3. Observe the temporary disabled state then unchanged payment choices
4. Compare the actual advance component in its failed state

Expected: A denied attempt visibly explains what happened and offers a safe recovery without claiming money was collected.

Impact: Riders cannot distinguish a denied settlement attempt from an ignored click and may retry without useful guidance.

- A: retain UPI/cash choices, add an announced failure and safe status refresh; approve final wording without claiming payment collection.
- B: adapt the existing failure-card presentation and give an explicit way back to method choices.

Selector: `button[data-size="action"]`. For04 choose1440px and200% text; a generic button selector is not an automated fix locator. All fixes remain NOT_CHANGED; recommended A is a proposal, not approval.

### P07-B02-03 — Recovered update notice leaves an invisible Tab stop

**MEDIUM; ACCESSIBILITY; reproduced2×.** After a stale read recovers, the old notice has opacity 0 but remains mounted. Its Dismiss button still receives keyboard Tab focus. The shared notice is used outside tracking too; any shared fix needs that cascade reviewed.

Source: frontend/src/components/ui/RefreshNotice.jsx:50-98. [Actual/reference board](http://127.0.0.1:4317/p07?issue=P07-B02-03&width=390).

1. Open and wait for two 5-second poll cycles
2. The middle fixture read fails; the next succeeds
3. The notice disappears visually
4. Use Tab to reach its invisible Dismiss control; Locate marks its actual bounds

Expected: A visually removed notice leaves no invisible keyboard focus target.

Impact: Tab users lose their visible location in the page after recovery.

- A: preserve the exit animation, remove the hidden notice afterwards and restore focus if it held focus.
- B: retain mounting but remove hidden descendants from focus/accessibility while leaving visible notices usable.

Selector: `[role="status"] button[aria-label="Dismiss"]`. For04 choose1440px and200% text; a generic button selector is not an automated fix locator. All fixes remain NOT_CHANGED; recommended A is a proposal, not approval.

### P07-B02-04 — Large text puts Contact support under the receipt

**MEDIUM; RESPONSIVE; reproduced2×.** At 1440px with 200% root text, the completed-ride support notice extends into the receipt column. The receipt intercepts the Contact support click. This was reproduced twice; it is separate from the already-fixed account backdrop issue.

Source: frontend/src/pages/TrackingPage.jsx:655-670,1344-1429. [Actual/reference board](http://127.0.0.1:4317/p07?issue=P07-B02-04&width=1440).

1. Choose Laptop 1440px
2. The observed example applies 200% text; the reference uses normal text
3. In the completed ride, inspect Contact support in the left column
4. Its centre is covered by the receipt; the normal-text control remains usable

Expected: Enlarged text preserves the support action’s click target and the receipt’s readable order.

Impact: Users with enlarged text cannot activate this support action by pointer at the reproduced size.

- A: constrain/wrap the existing support row without changing its copy or action.
- B: approve an adaptive stacked terminal layout at enlarged text sizes, preserving receipt and action order.

Selector: `button`. For04 choose1440px and200% text; a generic button selector is not an automated fix locator. All fixes remain NOT_CHANGED; recommended A is a proposal, not approval.

## Customer comprehension

Ride vs payment states are distinct: Ride completed can still show Total due; paid methods say received only from a supplied paid state. Advance wording says it is part of the fare. Cancellation pending copy says processed is not yet confirmed, while processed/retained outcomes have separate explanations. These are presentation observations, not proof of payment/refund execution. Main action comprehension breaks at denied settlement feedback (02) and delayed partial-refund freshness (01). Receipt labels remain source-defined; no fare, refund policy, legal promise or copy rewrite is approved. Hindi/Hinglish is mixed where existing payment copy has no translation; this is an observed localization limitation, not a newly approved rewrite.

Item 03 Account backdrop repair remains accepted and unchanged. Item 12 remains OWNER_VISUAL_REVIEW_PENDING / ON HOLD at the owner’s request; no choice or standard is inferred. P03 Home/Outstation KEEP CURRENT, P04 native results, P06 fixes and approved input/button/focus/spacing choices are preserved. No P08, Android, provider operation, commit, push, merge or deployment.
