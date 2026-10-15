# Product lens

Score: 7/10 | Vote: FUND IF

This applies the published Product framework, without claiming personal endorsement. The score reflects a promising experience with substantial execution risk; demand and economics remain unproven.

## What is strong

The one-sentence promise should be: **Make your existing website work beautifully across screen sizes, while keeping the design you chose.** That is clearer than a general visual editor or another website generator. The satisfying moment is seeing the same brand, hierarchy, and working interactions survive a change of width, then seeing that result in the actual project.

The first five minutes should begin with a running local page. The user chooses their preferred size and marks elements to preserve. The tool shows three widths, proposes a small adaptation, explains its decisions, and lets the user accept, adjust, or undo them. One accepted change reaches the source; the page reloads to confirm it. Loading errors, unsupported components, and conflicts must be understandable parts of this experience.

Variant 1, visual edits followed by an agent file, is valuable when the user already knows the desired layout. It provides control, but requires the user to do much of the design work and makes agent interpretation a second opportunity for failure. Variant 2, AI proposals followed by visual refinement, offers the stronger opening experience if suggestions are selective, editable, and reversible. Prefer variant 2 as the entry point, with variant 1's controls available throughout. An attractive proposal that cannot be implemented is unfinished product work.

Both directions matter. Desktop-to-mobile needs decisions about stacking, navigation, density, and content priority. Mobile-to-desktop needs decisions about grouping, measure, whitespace, and whether extra columns improve comprehension. Enlarging everything is not an adaptation. A single screenshot cannot reveal the designer's intent; the product should use source, existing styles, component behavior, and explicit user constraints, then expose uncertain choices.

## What would kill it (the top 3, most dangerous first)

1. **The accepted preview and implemented page disagree.** A free-form export can lose component identity, breakpoint scope, and layout dependencies. Use source-linked targets, recorded constraints, and before/after evidence; validate the agent's implementation by rendering the actual changed project. Existing desktop or mobile behavior must survive. Otherwise users are buying another correction loop.
2. **AI produces plausible screenshots rather than professional websites.** Professional quality includes hierarchy, typography, image crops, content continuity, navigation, and comfortable spacing between presets. Hiding overflow or essential content to make a screenshot clean is failure. So is losing keyboard access, meaningful reading order, focus visibility, or usable controls. Offer alternate layouts where judgment is ambiguous and preserve semantic structure.
3. **A general editor overwhelms the specific job.** Every framework, arbitrary positioning, backend behavior, and unlimited visual controls would dilute the experience. Support one stack and ordinary content pages first. Keep spacing, width, type scale, flex/grid arrangement, and breakpoint scope; defer animation authoring, new component creation, complex dashboards, and arbitrary site imports. Free dragging should not silently create fragile absolute positioning.

## The questions I would ask the founder

- Which initial stack and page type will receive a complete, dependable experience?
- Which brand and content choices should the tool preserve, and which may it propose changing?
- Will success mean an exported instruction file or a verified source change? How does the user recover when the agent only partially implements it?
- Can the first session demonstrate useful improvement before asking the user to understand CSS breakpoints?

## If FUND IF: the conditions

These are proposed acceptance gates and hypotheses, not measured results:

- **Hypothesis: the first five minutes deliver value.** At least 8 of 10 target users connect a supported project, approve one useful adaptation, and verify the changed page within five minutes without facilitator help.
- **Hypothesis: adaptation works in both directions.** Test 12 permissioned pages, six starting at mobile and six at desktop. At least 10 pass independent review for retained identity, hierarchy, and usability at 360, 768, and 1440 pixels, plus intermediate-width sweeps. Report results separately by direction.
- **Hypothesis: previews are trustworthy.** Every accepted test change survives implementation and reload without unexplained material visual differences, broken primary interactions, or regression at the original width. A screenshot-only mock does not pass.
- **Hypothesis: craft and control survive automation.** Two independent frontend/design reviewers rate at least 10 of 12 outputs at least 4/5 on a predefined rubric. Keyboard, reading-order, focus, and 200% zoom checks find no new blocking issue; every proposed change can be rejected or undone.

A local VS Code webview with a source connector is a proposed delivery route: custom extension views are documented by the [VS Code Webview API](https://code.visualstudio.com/api/extension-guides/webview). That does not prove this connector or a custom Codex panel exists. Validate the integration first; use a web interface with the same verified source workflow if necessary.
