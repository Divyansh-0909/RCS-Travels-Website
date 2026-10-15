# Board assessment: responsive website assistant

Assessment date: 2026-10-12. This is a simulation applying published frameworks, not an endorsement by their authors or evidence of customer demand.

## Subsequent clarification and its implication

The founder clarified that reducing repeated responsive-layout prompts is the central job. AI-built websites may look wrong at another width, and describing every correction back in the IDE or Codex is tedious. The product should let the user show the intended layout directly and provide precise implementation context. Automatic adaptation is an optional accelerator. The scores below describe the original two-workflow proposal and have not been rerun following this clarification.

The updated MVP recommendation is therefore a source-connected visual correction loop: preview, select, adjust within a width range, implement, and verify. Measure how many prompt iterations it removes and total time through accepted code. AI-first adaptation can follow once that loop is reliable.

## Vote

**3 FUND IF, 0 FUND, 0 PASS. Average score: 6/10.** The votes support a bounded prototype and real customer validation. They do not justify committing to a universal visual website editor yet.

| Lens | Score | Vote | Decisive concern |
| --- | --- | --- | --- |
| Offers | 6/10 | FUND IF | Setup, correction, and handoff may consume the promised savings; no defined paying segment or purchase evidence. |
| Monopoly | 5/10 | FUND IF | Nearby competitors already combine AI, visual editing, and existing source; differentiation and repeat use are unproven. |
| Product | 7/10 | FUND IF | The experience is compelling only if accepted previews become working, maintainable source changes. |

Individual reasoning: [Offers](board/offers.md), [Monopoly](board/monopoly.md), [Product](board/product.md).

## Shared risks, highest priority first

1. **Preview/source disagreement.** A DOM overlay or design canvas is insufficient. The changed project must render the result the user approved, including shared components and actual interactions.
2. **Unproven advantage and economics.** Faster generation does not establish lower total completion time. Include setup, manual edits, agent iteration, source cleanup, and support. Price, repeat usage, acquisition cost, and delivery cost remain open.
3. **Excessive scope.** Every website, framework, component, and device would create too many failure modes. Start with one code/style stack and a bounded page type, with both mobile-to-desktop and desktop-to-mobile tests.
4. **Professional quality is broader than screenshot quality.** Preserve identity, hierarchy, content, navigation, accessibility, intermediate-width behavior, and the original approved layout. Hiding essential content or overflow is not a valid repair.

## Disagreements to preserve

- The Product lens sees the highest potential in AI-first adaptation with reversible controls. The Offers lens places more weight on a paid buyer's confidence and remaining work. The Monopoly lens considers even a successful experience insufficient without an advantage over existing tools.
- The Offers lens proposes 30% median total time saved as an initial value test; the Monopoly lens proposes 50% as a stronger differentiation gate. These are suggested thresholds, not expected or measured performance.
- The founder's audience remains broad. Offers favors freelancers or small agencies with recurring paid work; Monopoly suggests people finishing AI-generated React/Tailwind landing pages in VS Code. Neither proposed segment is established demand or a decision made by the founder.

## Merged conditions

These are proposed validation gates. Checkboxes indicate unfinished work, not mandatory platform requirements.

- [ ] Choose a specific initial buyer, source stack, page type, and acquisition channel. Leave the brand and price undecided until tested.
- [ ] Interview 12 people about recent responsive-repair jobs. Recruit at least 10 qualified participants for usability/demand evaluation, with permission to use their sites. Obtain actual task evidence, not compliments.
- [ ] Prove a complete source-connected change: select an element, edit a width-scoped layout rule, implement a reviewable change, reload the real page, and compare with the approved preview. Account for repeated instances and shared styles.
- [ ] At least 8 of 10 usability participants connect a supported project and verify one useful adaptation within five minutes without facilitator help.
- [ ] Evaluate at least 12 pages balanced between mobile-first and desktop-first inputs. At least 10 pass the defined craft and usability rubric, with two independent reviewers assigning at least 4/5. Include 360, 768, and 1440 CSS-pixel widths, intermediate widths, original-width comparison, keyboard use, focus, reading order, and 200% zoom. No unresolved new blocking interaction failures.
- [ ] On 20 held-out pages, compare total active repair time and accepted output quality with the user's usual AI-agent/browser workflow and relevant Onlook/Fusion workflows where available. Use the same requirements and comparable information. Seek at least 30% median savings for initial value and 50% to support a strong specialist advantage; report both directions separately.
- [ ] Obtain five paid pilots at a declared test price and three repeat uses on separate pages within 30 days. Record acquisition effort, revisions, compute, and support. Establish viable unit economics before scaling; do not assume a subscription fits an occasional task.
- [ ] Demonstrate a reusable advantage: reliable element-to-source mapping, a responsive repair/evaluation system, or permissioned examples of accepted/rejected adaptations that improve results. A panel plus a prompt is not demonstrated defensibility.
- [ ] Verify the delivery integration separately. VS Code webviews and Codex MCP tools are documented capabilities; custom UI inside a particular Codex client still requires a compatibility spike.

## Strongest version of the business

An editor-connected assistant for people correcting responsive layouts in AI-built React/Tailwind marketing websites: keep the design already approved at one width, let the user show desired corrections at other widths through a live preview, and deliver a verified patch in the existing project. AI-generated adaptations may provide a starting point. This narrows support and makes precise visual feedback and reliable responsive completion the central outcome. React/Tailwind and marketing pages are recommendations to test, not founder-supplied requirements.

Next skill: `founder-competitors` for a focused comparison of actual repair workflows. Follow with real paid pilots; a simulated consumer panel can suggest objections but cannot validate purchases or design quality.

Technical assessment and proposed architecture: [feasibility.md](feasibility.md).
