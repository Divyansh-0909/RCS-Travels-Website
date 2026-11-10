# Responsibility review — near-black appearance

1 November 2026. Owner selected the existing RCS near-black `#0B0B14` for dark-mode page, panel and button backgrounds, while retaining dark input backgrounds and using muted input backgrounds in light mode.

The canonical near-black value now has a named color alias in `shared/theme/tokens.cjs`; the existing background value is unchanged. The theme stylesheet was regenerated. Page-scoped appearance rules also cover portalled detail dialogs and dropdowns. Other routes retain their existing surface roles.

Dark fields retain the former lookup surface and compact-field blends as opaque fills. Disabled content is dimmed separately so the new black canvas does not change the field fill. Light lookup fields, choice controls and textareas use the existing muted surface (`#E8E8EC`). Status text/icon colors, borders, spacing, focus outlines and review rules are retained. Menu keyboard/pointer highlights and loading placeholders retain visible muted feedback.

Validation:

- Frontend build PASS, with the existing bundle-size warning.
- Frontend tests **104/104 PASS**; no new unit tests for this appearance-only change.
- **6 browser configurations PASS**: 390, 768 and 1440px in light and dark mode; **4 axe audits**, zero violations or runtime errors.
- Dark page, panels, buttons, badges, dialogs and menu backgrounds checked against `rgb(11, 11, 20)`. Light field fills checked against the muted role. Sampled dark field colors remain within two RGB channel values of their former blends.
- Dropdown opening does not shift the form; keyboard highlighting stays visible. All three detail popups open and return focus on Escape. Save remains disabled until required choices and a reason are supplied. All fixture requests stayed GET-only.
- Representative desktop, phone, light-mode and dialog screenshots visually inspected. Existing tokens and unrelated route surface values preserved.

Evidence: [`output/handoff/responsibility-near-black-2026-11-01/`](../../output/handoff/responsibility-near-black-2026-11-01/), with before/after screenshots, field-color samples, browser checks and build/test logs.

Preview: [dark](http://127.0.0.1:1575/dashboard/responsibility?case=synthetic-timeline&fieldReview=review&workspace=1&theme=dark) · [light](http://127.0.0.1:1575/dashboard/responsibility?case=synthetic-timeline&fieldReview=review&workspace=1&theme=light).
