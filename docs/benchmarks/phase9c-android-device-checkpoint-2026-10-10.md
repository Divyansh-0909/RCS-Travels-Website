# Phase 9C — physical Android setup and native captain journey

10 October 2026 (IST). Continues the [authenticated browser checkpoint](phase9c-authenticated-ui-checkpoint-2026-10-10.md). Evidence: `output/phase9-native-device-2026-10-10/`. Historical checkpoints and failed trials are preserved. **Phase 9C remains PARTIAL.** The supported native captain journey now works; broader UI/device coverage and Phase 9D remain outstanding.

## I — Actual Windows/device setup

| Component | Executed setup |
| --- | --- |
| Windows / shell | Windows 11 Home Single Language, build 26300, x64; PowerShell 5.1 |
| Node / npm | 24.14.1 / 11.11.0, reused |
| Java | Explicit JDK 17.0.2 at `C:\Program Files\Java\jdk-17.0.2`; existing Java 24 PATH installation retained |
| ADB | `C:\Android\platform-tools\adb.exe`, ADB 1.0.41, Platform-Tools 37.0.1-15733141 |
| Android SDK | SDK 36, Build-Tools 36.0.0 (35.0.0 also installed by Gradle), NDK 27.1.12297006, CMake 3.22.1 |
| Maestro | 2.11.0 at `C:\maestro`, Java entry point used locally; analytics/AI analysis/cloud execution disabled |
| Actual phone | Samsung SM-A528B, Android 14/API 34, arm64, 1080 × 2400; authorized physical USB verified independently of its serial string |
| Actual app | Expo 55.0.28, React Native 0.83.10, React 19.2, development client 55.0.37 |

Official tool archives were checksum-verified. The owner approved USB debugging and the Android SDK license, unlocked the phone and hid notification previews. The existing OEM/ADB driver, native Android project and local Docker engine were reused. Android Studio, an emulator, EAS and cloud uploads were not used. User PATH entries were appended; existing entries were retained. New terminals pick up the persisted PATH.

The separate test package is **`com.rcstravels.driver.phase9`**. The installed production package remains untouched. The final local APK is 80,152,100 bytes, SHA-256 **`e0129e33476f6f955607a86153866a63327b756d7ee080225401b362579acdb1`**, build `8148ba4b-272b-4bd4-89ca-4d91c881565b`. Gradle completed in 6m 14s. The prior APK and build records remain preserved. Its test signing certificate matches the new APK; the installer upgrades only the verified predecessor, preserves app data and rechecks final bytes. Unknown installed builds fail closed.

## II — Executed native journey

Selected fresh-process runs:

- Primary: `20261010152309668-b8fe2b8a-a420-4129-82ff-c1a5b902ab62`.
- Independent repeat: `20261010151631979-3a79f013-75a3-495a-8ec3-8b4d013729a4`.

Both recorded **process exit 0**, three ordered assertion groups PASS, matching APK/executor identities, **207 backend source/config identities** and matching staged application identities. Receipts have verified integrity hashes. `native-repeat-comparison.json` records the comparison. An earlier successful receipt is retained separately; its PowerShell invocation returned shell status 1 while recording Node warnings, so the selected runs use structured subprocess exit recording.

1. The actual native Clerk SDK restores a synthetic signed session and reaches protected captain APIs. Approved synthetic driver/vehicle document records supply fixture setup; real authentication and approval gates remain active. OTP delivery, document upload/scanning and human approval journeys were not tested.
2. Real booking/payment services prepare a scheduled booking. The actual signed raw HTTP webhook receives the fake advance capture twice, with one authoritative capture. Actual assignment services persist the offer. Native Accept receives a controlled 503 with **no assignment/debit**. The existing 30-second panel expires, the captain opens Notifications and retries through the real protected acceptance handler: one owner and one **₹100** reservation, wallet **₹1,000 → ₹900**.
3. Native Close → Back → Ride details opens the matching booking reference. Native cancellation selects “Rider cannot be contacted” and confirms. Assignment is released, capacity returns to four, and the original owner's hold remains reserved: wallet **₹900**. The real collector creates the immutable driver-cancellation incident. Frozen-V5-compatible offline analysis proposes DRIVER_CAUSED; the independent gate returns **NEEDS_ADMIN_REVIEW**. Final decisions, liabilities and strikes remain zero; the advisory evaluation cannot change financial state.

The captain actions execute through Maestro and actual Android controls, not direct HTTP substitutes. Setup/external payment delivery and independent database assertions use the existing isolated harness. Owner-approved 0%/10% commission and reservation ownership rules remain unchanged.

Explicit native screenshots show the acceptance failure, accepted prompt and booking details. This is physical UI execution, not a complete visual-fidelity pass. The test APK supplies an explicitly invalid Maps key solely to avoid SDK initialization failure. Maps/tiles/navigation remain unverified; location permission remained denied. Dark offer-address contrast and existing Reanimated warnings remain observed UI debt.

## III — Failures corrected and permanent witnesses

- Windows Ninja paths exceeded MAX_PATH: short owned build roots, with a path regression. Existing native dependencies remain intact.
- Windows batch wrapper quoting failed: direct Gradle and Maestro Java entry points, now exercised by the successful native runs.
- Metro could not follow junction targets or cross-drive Expo virtual paths: preserve aliases plus canonical dependency/shared roots and stage runtime JS on the repository drive. Permanent resolver/staging tests cover these cases.
- Native Clerk rejected the browser fixture's incomplete billing DTO and padded publishable key: native-only billing fields and unpadded synthetic key, with explicit regressions. Original browser authentication fixture and signed session contents remain unchanged.
- Native onboarding redirected incomplete fixtures to documents: explicit owned fixture records and protected profile preflight. Importing the document service before database isolation produced a denied-runtime-DB failure; services now load after harness creation.
- Missing native Maps metadata crashed the test app: strip any source Maps key and inject the invalid isolated key. Staging and verified upgrade regressions cover the correction.
- Animated offer timing and native navigation differed from assumed recipes: bounded test settling, ordinary panel expiry, persistent Notifications retry and the visible Ride details control. The full native recipe is the permanent regression; app timeouts and business policy were not changed.

Failed receipts/logs remain available. Seven unverified automatic trial captures were discarded; private overlays/home screens are not accepted evidence. Device serials are redacted in distributed diagnostic artifacts.

## IV — Isolation, replay and phone cleanup

The dedicated backend child excludes production credentials, uses empty dotenv and denied runtime database URLs, restricts host sockets to loopback, and migrates owned disposable PostgreSQL/PostGIS/pgvector databases. Fake payment/auth/notification/routing dependencies are explicit. Advisory triggers deny consequence writes. The test app points to USB-forwarded loopback services; only owned reverse mappings and processes are removed. Original application sources and unrelated working-tree changes are preserved.

Native receipts save setup observations, requests, fault outcomes, final booking/wallet/provider state, immutable case/evidence and raw-versus-guarded results. `node backend/tests/run-phase9-native.js` recreates this bounded scenario. Native recipe re-execution and ordered outcome comparison are **not exact saved-input UI replay**. The separately executed backend replay remains distinct evidence.

USB stay-awake was enabled temporarily as **0 → 2**, then restored and independently read back as **0**. The script preserves other charging flags, checks a phone-bound lease, saves before changing settings and rejects manual setting changes. It does not bypass the secure lock screen. The owner unlocks once before use:

```powershell
node tools/phase9-native/phone-awake.mjs enable
node backend/tests/run-phase9-native.js
node tools/phase9-native/phone-awake.mjs restore
```

The test app remains installed. Disconnect USB when finished; USB debugging can be disabled or this computer's authorization revoked in Developer Options. No PIN, account, private storage or other app was modified.

## V — Verification closure

Source-bound closure is recorded in `execution-manifest.json`. Executed results:

| Check | Result |
| --- | --- |
| Selected native primary/repeat | PASS / PASS, process exit 0 each |
| Full backend | 1,693/1,693 PASS, no skips/cancellations/todos; `backend-closure-final.log` |
| Native isolation/staging/awake units | 22/22 PASS |
| Scoped coverage | 100% statements/branches/functions/lines; 327 statements/lines, 156 branches, 27 functions; nine complete modules |
| Structural maxima | Cyclomatic 15, cognitive 15, Halstead Difficulty 28.377, CRAP 15, source LOC 108 |
| Scoped clone detection | 0; nine modules, five-line/50-token minimum |
| Mutation closure | 644 unique identities: 629 killed, 15 reviewed equivalent; zero meaningful survivors/timeouts/ignored/errors |
| Scoped lint / backend typecheck | PASS |
| Captain units / lint | 5/5 PASS; zero lint errors, seven existing warnings |
| Earlier executed DB / paired replay / independent saved backend replay | 50/50 / 37/37 / 36/36 PASS; distinct backend evidence, not native UI replay |
| Frozen V5 | Original hash `e484afc4c7fa724ea29af6edd962c48b814dc73a10e4f4a5e33833ad26afbe75`, 22/22 unchanged |

Scope is the nine native safety/transport/staging modules. Build/runner orchestration is exercised by native execution; original large application routes and unrelated historical complexity debt are not certified by these scoped metrics. Earlier mutation trials and an aborted contention run are retained and do not contribute a passing score. No held-out, Responsibility Luna, Search or Hindi/Hinglish evaluation was resumed.

The complete raw mutation audit initially reported 597 killed and 47 survivors. Added witnesses killed 32 more; a focused rerun exercised 134 identities, all reconciled to the original 644 by file/location/mutator/replacement. Full raw reports remain unchanged. `mutation-closure-final.json` binds source hashes and identity reconciliation. `reviewed-native-equivalences.json` and executable `backend/tests/quality/phase9-native-equivalences.mjs` retain the remaining 15 reviews. They cover first-token whitespace splitting, a redundant parsed-drive-root end anchor, predicates implied by the accepted digits/upper-bound contract, equivalent UTF-8 coercion, a greedy line-end regex, ordinary RequestInfo header access, Express's falsey content-type handling and internal temporary-name punctuation. Temporary names are compared as generated internal identities; exclusive creation and atomic rename still have collision witnesses. No mutation was ignored and no threshold waiver was introduced.

The first equivalence witness invocation failed because textual substitution lost AST expression grouping. That failed log is retained; the corrected generator preserves grouping and passes 15/15 with process exit 0. It changed no application/helper source.

## VI — Remaining scope and status

Remaining native coverage includes reject/swipe/reopen variants, competing captains, acceptance/customer-cancellation races, replacement/completion, interrupted requests/process recovery, location permission/settings transitions, GPS freshness/background behavior, native navigation/gestures and broader refresh/mobile journeys. Actual map verification needs dedicated test configuration. Customer form creation, complete cross-role replacement/completion, human review/appeal UI and exact saved-input UI replay also remain open. Independent human evaluation and deployed shadow-only permissions remain Phase 9D; production activation is separately approval-gated.

RESPONSIBILITY PHASES 1–7: VERIFIED

RESPONSIBILITY PHASE 8: COMPLETE

HISTORICAL PHASE 8.2: RETIRED — NO RECOVERED SCOPE

PHASE 9A / 9B: COMPLETE

PHASE 9C: PARTIAL

NATIVE SETUP: COMPLETE

SUPPORTED NATIVE CAPTAIN JOURNEY: PASS

PHASE 9D: NOT STARTED

PRODUCTION SHADOW / AUTO-ADJUDICATION / PRODUCTION CONSEQUENCES / SEARCH ROLLOUT: OFF

PROJECT-WIDE PROOFLOOP / PUBLIC GENERALIZATION: NOT STARTED
