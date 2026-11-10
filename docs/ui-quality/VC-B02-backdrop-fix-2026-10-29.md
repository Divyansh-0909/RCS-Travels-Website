# VC-B02-03 — backdrop interception fixed

29 October 2026 IST. The owner authorized repair of Item 03. This supersedes the earlier OPEN disposition for pointer interception in admin filters, ride-history filters and account editing. Earlier screenshots, measurements and reports remain historical.

The backdrop already used a body portal at `z-index: 150`. The affected `z-index: 200` panels were nested inside `AccountLayout`'s animated content. Its retained transform/opacity animation and `will-change` establish a lower stacking context; a child's larger z-index cannot escape it. The baseline reproduced the problem on phone and desktop: keyboard Space changed Pending, but a pointer click hit the backdrop and dismissed the panel.

The affected panels now use the existing body-portal pattern already used by the detail dialogs:

- [AdminDashboard](../../frontend/src/pages/AdminDashboard.tsx): the filter dialog is portalled to `document.body` and fixed to the viewport.
- [ManageAccount](../../frontend/src/pages/ManageAccount.jsx): account editors and ride-history filters are portalled to `document.body`; ride filters are fixed to the viewport.

The existing backdrop and panel z-index values, control styling, input sizing, validation, data handlers, permissions and animations are retained. The backdrop continues to block the underlying page and dismiss on an outside click. Mobile filters remain full screen; desktop filters are centred in the viewport rather than anchored inside animated/clipped account content. This is a layering repair, not a new form or business workflow.

Verification uses the actual local React app with synthetic actors and blocked external hosts/writes:

- Six baseline pointer-interception samples reproduced the defect across admin filters, ride-history filters and Emergency Contact at 390px and 1440px.
- Eight main configurations cover 320/390/768/1440px in Light and Dark, with reduced motion. Four further configurations exercise ordinary animations at 390/1440px in both themes; two exercise touch taps at 390px in both themes. Across these configurations, 56 recorded panel/control hit tests pass.
- Pointer and keyboard chip selection, date-field editing, Apply/Clear, retained selections, Escape, outside dismissal, repeated opening, Emergency Contact/DOB editing and closing, and the nested Gender dropdown pass. Supplemental Driver/Users filter choices also pass. No profile update or other mutating product request was issued.
- Website build passes with the existing bundle-size warning. Frontend tests: 77/77 pass. Compare/coverage tooling: 19/19 pass. Scoped CRLF-aware whitespace checks pass. This does not add a focus-trap or complete modal-accessibility certification.

Actual screenshots were inspected on phone, tablet and desktop. The reviewer now labels Item 03 implemented and shows the historical 26 October click failure beside the 29 October selected-chip result. Four new public review captures are additive. Three browser checks verify the updated status, image loading and phone-column/desktop-stack presentation. This used temporary GET-only review servers; no document watcher, dispatcher or device automation was started, and those servers were closed afterwards.

Evidence: [before](../../output/handoff/VC-B02-backdrop-fix-2026-10-29/before/results.json), [main results](../../output/handoff/VC-B02-backdrop-fix-2026-10-29/after/results.json), [ordinary motion](../../output/handoff/VC-B02-backdrop-fix-2026-10-29/after-motion/results.json), [touch](../../output/handoff/VC-B02-backdrop-fix-2026-10-29/after-touch/results.json), [reviewer checks](../../output/handoff/VC-B02-backdrop-fix-2026-10-29/reviewer-results.json) and [manifest](../../output/handoff/VC-B02-backdrop-fix-2026-10-29/manifest.json).

Representative captures: [desktop filter after click](../../output/handoff/VC-B02-backdrop-fix-2026-10-29/after/1440-light-admin-filters-selected.png), [phone filter after click](../../output/handoff/VC-B02-backdrop-fix-2026-10-29/after/390-dark-admin-filters-selected.png), and [account field after editing](../../output/handoff/VC-B02-backdrop-fix-2026-10-29/after/390-light-Emergency-Contact-edited.png). A test assertion initially matched both the selected Gender heading and its exiting option; it was narrowed to the heading and the passing runs use the corrected harness. Those attempts remain retained.

Only two product files changed. AccountLayout, shared Input/Button, focus CSS, theme tokens and generated theme retain their starting identities. Canonical coverage and registered surfaces needed no source-anchor changes and retain their identities; owner choices/history are untouched. Backend/native suites were not run for this website-only repair. Other deferred themes, field aesthetic review and earlier whole-product limitations remain separate.
