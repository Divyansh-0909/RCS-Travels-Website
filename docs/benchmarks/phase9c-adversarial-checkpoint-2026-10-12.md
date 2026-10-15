# Phase 9C — adversarial verification and acceptance closure

12 October 2026 IST. Continues the [cross-application checkpoint](phase9c-cross-application-checkpoint-2026-10-11.md) and [acceptance matrix](phase9c-adversarial-acceptance-2026-10-11.md). Evidence: `output/phase9c-adversarial-2026-10-11/` (implementation start date). **Phase 9C COMPLETE for the approved supported, isolated customer/captain/admin scope.** The final matrix records every requirement, evidence and explicit external/replay boundary. Historical failed receipts and source epochs are preserved. Overall Phase 9 is not complete.

## Implemented corrections

- Coupon selection sends the newly selected coupon to authoritative fare estimation; superseded responses cannot publish an older quote.
- A restored scheduled intent without its non-persisted date returns to date selection before confirmation.
- Tracking requires a successful read bound to the current booking and SDK user. A 401/403/404 hides the cached ride and financial controls. Transient failures can retain an already verified same-user snapshot.
- Native offer acknowledgements reconcile after failure, and empty Notifications remain visible after stale acceptance.
- Native cancellation refreshes the authoritative ride/profile after the response. Completion winning the race closes the stale cancellation sheet; the protected cancellation still returns 409.
- A read-only protected notice endpoint and the smallest native notice/appeal screen reuse original-incident ownership, confirmed delivery and existing appeal policy. No new appeal or financial authority is created by display.

Every correction has permanent unit or actual UI regression witnesses. Historical raw failures remain preserved.

## Executed evidence

| Supported scenario | Actual result |
| --- | --- |
| Native acceptance versus customer cancellation, held native request, duplicate tap, customer refresh/refund race | Primary and fresh-process repeat PASS; physical actions and competing browser/provider events are separately labelled |
| Competing captains / replacement versus terminal customer cancellation | Current primary and independent repeat PASS for each; identical executed source and staged application identities within each pair; `native-competing-comparison.json`, `native-replacement-comparison.json` |
| Native cancellation versus completion | Corrected primary `terminal-20261011200059324-b286306d-8d46-4375-9991-d5fc2b614bdc` and repeat `terminal-20261012030626591-23763bcb-bf06-4f69-a167-7682d969fc0a` PASS; identical staged native sources, explicit unrelated source differences retained by comparison |
| Customer quote/session adversarial recipe | Current primary `browser-20261011200903875-acf49eb1-8c52-471e-8d73-a9428159c7d6` and repeat `browser-20261011201246978-a6db3325-8bba-47fd-bbf2-d51c4fc18619` PASS; 16 groups each, 503 identical source identities; `customer-session-comparison.json` |
| Actual SDK identity replacement | Browser SDK user changes, protected old-booking read returns 403, old ride/payment controls disappear; mobile failure screen visually inspected |
| Actual admin evidence supersession | Two immutable evidence versions; old displayed review returns 409 before authority; refreshed form clears human choices; primary/repeat PASS |
| Native original appeal and admin resolution | Primary `appeal-20261012025221979-ea15c10b-c7e9-433f-acf0-1d35c6e57009` and fresh-process repeat `appeal-20261012030034184-eea27b5a-ceec-413f-a751-24c373f5a013` PASS; original submission, admin waiver, replacement's empty notice list and protected role/expiry probes; comparison binds identical sources and staged app |
| Foreground permission revocation/restart | Primary `permissions-20261012033143196-804f3f81-7396-4291-90f7-452fb6a7c283` and repeat `permissions-20261012033807417-14d9b4d1-5d2b-421f-b6c8-7bfcb68b36bc` PASS; four groups each, identical sources/staged app; `native-permissions-comparison.json` |
| Offer swipe/offline/background/restart recovery | Primary `recovery-20261012034510371-63b97527-c356-4745-85a7-1be204304caa` and repeat `recovery-20261012035237874-da8a321c-c063-48e8-974e-1d5cab813367` PASS; three groups each, identical sources/staged app; `native-recovery-comparison.json` |

Customer request mutations are explicitly labelled. They exercise real protected handlers with expired/invalid synthetic credentials, stale quote/location/vehicle, fare mismatch, invalid scheduling and missing details. Definitive payment rejection creates one unpaid booking; expired recovery cannot create another order. Prior unknown-provider-outcome and duplicate-capture evidence remains separate.

## Reproduction and backend verification

Failed UI recipes automatically emit integrity-bound diagnostic artifacts and validator-approved isolated invocations. A controlled native-race diagnostic run automatically captured initial state/clock, actors, ordered UI/API/provider outcomes, traces, 504 source identities, staged app/APK identities and financial invariants. Its explicit capture flag fails after the actual assertions; this is a diagnostic demonstration, not an application defect. `reproduction-resume-3-proof.json` records fresh-database controlled backend event reproduction, the matching actual native/browser regression recipe and an independent repeat, all exit 0. Current race runs are `race-20261012111158517-afee5ddc-9d69-42ce-93ff-54158252ec30` and `race-20261012111901598-ae6b9f1e-ef27-4113-b07b-689dd466c6e3`, with 504 identical source identities.

Backend replay checks capture, offer, cancellation/refund and rejected acceptance from recorded initial inputs. Native recipe re-execution uses regenerated identities and real elapsed time. Exact saved-input OS/UI replay is **NOT IMPLEMENTED**. The backend mapping covers this native-race family; other validated artifacts can launch their approved recipe but do not gain a fabricated backend mapping.

An IDE/process interruption left an earlier combined launcher without a complete UI receipt. Its interruption and failed resumption/Docker preflights are preserved and excluded from successful proof. Earlier root-level derived backend input/result reports reused filenames; their overwrite history is not presented as immutable evidence. The correction writes exclusive per-invocation input/result/index files beside the owned artifact. `reproduction-retention-regression.json` executes two further fresh backend reproductions, validates both distinct reports/hashes and confirms the original artifact, prior reports and legacy root files remain unchanged. Original failed captures and invocation logs remain retained.

Current full backend: **1,755/1,755 PASS**, 68 suites, no skips/cancellations/todos, including four new CLI tests rejecting controlled failure capture outside the native race before database setup. Latest actual execution: `backend-tests-accepted-latest-execution.json`. Frontend units: **57/57 PASS**; isolated build PASS. Captain units: **12/12 PASS**. Captain lint: zero errors, seven existing warnings. Backend typecheck PASS (`backend-typecheck-accepted-latest-execution.json`), scoped lint PASS and actual Git whitespace exit PASS. Seven additional test-orchestration sources pass ESLint recommended rules; the initial lint failure is retained separately.

Current real PostgreSQL/PostGIS/pgvector suite: **50/50 PASS**. Current paired backend replay: **37/37 PASS**. Independent current-source saved backend replay: **36/36 PASS**, selected run `20261012023617230-7498b52c-22f1-4e87-b8c0-2fb6f73b62ba`.

Re-execution of copied October 9 historical receipts correctly refused three different source identities (`prisma/schema.prisma`, `responsibilityShadowAdjudication.js`, `phase9Lifecycle.js`). Those historical receipts were not modified or rehashed. Current paired receipts were generated and independently replayed instead. The original failure logs and copy manifest remain preserved.

## Scoped quality

Ten complete critical helpers: **100% statements/branches/functions/lines**, 193 statements/lines, 126 branches, 20 functions. Structural maxima: cyclomatic **21**, cognitive **18**, Halstead Difficulty **29.983**, CRAP **21**, source **68 LOC**. Clone detection: **0** at five lines/50 tokens. Scoped lint PASS.

Mutation closure: **382 unique identities**, **378 killed**, **four executable reviewed equivalents**, zero meaningful survivors/timeouts/ignored/errors. Three equivalents are existing one-shot gateway latch/content-type behavior; one is a redundant optional access after a JSON initial-clock guard. Exact current-source reports and reviews are bound by `mutation-closure.json`. Raw survivor and failed scaffolding reports remain intact. No threshold waiver or ignored mutant was introduced.

These numbers certify the ten helpers. Actual application caller behavior is exercised by the UI scenarios; large historical routes/components are not certified by these scoped measurements.

## Device and safety boundaries

The approved test package/APK, restricted SDK-only Maps configuration, synthetic locations, real protected SDK sessions, fake providers and disposable database harness are reused. No owner GPS, background location, production provider, held-out evaluation, Responsibility Luna, Search or Hindi/Hinglish evaluation is resumed.

USB stay-awake stayed **2** under the phone-bound lease across the native runs and interruption. After every native process finished, `phone-cleanup-final.json` independently verified restoration to **0**, stopped only the test package, confirmed fine/coarse/background permissions denied and zero USB reverse mappings. Wake pulses cannot bypass the secure lock. Production app and unrelated phone settings were preserved. Retained overlay/scroll failures are not accepted as passing appeal-ownership witnesses.

The recovery recipe physically swipes the new panel, backgrounds/reopens the app, observes the existing panel's 30-second expiry and the still-pending authoritative offer, and exercises protected offline rejection. A later actual worker sweep preserves the pending RCS grant instead of fabricating an expiry or partner grant. Physical acceptance commits, its acknowledgement is replaced with 503, and force-stop/reopen restores one owner and one original-owner ₹100 hold. The labelled database offline toggle and controlled worker times are fixtures; the native actions are not HTTP substitutes. The offline CTA currently says “Go online” while attempting acceptance; its visible 409 explains the denial. This existing wording is UI debt, not an automatic online transition or a successful offline acceptance.

Selected physical screenshots of revoked permission, valid arrival/OTP, original appeal submission, replacement's empty notices, offline denial and restarted assignment were inspected. This certifies those states rather than every native screen or hardware capability.

Frozen Jev V5 remains `e484afc4c7fa724ea29af6edd962c48b814dc73a10e4f4a5e33833ad26afbe75`. Owner-approved commission and each original owner's deposit rules remain intact.

## Live Clerk and session boundary

The owner selected an isolated development instance and supplied the ignored `backend/.env` configuration. CLI inspection verified `environment_type: development`; Clerk's Svix portal endpoint returned `svix_app_missing`, establishing no configured Svix application before creating any synthetic user. No webhook or instance setting changed. Only the two test keys were read locally, neither printed nor saved in evidence.

Live primary `live-clerk-1791804908701-c8ded2c5-2f14-4431-934b-7d5c0b8cd442` and fresh-process repeat `live-clerk-1791805069894-b6d0b4b3-f19f-40dc-989a-87fd689bef4f` PASS. Each creates only a uniquely marked reserved `+clerk_test@example.com` user, signs it in through the actual browser SDK using a Backend API ticket, and uses real cryptographic verification plus protected application GET/ownership routes against a disposable loopback database. The child has only the provider's public verification key, denies non-GET requests and checks unchanged financial snapshots under consequence-denial triggers. The provider secret never reaches that child. Actual provider revocation plus forced SDK refresh/navigation removes booking/payment controls. The cached JWT returns **200 immediately after revocation**, then **401 after its actual 60-second lifetime expires**. This proves the existing short-lived stateless token boundary, not immediate server revocation. Each synthetic user is ownership-verified and deleted; private temporary configuration is removed. A lexical lint correction separates the two runner source epochs; both original hashes remain recorded.

Retained trials diagnose compressed-response transport behavior with Node's built-in fetch after Testcontainers loading (the installed Undici client is used), missing identification on a contact-free user, an overlong synthetic email local part, and a locator expecting a hidden pickup instead of the visible drop address. None changed deployed authentication or authorized financial effects. See [Clerk's reserved test-email documentation](https://clerk.com/docs/guides/development/testing/test-emails-and-phones) for the chosen synthetic identifier; no email verification delivery was requested.

## Final review and limitations

The final 26-row matrix checks R9-02–04 against actual evidence. All approved critical isolated workflows are verified. Actual owner GPS/background collection, external navigation and exact saved-input OS/UI replay remain unmeasured, explicitly outside the implemented minimum. Independent human calibration and deployed shadow-only permissions remain Phase 9D work. Production activation receives no permission from these simulator proofs. Existing offline offer CTA wording remains UI debt: its action receives a visible protected denial rather than implicitly going online.

The retained first permission failure expected HTTP 400, while the protected contract correctly returned 422 `LOCATION_REQUIRED`. The corrected recipe records the real response before asserting; primary/repeat pass, with no runtime geofence change. Failure-capture/reporting corrections have executable regressions. The final manifest records selected source epochs, differences from the final tree, original failures and exclusions; earlier receipts are not relabelled as executions of later edits.

RESPONSIBILITY PHASES 1–7: VERIFIED

RESPONSIBILITY PHASE 8: COMPLETE

HISTORICAL PHASE 8.2: RETIRED — NO RECOVERED SCOPE

PHASE 9A / 9B: COMPLETE

PHASE 9C: COMPLETE FOR APPROVED SUPPORTED ISOLATED SCOPE

PHASE 9D: NOT STARTED

PRODUCTION SHADOW / AUTO-ADJUDICATION / PRODUCTION CONSEQUENCES / SEARCH ROLLOUT: OFF

PROJECT-WIDE PROOFLOOP / PUBLIC GENERALIZATION: NOT STARTED
