# P07 — visual consistency audit

29 October 2026 IST. **APPROVAL_REQUIRED. Audit complete within the stated fixture scope; product fixes NOT_CHANGED.**

Approved prompt: [handoff document](https://docs.google.com/document/d/1mfFSj9kbob7mAE5CuUW9aR1LBnoHjVS0vb6w91KvzJ8). [Drive evidence folder](https://drive.google.com/drive/folders/1qP4Ig18YTCtjqNGqbXWoSPbrEoTW30lz). Local raw evidence: `output/handoff/P07-2026-10-29/`. This is P07, separate from the earlier unnumbered consistency work.

The comparison groups controls by semantic purpose. Matching every rectangle is not a standard. Existing approved tokens/primitives are the reference; no global palette, input, pill, theme or sizing change is proposed here.

| Family / scope IDs | Classification | Measurements / rationale | Decision |
|---|---|---|---|
| Primary actions: W.TRACKING +CustomerPaymentPanel +RideSettlementPanel +CancelledBookingPanel | CONSISTENT in sampled normal text | Existing Button/ActionControl: minimum48px, label16px/24px, radius12px, padding12px24px; wraps taller at narrow/large text | Preserve current approved sizing |
| Equivalent failed payment feedback: CustomerPaymentPanel vs RideSettlementPanel | CONFIRMED_INCONSISTENCY | Actual advance failure: heading, explanation, role=alert, retry. Settlement denied: unchanged choices, no alert, despite FAILED phase |02 A inline failure or B existing card; no aesthetic approval yet |
| Outcome cards: settlement paid vs cancellation refund | INTENTIONAL_VARIANT | Both muted surface/radius16; paid padding16; cancellation padding20. Pending refund differs from processed collection semantically | Keep distinction and source-defined promises |
| Receipt/amount rows: completed receipt vs advance breakdown | CONSISTENT hierarchy; confirmed responsive defect | Monetary rows are read-only; total emphasized, actions separate. Desktop200% text covers support link |04 wrap notice(A) or adaptive stack(B); no arithmetic edits |
| Icon controls, Share, Ride details, support | INTENTIONAL_VARIANT | Circular Back44px; primary actions48px minimum; compact top controls/support are contextual variants, not competing CTAs | Preserve unless specific future choice |
| Read feedback: skeleton, FailureState, RefreshNotice | CONSISTENT purposes; accessibility failure | Loader vs blocking initial failure vs nonblocking stale notice are different roles. Hidden recovered notice remains focusable |03 remove after exit(A) or inert hidden state(B) |
| Typography / hierarchy | CONSISTENT in normal samples | Mobile active title30px bold, supporting heading18px/24.75; terminal labels and receipt totals have separate emphasis. Enlarged receipt wrapping is captured rather than a new type scale | No type standard change |
| Whole-page themes / provider modal | UNVERIFIED | Legacy fixed tracking; provider checkout denied. Item12 is ON HOLD, not a P07 standard choice | No forced counterpart or provider-fidelity claim |

## Actual action measurements at390px / normal text

| State | Control | Height | Font / line | Radius | Padding | Text contrast |
|---|---|---|---|---|---|---|
| assigned | Call driver | 48px | 16px / 24px | 12px | 12px 24px | 4.68:1 |
| advance | Pay ₹90 | 48px | 16px / 24px | 12px | 12px 24px | 4.68:1 |
| completed | Pay with UPI | 48px | 16px / 24px | 12px | 12px 24px | 4.68:1 |
| completed | Pay with cash | 48px | 16px / 24px | 12px | 12px 24px | 19.59:1 |
| partial-refund-pending | Refresh payment status | 48px | 16px / 24px | 12px | 12px 24px | 4.68:1 |
| partial-refund-pending | Back to home | 48px | 16px / 24px | 12px | 12px 24px | 19.59:1 |

These are actual DOM measurements from the selected enabled initial state. Button fill is on its outer wrapper, so contrast composites the ancestor backgrounds. Motion/hover colors and disabled opacity are not certified by initial-state ratios. On320px a wrapping Call driver becomes72px high, preserving the shared minimum rather than clipping the label; large text expands further. No fabricated blanket fixed48px guarantee.

Source anchors: components/ui/Button.jsx:6,45; components/ui/IconButton.jsx; CustomerPaymentPanel.jsx:76; RideSettlementPanel.jsx:7–48; CancelledBookingPanel.jsx:8–20; TrackingPage.jsx:655–670,1344–1429; components/ui/RefreshNotice.jsx:50–98. Source ID and full bounds/style tuples are in measured-families.json and canonical rows. Safe paired occurrences are in the live board: actual settlement vs actual advance failure component; actual partial/full refund; hidden recovered vs assigned control;200% vs normal completed route. These are observed/reference states, not implementations of future choices.

The consistency inventory receives additive phaseAssessments.P07, keeping its existing families, catalogRevision, prior occurrences and owner choice history unchanged. Owner-approved-patterns.json and both choice registries remain byte-identical. Visual consistency is a separate tracker dimension; functional verification and owner aesthetic approval are not interchangeable.

Item 03 Account backdrop repair remains accepted and unchanged. Item 12 remains OWNER_VISUAL_REVIEW_PENDING / ON HOLD at the owner’s request; no choice or standard is inferred. P03 Home/Outstation KEEP CURRENT, P04 native results, P06 fixes and approved input/button/focus/spacing choices are preserved. No P08, Android, provider operation, commit, push, merge or deployment.
