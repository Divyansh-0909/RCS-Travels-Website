# Responsibility evidence and decision timelines

30 October 2026. Owner requested simpler Evidence & decisions, clearer dates, shadcn components, and timelines for suitable records. This extends the [dashboard redesign](responsibility-redesign-2026-10-29.md) and preserves the [motion work](responsibility-motion-2026-10-30.md).

## Presentation

- Three tabs: **Evidence**, **AI assessment**, **Decisions**. Evidence summary and assessment details open by default; Decisions opens the most authoritative available decision.
- Ride events, evidence versions, and assessment history use ordered timelines with shadcn cards. Each event shows its name, observed time, key facts and source. Extra event metadata uses a shadcn Collapsible.
- Decisions use a connected sequence of provisional decision, human review, appeals and final decision. Unrecorded stages say **Not recorded**; an existing record without a timestamp says **Time not recorded**. The sequence represents lifecycle stages rather than inferred chronological sorting.
- Decision headers prefer the actual evaluation, decision, submission, review or finalization time over database creation time. Appeal submission/review timestamps remain associated with their own records.
- Dates use **29 Oct 2026 · 10:00:00 AM IST**, with an explicit India/UTC+05:30 legend. Source fractional precision is retained. Calendar-only dates remain on their recorded date. Invalid dates and clocks without a timezone remain unchanged and receive an explanatory note.
- Original JSON remains available in each **Original record** disclosure. Closing it unmounts the hidden content. The readable records use page scrolling; only original JSON has a bounded scroll area.

The shadcn **4.23.0** CLI generated the added Collapsible component. Existing shadcn Tabs, Accordion, Card, Badge and Button components retain RCS semantic colors and typography. No package, lockfile, shared token, generated theme or motion configuration changed.

## Review locally

- [Evidence timeline, light](http://127.0.0.1:1575/dashboard/responsibility?case=synthetic-timeline&fieldReview=review&workspace=1&theme=light)
- [Evidence timeline, dark](http://127.0.0.1:1575/dashboard/responsibility?case=synthetic-timeline&fieldReview=review&workspace=1&theme=dark)
- [Final decision](http://127.0.0.1:1575/dashboard/responsibility?case=synthetic-final&fieldReview=review&workspace=1&theme=light)
- [Appeal](http://127.0.0.1:1575/dashboard/responsibility?case=synthetic-appeal&fieldReview=review&workspace=1&theme=dark)

Review the timeline scan order, readable date/time, expandable event details, decision-stage labels and both themes. These links use synthetic local records with saves disabled; workflow tests substitute local responses to check review and appeal behavior.

## Verification and preservation

Selected results and screenshots are recorded in `output/handoff/responsibility-records-2026-10-30/verification.json`. Browser checks cover timeline ordering, exact original data, keyboard disclosures, fixed India time from a browser configured for Los Angeles, missing/finalized states, text enlargement, overflow and model/shadow separation.

The canonical inventory retains **355 stable IDs** and all previous audit/owner statuses. Only three Responsibility page source lines are rebound. Of **329** pre-task recorded inputs, **323** remain identical; six expected changes are the page, record renderer, form tab-reference copy, synthetic fixture, coverage CSV and registry. HEAD and staging index remain unchanged. New presentation helpers, tests and the generated Collapsible are additive.

This is synthetic browser verification, including mobile viewports, rather than a physical-device or live database/provider acceptance result. Backend policy, review authority, API behavior and the model-shadow selection helper remain unchanged. The shared WebSocket remains owner-deferred.

31 October follow-up: [timeline layout correction](responsibility-timeline-fix-2026-10-31.md) fixes dot/heading alignment, disconnected final markers, final-stage line overshoot and narrow label/value wrapping. Its screenshots and geometric browser checks are additive; the earlier evidence remains preserved.

31 October color follow-up: the default dark-mode tab bar now uses the existing strong surface token for its track and an inverse ink/surface pair for its solid selected tab. The approved light-mode baseline screenshot is pixel-identical. Selection, hover and keyboard focus pass in 12 mobile/desktop configurations across Chromium, Firefox and WebKit; minimum measured label contrast is 6.18:1. Website build and four scoped tab accessibility audits pass. Evidence: `output/handoff/responsibility-tab-colors-2026-10-31/`.

31 October owner-approved broader redesign: [Unslop dashboard pass](responsibility-unslop-2026-10-31.md), retaining the RCS colors and Mori font. The case summary, evidence presentation and review-panel layout are reorganized; earlier reports remain historical evidence at their own source identities.
