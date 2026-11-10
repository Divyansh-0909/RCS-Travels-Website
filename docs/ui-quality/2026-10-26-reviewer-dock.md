# Reviewer dock controls

26 October 2026 IST. Implements the owner's request to move colour mode and preview size to the bottom dock, following the sibling graphicUI clone's floating toolbar. Reference: `graphicUI_clone/app/src/main.jsx` and the `.floating-toolbar`, `.toolbar-segment` and `.chrome-icon` rules in its workbench stylesheet. That repository was read only.

The dock now has the Website/Android/Compare mode segment, a device button and a sun/moon toggle. The controls use the clone's black rounded surfaces, compact spacing, neutral selected states and subtle shadows. On narrow screens, mode labels give way to accessible icons so the full dock fits. The theme button changes the preview preference and reviewer canvas appearance. Its accessible toggle name stays stable while its sun/moon icon and pressed state reflect the selected mode.

The device button displays a phone, tablet, laptop or desktop icon for the selected preview. Its upward-opening menu contains six labelled presets: phones at 360/390px, tablet at 768px, laptops at 1280/1440px and desktop at 1920px. These are actual iframe viewport widths; fitting them onto the canvas does not change their responsive breakpoints. The desktop preset uses a 1920×1080 viewport. Phone comparisons stay side by side; tablet/laptop/desktop comparisons stack.

The earlier top-bar/inspector size and preference controls are removed from view. The underlying native select values and existing change handlers remain the source of truth, preserving drafts, URL state and preview behavior. Size and preference survive navigation between Website and Compare. Actual Android remains device-controlled, with these browser controls hidden in native view.

Validation: eight focused dock groups and all 14 reviewer walkthrough groups PASS. Checks cover all presets and their real iframe dimensions, icon changes, both colour modes, keyboard selection/Escape, unsaved notes, view switching, actual website issue replay, coverage controls, save/error states and narrow/touch/landscape layouts. The dock accessibility sample and the walkthrough's scoped accessibility samples report no violations. Tool tests: 49 PASS, one existing skip. All 264 protected product inputs and the saved owner-choice registry remain unchanged by this reviewer work.

Screenshots were inspected at desktop, 320/390px phone sizes, tablet and short landscape sizes. Settled phone screenshots in both modes are retained separately from initial loading/compositor captures. Evidence: `output/handoff/reviewer-dock-2026-10-26/`, including `dock-checks.json`, `dock-axe.json`, `walkthrough/walkthrough.json`, screenshots, original source copies and tool output. Only reviewer tooling changed; the production frontend/backend/native suites are outside this change's code path.

[Open the updated reviewer](http://127.0.0.1:4317/?view=consistency&width=390&theme=light).
