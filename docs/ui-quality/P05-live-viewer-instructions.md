# P05 live viewer instructions

AUTHOR: CODEX | PHASE: P05 | VERSION: 1
CONTINUATION: Owner-requested connected Android follow-up
STATUS: OUTPUT_READY
REVIEW STATUS: AWAITING_REVIEW
Date: 23/10/2026, 3:33:49 pm (Asia/Kolkata)
Run: 968cf0bf-7d54-4e7d-b622-9ba86224340c:android-connected-2026-10-23

Open [website coverage](http://127.0.0.1:4317/?mode=website&coverage=W.SETTINGS.NOTIFICATIONS&width=390&theme=light). Expand Browse coverage inventory, search by screen/route/role/ID/source/state, and filter audit/verification/owner status. Hierarchy indentation follows actual parent IDs. Separate audit, owner, implementation and verification fields are shown; exact prior Drive evidence and known-issue links are retained. Width and theme controls remain available.

Website entries open the real existing product renderer in the local synthetic preview. Customer/admin fixture actors are explicitly selected by the loopback helper. Notifications, Language, Safety/Help and account/admin section names can be positioned through actual navigation buttons. Other state transitions require the recorded safe steps; they are not automatically exercised. A /dev/... target is labelled SYNTHETIC FIXTURE and is not a protected-route/backend pass. Missing ID/token/case fixtures show NOT_RUN/unavailable and hide the old frame. Shared source groups are not fake URLs. The vehicle quote fixture is limited; it does not prove working prices.

Select Android to browse the separate native inventory. The frame is always the existing /native device stream, VIEW-ONLY. It uses current device/fixture freshness: a connected healthy isolated app is LIVE; disconnected, background, stale or unavailable frames are hidden. Selecting coverage describes an inventory row and never positions the phone. Selecting a native item never runs ADB/Maestro, changes routes, or substitutes an Expo/web mock. Historical P02/P04 checks remain separately dated.

Start the watcher with node tools/handoff/cli.mjs start. Start only the website fixture using node tools/ui-quality/serve.mjs (a hidden existing helper process is already running for this review). Reload the reviewer after updating the tracker. Do not use preview.ps1 start while deliberately working without a device, because that command also starts the native fixture. Rebuild/validate with node tools/ui-quality/coverage/discover.mjs, node tools/ui-quality/coverage/build.mjs and node --test tools/ui-quality/coverage/coverage.test.mjs. Keep stable IDs; a removed ID is a validation error requiring explicit reconciliation. Update status fields only from new bounded proof and recorded owner choices, not by marking an entire parent done.

Original Home/Outstation issue queue and separate routes remain available. Loopback URLs work on this computer; no new hosting, paid service or scheduler was added.
