# Responsibility dashboard motion

30 October 2026 IST. Applies the owner's explicit `$animate` request to the existing shadcn dashboard.

Frequent controls receive **feedback** and **state indication**: 120ms CSS press feedback at `scale(0.97)` and short chevron rotations. The canonical shared `feedback` token supplies `cubic-bezier(0.23, 1, 0.32, 1)` and duration; the theme script generates the website variables. No motion dependency was added. Native global CSS remains byte-identical.

Records, tab panels, dropdown contents and case data stay immediate. Keyboard input disables control transitions, including Escape handled through Radix's document event path. Reduced motion removes spatial movement and retains a gentle opacity response on decorative button icons. Hover adds no movement. CSS transitions reverse from the current rendered state without restarting a keyframe sequence. A page-scoped pointer marker makes touch presses reliable; release, cancellation, keyboard input, blur and unmount clear that marker without changing native click behavior or capturing the pointer.

Selected checks: 36 browser configurations across Chromium/Firefox/WebKit, Light/Dark, 390/768/1440px and both motion preferences; 10 existing review/appeal workflow scenarios; four keyboard/error configurations with eight scoped axe audits; two Chromium touch-cancellation emulations. Frontend 77/77, coverage 14/14 and website build pass. Screenshots include idle and paused mid-press states. Browser emulation does not establish physical-device feel.

Earlier WebKit transition observations, harness corrections and the pre-fix touch check are retained separately. Runs predating the final pointer-state fix are not counted in its selected denominator.

Feel-check: press and release Refresh, expand/collapse records, then use Tab/Space/Escape. Pointer feedback should feel quiet; keyboard interaction should feel immediate. Try the operating system's reduced-motion setting. Live previews still use synthetic cases and deny saving.

[Light preview](http://127.0.0.1:1575/dashboard/responsibility?case=synthetic-review&fieldReview=review&workspace=1&theme=light) · [Dark preview](http://127.0.0.1:1575/dashboard/responsibility?case=synthetic-review&fieldReview=review&workspace=1&theme=dark)

Evidence: `output/handoff/responsibility-motion-2026-10-30/`. Only three coverage source-line anchors were refreshed; no audit/owner decision was promoted. Existing review rules, API payloads, shared WebSocket deferral and unrelated UI decisions are preserved. No backend/provider/native campaign, deployment, commit, push or merge.
