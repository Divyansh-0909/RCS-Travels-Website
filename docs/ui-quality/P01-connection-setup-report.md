# connection-setup-report

AUTHOR: CODEX
PHASE: P01
DATE: 21 October 2026 (Asia/Kolkata)
EVIDENCE SNAPSHOT: 2026-10-21T07:44:01.420Z
GIT BASE: 2ff51e7d9dade932cd21dfe5d836488d4b9a700a

The automatic local handoff is implemented and running. Google Drive/Docs API reads, a red status insertion, preservation of existing green text, upload/readback/delete, the change feed, a real Codex CLI turn, and a real fixture-dispatch/restart test were verified. This report is published before releasing P01 bootstrap ownership; final review readiness is recorded in the newest red Doc output.

Architecture: one Node 24 worker in tools/handoff, one repository lock, atomic durable JSON state, 60-second Drive change/revision reconciliation, and supported Codex CLI 0.160.1 JSON events. Existing ChatGPT authentication is used; no Codex SDK, app-server daemon, paid API fallback, cloud worker or duplicate ChatGPT automation was introduced. App-server capabilities and CLI resume help were inspected; CLI was the simpler supported interface. The chat Drive connector read the authoritative document first; background access uses the installed Google CLI after the owner's completed Drive consent. Credentials stay in their existing OS profiles.

Connections: Drive CONNECTED (correct folder and canAddChildren); Docs CONNECTED (correct document/revision and formatting readback); Codex CONNECTED (ChatGPT login, turn.completed and thread ID saved). The existing hourly ChatGPT reviewer was preserved, not independently reconfigured or instant-triggered. Its next successful review remains external to this local worker.

Configuration is ignored output/handoff/config.json; machine state, checkpoints, per-run prompts, last successful tests, manifests and heartbeat are under output/handoff. Application .env files were not edited; credentials were not printed, copied or uploaded. The dedicated fixture preview loads no .env files. Worker network/status listeners bind only to loopback. Optional startup is available but was not installed.

Packages: the worker needs no npm packages. Frontend developer tooling added Storybook 10.6.3 (react-vite, a11y, docs), @axe-core/playwright 4.14.0 and Chromatic 18.13.0; existing Playwright 1.64.0 and Maestro 2.11.0 were reused. Production application behavior changed only through accessible-name props on the existing switch family.

Commands from repository root:

```powershell
.\tools\handoff\handoff.ps1 start
.\tools\handoff\handoff.ps1 status
.\tools\handoff\handoff.ps1 stop
.\tools\handoff\handoff.ps1 restart
.\tools\handoff\handoff.ps1 resume
node tools/handoff/cli.mjs probe
node tools/ui-quality/serve.mjs
```

Viewer http://127.0.0.1:4317/ ; safe actual frontend http://127.0.0.1:1575/ ; Storybook http://127.0.0.1:6006/ . Bootstrap was registered to this existing session, then the worker was stopped/restarted multiple times without dispatching another P01 task. The phase becomes idle AWAITING_REVIEW only after manifest/artifact verification and red OUTPUT_READY publication. Next prompts must follow the plain ready header/version convention in tools/handoff/README.md; no signature or extra approval is required. Product and production-action approval boundaries remain in force.

Known limits: CLI tasks are not promised to appear in this already-open desktop conversation; laptop power/network and the worker are required. Exact intra-turn replay is not supported by this integration; resume uses the saved thread/checkpoint. Unknown quota resets use 6/12/24-hour retries then manual resume. Real quota exhaustion was not induced; recovery was simulated. Native verification: FAILED: Isolated native startup/journey verification — accept-failure-and-retry Maestro exit 1 — failed assertion: "Controlled acceptance outage. Please retry." is visible. Evidence: P01-native-verification.json. USB keep-awake remains enabled at the owner’s request. Chromatic cloud publishing remains unexecuted without a project token. [Authoritative handoff](https://docs.google.com/document/d/1mfFSj9kbob7mAE5CuUW9aR1LBnoHjVS0vb6w91KvzJ8/edit); [workspace](https://drive.google.com/drive/folders/1mSEZf7o3AiBFdcTe0YSDljVOQSuHwmk5).
