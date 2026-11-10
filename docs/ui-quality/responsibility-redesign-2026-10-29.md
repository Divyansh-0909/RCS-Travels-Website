# Responsibility page redesign

29 October 2026 IST. The owner explicitly approved redesigning the whole Responsibility page with the shadcn CLI and Apple design guidance. This is a website UI change; existing review, appeal, evidence-binding and final-authority rules remain in force.

[Light preview](http://127.0.0.1:1575/dashboard/responsibility?case=synthetic-review&fieldReview=review&workspace=1&theme=light) · [Dark preview](http://127.0.0.1:1575/dashboard/responsibility?case=synthetic-review&fieldReview=review&workspace=1&theme=dark) · [Evidence folder](https://drive.google.com/drive/folders/10pFVuOyeBXI9rb8LDkvgjbW8OAiiD0KW)

The preview uses synthetic admin cases. All live-preview API writes are intercepted locally and return 409. Accepted-save tests use separate browser-only adapters; no real review, payment or consequence is applied.

## Design and spacing

The actual shadcn **4.23.0** CLI generated Button, Card, Badge, Alert, Input, Label, Textarea, Select, Tabs, Accordion, Skeleton and Separator. The exact original generated files and their hashes are retained alongside the adapted RCS versions. Existing RCS colors, Mori typography and semantic light/dark tokens are reused; there is no global shadcn theme reset.

The page now has a case lookup, clear overview, Evidence/Analysis/History tabs, expandable readable records and a separate human-review form. Desktop uses two workspace columns; smaller screens stack them. All ten original evidence/decision record groups remain available. Phone case details use one column so identifiers and states have room to wrap.

| Spacing/control | Implementation |
|---|---|
| Page gutters | 16px phone, 24px tablet, 32px desktop |
| Card padding | 16px phone, 24px larger screens |
| Label-to-field gap | 8px |
| Review-field and major-card spacing | 24px |
| Single-line fields/main actions | At least 48px; 16px field text |
| Icon/compact actions and options | At least 44px targets |

[Apple layout](https://developer.apple.com/design/human-interface-guidelines/layout), [text fields](https://developer.apple.com/design/human-interface-guidelines/text-fields) and [accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) informed grouping, alignment, vertical fields, reflow and usable targets. These CSS dimensions are RCS implementation choices; Apple does not prescribe this exact web spacing scale, and native points are not CSS pixels. The [shadcn CLI documentation](https://ui.shadcn.com/docs/cli) is the component provenance reference.

## Verification

- Website build passes; the existing large-chunk advisory remains. All **77 frontend tests pass**, including the **21 existing Responsibility contract tests**.
- **10 workflow scenarios pass in each of Chromium, Firefox and WebKit**: lookup/clear/history, loading/retry/missing/foreign cases, all records and model-shadow separation, validation/reset/length limits, exact version-bound Waive/Uphold/appeal payloads, duplicate-submit prevention, accepted-result refresh, rejected-save draft retention, stale read/save isolation, finalized/prerequisite states and theme switching.
- **44 responsive configurations pass** across those engines, both themes, widths 320–1920px, 844×390 landscape and 200% text at 320/1440px. Checks include document overflow, usable targets, dropdown bounds, field interaction and expanded records. Phone summary columns are explicitly checked.
- **20 scoped axe audits report zero violations** across normal pages, open menus and validation errors. Incomplete/manual checks remain recorded. Keyboard tab/accordion operation, Escape focus restoration, outside-click dismissal and the single primary-colored field edge are checked separately.
- Four long-data configurations retain a 71-character hash, 230-character booking identifier and 900-character unbroken evidence value. Enlarged waiver-menu options wrap within the viewport; keyboard focus remains visible in forced-colors emulation.

Browser review found and fixed a React dependency-resolution issue, a translucent page-background contrast dependency, duplicate dropdown focus outlines, narrow-screen summary wrapping and enlarged waiver-menu overflow. The case lookup also keeps its input synchronized with browser Back/Forward. Failed harness attempts are retained separately; final selected results are identified in `verification.json`.

## Scope and review

Review the overview density, tab/record organization, form spacing, dropdown behavior and both themes. Try Waive and Uphold; then use `synthetic-appeal`, `synthetic-final`, `synthetic-not-ready`, `synthetic-read-error` and an unknown ID to inspect the other states. The read-error fixture deliberately stays failed until the automated recovery test enables its local recovery flag.

Results are browser-engine/viewport evidence, not certification of every physical device, native keyboard, spoken screen reader, deployed authentication or backend financial execution. Backend/provider/native suites were not rerun for this frontend change. Existing case-load, inspection and review-payload helpers remain unchanged.

Only the Responsibility page and form receive this new visual approval scope. Other Item12 field reviews remain pending; the shared WebSocket remains **OWNER_DEFERRED**. Existing P03/P04/P06/P07 history is preserved. The canonical inventory retains all 355 stable IDs; six source anchors are rebound, two bounded UI surfaces receive the new evidence, and grouped child/state audits are not promoted. No production activation, deployment, commit, push or merge.

Local evidence: `output/handoff/responsibility-redesign-2026-10-29/`. `verification.json`, per-engine workflow/responsive results, scoped axe outputs, screenshots, CLI originals, source hashes and preservation checks define the selected scope.
