# Phase 9C — cross-application journeys, SDK maps and native completion

11 October 2026 (IST). Continues the [physical Android checkpoint](phase9c-android-device-checkpoint-2026-10-10.md). Evidence: `output/phase9-cross-application-2026-10-11/`. **Phase 9C remains PARTIAL.** Failed trials, previous source identities and raw mutation reports are retained.

## Completed cross-application journey

Two fresh-process runs passed all nine assertion groups with exit 0:

- `20261011073026212-66504875-6c57-45eb-ba85-ccb5a8ead84d`
- `20261011074009640-6fe47590-1d53-4335-90a2-aac1f53acbb0`

The customer creates a scheduled booking through the actual form, uses the fake checkout and receives two deliveries of the actual signed capture webhook. The physical captain accepts; a deliberately lost acknowledgement returns 503 after the real acceptance commits. Refresh reconciles one owner and one reservation. The original captain cancels through Android controls, retaining that owner's hold. A separate signed native PARTNER session accepts the replacement. The customer sees the replacement, the admin inspects raw versus guarded results, and a stale review submission returns 409 before authority writes. Explicit synthetic human waiver, customer cancellation, both owners' deposit returns and duplicate processed refund callbacks complete the journey.

Fare/advance are ₹280/₹28. Both accepted drivers have independent ₹28 holds and finish with their original ₹1,000 wallet balances. The offline analyst proposes DRIVER_CAUSED; the independent gate requires admin review. Only the explicit synthetic human action supplies final authority. Liabilities, strikes, blocks, consequence executions and payouts remain zero. These are integration exercises, not independent human calibration.

`cross-independent-repeat-comparison.json` verifies receipt hashes, matching application/source identities and matching actions and financial ownership. This is a recipe repeat with generated identities and real elapsed times, **not exact saved-input UI replay**. Later host-helper and captain changes have their own identities; the earlier selected runs are not presented as executions of those later edits.

## Corrections and executable witnesses

- Protected review/appeal requests bind the displayed evidence version and hash. Checks occur under the case lock before authority reuse. Stale or malformed submissions fail closed.
- Driver-cancellation notice and appeal ownership use hash-verified original incident evidence plus the committed cancellation record. Replacement ownership cannot take over an original driver's notice or appeal.
- Captain offer acknowledgements reconcile offers and profile even after a response is lost. The physical 200-commit/503-response failure has a permanent journey and unit witness.
- Admin review has explicit blank human choices, canonical classifications, guarded duplicate submission and stale-evidence feedback. Actual browser review and appeal review pass at desktop and 390-pixel widths. The captain appeal submission in the appeal scenario is protected HTTP setup; native appeal UI is still outstanding.
- Captain address text uses the existing ink token. Actual native observation also found the pickup address displayed under “Dropping at.” `activeRideAddress.ts` now selects the current endpoint; unit tests and the native recipe assert the drop address after OTP start.
- Maestro can retry once only when its Android driver fails before any flow starts. The failed startup log is preserved; executed actions and business failures are not retried by this rule.
- Unsupported `--replay`, including an empty value, fails before database setup. CLI regressions pass. Exact cross-application UI replay has not been implemented.

Actual protected database tests pass: review/appeal/order witnesses **3/3**, historical Phase 6B **10/10**. Standalone admin review/appeal browser run `admin-20261011072141743-da8d581c-e6cb-4511-9633-b5079715485c` passes. Originals and replacement/foreign actors remain distinct.

## Google Cloud CLI and physical maps

The owner authorized SDK-only testing and delegated project setup. The CLI created **`rcs-phase9-maps-20261011`**, linked the existing billing account and restricted the separate key to Maps SDK for Android, package **`com.rcstravels.driver.phase9`**, and signing SHA-1 **`FD:9D:C7:57:8B:54:FE:CA:4B:DC:2C:F9:12:D6:1A:C1:87:BD:39:79`**. Existing CLI default project and production keys were preserved. Key material is outside Git and omitted from evidence. The initial key exposed by CLI stderr was revoked; the replacement was captured privately.

The verified test APK is build `2b49f1c0-2523-44ce-bd08-b0a8d8dfbe29`, SHA-256 **`e34500d6090932f3ebc5ce7879498d3fc482b477601efa608723572aeb2072d6`**. SDK tiles and synthetic Delhi route display were visually inspected on the physical Samsung. `maps-device-witness.json` retains the selected observations. Maps IDs, live Directions and external navigation are not claimed. Routing HTTP remains an explicit fake; external navigation records synthetic intents without opening the owner's Maps account.

## Native GPS and completion continuation

The test copy preserves actual Android foreground permission APIs while substituting every position API with explicit synthetic Delhi values. Real owner GPS and native background collection are excluded. The synthetic provider validates coordinates and records immutable observations. Permissions are restored only for the owned test package after each run. The SDK Tools button was disabled through the test app's developer menu because it covered the online control; this was a test overlay, not an application permission defect.

Run `device-20261011122340791-15e192f8-c793-45df-bf3b-9af8dc46c37f` passed five native assertion groups: actual foreground grant, acceptance/departure, unavailable/poor/stale GPS gates, swipe arrival and four native OTP fields, then swipe completion at the synthetic drop. The drop address correction was exercised. The customer cash response succeeded, but an ambiguous text locator matched both status and receipt summary, so this run is retained as **FAILED**, not a complete native pass. The locator is now scoped to the payment status. A subsequent retry failed during Metro headers timeout before device actions.

The corrected primary `device-20261011133525687-238e214e-dd96-4b04-94ab-9ee19edb9752` and independent repeat `device-20261011134706749-9541b9f0-6669-43c6-8848-709592ec1bdf` both passed with process exit 0. Five native assertion groups and the actual mobile customer cash action complete in each. `native-device-repeat-comparison.json` verifies receipt integrity, identical 463 source identities, staged application identities, APK and action groups. Each `financial-audit.json` checks the saved authoritative completion/cash responses and independent ledger: ₹100 advance plus ₹900 cash, ₹100 commission, one ₹100 original-owner reservation return, wallet ₹1,000 and zero Responsibility authority/consequences. These are saved-observation audits and recipe repeats, not exact saved-input UI event replay.

## Mobile customer failure and recovery coverage

`customer-20261011140302074-51e63fe5-8376-42c5-8db5-cebf49cdfbf4` and independent repeat `customer-20261011140423895-3c4e39f1-4377-4129-98a8-12aa234342b6` pass five groups each on the actual 390-pixel customer surface. Blank/missing-drop forms remain disabled; real location/date/vehicle forms survive back/forward; double confirmation produces one booking, with its loading button disabled while the request is held. A definitive provider rejection leaves one unpaid booking; UI retry reuses it. Authorization and refresh cannot fabricate capture. Delayed duplicate signed capture confirms one ₹28 advance on the ₹280 fare. Foreign customer access returns 403. Saved UI traces and database/wallet invariants contain no consequence.

Separate `customer-20261011140343999-3ba20bab-4c3d-424d-9e60-f99c1392d00e` passes the unknown-order boundary: retry returns 503, `ORDER_OUTCOME_UNKNOWN` remains durable, no provider order is created and the booking stays unpaid. No retry, reconciliation or authority rule was weakened. `customer-safety-comparison.json` verifies receipt integrity, matching 457 source identities and ordered actions for the successful pair, plus the unknown-outcome invariants. The first recipe incorrectly treated an unknown provider outcome as immediately retryable; its unhandled automation callback stopped before a full failure receipt was written. Its log and exact recipe source are preserved. The second failed recipe's foreign-access matcher omitted `/status`; its saved trace actually records 403 and correct financial state. The matcher and visible confirmation wait were corrected. These were recipe defects, not product authorization or payment bypasses.

## Native rejection and priority escalation extension

The `--offers-only --keep-awake` recipe passes in primary `offers-20261011142516892-39562a74-a4ba-412d-ae23-05da2d873f1b` and independent repeat `offers-20261011142912896-b0109d4e-ffd4-4abc-9df4-805a9f2f57b4`, both with process exit 0. Physical RCS rejection creates no assignment or hold. The actual worker does not reoffer the rejected RCS row and escalates to the partner group. The physical partner accepts in a separately verified signed session, reserving only its own ₹100. Duplicate rejection returns 409 and foreign ride access returns 403 through protected HTTP. Protected synthetic customer cancellation returns that single hold; signed processed refund callbacks and cancellation duplicates produce one ₹100 provider refund. All wallets return to ₹1,000, with no final authority or consequence. `native-offers-repeat-comparison.json` verifies matching 215 backend/executor identities, staged app identities, actions and ownership invariants. HTTP fixtures are explicitly separate from the physical actions.

The first trial imported a service before installing the owned database and timed out on the protected profile; a database identity assertion now prevents that initialization error before phone execution. The second trial passed the physical actions but incorrectly expected immediate refund completion before the processed provider callback. Both failed receipts/logs and exact recipe sources are retained. Existing pg client-query deprecation warnings remain in the passing logs; no production query behavior was changed to suppress them.

USB stay-awake was kept at **2** across every native trial/repeat and the intervening browser checks, then restored only after the last native process exited. Independent readback at **2026-10-11T14:35:01.014Z** confirms **0**, the original setting. `phone-cleanup-final.json` also confirms denied fine/coarse/background permissions, stopped test app and zero USB reverse mappings. The production app remains untouched; the verified test APK stays installed. The lease does not bypass the secure lock. No additional unlock was needed after the IDE reload.

## Executed verification

| Check | Actual result |
| --- | --- |
| Full backend | **1,733/1,733 PASS**, 68 suites, no skips/cancellations/todos; latest `backend-tests-accepted-current.log` |
| Native GPS / OTP / completion / customer cash | **Primary and independent repeat PASS**, five physical assertion groups plus actual mobile cash action; two offline financial audits PASS |
| Native rejection / priority escalation | **Primary and independent repeat PASS**, four assertion groups, with HTTP fixture actions explicitly identified |
| Mobile customer failure/recovery | **Primary and independent repeat PASS**, five groups each; separate unknown-provider-outcome case five groups PASS |
| Real Phase 9 database suite | **50/50 PASS**; `phase9-current-db.log` |
| Paired backend replay | **37/37 PASS**; `phase9-current-paired-replay.log` |
| Independent saved backend replay | **36/36 PASS**; `phase9-current-saved-replay.log` |
| Frontend units / isolated build | **51/51 / PASS**, earlier current continuation logs |
| Captain units / lint | **10/10 / PASS**, zero errors and seven existing warnings |
| Backend typecheck | **PASS**; latest accepted execution selected by the manifest |
| Critical coverage | **100% all four measures**, 13 modules; 373 statements/lines, 265 branches, 33 functions; `coverage-final/` |
| Structural maxima | Cyclomatic 21, cognitive 18, Halstead Difficulty 29.258, CRAP 21; maximum scoped source 67 LOC |
| Clone check | **0**; 13-file scope, 11 eligible sources at five-line/50-token minimum; the two short new helpers cannot form a five-line clone |
| Mutation closure | **PASS: 847 unique identities, 834 killed, 13 executable reviewed equivalents**, zero meaningful survivors/timeouts/ignored/errors; `mutation-closure.json`. Earlier raw timeout reports remain retained. |
| Final scoped lint | **PASS**; `scoped-lint-final.log`. Critical helper source identities remain unchanged. |

Coverage report copies retain scoped V8 counters/source maps and bind them to original file hashes; original raw coverage is unchanged. Scoped metrics certify the listed helpers, not large historical route/component files.

Local command execution subsequently stalled. Three `post-tool-use.mjs` processes were observed consuming CPU; stopping those stuck processes did not recover all queued commands. Hook configuration has not been modified or disabled. Even small file reads stopped returning output. The owner has been asked to reload Codex/IDE. This is an execution-infrastructure blocker, not a failed product acceptance or permission request for Phase 8.2. The machine checkpoint is `continuation-state.json`.

## Reproduction and remaining scope

1. Command execution recovered after the IDE reload. Hook configuration remains unchanged. The pending ninth trial never started; trial 10 stopped before phone actions because Docker was not running. The existing local Docker installation was restarted.
2. Native completion/cash, mobile failure/recovery and native rejection/escalation now have successful independent repeats. Reproduce with the commands below. Saved financial audits and UI recipe comparisons retain their explicit boundaries.
3. Provider catch-branch retest killed all five previous timeout identities. Exact reconciliation across current source reports yields 847 identities, with 13 executable equivalence witnesses rerun successfully. Scoped lint and whitespace checks pass. The source-bound `execution-manifest.json` selects exact receipts, quality results and cleanup evidence.
4. Remaining Phase 9C acceptance gaps: native swipe-dismiss/reopen variants, stale or competing acceptance and cancellation/completion UI interleavings, offline/ineligible/priority-denial UI variants, location permission/settings/background transitions and interrupted upload recovery; customer expired/ambiguous sessions, stale quotes and broader invalid date/form cases. Driver appeal creation remains protected HTTP setup in the admin appeal journey. External navigation and native background collection are unmeasured. Exact saved-input UI replay is not implemented. Backend concurrency/replay witnesses remain separate evidence. Phase 9D preparation has not begun; completion or a supported scope amendment is still required for Phase 9C.

```powershell
node tools/phase9-native/phone-awake.mjs enable
try {
  node backend/tests/run-phase9-cross.js --device-only --keep-awake
  node backend/tests/run-phase9-cross.js --offers-only --keep-awake
} finally {
  node tools/phase9-native/phone-awake.mjs restore
}
node backend/tests/run-phase9-cross.js --customer-safety-only
node backend/tests/run-phase9-cross.js --customer-safety-only --unknown-order
```

The phone must be manually unlocked once before native runs. Browser scenarios create clean isolated environments; they do not need the phone. Earlier full cross-application pairs execute their recorded source version; later captain/helper changes are separately bound by the new native scenarios. Visual inspection of the selected mobile vehicle/confirmation, native drop-address/map and rejected-offer screens passed for those states; complete visual fidelity across remaining screens is not claimed.

Frozen Jev V5 **`e484afc4c7fa724ea29af6edd962c48b814dc73a10e4f4a5e33833ad26afbe75`**, 22 identities unchanged. No held-out, Responsibility Luna, Search or Hindi/Hinglish evaluation resumed. Evaluation provider calls: **0**. Owner-approved 0%/10% commission and each original owner's reservation rules remain intact.

RESPONSIBILITY PHASES 1–7: VERIFIED

RESPONSIBILITY PHASE 8: COMPLETE

HISTORICAL PHASE 8.2: RETIRED — NO RECOVERED SCOPE

PHASE 9A / 9B: COMPLETE

PHASE 9C: PARTIAL

NATIVE CAPTAIN E2E: PARTIAL — SUPPORTED SLICES PASS

CUSTOMER FULL BOOKING E2E: PARTIAL — TRADITIONAL FORM AND SUPPORTED TERMINAL SLICES PASS

ADMIN REVIEW/APPEAL E2E: PASS FOR THE SUPPORTED SYNTHETIC ADMIN UI WORKFLOWS

MAPS E2E: INCOMPLETE — ANDROID SDK TILES PASS; EXTERNAL NAVIGATION UNMEASURED

GPS DEVICE E2E: PARTIAL — REAL FOREGROUND PERMISSION, SYNTHETIC FIXES

EXACT SAVED-INPUT UI REPLAY: NOT IMPLEMENTED

PHASE 9D: NOT STARTED

PRODUCTION SHADOW / AUTO-ADJUDICATION / PRODUCTION CONSEQUENCES / SEARCH ROLLOUT: OFF

PROJECT-WIDE PROOFLOOP / PUBLIC GENERALIZATION: NOT STARTED
