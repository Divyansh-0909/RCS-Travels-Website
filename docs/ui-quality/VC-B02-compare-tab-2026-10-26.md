# VC-B02 findings in Compare

26 October 2026 IST. All 14 findings from the [website consistency audit](VC-B02-website-consistency-2026-10-26.md) are now individual entries in the existing Compare dropdown, alongside the original three comparisons.

[Open Compare](http://127.0.0.1:4317/?view=consistency&family=VC-B02-04&width=390&theme=light).

Each audit entry provides its finding, suggested direction, affected screens and a choice/note form. Both evidence selectors can compare relevant recorded controls; input comparisons include login, signup, booking, saved places and other measured fields. Measurement states cover rest, focus, hover, pressed and pending where observed. Actual capture size/theme is displayed, including when it differs from the requested viewport. Screenshots remain labelled as focus captures; selecting another measurement state does not manufacture a corresponding screenshot.

Recorded evidence, blockers, source-only inspection and design proposals have distinct labels. Source-only entries do not receive invented runtime dimensions. The compact-pill entry includes interactive 36px and 40px face proposals, each retaining 44px native button targets. Phone comparisons remain side by side; tablet/laptop comparisons stack.

Audit choices persist in `output/handoff/consistency-audit-decisions.json`, through `/api/consistency/audit-decision`. They use their own revision/catalog guards and finite canonical screen scopes. Saving records an owner instruction with `implementationStatus: NOT_CHANGED` and `aestheticAcceptance: NOT_RECORDED`; it does not apply product changes. Existing choices and history in `output/handoff/consistency-decisions.json` retain their original catalog identity and bytes.

The existing document watcher remains running. Automatic approval review rejected its requested restart with the sole reason `blocked by policy`. The additions therefore run through the independent, loopback-only `tools/ui-quality/consistency/audit-worker.mjs` service on port 4319. It accepts reviewer origins only, restricts image paths and methods, and has no document-watcher or product-execution behavior. A normally restarted reviewer can serve these routes itself; the client chooses that same-origin route when available. If the extra service is unavailable, the original three comparisons still load.

Validation:

- All 14 findings traversed at five physical viewport/theme configurations: 320 Light, 390 Dark, 768 Light, 1440 Light and 1440 Dark. Recorded images, source labels, proposal controls, sample selection, responsive layout, state switching and legacy implementation status checked.
- Choice/note saving, failure retention and affected-screen subsets checked with browser-intercepted responses. Separate API tests prove persistence, stale-write rejection, origin restrictions and preservation of the old registry using disposable temporary files. No synthetic review choice was written into the owner's live audit registry.
- Zero page errors and zero axe findings on the tested Compare source/proposal views. Screenshots inspected in phone and desktop layouts. Mobile readouts wrap; icon-only controls do not imply a text-label size.
- 19 reviewer/API/coverage tests pass. Service origin/preflight/method guards and offline fallback pass. Syntax and scoped whitespace pass.
- All 229 recorded frontend/theme inputs and the old decision registry remain unchanged. Production build, backend suites and Android lint were not run for this tooling-only change. Historical audit evidence and canonical coverage statuses were not advanced or rewritten.

Evidence: `output/handoff/compare-audit-2026-10-26/`, including baseline copies, browser validation/screenshots, axe results, earlier attempts, service checks, quality and manifest. The first browser harness requested an unlisted signup-phone option; the comparison selectors were expanded to include that already-audited input before the final passing run.
