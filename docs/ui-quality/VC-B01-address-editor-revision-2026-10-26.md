# VC-B01 address editor — revised owner choice

26 October 2026 IST. Implements the saved `VC-B01-ADDRESS` choice from registry revision 8, recorded at `2026-10-26T10:30:36.412Z`. This supersedes the earlier red cancel treatment and bare saved-place inputs. Final owner visual acceptance remains unrecorded.

Cancel now has a white circle and black X in both themes. Name and address use labelled, inset fields with the existing RCS surfaces, typography, 12px corners and a clear focus outline. Each field's clickable label covers a 48px-high area. Fields stack below 900px and sit together on wider screens, with additional width allocated to the address. Their combined desktop width is capped at 672px.

The existing card width, 24px corners and trailing action edge remain. Actions align with the first field, within 2px of their previous vertical position. On narrow screens the editing card grows from 92px to 144px to fit readable labelled fields; desktop editing retains 92px. Errors leave the fields and actions in place. Accessible error associations were added. Name/address editing, same-ID saves, length limits, pending protection, failure recovery, Enter and Escape retain their behavior.

The comparison now measures the complete labelled field as 48px, retaining the actual 16px text measurement. Its scope note identifies Home as the displayed example of the editor shared with Work and custom places.

The design adapts [Apple's text-field guidance](https://developer.apple.com/design/human-interface-guidelines/text-fields?changes=_7) on labels, spacing and tab order, and [Uber Base Web's input implementation](https://github.com/uber/baseweb/blob/main/src/input/styled-components.ts) on filled fields and distinct focus/disabled states. These RCS dimensions and responsive arrangements are implementation choices, rather than prescribed Apple/Uber values.

Validation:

- Actual React application: 10 browser groups PASS at 320, 360, 390, 768 and 1440px, each in Light and Dark. Home rename, Work/custom editing, new places, keyboard order/focus, empty fields, maximum-length text, failed saves, pending saves, cancellation and successful same-ID saves checked. All mutations were fulfilled inside isolated browser contexts using synthetic data.
- Zero scoped axe findings and zero page errors. Phone, tablet and desktop screenshots inspected; the first cramped design was revised before final verification. Live comparison readouts and white/black cancel verified separately.
- Frontend build PASS, with the existing large-chunk warning; 72 frontend tests PASS; 17 reviewer/coverage tests PASS; harness syntax and scoped whitespace checks PASS.
- Of 229 recorded frontend/theme inputs, only `SettingsPage.jsx` changed. Canonical coverage CSV and registered surfaces remain byte-identical. Backend and Android suites were not run for this website change.

Evidence: `output/handoff/address-editor-revision-2026-10-26/`, including the original decision/source, before screenshots, intermediate designs, final screenshots, `functional.json`, `validation.json`, `reviewer-check.json` and the file manifest. Earlier published evidence remains historical and unchanged.

[Open the updated live comparison](http://127.0.0.1:4317/?view=consistency&family=VC-B01-ADDRESS&width=390&theme=light).
