# RCS Travels agent guidance

## Scope and sources

- Preserve unrelated user changes; this repository is often developed with a dirty working tree.
- For product rules and unresolved work, read the relevant section of `CONTEXT.md` and `ROADMAP.txt`, then verify it against current code before relying on it.
- Never expose, print, commit, or weaken handling of production credentials or real customer/captain data. Do not add authentication bypasses for deployed environments.

## UI work

- Use the `rcs-ui` skill for any material website or captain-app visual change.
- Treat supplied screenshots or Figma selections as visual acceptance targets, while preserving the repository's behavior and design system.
- Reuse `shared/theme/tokens.cjs` and existing primitives. Do not hand-edit `frontend/src/theme.generated.css`; regenerate it through the package theme script after changing shared tokens.
- A build is not visual verification. Run the affected surface, inspect it at relevant mobile and desktop sizes, capture screenshots, compare them to the target, and iterate. Use `$playwright-interactive` for browser-renderable work when available.
- Do not declare visual fidelity for native maps, gestures, safe areas, or keyboards based only on Expo web. Use a simulator/device image or state the remaining limitation.

## Validation

- Website build: `npm --prefix frontend run build`
- Backend typecheck: `npm --prefix backend run typecheck`
- Backend tests: `npm --prefix backend test`
- Captain-app lint: `npm --prefix driver-app run lint`
- Run the checks for the surfaces changed; do not imply untouched suites were run.

## Nested guidance

`driver-app/AGENTS.md` applies in addition to this file for captain-app work and takes precedence where it is more specific.
