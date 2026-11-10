# Responsibility review — summary panels and full-record dialogs

1 November 2026 IST. Follows the owner's [shadcn Plan reference](https://ui.shadcn.com/docs/ai-elements/base/plan), using the official Trace and Dialog patterns with the project's existing Radix primitives, RCS tokens and Mori typography.

- The overview spans the first full row. Evidence, AI assessment and Decisions occupy three matching panels beneath it on desktop and stack on smaller screens. The decision form remains full width below them.
- Each panel contains expandable Trace groups with bright headings, muted summaries and the reference's vertical guide. Dark-mode headings are white; light mode uses the corresponding readable ink color.
- Separate View full buttons open scrollable dialogs containing all ten existing record groups, including exact original JSON. Close, Escape and backdrop dismissal restore focus to the opener. The review draft survives reading and closing dialogs.
- Summaries distinguish missing, empty, incomplete, failed and passed records. A saved record is not treated as a successful check. Legacy shadow records never borrow production analysis, and case state alone does not invent a final-decision record.
- Review form, payload/date/model helpers and case loading/action hooks retain their preceding byte identities. No dependencies, API permissions or business rules changed.

Validation: website build; **96 frontend tests**; **10 synthetic browser workflows**; **20 browser/viewport/theme configurations** across Chromium, Firefox and WebKit; and four final Chromium configurations after adding the blank-text fallback guard. The selected final run checks enlarged text, exact available JSON across all ten record groups, modal scrolling, focus containment/restoration and draft preservation. Eight final automated accessibility audits report zero violations; manual checks remain outside those automated results.

Evidence, source hashes, registry snapshots and preservation details: `output/handoff/responsibility-summary-panels-2026-11-01/verification.json`.

[Dark preview](http://127.0.0.1:1575/dashboard/responsibility?case=synthetic-timeline&fieldReview=review&workspace=1&theme=dark) · [Light preview](http://127.0.0.1:1575/dashboard/responsibility?case=synthetic-timeline&fieldReview=review&workspace=1&theme=light)
