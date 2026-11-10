# component-audit

AUTHOR: CODEX
PHASE: P01
DATE: 21 October 2026 (Asia/Kolkata)
EVIDENCE SNAPSHOT: 2026-10-21T07:44:01.426Z
GIT BASE: 2ff51e7d9dade932cd21dfe5d836488d4b9a700a

The controlled family is frontend/src/components/ui/Toggle.jsx, reused by notification and live-location settings. Verified defect: switches had aria-checked and keyboard-native button semantics but no accessible name. The pilot forwards aria-label/aria-labelledby and supplies the existing translated visible labels. Appearance, callback and disabled contracts are unchanged.

Existing reusable primitives include Button, Input, SettingRow, AccountLayout, CircleIconButton, EmptyState, FailureState, Skeleton and feedback overlays. Storybook uses these production components directly, not story-only clones. Existing semantic tokens remain the theming foundation; no token change was required to correct a name.

Legitimate variation: RideOptions OptionRow is the whole interactive switch, with a decorative SliderToggle inside it. Its booking-specific price/context and legacy treatment differ from account Toggle. Do not replace it with a nested interactive Toggle or homogenize their appearance. Account SettingRow and marketing information cards serve different composition roles. Home and Outstation remain independent.

Follow-up candidates: ThemeToggle uses radio roles and Enter/Space, but arrow-key/roving-tab behavior still needs assessment; no full radio-group keyboard conformance is claimed. AccountLayout navigation includes clickable heading/icon elements that warrant a keyboard/semantics audit. Saved-place icon controls and emergency-contact form labels need the exact axe findings investigated before broader primitive changes. Existing button outer/inner layout and form association must be preserved if consolidated.

Observed automated findings outside the pilot (repro: run node tools/ui-quality/serve.mjs, select the listed route/theme/width, run axe; screenshots are unapproved evidence):

| Screen | Route | Width / preference (actual theme) | axe findings | Evidence |
|---|---|---|---|---|
| Home-Landing | / | 390 / dark (legacy) | color-contrast, target-size | [capture](https://drive.google.com/file/d/13w_P2PlHgLCxbySfl-wQJfB2Go0J0Or-/view?usp=drivesdk) |
| Home-Landing | / | 1440 / dark (legacy) | color-contrast, target-size | [capture](https://drive.google.com/file/d/1PlmjgGopRJ1djWsfXUQuzXcVNPtghg5_/view?usp=drivesdk) |
| Outstation | /outstation | 390 / dark (legacy) | color-contrast | [capture](https://drive.google.com/file/d/1fqb7ZYEMO_UKL94hQXGwz8pEiJK-AJxg/view?usp=drivesdk) |
| Outstation | /outstation | 1440 / dark (legacy) | color-contrast | [capture](https://drive.google.com/file/d/1BFQzc3_aHx_gMTJaEaiei_HlafprpcTo/view?usp=drivesdk) |
| Booking-form-fixture | /dev/home | 390 / light (light) | color-contrast | [capture](https://drive.google.com/file/d/12gYRryfoEj-h6DfqeP65Wiv87lA-KPkF/view?usp=drivesdk) |
| Booking-form-fixture | /dev/home | 1440 / light (light) | color-contrast | [capture](https://drive.google.com/file/d/1_HF3ZsgYmrOU-B-vFaTl5TC46b_iL5qM/view?usp=drivesdk) |
| Safety | /dev/safety | 1440 / light (light) | list | [capture](https://drive.google.com/file/d/1CnBA1vFwo6Z59er1xQTqLmhdHxxuZihP/view?usp=drivesdk) |
| Safety | /dev/safety | 1440 / dark (dark) | list | [capture](https://drive.google.com/file/d/1efqOSzypG1FLuHsT2DQKqqhFkBv5xU0T/view?usp=drivesdk) |
| Help | /dev/help | 1440 / dark (dark) | list | [capture](https://drive.google.com/file/d/1wrJLkNm7f8NuY3vuW6TirYn4WMrU9D6k/view?usp=drivesdk) |
| Feedback-states | /dev/states | 390 / light (light) | color-contrast | [capture](https://drive.google.com/file/d/19FfdYtZ-_ujqx84-kL6fA7zkjl1UzhKC/view?usp=drivesdk) |
| Feedback-states | /dev/states | 390 / dark (dark) | color-contrast | [capture](https://drive.google.com/file/d/1gdRbRu9UVC2ZazD5B3vZsdZDf_XVtsvv/view?usp=drivesdk) |
| Feedback-states | /dev/states | 1440 / light (light) | color-contrast | [capture](https://drive.google.com/file/d/1Bm5y2EqQm0DfnJo2GlATIs-8f3zwiKaj/view?usp=drivesdk) |
| Feedback-states | /dev/states | 1440 / dark (dark) | color-contrast | [capture](https://drive.google.com/file/d/17gcu8u0lQlxB8L5xIJ5dw9_RETlL0LeD/view?usp=drivesdk) |
| Privacy | /privacy | 390 / dark (dark) | color-contrast | [capture](https://drive.google.com/file/d/13HRThbcIkneYU0hBtPTNDRqo4k_cHuuC/view?usp=drivesdk) |
| Privacy | /privacy | 1440 / dark (dark) | color-contrast | [capture](https://drive.google.com/file/d/1PtDowyCn8y48JRLNBD-kgt_d21QWH8ll/view?usp=drivesdk) |
| Refunds | /refunds | 390 / dark (dark) | color-contrast | [capture](https://drive.google.com/file/d/1z3rBVhEmKIkKYejtxWuilrsYcm8bBAqI/view?usp=drivesdk) |
| Refunds | /refunds | 1440 / dark (dark) | color-contrast | [capture](https://drive.google.com/file/d/1xAEAbZqaHBhM2i3ZXTMFmnsctUP8453_/view?usp=drivesdk) |
| Grievance | /grievance | 390 / dark (dark) | color-contrast | [capture](https://drive.google.com/file/d/1dSOlh5sotbgDpf4bFEsW8WGQsRrPgsyC/view?usp=drivesdk) |
| Grievance | /grievance | 1440 / dark (dark) | color-contrast | [capture](https://drive.google.com/file/d/1CkC0m_PadNd3Gb-S9Gj6wS0ydKvauCQh/view?usp=drivesdk) |
| Admin | /dev/admin | 1440 / light (light) | color-contrast | [capture](https://drive.google.com/file/d/1YmdnjYqXfF0E8t6uxebW_snKI3XcfTen/view?usp=drivesdk) |
| Admin | /dev/admin | 1440 / dark (dark) | color-contrast | [capture](https://drive.google.com/file/d/1eDAIfccOTvkijkfP2MMBfkLBjvJNF5W7/view?usp=drivesdk) |
| Terms | /terms | 390 / dark (dark) | color-contrast | [capture](https://drive.google.com/file/d/1Zf8vrGZInIE6Zds1reUFnl0BQ5Lz6tRs/view?usp=drivesdk) |
| Terms | /terms | 1440 / dark (dark) | color-contrast | [capture](https://drive.google.com/file/d/1iqyE4mI58bpmrclObovMJBCHQFowFdFM/view?usp=drivesdk) |

Severity: inaccessible unnamed pilot controls were critical per axe and are fixed. Remaining contrast findings require measured color/target investigation, preserving intentional legacy sections. Home touch targets and 420px capture width need a bounded responsive fix proposal. Exact CSS causes outside the pilot are not yet proven; these are findings, not approved redesign instructions.
