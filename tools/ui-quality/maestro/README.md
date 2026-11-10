# Native P01 verification

Maestro 2.11.0, Java 17, adb, a connected Android device and the isolated `com.rcstravels.driver.phase9` package were discovered on this laptop. The production package is not a test target. No iOS simulator is available on Windows.

Reuse the existing verified isolation harness instead of introducing another native authentication provider:

```powershell
node backend/tests/run-phase9-native.js --keep-awake
```

This runner starts an isolated PostGIS environment, supplies only synthetic credentials/providers, validates the test APK identity/hash, stages the existing Expo 55 app and local transport, starts Metro and USB forwarding, and cleans up the device/backend session. Existing flows cover launch, optional permission prompts, offers, acceptance/failure/retry, navigation and cancellation. Broader flows are in `backend/tests/run-phase9-native-expanded.js`.

The supplemental `p01-readonly.yaml` is for a session already started by that harness. It does not launch or authenticate the production app. It checks navigation and saves evidence without accepting, dispatching or paying for a ride. Do not run it against arbitrary device state. Auth form/theme/error-state coverage requires an extension of that isolated fixture and must remain NOT RUN until executed.

```powershell
maestro test tools/ui-quality/maestro/p01-readonly.yaml
```

The actual connected-phone run restored the synthetic captain session and delivered the controlled acceptance HTTP 503, but failed the expected retry-message assertion. Its device screenshot and sanitized verification summary are included in the P01 handoff. This is a failed native check, not an unavailable-device claim. A test-only bundle downloader fixes the cold-build header timeout while retaining a bounded deadline. No production booking behavior was changed.

Native appearance, maps, safe areas, gestures, background state and keyboards cannot be approved from Expo web or website screenshots. Tool/package discovery alone is not a Maestro test pass. USB keep-awake was explicitly requested by the owner and is left enabled; restore it only when requested using `node tools/phase9-native/phone-awake.mjs restore`.
