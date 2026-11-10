# Responsibility review - shadcn decision fields

1 November 2026 IST. The Your decision form follows the linked [Input](https://ui.shadcn.com/docs/components/base/input), [Textarea](https://ui.shadcn.com/docs/components/base/textarea) and [Dropdown Menu](https://ui.shadcn.com/docs/components/base/dropdown-menu) components, adapted to the existing RCS colors and font.

- Decision, Cause of the issue and Action level now use the Base UI shadcn Dropdown Menu, added through the shadcn CLI. Radio items retain one selected choice, with a checkmark and a subtle selected background. This supersedes the intermediate Select-menu styling recorded in the same evidence directory.
- Choice triggers and the reason textarea share 8px corners, compact padding, adaptive colors, disabled/error states and a single primary focus border. The textarea grows up to 320px, can be resized vertically and retains its 3-2,000 character validation. The Case ID lookup retains its preceding appearance.
- Menu options use compact desktop sizing and 44px touch targets. Long labels wrap, menus remain within the viewport, and enlarged content can scroll. Hover feedback also works in WebKit. Keyboard focus uses the primary color without a second offset border around the field or popup.
- Accessible trigger names include both the field name and its current value. The Cause field remains disabled until a decision is chosen; changing Decision clears dependent choices. Validation, review/appeal gates, save payloads and error/draft behavior are preserved.

Validation: website build and **96 frontend tests PASS**; **18 field configurations** and **16 final menu configurations** across Chromium, Firefox and WebKit; **four final focus checks**; **10 synthetic browser workflows**. Eight automated accessibility audits report zero violations. Both themes, 320-1440px layouts, touch emulation, keyboard selection/Escape/focus return, long labels and 200% text were checked. Screenshots were captured and visually inspected.

The workflow checks use synthetic browser adapters for accepted/rejected saves. They do not establish live backend writes or physical-device testing. Existing review policy/payload helpers, the Case page and prior Select primitive are byte-identical to their pre-task snapshots. Backend/native suites were not run for this frontend change.

Selected results and source hashes: `output/handoff/responsibility-shadcn-fields-2026-11-01/verification.json`. Final Dropdown Menu screenshots and checks are in its `dropdown/` subdirectory; preceding intermediate Select records remain separate.

[Dark preview](http://127.0.0.1:1575/dashboard/responsibility?case=synthetic-timeline&fieldReview=review&workspace=1&theme=dark#human-review-heading) | [Light preview](http://127.0.0.1:1575/dashboard/responsibility?case=synthetic-timeline&fieldReview=review&workspace=1&theme=light#human-review-heading)
