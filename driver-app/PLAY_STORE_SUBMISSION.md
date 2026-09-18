# RCS Captains — Google Play submission sheet

Last audited: 2026-09-14

This file is the working source for the RCS Captains Play Console submission. It is based on the current driver app and backend behavior. It is not a substitute for lawyer review of retention, privacy-policy, labour/transport, tax, or regulatory obligations.

## App identity

- App name: `RCS Captains`
- Android package: `com.rcstravels.driver`
- Current app version: `1.0.0`
- Website: `https://www.rcstravels.co.in`
- Privacy policy: `https://www.rcstravels.co.in/driver-privacy`
- Account deletion URL: `https://www.rcstravels.co.in/captains/delete-account`
- Support email: `rcstravels.support@gmail.com`
- Support phone / WhatsApp: `+91 85860 88085`

## Store listing copy

### Title

`RCS Captains`

### Short description

`Drive with RCS Travels: get ride offers, navigate trips and track earnings.`

### Full description

`RCS Captains is the driver app for RCS Travels captains.`

`Go online when you are ready to drive, receive nearby ride offers, review trip details, navigate to pickup and drop locations, and keep track of your completed rides and earnings from one place.`

`The app also helps captains complete onboarding and vehicle verification, upload required driver and vehicle documents, receive document-status updates, manage vehicles, view ride history, and contact RCS Travels support.`

`Location is used in the foreground to show captains their position on the Home map. When a captain is online, location is also sent to RCS Travels so nearby captains can be found, relevant ride offers can be dispatched, and assigned rides can show live progress. Background location is used only for the online-driving workflow, including when the app is in the background. Captains can stop background use and server reporting by going offline.`

`RCS Captains is intended for approved RCS Travels drivers and requires an RCS Captains account.`

### Category

Recommended primary category: `Maps & Navigation`.

Reason: the core in-app workflow is driver availability, location-based ride dispatch, live trip progress, and trip navigation. If RCS wants to position the app primarily as workforce software rather than a navigation/dispatch app, `Business` is the reasonable alternative.

### Support / contact text

`Need help with your captain account, documents, rides or payments? Contact RCS Travels at rcstravels.support@gmail.com or WhatsApp/call +91 85860 88085.`

## Data Safety form — code-based answers

The table below is the conservative declaration for what the current captain product collects. “Shared” includes data intentionally exposed to riders/customers. Transfers to Clerk, Google Cloud, Firebase, Google Maps/Routes, Meta WhatsApp and other processors can be answered as **not shared** only if those vendors are acting solely as RCS Travels service providers under the applicable contract/terms. Confirm that vendor role before submitting the form.

| Play data type | Collected | Shared | Required / optional | Processing / purpose | Current app evidence / notes |
| --- | --- | --- | --- | --- | --- |
| Location — Approximate location | Yes | Yes | Required while captain chooses to be online | App functionality; ride dispatch; trip progress; fraud/safety where applicable | Android may provide approximate location; backend receives captain coordinates. Rider-facing tracking exposes captain location while the ride is eligible for live tracking. |
| Location — Precise location | Yes | Yes | Required while captain chooses to be online | App functionality; nearby ride dispatch; navigation; assigned-ride live progress | `expo-location` sends lat/lng while online, including background operation. |
| Personal info — Name | Yes | Yes | Required for captain account | Account management; app functionality; safety/identity | Rider booking/tracking response includes captain name. |
| Personal info — Phone number | Yes | Yes | Required for authentication/account | Account management; authentication; app functionality; support/safety | Phone-backed Clerk account is resolved into the Driver row. Rider booking response currently includes driver phone. |
| Personal info — User IDs | Yes | No* | Required | Account management; authentication; security | Clerk user identity / internal driver ID. `No*` assumes identity vendors are service providers. |
| Personal info — Address | Yes | No* | Required only where present on submitted verification document | Driver/vehicle verification; legal/safety/fraud | Licence/vehicle documents may contain address information even though the app does not expose a separate address field. |
| Personal info — Other info | Yes | Yes | Required for approved-driver onboarding | Driver/vehicle verification; app functionality; safety/fraud | Vehicle registration/model/class, document numbers/expiry, verification state and related captain records. Vehicle plate/model are shown to riders. |
| Financial info — Other financial info | Yes | No | Generated as part of using the service | App functionality; accounting; fraud/dispute handling | Driver wallet balance, earnings, commissions, reimbursements, charges and payment-state records. The captain app does not collect raw card, bank-password, UPI PIN or OTP credentials. |
| Photos and videos — Photos | Yes | Yes | Required where onboarding/vehicle verification requires them | Account profile; driver/vehicle verification; safety | Captain profile photo is shown to riders after approval. Vehicle/document photos remain private to verification/admin flows. |
| Files and docs — Files and docs | Yes | No* | Required where onboarding/vehicle verification requires them | Driver/vehicle verification; legal/safety/fraud | Driving licence, RC, insurance, permit, tax, fitness, PUC/CNG and related documents as applicable. Stored privately. `No*` assumes storage/processing vendors are service providers. |
| App activity — App interactions | Yes | Yes | Required to use ride functionality | App functionality; analytics/operations; safety/fraud | Online/offline state, ride accept/cancel/status changes, ride history and service interactions are sent to the backend; ride state/progress is exposed to the relevant rider. |
| Device or other IDs | Yes | No* | Required for push notifications; otherwise not separately entered by user | App functionality; notifications; security | FCM push token and auth/session identifiers. `No*` assumes Firebase/Clerk are service providers. |

Do **not** select these based on the current code unless a new SDK/flow is added before submission:

- Contacts
- Calendar
- Audio files / voice recordings
- Health and fitness
- Browsing history
- Installed apps
- Credit score
- Raw payment-card details, UPI PINs, bank passwords or banking OTPs
- Crash logs / diagnostics from a third-party crash SDK (none is currently present in the captain app)

### Data Safety purpose selections

Use these purposes for the applicable rows above:

- `App functionality` — primary purpose for account, dispatch, ride lifecycle, navigation, wallet/earnings and verification.
- `Account management` — name, phone, user ID and account/deletion flows.
- `Fraud prevention, security, and compliance` — verification documents, document hashes, account/session identifiers and safety/audit records.
- `Developer communications` — only where the submitted data is used to contact the captain about account/document/ride status. Do not select advertising/marketing unless that use is actually introduced.

Avoid selecting `Advertising or marketing`, `Personalization`, or unrelated purposes unless the production behavior changes.

### Data Safety security questions

- Data deletion request mechanism: **Yes**, once `https://www.rcstravels.co.in/captains/delete-account` is deployed and reachable publicly.
- Data encrypted in transit: answer **Yes only after** the production EAS environment is confirmed to set `EXPO_PUBLIC_API_BASE_URL` to an `https://` endpoint. Current release code accepts the configured URL; development can use HTTP.
- Independent security review: answer **No** unless RCS Travels has actually completed one that meets Google’s definition.
- Data sharing with service providers: before selecting `No` for processor-only transfers, confirm that Clerk, Google Cloud Storage, Firebase, Google Maps/Routes and Meta WhatsApp are used under terms that qualify them as service providers acting on behalf of RCS Travels.

## Background Location declaration

### Primary feature name

`Nearby ride dispatch while the captain is online`

### Declaration wording

`RCS Captains uses background location only after a captain chooses to go Online. The core feature is nearby ride dispatch: while the captain is available for work, the app must continue updating the captain’s location when the app is backgrounded or not actively in use so the RCS Travels dispatch system can determine which captains are near a pickup and send relevant ride offers. If background location is deferred or interrupted while the captain remains online, location becomes stale and the captain can miss nearby ride offers. Location reporting stops when the captain goes Offline.`

### Prominent disclosure shown in-app before the Android background permission step

`RCS Captains collects your precise location while you are online, including when the app is in the background or not in use, so RCS can find nearby rides, dispatch offers, and show your live progress during assigned rides. Choose “Allow all the time” to go online.`

### Background-location review video steps

Record one continuous video on the release build:

1. Open RCS Captains and sign in with the reviewer captain account.
2. Reach the normal captain home screen after onboarding.
3. Tap the control used to go Online.
4. Show the foreground-location explanation and grant the foreground location permission.
5. Show the RCS Captains prominent background-location disclosure immediately before the system background-location permission/settings step.
6. Choose `Allow all the time` / grant background location.
7. Return to the app and show the captain becoming Online.
8. Put the app in the background and show the persistent location foreground-service notification.
9. Return to the app and go Offline, showing that the online location workflow stops.

The video should make the user-trigger, disclosure, Android permission flow, visible foreground-service notification, and Offline stop action readable without editing away the transitions.

## Foreground Service declaration

### Foreground service type

`location`

### Declaration wording

`When a captain chooses to go Online, RCS Captains starts a location foreground service so the app can keep the captain’s location current for nearby ride dispatch and live progress during an assigned ride, including while the app is backgrounded. The service is user-initiated by going Online and displays a persistent Android notification while active. If the service is deferred or interrupted, the dispatch system receives stale or no captain location, which can prevent nearby ride offers and stop live assigned-ride progress. The service stops when the captain goes Offline.`

### Foreground-service review video steps

1. Sign in with the reviewer captain account and open the captain home screen.
2. Tap Go Online and grant the required location permissions.
3. Show the app reporting the captain as Online.
4. Background the app.
5. Show the persistent Android location notification generated for the online shift.
6. Reopen the app and go Offline.
7. Show that the online location workflow/service notification ends.

## Reviewer access instructions

Do not put a real production user’s credentials in this repository. Fill the placeholders below in Play Console immediately before submission.

`RCS Captains is a restricted driver-partner app. Use the dedicated Google Play review captain account below. The account must already be approved/onboarded so the reviewer can reach the Home screen and test ride/location functionality.`

`Review phone/account: [PLAY_REVIEW_CAPTAIN_PHONE]`

`Authentication method / OTP instructions: [PLAY_REVIEW_AUTH_INSTRUCTIONS]`

`If a reusable test OTP or special review authentication method is provided, it must be limited to the dedicated review account and must not disable authentication for normal users.`

`After sign-in: open Home -> tap Go Online to exercise foreground/background location; open Account -> Manage account -> Delete account to review account deletion.`

**Submission blocker:** a working reviewer account and deterministic reviewer authentication procedure still need to be created/configured. Do not submit a review account that depends on an RCS employee manually forwarding an OTP during Google’s review.

## Account deletion behavior and legal-retention review

Current in-app deletion calls the authenticated backend deletion route. The route:

- refuses deletion while an active ride is in progress;
- deletes the captain’s current `DriverLocation` row;
- deactivates the captain account;
- replaces name/phone/auth identity with deletion sentinels;
- clears profile photo reference and FCM token;
- best-effort deletes the profile photo storage object;
- best-effort deletes the Clerk user;
- preserves the stable Driver row so ride, wallet and safety/audit relations remain intact.

Current deletion **does not delete all driver verification records**. `DriverDocument`, `DriverDocumentArchive`, vehicle/ride/wallet/cancellation/complaint and related history may remain, and archived verification-document storage objects are deliberately retained by the current schema/design.

Before Play submission, the business/lawyer must document the lawful reason for retaining each retained category and the retention period or deletion criterion. If no defensible legal/safety/fraud/tax/dispute basis exists for a category, the deletion implementation and storage cleanup must be expanded before release.

This is currently a **release blocker** because the public deletion page promises limited retention for legal/safety/fraud/dispute/tax/regulatory purposes but the code has no documented retention schedule that can be verified against that promise.

## Android permissions/config audit

Intended Android permissions in `app.json`:

- `ACCESS_COARSE_LOCATION`
- `ACCESS_FINE_LOCATION`
- `ACCESS_BACKGROUND_LOCATION`
- `FOREGROUND_SERVICE`
- `FOREGROUND_SERVICE_LOCATION`

Explicitly blocked:

- `SYSTEM_ALERT_WINDOW` — the old “Display over other apps” return overlay was removed; normal Android Back/Recents navigation is used instead.
- `RECORD_AUDIO` — microphone access is not needed by the document/photo flow.

The image picker retains camera and photo-library access because driver/vehicle verification requires document and vehicle photos.

Expo / React Native tooling in this checkout resolves Android target/compile SDK 36, satisfying the Play target-API requirement for updates/new apps from 2026-08-31. Confirm the final generated manifest/SDK from the production `.aab` before upload.

## Production `.aab` checklist

Production EAS profile is configured for Android `app-bundle`, with remote app-version auto increment.

Before accepting the build as release-ready, verify:

- EAS account is authenticated and has access to project `7c344546-07d1-43ed-a2a6-9c1a9b3ddabd`.
- Production EAS environment includes the required Clerk/API/Maps configuration.
- Production API base URL is HTTPS.
- Google services/Firebase configuration is present for the production package.
- Android signing credentials are valid.
- The resulting `.aab` manifest contains the intended location/FGS permissions and does not request `SYSTEM_ALERT_WINDOW` or `RECORD_AUDIO`.
- The resulting app targets API 36.

## Final readiness gate

Code-side items expected before submission:

- [x] In-app account deletion under Manage account.
- [x] Public account-deletion page implemented in the website source.
- [x] Foreground -> background location permission flow is user-triggered from going Online.
- [x] Prominent background-location disclosure implemented before background permission request.
- [x] “Display over other apps” implementation removed and permission blocked.
- [x] Location foreground service tied to the Online state.
- [x] Data Safety draft prepared from actual code/data flows.
- [x] Background Location declaration wording prepared.
- [x] Foreground Service declaration wording prepared.
- [x] Reviewer-access instructions prepared.
- [x] Store listing copy prepared.
- [ ] Lawyer/business confirms retained-data legal basis and retention schedule, or deletion is expanded.
- [ ] Public privacy/deletion pages are deployed and reachable at the final URLs.
- [ ] Dedicated Google review account/auth method is ready.
- [ ] Background Location review video is recorded and uploaded.
- [ ] Foreground Service review video is recorded and uploaded if Play Console requests it for the declared use.
- [ ] Store graphics/screenshots are supplied by the project owner.
- [ ] Production EAS `.aab` completes successfully and its final manifest/target SDK are inspected.
- [ ] Vendor processor/service-provider roles are confirmed for final Data Safety “shared” answers.
- [ ] Production API endpoint is confirmed HTTPS for the Data Safety encryption answer.

## Policy references

- Account deletion: `https://support.google.com/googleplay/android-developer/answer/13327111?hl=en`
- Background location: `https://support.google.com/googleplay/android-developer/answer/9799150?hl=en`
- Prominent disclosure: `https://support.google.com/googleplay/android-developer/answer/11150561?hl=en`
- Foreground service declaration: `https://support.google.com/googleplay/android-developer/answer/13392821?hl=en`
- Data Safety: `https://support.google.com/googleplay/android-developer/answer/10787469?hl=en`
- User Data policy: `https://support.google.com/googleplay/android-developer/answer/10144311?rd=1`
- Android target API requirements: `https://developer.android.com/google/play/requirements/target-sdk`
