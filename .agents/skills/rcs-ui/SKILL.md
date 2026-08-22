---
name: rcs-ui
description: Design, implement, polish, or review RCS Travels web and captain-app interfaces. Use for any task that materially changes layout, styling, components, responsive behavior, interaction states, or motion in frontend/ or driver-app/. Do not use for backend-only work.
---

# RCS UI

Produce an interface that feels deliberately designed for RCS Travels and is visibly verified in the running product. Functional code, a successful build, and plausible CSS are necessary but are not visual acceptance.

## Establish the target

Before editing, identify the screen's audience, single job, primary action, and source of visual truth. Use sources in this order:

1. Screenshots, Figma selections, or explicit direction supplied for the task.
2. The current product and behavior that must remain intact.
3. `shared/theme/tokens.cjs` and the existing primitives for the target surface.
4. `.design-sync/config.json` and `.design-sync/previews/` for website component usage.
5. `driver-app/design/driver-ui.html` as a visual reference for the captain app, never as behavioral truth.

Read [references/visual-contract.md](references/visual-contract.md) before making visual decisions. Inspect the actual canonical components named there rather than recreating them from memory.

If the brief leaves room for invention, choose a compact visual direction before coding: hierarchy, typography roles, spacing rhythm, surface treatment, and at most one memorable signature element. Make it specific to transport, maps, trust, or the current task. Avoid familiar AI defaults unless the brief asks for them.

## Build within the system

- Reuse existing primitives and tokens. Do not create a parallel button, input, panel, color, type, radius, or shadow system for one screen.
- Preserve routing, state, API behavior, maps, accessibility, and error handling while changing presentation.
- Keep one obvious primary action in each decision area. De-emphasize competitors instead of making everything louder.
- Use proximity and whitespace to group content. Remove decoration that does not communicate hierarchy, state, affordance, or elevation.
- Design real loading, empty, error, disabled, pressed, focused, and long-content states when the changed flow can enter them.
- Treat website and React Native implementations as related surfaces, not identical rendering engines. Verify supported properties and components before sharing styles.
- Keep visual changes scoped. Do not use a UI request as permission for unrelated architecture or dependency replacement.

## Motion

Motion must explain state, preserve spatial continuity, or provide feedback. The more often an interaction occurs, the shorter and quieter it should be.

- Prefer existing project timing and easing where they already create a coherent motion language.
- For new interaction motion, favor fast ease-out entrances and feedback, ease-in-out for elements moving on screen, and linear motion only for continuous progress.
- Avoid `transition: all`, `scale(0)` entrances, sluggish ease-in interaction feedback, and decorative animation on frequent actions.
- Animate transform and opacity when practical, make rapidly repeated transitions interruptible, gate hover effects to hover-capable pointers, and respect reduced motion.
- On touch surfaces, verify the interaction on a representative device or simulator when motion or gestures are material.

## Visual acceptance

Read and follow [references/visual-qa.md](references/visual-qa.md). For web-renderable work, use `$playwright-interactive` when it is available to inspect the real application at relevant desktop and mobile viewports. Capture, compare, revise, and repeat; do not stop after the first screenshot.

If browser or device inspection is genuinely unavailable, say exactly what could not be observed, run the strongest available static checks, and request or provide the precise screenshot needed for the next pass. Never claim visual fidelity without seeing the result.

## Review output

When reviewing rather than editing, lead with the highest-impact visual or interaction failures. Tie each finding to a concrete screen, state, or component and explain the user-visible consequence. Prefer a small set of meaningful corrections over a catalog of subjective preferences.
