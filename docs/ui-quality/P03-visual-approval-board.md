# P03-visual-approval-board

AUTHOR: CODEX
PHASE: P03 | VERSION: 1
DATE: 22 October 2026 (Asia/Calcutta)
STATUS: OWNER-DIRECTED CLOSURE — KNOWN VISUAL FINDINGS DEFERRED

Owner instruction: “leave these pages as they are now.” Home (/) and Outstation (/outstation) are kept exactly as currently implemented. No new visual treatment is approved or applied. The existing contrast, touch-target and width findings are deferred by owner direction, not repaired or counted as accessibility PASS. The earlier nonvisual Outstation modal keyboard fix is retained.

## P03-H1 — Home copyright contrast

Route /; selector `footer p:last-child`.

Dark preference: #606067 on #121220, 2.97:1; normal text requires 4.5:1.

Owner direction: KEEP CURRENT. Remediation: DEFERRED. Proposed treatment: NOT APPLIED.

## P03-H2 — Carousel step touch targets

Route /; selector `button[aria-label="Go to step 2"]`.

Inactive dots 10 × 10px; active dot 12.5 × 12.5px. Closest safe offset 16px; minimum target/spacing test is 24px.

Owner direction: KEEP CURRENT. Remediation: DEFERRED. Proposed treatment: NOT APPLIED.

## P03-H3 — Home mobile width overflow

Route /; selector `.landing-hero`.

390px viewport produced a 420px full-page image/document. Hero overflow: clip with overflow-clip-margin: 30px on both axes.

Owner direction: KEEP CURRENT. Remediation: DEFERRED. Proposed treatment: NOT APPLIED.

## P03-O1 — Destination prompt contrast

Route /outstation; selector `button .leading-5`.

Dark preference: #121220 on #262636, 1.24:1 at 18px; required 4.5:1. Light preference is measured independently.

Owner direction: KEEP CURRENT. Remediation: DEFERRED. Proposed treatment: NOT APPLIED.

## P03-O2 — Outstation copyright contrast

Route /outstation; selector `footer p:last-child`.

Same footer pairing as P03-H1: dark preference 2.97:1 vs 4.5:1 required.

Owner direction: KEEP CURRENT. Remediation: DEFERRED. Proposed treatment: NOT APPLIED.
