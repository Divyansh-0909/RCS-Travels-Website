# P04 native viewer instructions

AUTHOR: CODEX | PHASE: P04 | VERSION: 1
STATUS: OUTPUT_READY
REVIEW STATUS: AWAITING_REVIEW
Date: 2026-10-22T20:32:10.808Z
Run: 79361924-917d-4dd9-9740-26c727966c1b

Live A2 review: http://127.0.0.1:4317/?mode=android&issue=P04-A2
A1: http://127.0.0.1:4317/?mode=android&issue=P04-A1
Direct feed: http://127.0.0.1:4317/native

Use the physical phone. Browser clicks do not control Android. The stream hides when the fixture/capture is older than 15 seconds, USB is disconnected, or the isolated test package is not foreground. Native selected-state verification is in the hierarchy evidence; the visual highlight looks the same.

Start Docker Desktop, then run powershell -NoProfile -File tools/ui-quality/preview.ps1 start. Native staging/bundling can take several minutes; a previous frame is not proof of current code. USB awake remains enabled with node tools/phase9-native/phone-awake.mjs enable; this does not bypass a PIN. Stop only the owned fixture with powershell -NoProfile -File tools/ui-quality/preview.ps1 stop-native. These loopback links work on this computer. No startup scheduler was installed.

Tested on one Samsung SM-A528B Android14 physical USB device (1080x2400, density450, font0.9), isolated com.rcstravels.driver.phase9 debug package and disposable synthetic backend. Android accessibility-node metadata was verified; spoken TalkBack was NOT tested. No iOS/other-device/release-build claim. The existing APK was reused with a rebuilt native JS bundle. Full offer/notification/booking/wallet/dispatch journeys were NOT rerun for this metadata-only change; those implementations and role gates were preserved. Earlier P04 backend typecheck failure in untouched StudyAI code and the unfinished full backend suite remain unresolved baseline limitations, not passes. Home and Outstation remain owner-deferred and unchanged. No production data, bookings, payments or external messages were used.
