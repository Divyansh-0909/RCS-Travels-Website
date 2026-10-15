# Isolated physical Android captain checks

Run from the repository root on Windows. The runner uses the existing disposable
PostgreSQL/PostGIS/pgvector harness, real protected application APIs, synthetic
Clerk session restoration and fake payment/routing/notification dependencies.

## Local prerequisites

- JDK 17: `C:\Program Files\Java\jdk-17.0.2`
- Android SDK: `C:\Android` (SDK 36, Build Tools 36, NDK 27.1.12297006)
- Maestro: `C:\maestro\bin\maestro.bat`
- Docker and the existing installed repository dependencies
- One authorized physical USB Android device, unlocked and awake, with private
  notification previews and overlays hidden

The owner accepted the Android SDK terms and authorized USB debugging during this
continuation. User PATH entries were appended; open a new terminal to pick them up.

## Build and run

```powershell
node tools/phase9-native/build.mjs
node tools/phase9-native/phone-awake.mjs enable
node backend/tests/run-phase9-native.js
node tools/phase9-native/phone-awake.mjs restore
```

The build stages the actual captain app under a short owned `C:\r9\<run>` path,
keeps its native dependencies, excludes production configuration and credentials,
and adds the separate `com.rcstravels.driver.phase9` application ID. Original
application files and the installed production package remain independent.

Unlock the phone once before enabling USB awake. The script preserves other
charging flags, records the original setting atomically, and restores only the
same phone's unchanged owned setting. It keeps the screen awake while USB-powered;
the Android lock screen and credentials remain active.

The native runner verifies the APK identity and SHA-256. A fresh test package is
installed; an existing package is reused only when its owned APK has the exact
expected SHA-256. An upgrade requires the recorded predecessor SHA-256, the same
test signing key (also enforced by Android), and verification of the final APK
bytes. It preserves app data. Unknown packages/builds are rejected. Device-side
SHA-256 avoids downloading the installed APK over USB.

Metro and the API bind to loopback. The runner creates only its own USB reverse
ports with `--no-rebind`, loads the debug app, waits for its protected captain
profile, and runs Maestro acceptance/retry/cancellation flows. The synthetic
captain has explicit approved onboarding records; real approval gates stay active.
After an injected acceptance failure, the floating card expires normally and the
captain retries through Notifications, then opens the accepted ride's details.
Assertions then
inspect the synthetic database, retained reservation and offline frozen-V5 guard.
Cleanup stops the test package and owned servers and removes only added ports.

Receipts, generated Maestro recipes and logs go to
`output/phase9-native-device-2026-10-10/`. Recipe implementation is ready; native
journey success requires an actual physical-device receipt. The current checkpoint
is `docs/benchmarks/phase9c-android-device-checkpoint-2026-10-10.md`.

The test APK uses an explicitly invalid Maps key to initialize the actual native
SDK without production credentials. It does not verify maps, tiles or navigation.
The Windows runner invokes Maestro's Java entry point directly to preserve path
arguments. Explicit screenshots and other artifacts stay in each owned run directory;
see [Maestro artifact options](https://docs.maestro.dev/maestro-flows/workspace-management/test-reports-and-artifacts).

## Unit checks

```powershell
node --import ./backend/tests/helpers/phase9UnitIsolation.js --import ./backend/node_modules/tsx/dist/loader.mjs --test backend/tests/phase9NativeInfrastructure.test.js backend/tests/phase9NativeTransport.test.js backend/tests/phase9PhoneAwake.test.js
```

Unit and mutation runs mock ADB and use synthetic staging files. They perform no
phone installation or interaction. Maestro test runs require the physical phone.
Synthetic session restoration does not measure OTP delivery. Maps, actual GPS,
background behavior, gestures and keyboard behavior require separate device proof.

When finished, disconnect the USB cable. The owner can turn off USB debugging or
revoke this computer in Android Developer Options. The runner changes neither
setting and leaves the separate test application installed.
