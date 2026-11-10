# Responsibility review - dropdown stability

1 November 2026 IST. Follow-up to [the shadcn decision fields](responsibility-shadcn-fields-2026-11-01.md).

Opening a menu reproduced an **8px downward shift** in the reason field and an 8px increase in form height. Base UI adds fixed focus helpers next to its trigger. The field groups' sibling-margin spacing treated the trigger as no longer the last child and added a bottom margin. Using flex column gaps in the three choice groups preserves their spacing without counting fixed helpers.

Menu items now have no border, outline or shadow, including selected, hovered and keyboard-focused options. Selection remains marked by its checkmark and fill. Keyboard focus uses a filled highlight, with system highlight colors in forced-colors mode. Field and menu container styling otherwise remains as before. This supersedes only the earlier menu-item outline treatment.

Validation: website build PASS; **16 browser/viewport/theme configurations** across Chromium, Firefox and WebKit, covering 320px and tablet layouts as well as phone and desktop. All **64 menu open/close observations** retain the form and field geometry and scroll position: **0px shift**. Selection, keyboard navigation, Escape focus return and borderless option states pass. Four automated menu accessibility audits report zero violations; no runtime errors. Light and dark screenshots were captured and visually inspected. Review payload/validation helpers remain unchanged; backend/native suites were not run.

Evidence: `output/handoff/responsibility-dropdown-stability-2026-11-01/verification.json`, including the pre-fix measurement, final geometry checks and source hashes.
