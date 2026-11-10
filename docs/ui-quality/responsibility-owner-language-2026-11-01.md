# Responsibility review — plain language for service owners

1 November 2026 IST. The existing two-column layout, RCS colors, Mori typography, badges and compact actions are retained.

- Ride details shows the booking and issue. Record version and verification code remain inside Case details.
- Ride history & decisions uses What happened and Past decisions tabs. Initial decision, Saved review and Final decision describe the stages in plain language.
- AI suggestion remains a separate section and clearly explains that a suggestion is not a final decision.
- Your decision uses Decision, Cause of the issue, Action level and Reason for your decision. Options include Hold driver responsible and Take no action.
- Technical labels are translated for display: Actor becomes Who was involved, classification becomes Cause of the issue, and derived records become From other records.
- Jump to links move to Ride details, Ride history, AI suggestion and Your decision, including keyboard focus. Draft input is preserved.
- Exact IDs, free text, AI responses and original JSON remain available. Date conversion, precision, review rules, API enum values and payload construction are unchanged. Level 1/2 retain their existing policy meanings; no new penalty definition is introduced.

Verification: website build; 87 frontend tests; 10 synthetic browser workflow scenarios; 12 viewport/theme combinations from 320–1920px; four accessibility audits with zero violations; enlarged text and long selected options. Evidence and source identities: `output/handoff/responsibility-owner-language-2026-11-01/verification.json`.

[Light preview](http://127.0.0.1:1575/dashboard/responsibility?case=synthetic-timeline&fieldReview=review&workspace=1&theme=light) · [Dark preview](http://127.0.0.1:1575/dashboard/responsibility?case=synthetic-timeline&fieldReview=review&workspace=1&theme=dark)
