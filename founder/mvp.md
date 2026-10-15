# Build proposal: visual responsive corrections for AI-built websites

Status: proposed scope, not an implemented application. Updated 2026-10-12.

## Product promise

Open a running website, show how a section should look at another width, and get that correction implemented in the existing project with less repeated prompting.

The first release should solve this correction loop. AI-generated responsive adaptations are an optional later accelerator. Brand, price, team, and schedule remain undecided.

## Initial scope

Start with source-connected React/Tailwind marketing pages and one supported local development setup, chosen against pilot users' projects. Support both desktop-to-mobile and mobile-to-desktop corrections. This is a recommended test scope, not a founder-confirmed requirement.

Existing interactions and content should survive. Source access is required for verified implementation. An arbitrary public URL does not provide sufficient component/source context.

## First-session experience

1. Connect a supported local project and its running development preview. Select a route and record the starting source revision.
2. Choose the width where the current design is approved. Save a reference view and mark changes as preserving that layout by default.
3. Switch to another viewport width or drag the width slider until the problem appears.
4. Enter selection mode and click the affected section or element. Highlight its parent/component and explain whether it is shared with other instances.
5. Adjust the layout with a small property panel. Changes appear immediately as a draft, with a visible width scope.
6. Review the pending changes, then choose Apply. Straightforward supported edits can use direct source transforms; structural requests can be passed to the user's coding agent with precise context.
7. Reload the page from updated source, compare it with the accepted draft, and check the original width. Show verified results and remaining problems separately. Keep source changes reviewable and reversible.

Success is an accepted correction in actual source. A temporary browser style edit is not completed implementation.

## User-facing MVP

| Component | What to build | Why it is necessary |
| --- | --- | --- |
| Project connection | Local project selection, development URL, route selection, connection status, actionable unsupported-project errors | Establish the real source and preview being edited. |
| Preview canvas | One large live viewport, width presets, a continuous width slider, optional comparison with the approved starting view | Reproduce the problem and inspect widths between presets. |
| Selection | Hover highlight, click-to-select, parent selection, selection/interaction mode toggle, shared-instance indication | Tell the agent exactly what the user wants changed while allowing menus/forms to be exercised. |
| Property panel | Stack/row, column count, wrap, alignment, gap, padding, width/max-width, text size and line height | Cover common responsive corrections without requiring users to write CSS. |
| Width scope | Show inherited values and whether an edit applies globally or within a width range; respect existing project breakpoints | Prevent a phone correction from accidentally changing an approved desktop layout. |
| Draft changes | Immediate visual feedback, pending-change list, undo/reset, readable scope summary | Give users control over the result before source implementation. |
| Implementation | Reviewable source edits or a structured agent handoff with status | Close the correction loop in the existing project. |
| Verification | Rerender from source, compare approved and actual layouts, inspect target/intermediate/original widths | Detect disagreement, regressions, and work that is still incomplete. |

Use meaningful layout rules for positioning. Prefer alignment, flow, spacing, and grid/flex arrangement over unrestricted dragging that silently creates absolute coordinates. Treat content order changes carefully: visual order and keyboard/reading order must remain coherent.

## Technical foundation

The engine is more consequential than the panel:

1. **Preview bridge.** A development-only integration exposes selected elements, geometry, computed styles, page state, and screenshots from the running app. Account for preview/editor origin boundaries rather than assuming unrestricted iframe access.
2. **Element-to-source mapping.** Connect a rendered selection to the owning component and relevant styling definition. Distinguish a repeated instance from a shared source definition. Use source instrumentation/metadata where supported; never infer reliable source identity from screenshots alone.
3. **Responsive change model.** Record a stable target, source revision, route, width range, current values, requested rules, inherited/shared scope, preservation constraints, and visual reference. Detect stale edits if the source changes.
4. **Draft rendering.** Apply reversible preview changes while keeping draft state separate from verified source state. The preview rules must be implementable in the supported style system.
5. **Source implementation.** Implement narrowly scoped known operations predictably. For ambiguous structural changes, give the agent the exact component, rules, constraints, and reference, then inspect its result. Handle unsupported edits explicitly rather than treating AI as guaranteed to recover them.
6. **Verification loop.** Render the actual source at target, original, intermediate, and breakpoint-boundary widths. Detect obvious overflow/clipping, compare the draft and actual layouts, exercise important interactions, and show unresolved differences. Human judgment remains necessary for craft.

Do not regenerate an entire page to change one responsive section. Preserve component relationships, behavior, and existing design tokens. Source undo must preserve unrelated user/agent edits; a blanket project reset is unsuitable.

## Editor and agent integration

Proposed delivery: a VS Code extension webview for the canvas and property panel, backed by the local engine. Prove the engine first in a minimal local interface before investing in a polished extension. VS Code's webview API documents the UI capability, not the product-specific source connector. [VS Code webviews](https://code.visualstudio.com/api/extension-guides/webview).

Expose the engine to Codex through MCP tools, with a skill describing the correction and verification workflow. A useful small tool surface could provide project/selection context, retrieve pending corrections, capture views, and verify an implementation. The agent can retrieve queued changes; do not assume an extension can arbitrarily control another extension's active chat. MCP integration is documented for Codex, while automatic handoff and any custom panel inside a specific client require an integration test. [Codex MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

An optional export can include `RESPONSIVE.md`, structured changes, and screenshots. It provides a fallback for other agents. Avoid making repeated manual download/upload the main workflow.

## Build order and exit gates

### 1. Prove one faithful correction

Use one supported local page and two viewport widths. Select a component, change one layout property within a width range, implement it in source, and reload. Demonstrate that the intended width changed, the approved width was preserved, and an unrelated source edit survives undo. If this fails, resolve mapping or implementation before expanding the editor.

### 2. Build the correction MVP

Add the preview controls, selection modes, essential property panel, width scope, pending changes, and undo. Cover ordinary heroes, navigation, card grids, and forms within the supported project type. Test both adaptation directions and repeated/shared components.

### 3. Connect the user's coding workflow

Wrap the engine in the VS Code interface and test Codex MCP access to pending changes and verification. Prove the complete Apply/retrieve/implement/verify sequence. Present actual integration limitations rather than promising seamless control before it exists.

### 4. Evaluate with real users and projects

Compare accepted-source completion time, prompt iterations, preview/IDE switching, correction count, and regressions with users' existing agent/browser process. Include setup and cleanup. Check independent design quality and important interactions; collect paid and repeat usage evidence. Existing board gates are hypotheses to test, not measured outcomes. [Board assessment](board.md).

### 5. Add automatic suggestions where they help

Suggest a repair for an overflowing section or propose an initial responsive adaptation. Every suggestion uses the same reversible editor and source-verification loop. Add broader framework support only after the first scope is dependable.

## Defer from the first release

- A complete website builder, new-page generation, or general brand/theme design.
- Arbitrary website URL import and recovery of its original project source.
- Support for every framework, CSS system, and build tool.
- Unrestricted absolute-position canvas editing and animation authoring.
- Full application/dashboard adaptation, canvas-based interfaces, and complex third-party embeds.
- Collaboration infrastructure, cloud hosting, and independent deployment workflows before the correction loop is proven.

## Decision to make after the prototype

Does visual correction deliver the user's intended layout with meaningfully fewer iterations and less total work? If yes, expand the supported corrections and validate a commercial offer. If source mapping, integration, or cleanup consumes the savings, fix or narrow those dependencies before building a larger interface.
