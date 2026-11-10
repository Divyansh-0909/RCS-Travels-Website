# Preview reviewer refresh

25 October 2026 IST. Owner-requested presentation update to the local reviewer. Reference: the black inspector in `graphicUI_clone/app/src/workbench.css` and its `13-short-inspector.png` capture. The clone was read only.

The reviewer now uses a 352px black inspector, 28px corners, dark controls, an independently scrolling body and a pinned Save footer. Visible copy is short; source references, explanations and recorded measurements remain under Details. The existing website/Android review modes share the dark sidebar styling.

Phone previews sit side by side. Tablet/laptop previews stack vertically. Fitting a preview changes its display scale while retaining its actual iframe viewport. Pattern choices, screen exclusions and notes survive preview-setting changes. Saving remains an explicit action; product standards are not applied by the reviewer.

Validation: seven layout combinations across outer widths 390, 768, 1440 and 1920; choice saving/exclusions, draft preservation, field switching, live vehicle selection and existing issue/Android review modes passed. The inspector axe sample reports zero violations and no incomplete rules. Tool tests: 49 passed, one existing Windows symlink skip. Syntax and whitespace checks pass. All 264 protected product/theme files are unchanged. No native UI or backend acceptance is inferred.

Current proof: `output/handoff/reviewer-refresh-2026-10-25/verification.json`, `quality.json`, `reviewer-axe.json` and the adjacent screenshots. Earlier published audit artifacts remain unchanged.

[Open the reviewer](http://127.0.0.1:4317/?view=consistency&width=390&theme=light). Use Screen to switch between Phone and Laptop.
