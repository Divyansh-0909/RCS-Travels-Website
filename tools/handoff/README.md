# Local ChatGPT ↔ Codex handoff

The Node worker polls the existing Google Doc and Drive change feed every 60 seconds. Two stable observations of an explicit phase header/status start one `codex exec --json` task. The current bootstrap session owns P01 until its verified output has been published. No extra signed manifest or owner authorization is required for each prompt.

Google API access uses the installed Google CLI's authenticated profile. Its supported `gcloud auth print-access-token` command refreshes tokens. Codex uses the existing ChatGPT login, removes API-key environment variables, forces ChatGPT login, and ignores custom user model-provider configuration. The worker makes no separately billed API fallback calls. No production application services import this tooling.

## Daily commands (repository root)

After a Windows restart, start the preview processes again with `powershell -NoProfile -ExecutionPolicy Bypass -File tools/ui-quality/preview.ps1 start`. Start Docker Desktop first when Android preview is needed. `ERR_CONNECTION_REFUSED` at port 4317 means the local viewer is not listening; it does not indicate that visual approval was granted or that the phase should resume. State-file replacement retries temporary Windows permission/busy errors while preserving the previous complete checkpoint.

P03 live owner review: run `powershell -NoProfile -ExecutionPolicy Bypass -File tools/ui-quality/preview.ps1 start`, then open http://127.0.0.1:4317/?issue=P03-O1&width=390&theme=dark . WEBSITE shows the real HMR frontend and five measured element selections. ANDROID APP shows fresh frames of the actual foreground isolated device app, explicitly VIEW-ONLY; interact directly on the physical phone. The fixture must be active and both fixture/capture heartbeats fresh. See [the live-viewer instructions](../../docs/ui-quality/P03-live-viewer-instructions.md) for issue URLs, supported preferences, startup/cleanup and limitations.

`APPROVAL_REQUIRED` is an owner visual-choice gate. Retry, force resume, a newer prompt/correction, and process restart cannot clear it. Record the owner's exact issue/treatment decisions before clearing the durable `approvalRequired.active` flag and continuing the same phase. Evidence may be uploaded while awaiting that decision; no OUTPUT_READY or next phase is claimed.

```powershell
.\tools\handoff\handoff.ps1 start
.\tools\handoff\handoff.ps1 status
.\tools\handoff\handoff.ps1 stop
.\tools\handoff\handoff.ps1 restart
.\tools\handoff\handoff.ps1 resume
node tools/ui-quality/serve.mjs
```

Viewer: http://127.0.0.1:4317/ . Safe actual frontend with hot reload: http://127.0.0.1:1575/ . Original local frontend, if already running: http://127.0.0.1:1574/ . The viewer's page selector keeps Home and Outstation separate. Select Settings and use the application's own theme control. Native app screens require the isolated device fixture; browser previews are not native verification.

The fixture server loads no `.env` files, reuses the existing synthetic Clerk transport, and disables unsupported mutations. Its notifications are synthetic in-memory state; this does not demonstrate real account/database persistence. Start it in a second terminal while watching fixes.

On Windows the CLI launcher explicitly selects the existing `elevated` Windows sandbox implementation while retaining `workspace-write`. This is needed because `--ignore-user-config` also skips the saved Windows sandbox selection. Workspace network access is enabled for local fixture servers, Docker and ADB. `node tools/handoff/verify-write.mjs` checks an actual file write and loopback request; `--resume-readonly` repeats the check using the original read-only smoke thread. These probes use isolated Git fixture directories and never execute an RCS phase.

During P02, `node tools/ui-quality/native-live.mjs` provides test-package-only frames for http://127.0.0.1:4317/native . It captures only while `com.rcstravels.driver.phase9` is the foreground app, keeps a bounded rolling frame set locally, and marks frames older than 15 seconds unavailable. It does not launch the native test or interact with other apps.

Optional Windows sign-in startup (worker only):

```powershell
.\tools\handoff\handoff.ps1 startup-install
.\tools\handoff\handoff.ps1 startup-remove
```

This creates/removes only `RCS Handoff.lnk` in the current user's Startup folder. It is not installed automatically. Laptop power, connectivity and repository access are required. Startup does not log in to a locked computer or keep it awake.

## One-time configuration / authentication recovery

```powershell
gcloud auth login rcstravels.business@gmail.com --enable-gdrive-access --force --no-activate
codex login
$taskCodex = Join-Path $env:APPDATA 'npm/node_modules/@openai/codex/bin/codex.js'
node tools/handoff/cli.mjs configure --account rcstravels.business@gmail.com --gcloud (Get-Command gcloud).Source --codex $taskCodex --preview http://127.0.0.1:1575
node tools/handoff/cli.mjs probe
```

Stop before configuring. Google credentials remain in Google's user profile and Codex credentials in Codex's profile; they are never copied into the repository or uploaded. The chat connector is useful interactively but is not a callable background Node credential provider. Drive consent grants the existing Google CLI Drive access; no cloud deployment or new OAuth application is needed.

## Ready-prompt contract for the existing hourly reviewer

Append the next prompt in the same Google Doc, in ChatGPT green `#18713C`:

```text
P02 | Concrete next task
STATUS: PROMPT_READY
VERSION: 1
OBJECTIVE: ...
DELIVERABLES: P02-execution-report.md, ...
...actual requirements and acceptance checks...
```

`STATUS: ACTIVE` is also accepted. P01's existing `ACTIVE / AWAITING CODEX OUTPUT` is recognized. A correction uses the same phase ID with an incremented `VERSION` and `STATUS: CORRECTION_REQUIRED`; a processed version is never silently re-executed. Put reviews below `CHATGPT REVIEW` or `P02 REVIEW:` so review prose is outside the executable prompt. Colors identify authors and are never execution authority. Historical prompts remain unchanged. The worker appends its own sections in red `#B4232E` using Google Docs `updateTextStyle` over only the insertion's UTF-16 range.

The local state/manifest is a mirror for idempotency and checkpoints, not a replacement for the Doc. All mutable data lives under ignored `output/handoff/`: `state.json`, `progress.json`, `config.json`, worker lock, per-run prompts/checkpoints/results/artifact manifests. Do not commit or upload the entire runtime directory.

The worker publishes `OUTPUT_READY` only after required artifacts pass local checks, upload, authenticated byte/hash readback, and manifest upload. It then waits in `AWAITING_REVIEW`; the existing hourly ChatGPT automation reviews the Doc/folder. No second ChatGPT automation is created, and there is no claim that a Drive event instantly invokes this conversation.

## Recovery and progress

States: PROMPT_READY, CODEX_RUNNING, OUTPUT_READY, AWAITING_REVIEW, CORRECTION_REQUIRED, APPROVAL_REQUIRED, PAUSED_USAGE_LIMIT, PAUSED_OFFLINE, PAUSED_AUTH, FAILED. Heartbeats persist every five seconds. One worker lock protects the repository; a surviving child PID prevents a replacement task after a worker crash. Publication retries never relaunch a completed model task.

Usage errors save thread ID, working-tree checkpoint, tests and reported reset. Known resets are retried after the reported time plus a minute; unknown resets use 6/12/24-hour backoffs, then manual resume. No quota probes repeatedly call the model. `resume` continues the exact stored thread, or uses the precise prompt/checkpoint if no thread was confirmed. Exact intra-turn replay is not promised. Authentication failures in a model task need sign-in followed by `resume`; Google network/auth failures back off and recheck. Approval-required phases remain idle until an explicit correction/decision is published. No next prompt is invented locally.

```powershell
node tools/handoff/cli.mjs progress --screen 'Settings / Notifications' --route /dev/settings --issue 'Concrete issue' --doing 'Current action' --status Editing
node tools/handoff/cli.mjs progress --screen 'Settings / Notifications' --issue 'Concrete issue' --doing 'Checks passed' --status Fixed --verified true --evidence 'actual functional/theme/responsive/regression commands and results'
npm --prefix tools/handoff test
```

## Sources verified during setup

- [Codex noninteractive execution](https://developers.openai.com/codex/noninteractive/) and installed `codex exec --help` / `codex exec resume --help`.
- [Codex app-server](https://developers.openai.com/codex/app-server/) was inspected; CLI JSON events are sufficient, so no second execution system was built.
- [Google CLI Drive consent](https://docs.cloud.google.com/sdk/gcloud/reference/auth/login).
- [Drive change feed](https://developers.google.com/workspace/drive/api/guides/manage-changes), with direct document revision reconciliation to catch missed/public-link change-feed events.
- [Google Docs text formatting](https://developers.google.com/workspace/docs/api/how-tos/format-text).
