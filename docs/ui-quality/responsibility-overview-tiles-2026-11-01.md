# Responsibility review - overview tiles

1 November 2026 IST. The case overview now uses six connected tiles with thin dividers, following the owner's reference: Booking, Issue, Case ID, Case status, Record version and Verification code. The visible Ride details heading, status badge, Case details disclosure and Make a decision link are removed. The existing RCS font and theme colors remain.

- All six values share the same font size, weight and line height at each screen size. Labels also share one typography style.
- Booking, Case ID and Verification code use single-line ellipsized previews. Their complete values remain in the text and title, and each label has a copy button that copies the full original value.
- Copy controls provide success/error icons and accessible announcements, retain keyboard access and 44px hit areas, and disable when their value is missing. Feedback resets after two seconds; timers and pending results are cleaned up when values change or the component unmounts.
- Container queries arrange six columns on desktop, three on tablets and two on phones, with one column on very narrow screens or when enlarged text needs more space. The loading skeleton uses the same six-tile layout.

Validation: website build and **96 frontend tests PASS**. Twelve browser/viewport/theme configurations pass: Chromium at 320, 390, 768, 1024 and 1440px in both themes, plus Firefox phone/dark and WebKit desktop/light checks. Four accessibility audits report zero violations; no runtime errors. Checks cover matching typography, removed controls, exact full-value copy arguments, keyboard/touch access, denied clipboard requests and recovery, long identifiers, 64-character verification codes, missing fields and 200% text. Screenshots were captured and visually inspected.

Clipboard responses and unusual record values were simulated within isolated browser checks; the user's system clipboard was not changed. The page's existing loading/routing/API/save controller is byte-identical to the pre-task snapshot. Backend/native suites were not run for this frontend change.

Evidence and selected source hashes: `output/handoff/responsibility-overview-tiles-2026-11-01/verification.json`.
