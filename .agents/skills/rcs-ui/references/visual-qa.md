# Visual QA loop

Use this reference whenever a UI is created, materially restyled, or reviewed against a visual target.

## Before changing the screen

1. Open the current implementation at the state being changed.
2. Capture a baseline when the environment permits.
3. Record the target viewport, state, and reference image or explicit design direction.
4. Identify the existing primitives and tokens the screen should reuse.

If the target state requires authentication or seeded data, use an existing safe local flow. Do not weaken authentication, add production bypasses, or mutate production data merely to obtain a screenshot.

## Run the appropriate surface

Website:

```powershell
npm --prefix frontend run dev -- --host 127.0.0.1
```

Captain app web rendering when it represents the changed UI accurately:

```powershell
npm --prefix driver-app run web
```

For native-only behavior, use the available Expo development build, simulator, or physical-device screenshot. Do not treat Expo web as proof for native maps, gestures, keyboard behavior, safe areas, or platform-specific layout.

## Inspect with the real renderer

Use `$playwright-interactive` for browser work when available. Reuse one live browser session while iterating so state and console evidence remain visible.

Choose viewports from the task's actual targets. When none are specified, cover at least:

- Phone: 390 × 844
- Tablet or constrained desktop when layout behavior changes: 768 × 1024
- Desktop: 1440 × 900

At every relevant viewport, inspect:

- first-glance hierarchy and obvious next action;
- alignment, spacing rhythm, grouping, and unused space;
- wrapping, clipping, overflow, fixed chrome, safe areas, and keyboard obstruction;
- hover, focus, pressed, disabled, loading, empty, error, and success states affected by the change;
- maps, sheets, drawers, overlays, and z-index relationships;
- contrast, touch-target size, and reduced-motion behavior;
- console errors and broken assets.

## Compare and iterate

Compare the rendered screen directly with the supplied reference or written direction. Name the largest mismatch, fix it, and capture again. Repeat until the remaining differences are intentional and defensible.

Do not accept these as completion evidence by themselves:

- a successful build;
- component code that appears reasonable;
- one screenshot at one viewport;
- a statement that the UI is "close" without a direct comparison;
- placeholder or mocked content that hides real wrapping and state problems.

Store disposable screenshots outside tracked source or under an ignored temporary screenshot directory. Commit visual artifacts only when the user explicitly wants them as project references.

## Static verification

After visual iteration, run the checks relevant to the changed surface:

```powershell
npm --prefix frontend run build
npm --prefix driver-app run lint
```

Run both only when both surfaces changed. Report visual checks separately from build or lint results.
