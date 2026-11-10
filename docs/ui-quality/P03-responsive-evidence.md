# P03-responsive-evidence

AUTHOR: CODEX
PHASE: P03 | VERSION: 1
DATE: 22 October 2026 (Asia/Calcutta)
STATUS: OWNER-DIRECTED CLOSURE — KNOWN VISUAL FINDINGS DEFERRED

Owner instruction: “leave these pages as they are now.” Home (/) and Outstation (/outstation) are kept exactly as currently implemented. No new visual treatment is approved or applied. The existing contrast, touch-target and width findings are deferred by owner direction, not repaired or counted as accessibility PASS. The earlier nonvisual Outstation modal keyboard fix is retained.

| Route | Width | Preference | Actual root | Document | PNG | axe IDs |
|---|---:|---|---|---:|---:|---|
| / | 360 | dark | legacy | 390 | 390 | color-contrast, target-size |
| / | 360 | light | legacy | 390 | 390 | color-contrast, target-size |
| / | 390 | dark | legacy | 420 | 420 | color-contrast, target-size |
| / | 390 | light | legacy | 420 | 420 | color-contrast, target-size |
| / | 768 | dark | legacy | 798 | 798 | color-contrast, target-size |
| / | 768 | light | legacy | 798 | 798 | color-contrast, target-size |
| / | 1280 | dark | legacy | 1280 | 1280 | color-contrast, target-size |
| / | 1280 | light | legacy | 1280 | 1280 | color-contrast, target-size |
| / | 1440 | dark | legacy | 1440 | 1440 | color-contrast, target-size |
| / | 1440 | light | legacy | 1440 | 1440 | color-contrast, target-size |
| /outstation | 360 | dark | legacy | 360 | 360 | color-contrast |
| /outstation | 360 | light | legacy | 360 | 360 | color-contrast |
| /outstation | 390 | dark | legacy | 390 | 390 | color-contrast |
| /outstation | 390 | light | legacy | 390 | 390 | color-contrast |
| /outstation | 768 | dark | legacy | 768 | 768 | color-contrast |
| /outstation | 768 | light | legacy | 768 | 768 | color-contrast |
| /outstation | 1280 | dark | legacy | 1280 | 1280 | color-contrast |
| /outstation | 1280 | light | legacy | 1280 | 1280 | color-contrast |
| /outstation | 1440 | dark | legacy | 1440 | 1440 | color-contrast |
| /outstation | 1440 | light | legacy | 1440 | 1440 | color-contrast |

The hero uses overflow: clip with overflow-clip-margin: 30px and intentionally transformed artwork. Home extends horizontally by 30px at 360/390/768px; desktop 1280/1440px fits. Clipped off-canvas carousel slides have separate large geometry and are not alone proof of document overflow. Outstation fits every measured width. The proposed page-specific correction is retained as an unapplied candidate, and no content is hidden to turn the result green. Captures wait for actual footer/hero readiness.
