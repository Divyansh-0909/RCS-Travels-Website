# Responsibility review — approved design integration

5 November 2026, Asia/Kolkata. The approved [mockup](../../output/handoff/responsibility-template-mockup-2026-11-02/README.md) is implemented in the actual `/dashboard/responsibility` route. This is a source implementation and local verification checkpoint; nothing was deployed.

[Review the actual page locally](http://127.0.0.1:1591/dashboard/responsibility). This separate loopback server uses synthetic cases and authentication fixtures. The product page itself uses the existing `useApi`, theme provider and protected admin route; it does not import these fixtures.

## What changed

- The approved heading, compact controls, case suggestions, filter popover, table, copy tooltips, fixed pagination strip, four-step guide, fixed review actions, MDI icons, colors and motion now live in the application. Main panels remain transparent. Typography, borders, muted surfaces, blue rider bubbles and the latest text-color adjustments are retained.
- Timeline events, driver/rider statements, AI suggestions, human decisions and appeal records come from the saved case context. Missing information gets an explicit empty or unavailable state. Event summaries are not presented as quotations from drivers or riders. Full records remain accessible in dialogs using the page background.
- Desktop review panels share a row when space permits and stack on narrower layouts. Mobile guide labels reserve equal space so the numbered badges align. Long event lists and statements scroll internally and support keyboard access.
- Search and filtering use a new protected, read-only `GET /api/admin/responsibility/cases` endpoint. It supports case/booking IDs, status, explicitly recorded reporter, IST date periods and deterministic `createdAt`/ID cursor pagination. The UI sizes each page to the available screen height; the API caps requests at 50. Completed cases are excluded. Full evidence snapshots are not included in list responses.
- The form retains the existing review/appeal actions, allowed classifications, reason validation, required action levels and evidence-version/hash binding. Save stays disabled until the steps and required fields are complete. Failures retain the draft; unchanged-evidence refreshes preserve it; changed evidence resets the review. Successful provisional decisions are not described as final. Saved cases can be revisited without enabling another decision.

The real form uses backend-supported cause choices and the existing conditional action-level field, rather than the mockup’s illustrative values. This does not change adjudication, appeal, financial or consequence policy.

## Verification

Evidence and screenshots: [integration artifacts](../../output/handoff/responsibility-production-integration-2026-11-05/).

| Check | Result |
| --- | --- |
| Website production build | PASS |
| Frontend tests | 109/109 PASS |
| Scoped frontend lint | 20 files, zero errors/warnings |
| New case-browser unit and signed-admin HTTP tests | 5/5 PASS; unauthenticated, non-admin, expired and revoked sessions rejected |
| Browser walkthrough | Ten light/dark configurations across Chromium, Firefox and WebKit; desktop, tablet and phone coverage |
| Save safety | Required action level, duplicate-click suppression, evidence-bound payload, provisional result wording, saved-case revisiting, appeal payload, completed-case read-only state and changed-evidence reset PASS |
| Additional states | Statement projection, keyboard focus, 200% text, reduced motion, keyboard menus, loading/error/retry/empty list and mismatched-case rejection PASS |

Browser walkthroughs use synthetic APIs. The protected HTTP test uses the actual authentication middleware with a fake database repository. These checks do not claim new real-database UI transaction or deployment verification.

The WebKit phone walkthrough retained one `ResizeObserver loop completed with undelivered notifications` browser notification, also observed during the mockup work. Its selected functional checks passed; the notification remains recorded in the browser report rather than being suppressed in application code.

Full backend verification remains constrained by existing unrelated work: backend typechecking reports StudyAI TS2719 at `services/AI/StudyAI/services/index_langGraph.ts:127`. The bounded full backend run has 1,997 passing tests, two historical Search test-file failures with `SOURCE_DRIFT`, and one custody transport timeout. The default run was stopped after that transport test hung; the repeat used a 60-second timeout. Historical registrations and those tests were not weakened or rewritten.

The optional full frontend typecheck also reports errors in existing finance, driver-review, admin-dashboard and shared-button callers. The new Responsibility files have no reported type errors. Logs retain the exact diagnostics.

## Reproduce

```powershell
node tools/ui-quality/responsibility/serve.mjs
node tools/ui-quality/responsibility/verify.mjs --cross-browser
node tools/ui-quality/responsibility/states.mjs
node tools/ui-quality/responsibility/lint.mjs
npm --prefix frontend run build
npm --prefix frontend test
```

Start the preview server separately and wait for its ready message before running browser checks. Its fixture data is disposable; fresh runs should use a restarted fixture server. Backend tests use the normal repository commands; the bounded full run is recorded separately in the artifacts.

Pre-edit copies of modified existing files are retained. HEAD, the staging index and generated theme CSS remain unchanged. No existing migrations, Search implementation, driver app, credentials or production activation settings were edited by this integration.

## Filter alignment follow-up

5 November: selected filter values now use the trigger's native flex layout. This removes extra baseline space that raised status/reporter labels and icons by 1.5 CSS pixels, while retaining the existing field dimensions, colors and horizontal spacing. The website build and five desktop/mobile theme/browser checks pass, including selection and applying filters. [Follow-up evidence](../../output/handoff/responsibility-filter-alignment-2026-11-05/README.md) records the new source identity separately from the preceding integration checkpoint.

Subsequent approved polish uses filled reporter icons, an edge-to-edge divider and muted footer in the filter popover, a transparent Reset background, tighter step 1/3 descriptions in secondary text, and the All ride records action beside the timeline date. Opened times now show uppercase AM/PM without the visible IST suffix, and mobile pagination shows only the total count.

The case list now fits its page size to the available height rather than stopping at five rows. Requests, cursor resets, page counts and range labels use the same fitted limit; selection remains intact when the bulk-copy footer grows. The API's existing 50-row ceiling remains enforced. Nine Chromium/WebKit layout checks and a 37-case pagination flow pass; the website build, 109 frontend tests and scoped lint pass. [Adaptive-row evidence](../../output/handoff/responsibility-adaptive-case-rows-2026-11-05/README.md) records this follow-up separately from the original integration.

The subsequent Unslop spacing pass standardizes the four steps' panel insets to 16px, related content to 8px gaps, and form/group spacing to 16px. It tightens the ride facts, balances AI disclosure padding, spaces populated decision histories and aligns record actions. The reason field keeps the full form width when Action level is shown. The website build and Chromium/WebKit desktop/mobile checks pass, including expanded records, long timelines, required-field gating and confirmation focus restoration. [Spacing audit, captures and validation](../../output/handoff/responsibility-panel-spacing-unslop-2026-11-05/README.md) document this CSS-only follow-up and credit the Unslop skill.

Record and confirmation popups now share the page's canvas, compact shadcn-style header, 16px insets, quiet field groups and bounded scrolling. Seven record popup types preserve their complete technical JSON; repeated headings and gray wrappers are removed. Pointer transitions use the existing 240ms fade/scale tokens, keyboard actions are immediate, and reduced motion uses a short fade. A reproduced background scroll jump from keyboard focus inside long dialogs is corrected. The build, 109 frontend tests, data comparisons, Chromium/WebKit focus/motion checks and confirmation failure/retry checks pass. Two pre-existing legacy complexity findings remain unchanged, with zero new lint findings. [Popup styling, motion and validation](../../output/handoff/responsibility-record-dialogs-2026-11-05/README.md) records the follow-up and skill credits.

The latest popup adjustment gives the body below the header a muted background and label/value rows without separators. Long values align at the top and wrap. Record popups retain their initial viewport-bounded height when Technical record or other disclosures expand; extra content scrolls beneath the fixed header and Close button. Five desktop/mobile theme configurations preserve all seven popup records exactly, with additional long-content, keyboard/motion and confirmation checks. The build and 109 frontend tests pass, with zero new lint findings. [Popup rows and scrolling evidence](../../output/handoff/responsibility-dialog-rows-scroll-2026-11-05/README.md) records this follow-up separately.

Differences in the saved accounts and Full AI assessment now use the owner's shadcn Stack Trace reference: expandable headings, vertical guides and inset detail blocks. Saved accounts remain separate, and AI sections are grouped by purpose. All story popups now show a persistent, draggable scrollbar whenever their content overflows, while keeping their header and height steady. Desktop/mobile theme, data-preservation, scrollbar, keyboard, long-record and confirmation checks pass; the build and 109 frontend tests pass with zero new lint findings. [Trace popup reference, screenshots and checks](../../output/handoff/responsibility-popup-trace-2026-11-05/README.md) documents this follow-up.

The owner-supplied `rcs-palette-draft (1).json` was checked against the registered palette and the rendered page. All 88 colors match exactly. Four desktop/mobile light/dark configurations pass 432 resolved-role and 108 actual-element color comparisons, including the new popup groups, inputs, borders, focus and secondary text. No color or application changes were necessary. [Palette verification and screenshots](../../output/handoff/responsibility-palette-verification-2026-11-05/README.md) records this verification-only follow-up.
