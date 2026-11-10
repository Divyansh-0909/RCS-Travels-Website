# live-viewer-instructions

AUTHOR: CODEX
PHASE: P01
DATE: 21 October 2026 (Asia/Kolkata)
EVIDENCE SNAPSHOT: 2026-10-21T07:44:01.423Z
GIT BASE: 2ff51e7d9dade932cd21dfe5d836488d4b9a700a

Open http://127.0.0.1:4317/ . The left pane is the real frontend with hot reload; the right pane shows current screen, issue, action, status, verified fixes, heartbeat and connection/usage pauses. Follow current screen is the default. Page selection keeps Home/Landing and Outstation independent. Width choices include 360, 390, 768, 1280 and 1440px; the left pane scrolls for wide previews.

Start worker: .\tools\handoff\handoff.ps1 start . Start safe frontend in another terminal: node tools/ui-quality/serve.mjs . Direct frontend URL: http://127.0.0.1:1575/ . Settings fixture: http://127.0.0.1:1575/dev/settings . Select Theme in the actual application to choose System/Light/Dark. Marketing and booking routes keep their fixed legacy policy; no missing theme is invented. On phone, the existing section menu switches between navigation and content.

The dedicated fixture server serves the actual app, existing synthetic Clerk transport and local in-memory preference APIs without loading .env. It disables unsupported mutations. It proves frontend behavior, not real backend persistence or real payments/dispatch. The existing normal Vite server at 1574 was left running and reused only as an observed environment fact; P01 tests used 1575.

Storybook: npm --prefix frontend run storybook ; http://127.0.0.1:6006/ . View the existing control stories in light/dark. Accessibility addon is manual to avoid simultaneous axe runs; the Playwright checks execute axe automatically. Watch browser tests with npm --prefix frontend run test:ui -- --headed --workers=1 . Native screens require the isolated Android harness described in tools/ui-quality/maestro/README.md; no native visual fidelity is claimed.

Worker status/stop/restart/resume: .\tools\handoff\handoff.ps1 status|stop|restart|resume (run one action per command). Optional sign-in startup: startup-install; remove it with startup-remove. Startup was not enabled automatically. Laptop must remain powered, connected and able to access this repository. Servers are loopback-only.

P01 progress actually transitioned Investigating → Editing → Testing → Fixed, with timestamps persisted before/after meaningful changes. FIXED — VERIFIED was set only after 30 browser checks, axe, the frontend build and 68 existing frontend tests passed. [Desktop viewer](https://drive.google.com/file/d/1geUedHvf5wbJCnSPrMm80rfw6PNKWUMu/view?usp=drivesdk); [phone viewer](https://drive.google.com/file/d/1PQUkxbertFV23uIox10g4zSF3T-0bpBb/view?usp=drivesdk).
