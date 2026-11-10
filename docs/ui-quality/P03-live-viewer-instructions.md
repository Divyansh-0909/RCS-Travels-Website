# P03-live-viewer-instructions

AUTHOR: CODEX
PHASE: P03 | VERSION: 1
DATE: 22 October 2026 (Asia/Calcutta)
STATUS: OWNER-DIRECTED CLOSURE — KNOWN VISUAL FINDINGS DEFERRED

Owner instruction: “leave these pages as they are now.” Home (/) and Outstation (/outstation) are kept exactly as currently implemented. No new visual treatment is approved or applied. The existing contrast, touch-target and width findings are deferred by owner direction, not repaired or counted as accessibility PASS. The earlier nonvisual Outstation modal keyboard fix is retained.

Open http://127.0.0.1:4317/?issue=P03-O1&width=390&theme=dark on this machine. Select WEBSITE or ANDROID APP. The website iframe is the actual synthetic Vite application with HMR. Issue buttons select the real route and scroll/highlight the measured element with a non-intercepting overlay. Width controls set the real iframe viewport to 360/390/768/1280/1440px. Account preference uses the existing preference; these two routes report root data-theme=legacy in both cases. No new page theme is fabricated.

Stable issue link: http://127.0.0.1:4317/?issue=ISSUE_ID&width=390&theme=dark . IDs: P03-H1, P03-H2, P03-H3, P03-O1, P03-O2. A width larger than the viewer pane can be panned inside the preview without making the viewer document overflow. Click Locate issue again to return to the element. Internal navigation remains interactive; polling does not reset a booking page. Call/WhatsApp/mail actions are intercepted by this developer fixture and displayed as unsent intent. Unsupported fixture writes return 409.

Android link: http://127.0.0.1:4317/?mode=android . Actual connected physical DEVICE, VIEW-ONLY. Interact directly on the unlocked phone; browser clicks do not control Android. Screens are captured only from com.rcstravels.driver.phase9 in foreground. Both capture and active disposable fixture must be fresh within 15 seconds; disconnected, other-app, no fixture, stopped capture and stale states hide the image. Source dimensions and frame age appear in the viewer. Native Metro uses a staged fixture and requires restart/rebuild when appropriate; no native hot reload is claimed. Current verification: LIVE, 1080 × 2400 physical pixels.

Start from repository root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/ui-quality/preview.ps1 start
node tools/phase9-native/phone-awake.mjs enable
```

Startup reuses owned processes. Android startup needs the connected authorized USB phone, Docker Desktop and the existing isolated debug APK. The script creates only a disposable local PostGIS fixture and loopback Metro/API transports. It does not read application .env files. Stop native with preview.ps1 stop-native; it requests graceful app/Metro/forward/database cleanup and leaves the requested USB keep-awake enabled. Status: preview.ps1 status. Keep the worker alive for the website viewer. These loopback URLs are local to the owner's computer and are not public or accessible to the cloud reviewer.

The owner has now chosen KEEP CURRENT for all five P03 visual findings. The decision is recorded; there is no pending P03 visual-choice request. Existing technical findings remain and no WCAG PASS is claimed. The phase is handed back for ChatGPT review, not expanded to other pages.

At closure the Android transport reports LIVE. Earlier evidence verified the actual 1080×2400 physical DEVICE feed and stale-frame hiding. Current runtime state is separate from that prior verified implementation.
