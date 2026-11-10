# P07 — execution report

29 October 2026 IST. **APPROVAL_REQUIRED. Audit complete within the stated fixture scope; product fixes NOT_CHANGED.**

Approved prompt: [handoff document](https://docs.google.com/document/d/1mfFSj9kbob7mAE5CuUW9aR1LBnoHjVS0vb6w91KvzJ8). [Drive evidence folder](https://drive.google.com/drive/folders/1qP4Ig18YTCtjqNGqbXWoSPbrEoTW30lz). Local raw evidence: `output/handoff/P07-2026-10-29/`. This is P07, separate from the earlier unnumbered consistency work.

The owner approved execution of the document’s P07 v1 audit. Its safe-replay items 4–5 require exact owner choices before any visual, copy, navigation or product logic changes. This phase added isolated fixtures, tests, live review and audit metadata only. Four real defects remain unresolved pending those choices.

## Source and route map

| Existing stable ID | Actual source / entry | Audited slice |
|---|---|---|
| W.TRACKING | frontend/src/main.jsx actual /booking/:id → frontend/src/pages/TrackingPage.jsx | Actual route with synthetic ID; loading, active ride, read failures/recovery, terminal outcomes, receipt and RideDetails |
| W.SHARED.CUSTOMER-PAYMENT-PANEL | frontend/src/components/CustomerPaymentPanel.jsx, TrackingPage advance branch | Amount presentation, busy/failed/cancelled/paid presentations; imported component reference for otherwise provider-dependent phases |
| W.SHARED.RIDE-SETTLEMENT-PANEL | frontend/src/components/RideSettlementPanel.jsx:7, completed branch | Pending UPI/cash choices, disabled/busy, denied cash confirmation, paid cash/UPI, missing capability |
| W.SHARED.CANCELLED-BOOKING-PANEL | frontend/src/components/CancelledBookingPanel.jsx:5; lib/cancelledAdvanceSummary.js | No advance, refund/partial refund pending and processed, retained advance, manual refresh |

Actual nested primitives include Button/ActionControl, IconButton, PillControl, BackgroundPanel, NoticePill, FailureState/ErrorPanel/EmptyState, Skeleton, OtpDisplay, RideDetails and the global RefreshNotice used by tracking. Source discovery does not make every nested interaction audited. Maps/native gestures and cancellation writes are excluded.

## Execution and results

Commands below run from the repository root unless noted. Successful browser script completion is exit 0 and means its explicit assertions completed; OBSERVED is not full journey acceptance.

| Command | Final exit / evidence |
|---|---|
| node tools/ui-quality/p07/checkpoint.mjs | 0; protected source/git/metadata snapshots before work |
| node tools/ui-quality/p07/serve.mjs | Long-running isolated app; final instance P07_PREVIEW_PORT=1578. Earlier audit instance1577 retained |
| node tools/ui-quality/p07/functional.mjs | 0; 8 records, four repeated scenarios, two defects repeated2×; errors[] |
| node tools/ui-quality/p07/matrix.mjs | 0; 84 state/config observations, zero harness failures; 12 scoped axe samples |
| P07_CONFIGS=[{"width":320,"height":844,"language":"hi","textSize":16},{"width":390,"height":844,"language":"hi-Latn","textSize":16}], P07_CASES=assigned,advance,completed,partial-refund-pending,failure, P07_MATRIX_RESULT=matrix-localized.json; node tools/ui-quality/p07/matrix.mjs | 0; 10 localized replacements, actual html language verified; environment values shown literally, no new denominator |
| node tools/ui-quality/p07/transitions.mjs | 0; 12 repeated transition records, including two reproduced invisible focus failures |
| node tools/ui-quality/p07/supplement.mjs | 0; 7 interaction/loading checks; 24 actual imported-component presentation samples; external[] |
| node tools/ui-quality/p07/measure.mjs | 0; 10 computed-style samples; merged10 corrected localization rows into84 |
| node tools/ui-quality/p07/final-check.mjs | 0; native cash double click creates one denied request while busy, repeated2×; not provider idempotency proof |
| node tools/ui-quality/p07/sync-board.mjs | 0; static board now includes all4 issues; no watcher or approval dispatcher |
| node tools/ui-quality/p07/reviewer.mjs | Long-running GET-only reviewer4317; existing viewer plus /p07 comparison board |
| node tools/ui-quality/p07/reviewer-check.mjs | 0; all4 examples in3 host/screen configurations, safe failure replay and no page overflow; captures wait for actual state rather than auth splash |
| node --test tools/ui-quality/p07/fixture.test.mjs frontend/tests/paymentUi.test.js frontend/tests/cancelledAdvanceSummary.test.js frontend/tests/bookingReadSafety.test.js | 0; 29/29 PASS; targeted-tests.txt |
| node --test tools/ui-quality/coverage/coverage.test.mjs tools/ui-quality/consistency/consistency.test.mjs tools/ui-quality/consistency/audit-compare.test.mjs | 0; 19/19 PASS; tooling-tests.txt |
| npm --prefix frontend run build | 0; build.txt, 8.69s; existing large-bundle advisory retained |
| node tools/ui-quality/p07/record.mjs | 0; 355 validated source traces, zero duplicate/orphan IDs or missing discovered routes; CSV round trip |

The large-text two-repeat probe is retained in large-text-support.json and screenshots, including exact bounds and the receipt hit target; it was an inline Playwright probe rather than an invented package command. Late old polling responses did not replace the newer state in the tested ordering (lateAborted=false); this does not prove every request is aborted or every concurrency pattern is safe.

## Retained unsuccessful attempts

The initial component loader lacked the React refresh preamble (exit1); Vite transformIndexHtml repaired only fixture HTML. A matrix attempt waited on a five-minute searching animation and was stopped; final harness waits only finite entrance animations ≤2s. A theme assertion ran before mount (exit1), and the initial localization attempt changed store language without i18n: corrected to the actual LanguageSelector sequence and html-lang wait. Old10 observations/PNGs remain in matrix-before-language-recheck.json and matrix-language-attempt/. Transition strict-text and assumed-unmount checks failed (exit1); corrected selectors preserved the discovered invisible-focus defect. Board attempts exposed its own13px source-text overflow and offscreen iframe actionability waits (exit1); fixed in review tooling. A screenshot wait on nonempty root captured an auth splash; final captures wait for each actual audited state. Supplement recorder/back-selector failures (exit1) were fixture assumptions; final combines intercepted intent stores and selects the overlaid Back control. Initial metadata recording failed on an export token before registry writes (exit1); the exact source token was corrected.

Automatic approval review rejected one combined stop/restart command with the sole reason “blocked by policy”, before execution. No browser-opening policy diagnosis is inferred. The running1577 service was kept; a separate final app1578 and GET-only reviewer were started successfully. Retained attempt logs/results are not selected as successful evidence.

## Preservation and limits

304/304 recorded frontend/driver/shared source inputs unchanged; HEAD and staging index hashes unchanged. Authorized registry changes are separate from product sources. The original dirty tree was preserved within this recorded inventory; no claim covers every unrelated editor file. Backend typecheck/full suite and native lint/device suites were NOT_RUN for this website audit. No real booking, backend ownership, payment provider, ledger, refund, financial policy or dispatch acceptance is claimed.

Item 03 Account backdrop repair remains accepted and unchanged. Item 12 remains OWNER_VISUAL_REVIEW_PENDING / ON HOLD at the owner’s request; no choice or standard is inferred. P03 Home/Outstation KEEP CURRENT, P04 native results, P06 fixes and approved input/button/focus/spacing choices are preserved. No P08, Android, provider operation, commit, push, merge or deployment.
