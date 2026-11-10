# P03-accessibility-metrics

AUTHOR: CODEX
PHASE: P03 | VERSION: 1
DATE: 22 October 2026 (Asia/Calcutta)
STATUS: OWNER-DIRECTED CLOSURE — KNOWN VISUAL FINDINGS DEFERRED

Owner instruction: “leave these pages as they are now.” Home (/) and Outstation (/outstation) are kept exactly as currently implemented. No new visual treatment is approved or applied. The existing contrast, touch-target and width findings are deferred by owner direction, not repaired or counted as accessibility PASS. The earlier nonvisual Outstation modal keyboard fix is retained.

Twenty real loaded cases covered Home and Outstation at 360/390/768/1280/1440px and both account preferences. Their existing legacy root appearance is retained; no counterpart theme is invented. Exact selectors, foreground/background ratios, keyboard focus and geometry are in P03-current-metrics.json.

- P03-H1 / P03-O2 — shared copyright: #606067 on #121220, measured 2.97:1 versus 4.5:1 required.
- P03-H2 — Home carousel targets: inactive 10 × 10px, active 12.5 × 12.5px; nearest safe offset 16px versus 24px minimum.
- P03-H3 — Home document/capture is 30px wider at 360/390/768px, including 390 → 420px; no blanket overflow clipping added.
- P03-O1 — Outstation destination prompt: #121220 on #262636, measured 1.24:1 versus 4.5:1 required.

Accessibility verdict for the retained visual findings: FAIL / DEFERRED BY OWNER. Technical reproduction and keyboard/contact checks pass; they do not prove WCAG conformance. The modal Tab escape was fixed without styling changes, with Tab/Shift+Tab wrapping, Escape and trigger focus restoration verified. No new audit or page edits were needed for this owner decision; source hashes still match the verified checkpoint.
