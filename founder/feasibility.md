# Responsive website assistant: feasibility and product recommendation

Assessment date: 2026-10-12. Name and price are undecided. This assesses a new product; no application has been built or benchmarked here.

## Recommendation

AI-assisted responsive adaptation is technically feasible for a bounded set of source-connected websites. A professional adaptation requires design interpretation, actual browser evaluation, and correction. The opportunity is worth a focused prototype and paid pilot. Demand, repeat usage, delivery economics, and an advantage over existing tools remain unproven.

The founder subsequently clarified the main job: reduce repeated trips back to the IDE or Codex to describe responsive corrections in prompts. The strongest initial product makes those corrections visual and precise, changes the actual source, and re-renders it for verification. AI-generated adaptations can provide an optional starting point. Avoid committing to arbitrary websites or all frameworks before validating this loop.

For example, the user previews a page at a phone width, selects a hero or card group, changes stacking, spacing, or type size, and sees the result immediately. The product captures the affected component, width scope, intended rules, and visual reference so the agent can implement a targeted change. The core promise is to replace vague layout descriptions with actionable visual feedback; an AI-generated first adaptation is not a prerequisite.

## What AI can understand, and what it cannot infer with certainty

Source code exposes component structure, tokens, styles, and behavior. The rendered DOM and computed styles expose the active layout. Screenshots reveal visual hierarchy, spacing, grouping, and image treatment. With those inputs and user constraints, a multimodal coding model can propose responsive changes.

But the original view does not uniquely specify another view. The same desktop sidebar could become a drawer, tabs, an accordion, or a section below the main content. Each is technically responsive; which is appropriate depends on the product's tasks. Likewise, a mobile list could become a desktop grid, remain a narrow reading column, or acquire a detail pane. The tool should expose uncertain decisions rather than pretend it has recovered the designer's intent.

For a marketing hero, a reasonable proposal might stack text and image on mobile, retain the primary action, preserve typography hierarchy, and choose a meaningful image crop. In the reverse direction it might cap reading width and distribute available space rather than enlarge every element. Complex tables, dashboards, third-party embeds, canvas content, menus, and dynamic states need additional rules and evaluation.

Research establishes screenshot-to-code as an evaluated task, but does not establish universal production quality. Design2Code combines automatic visual metrics with human evaluation; it should be read as a benchmark methodology, not a guarantee that a current model can professionally adapt arbitrary sites. [Design2Code](https://arxiv.org/abs/2403.03163).

## A proposed engine

1. **Read the actual project.** Start with a running supported local app, its source, its existing styles, and the approved starting viewport. Record the source revision and representative page state.
2. **Understand the rendered view.** Capture screenshots, DOM structure, bounding boxes, computed styles, and relevant component/source identities. Identify constraints such as important actions, existing spacing tokens, and elements the user wants preserved.
3. **Propose responsive rules.** Prefer fluid sizing, maximum widths, flex/grid reflow, and content-driven breakpoints. Structural changes such as new navigation behavior should be explicit proposals. Adapt both from larger to smaller screens and from smaller to larger screens.
4. **Render and inspect.** Run the actual changed page at chosen widths and between them. Measure overflow, clipping, overlaps, offscreen actions, and obvious regressions. Exercise menus, forms, dialogs, and relevant states. Use visual review for hierarchy and craft; automated checks alone cannot decide taste.
5. **Let the user correct the result.** Offer clear controls such as stack, columns, gap, padding, maximum width, alignment, type scale, and width scope. Include comparison and undo. The user should not need to redesign every screen from scratch.
6. **Implement and verify.** Apply reviewable changes to the original project, rerender from source, and check the accepted result and original viewport. Bound iterations and show what remains unresolved.

Playwright supports viewport and device emulation, making a multi-width check loop practical. Emulation is not equivalent to verifying every physical device or its keyboard, browser chrome, and interaction behavior. [Playwright emulation](https://playwright.dev/docs/emulation).

This is a proposed architecture, not a tested performance claim. Existing code/vision models are a reasonable first implementation; specialized training should follow demonstrated failure patterns and suitable permissioned data rather than be assumed necessary for the MVP.

## Responsive rules, rather than separate pixel canvases

Device presets are useful entry points, but the output needs to behave across continuous CSS-pixel widths. A desktop layout that works at 1440 and a phone layout that works at 390 can still fail at 900 or 430. Support a width slider, intermediate checks, and breakpoint boundary checks.

Capture flow and constraints, not just coordinates. For example: below a selected width, stack the hero vertically, use the existing small spacing token, cap the headline size, and preserve the primary action. Free dragging must translate into meaningful layout rules; silently generating absolute positions produces fragile results.

Record which edits apply globally, within a width range, or to a component/container. Show inheritance and overrides. Reordering needs attention to DOM reading order and keyboard navigation. Existing tokens and component behavior should survive the changes. [MDN media queries](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Media_queries/Using).

## The export file is possible; faithful implementation is the hard part

The user's instruction-file concept is practical. Graphical already distributes human-readable theme guidance and agent resources. That validates the handoff pattern, not the reliability of arbitrary responsive source edits. [Graphical](https://www.graphicalui.com/).

A useful export bundle would contain:

- `RESPONSIVE.md`: design intent, approved starting layout, preservation rules, and acceptance requirements.
- `responsive.json`: stable element/component identities, source references, affected routes, width ranges, and structured layout decisions. Avoid relying only on fragile generated selectors or positional DOM paths.
- Before/after references and screenshots at the approved widths.
- Source revision and page-state information so the agent knows whether the instructions are stale.
- Checks for the original viewport, intermediate widths, and important interactions.

For straightforward spacing or class changes, direct source transformations can be more predictable than asking an AI to reinterpret prose. Use AI for interpretation and more complex structural adaptations. A code patch plus a verified render is a stronger delivery outcome than an unverified instruction file. A repeated card may represent one shared component: the editor must distinguish an instance change from a change that affects every instance.

## VS Code and Codex delivery

**VS Code:** the documented webview API supports a custom preview/editor interface. A proposed extension could host the canvas and property panel, while a local connector instruments the running project and maps selected elements to source. That connector, source mapping, and compatibility with the selected development server are engineering work still to prove. [VS Code webviews](https://code.visualstudio.com/api/extension-guides/webview).

**Codex:** official OpenAI documentation confirms MCP integration for local Codex clients, including the IDE extension. An MCP server could expose inspection, screenshots, selections, saved responsive rules, and verification to the user's agent; a skill could coordinate the workflow. A skill alone does not create a graphical editor. [Codex MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

Treat a custom graphical panel inside a specific Codex client as a separate compatibility question. OpenAI's custom MCP UI documentation describes iframe components in ChatGPT and capability detection across compatible hosts; that is insufficient evidence to promise an identical panel in every Codex surface. A VS Code webview or local browser companion can provide the visual interface alongside the Codex agent. [OpenAI plugin UI](https://developers.openai.com/plugins/build/chatgpt-ui).

**Website fallback:** connect source through a local companion or repository-backed preview. A live URL alone gives rendered output, not the original project files, component identities, or maintainable framework conventions. Cross-origin restrictions prevent a web app from freely inspecting or manipulating arbitrary embedded sites; sites can also block framing. A proxy is not a universal solution for source recovery, authenticated apps, or runtime behavior. [MDN same-origin policy](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy).

## Competition and the business claim

Current primary sources show substantial overlap:

| Tool | Documented/advertised overlap | What to test against it |
| --- | --- | --- |
| Graphical | Visual theme choices and coding-agent resources | Does your responsive handoff solve layout behavior beyond theme consistency? |
| Onlook | Visual editing of existing React projects; React/Next/Tailwind import | Is responsive repair faster and more reliable than a general source-connected editor? |
| Builder Fusion | Existing code/design context, AI responsive generation, visual refinement, code/PR handoff | Does your specialist process produce better accepted adaptations with less correction? |
| Locofy | Design-aware code through MCP and IDE-based responsive refinement | Is your existing-code starting point useful when the user has no organized Figma source? |

Sources: [Onlook React](https://www.onlook.com/for/react), [Onlook import](https://docs.onlook.com/tutorials/importing-templates), [Builder Fusion](https://site.builder.io/fusion), [Locofy MCP](https://www.locofy.ai/docs/mcp/quickstart/). These are vendor descriptions, not side-by-side quality results. This review does not establish a feature missing from all competitors.

The potential advantage is dependable responsive completion in an existing project: fewer correction loops, preserved design intent, verified interactions, and maintainable source. A panel and a generic prompt are easily copied. Reusable source mapping, effective layout repair/evaluation, and permissioned examples of accepted adaptations could become advantages, but none is demonstrated yet.

The supplied reports are useful leads but contain inferred technology choices and unsupported adoption, pricing, funding, comparative reliability, and time-saving claims. Do not use their percentages, funding statements, or estimated build timelines as proof of viability. This assessment does not depend on them.

## Proposed MVP and evidence to collect

Start with source-connected React/Tailwind marketing pages in a local VS Code workflow, subject to customer validation. Cover typography, spacing, hero sections, navigation, grids, and ordinary forms. Support both adaptation directions. Defer a full website builder, arbitrary live-URL imports, every CSS system, animation authoring, and complex application dashboards.

The first engineering spike should prove selection -> scoped visual edit -> source change -> reload -> faithful preview. Build multi-width verification into that loop. After the founder's clarification, this is also the recommended initial user experience, rather than merely a dependency of AI-first generation. Add automatic proposals if they reduce correction effort; do not make them the condition for using the editor.

Test real pages and compare total active time through accepted source with a capable AI agent that also has browser access, plus nearby visual tools where available. Do not compare your fully instrumented product to a deliberately weak one-shot prompt. Measure setup, correction, cleanup, regressions, repeat use, and actual paid pilots. Also count prompt iterations, IDE/preview switches, and attempts needed to reproduce the user's approved change. Use independent design review as well as browser assertions. Suggested gates and the board's differing thresholds are in [board.md](board.md).

This could make coding easier by replacing repeated layout prompts and manual CSS revisions with a precise visual-feedback loop. Whether it does so is a measurable hypothesis. No speed percentage, profitable price, or subscription fit can be concluded from the available evidence.
