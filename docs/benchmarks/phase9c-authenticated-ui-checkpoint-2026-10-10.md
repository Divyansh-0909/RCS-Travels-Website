# Phase 9C — authenticated customer and admin browser slice

10 October 2026 (IST). Continues the [accepted Phase 9B checkpoint](phase9-final-integration-checkpoint-2026-10-10.md). Evidence: `output/phase9-ui-2026-10-10/`. Selected runs, exact source hashes, logs and reports are bound by `execution-manifest.json`; aggregate results and remaining requirements are in `verification-summary.json` and `continuation-state.json` in that directory. Historical checkpoints, failed trials and raw mutation reports remain available.

**Phase 9C: PARTIAL.** Customer payment, cancellation and refund visibility, plus admin Responsibility inspection, have real browser/API/database evidence. Captain operations have supplementary protected HTTP evidence, **not captain-app UI evidence**. Booking creation is a real-service fixture, not a customer booking-form action. These boundaries prevent a complete cross-application or Phase 9C acceptance claim.

## A. Customer UI

The runner starts the actual customer website, protected backend routes and application services against a fresh migrated PostgreSQL/PostGIS/pgvector database. It restores synthetic sessions through the actual Clerk browser SDK and backend signed-token verification. Production `protect` and `protectAdmin` remain active. OTP, WhatsApp delivery, Clerk ticket exchange and live-provider sign-in are not established by these restored-session tests.

The selected browser scenario executes these supported actions:

1. Open a scheduled booking created through the existing booking/payment services; inspect its pending advance in the real payment panel.
2. Inject one payment-order HTTP 503. The page displays the failure; no capture or booking confirmation occurs. Retry through the actual button and synthetic checkout, then the real payment verification route. Authorization alone does not mark the advance paid.
3. Navigate away before delivering the actual signed capture webhook twice. Return to the booking and observe one confirmed ₹100 advance on the ₹1,000 fixture.
4. Run the real assignment worker. Accept and cancel through the protected captain APIs, then reload the customer page to observe assignment and the driver-cancellation notice. Duplicate acceptance preserves one reservation. A different captain cannot accept the RCS offer.
5. Cancel through the actual customer modal using its supported reason. Reopen the terminal booking and refresh while its refund is pending.
6. Deliver the signed processed-refund callback twice. Refresh the page and observe the recorded refunded state, with one provider refund and no repeated financial effect.

Final persisted observations: booking `cancelled`, advance paid `10000` paise, disposition `refunded`, cancellation charge `0`, no assigned driver; one captured payment and one processed refund, each `10000` paise. Original and replacement fixture drivers retain ₹1,000 wallets and capacity four. Final decisions, liabilities, compensations, strikes, blocks and payouts are all zero. The replacement fixture is not a positive replacement UI journey.

### Corrections and permanent regressions

- `TrackingPage` previously had no terminal cancelled branch and could render active tracking controls. It now uses `CancelledBookingPanel`, showing the recorded refund state and refresh action without live driver controls. The mapper recognizes the backend's actual `partially_refunded` value and keeps unknown values unknown. Permanent mapping regressions: `frontend/tests/cancelledAdvanceSummary.test.js`; real cancelled/refund browser assertions: `backend/tests/e2e/phase9BrowserJourneys.mjs`.
- Admin request failures, unknown case IDs and superseded requests clear or suppress old evidence. Returned case identity must match the request. Permanent failure, stale-response, unmount and identity regressions: `frontend/tests/responsibilityCaseLoad.test.js`.
- Legacy shadow results cannot borrow a production result's envelope or factual validation. Permanent pairing regressions: `frontend/tests/responsibilityInspection.test.js`.

Actual screenshots were inspected for customer payment on desktop and terminal refund on a 390×844 viewport. Admin screenshots were inspected at 390×844, 768×1024 and 1440×900; executable overflow checks cover those admin sizes. The existing map-unavailable fallback was visible with external providers denied. No Google map rendering, native map fidelity or complete responsive coverage of every customer state is claimed.

Still unverified through customer UI: booking entry/review/confirmation creation, double-click creation/payment submission, positive replacement, completed ride/final cash payment, and the full race/failure matrix. The supported traditional booking forms remain the next customer integration target; unfinished natural-language Search was not activated.

## B. Captain app

The existing captain app is Expo/React Native; its actual `/rides/:id` / `RideDetail` surfaces and authenticated API/session boundaries were inventoried. Existing captain unit tests **5/5** and lint exit zero, with **seven warnings and zero errors** in existing app files. No captain source was changed in this slice.

**Native journeys: NOT RUN.** Android SDK, `adb` and emulator executables are unavailable; `ANDROID_HOME` and `ANDROID_SDK_ROOT` are unset, and no Android local SDK configuration was recovered. No connected-device or emulator image exists for this execution. Playwright and the protected HTTP acceptance/cancellation checks do not satisfy captain-app acceptance.

The supplementary HTTP scenario uses actual offer, acceptance and cancellation routes, worker assignment, ownership, capacity and reservation services. It verifies foreign-offer denial, duplicate acceptance and cancellation, with customer-visible consequences. Native session restoration, seeing/rejecting offers, stale-offer UI, replacement, progress/completion, network reconnect, eligibility restrictions and foreground/background handling remain incomplete. GPS, notifications, operating-system permissions, safe areas and keyboards require native verification.

Device follow-up: provision an isolated Android emulator or test device and a runner such as Maestro/Detox; connect only to this disposable backend and synthetic auth/provider environment. Exercise the existing app screens for offer → acceptance → cancellation and customer recovery, then rejection/stale ownership/replacement/completion and reconnect. Capture device traces and images before claiming those requirements. No fake captain screen or native success result was introduced.

## C. Admin Responsibility UI

New protected website route: `/dashboard/responsibility`, linked from the existing admin dashboard. `ResponsibilityCase` calls the real `/api/admin/responsibility/cases/:caseId` API. It exposes:

- Incident, booking and recorded evidence identities, family, state, versions and hashes.
- Exact evidence snapshot and provenance/chronology, missing evidence and contradictions through the recorded evidence JSON.
- Separately labelled **RAW MODEL OUTPUT**, **GUARDED SYSTEM DECISION** and **AUTHORIZED HUMAN DECISION** sections.
- Model envelope and factual validation, guarded review reasons, production provisional decision, human review/appeal/finality records and existing audit/work histories.

The view is inspect-only. No automatic finalization or consequence action was added. Human authority is explicitly absent for this scenario. Nonempty human review/appeal states and submission workflows have not been demonstrated through UI.

The existing shadow worker did not retain its full analyst envelope. A new nullable migration adds `analysis_envelope` and `factual_validation` to `ResponsibilityShadowResult`; `responsibilityShadowDiagnostics.js` preserves the exact envelope/validation for new results. Existing rows remain null; no fabricated backfill or alternate analysis is shown. The gate, model settings, prompts and decision authority are unchanged. Migration execution was isolated; no deployed migration was performed.

The explicit offline V5 transport recommends confident `DRIVER_CAUSED`; the real independent gate returns `NEEDS_ADMIN_REVIEW` because causal authority is missing. The admin sees both records without treating confidence as authority. Permanent diagnostics and worker tests preserve that distinction. If a shadow evidence hash differs from the current case, the view reports that mismatch.

Browser and API authorization checks establish anonymous **401**, customer/captain **403** on admin evidence, foreign-booking **403**, tampered signed token **401**, and customer navigation away from the admin route without evidence disclosure. Admin 503 and unknown-case 404 checks establish refresh recovery and clearing of stale evidence. A new-case/old-response race is covered by the loader regression; a complete stale-version admin workflow remains unverified.

## D. Cross-layer receipts and repeat execution

Selected primary run: `20261010090107134-c507046a-7b9c-4ae9-bba9-fbb01e438c9e`.

Selected independent fresh-process repeat: `20261010090351792-981aa310-1c5b-4cb4-932e-b864ddba9989`.

Both record **11 successful check groups**, including the explicitly labelled captain-API supplement. This is not eleven complete UI journeys. Each `receipt.json` includes synthetic initial booking/payment/provider/wallet state, actor/action outcomes, HTTP paths/statuses, incident/evidence/shadow records, final financial/ownership observations, frozen V5 identity and **463 source/config/static-asset hashes**. Source hashes are checked before and after browser execution. JSON receipt integrity, owned path and exact source matching are validated before repeat database creation.

`traces.json` hashes customer/admin Playwright traces. Selected traces redact tokens, cookies and provider signatures; screenshots and noncredential evidence remain. Traces include detailed browser network/action timing; the separate request list records API paths/statuses. Generated identities, wall-clock UI timing and poll counts vary. Screenshots and trace timing are not compared as deterministic outputs.

Commands from the repository root:

```powershell
node backend/tests/run-phase9-ui.js
node backend/tests/run-phase9-ui.js --replay=output/phase9-ui-2026-10-10/20261010090107134-c507046a-7b9c-4ae9-bba9-fbb01e438c9e/receipt.json
```

The repeat reruns the coded browser recipe with fresh fixtures and checks the exact ordered action outcomes and final semantic financial/ownership invariants against the selected receipt. **It does not reconstruct the old receipt's exact initial timestamps/IDs or replay every saved UI/external event.** Complete saved-input UI event replay remains incomplete.

The existing backend full replay was reverified separately: **37/37 paired tests** and **36/36 independent saved-input scenarios**. New backend receipts are at `output/phase9-final-integration-2026-10-09/replay/20261009222720782-3f0428e5-a6e2-4171-a244-cd815624c5b8/`, binding **207** source/config/schema identities. They share the real services and provider fixtures with this browser slice, but are not asserted to be an identical replay of the browser event schedule. Historical 205-identity receipts and manifests remain unchanged.

```powershell
npm --prefix backend run test:phase9:replay
npm --prefix backend run test:phase9:replay -- --receipts=../output/phase9-final-integration-2026-10-09/replay/20261009222720782-3f0428e5-a6e2-4171-a244-cd815624c5b8
```

Controlled payment-order/admin-read failures recur successfully in both selected browser runs, with traces and persisted invariants. Earlier failed trial logs and failure artifacts are retained. Diagnosed harness failures included missing synthetic Clerk endpoints, wrong API-base fallback, cold Vite navigation and a wrong cancellation-reason selector; fixes use explicit state waits/warmup, without retrying failed assertions. Runtime app defects are covered by the permanent regressions above.

Artifact hardening found weak corrupted-receipt tests that stopped at hash validation before testing schema/status, plus a missed escaped signature in trace redaction. Corrected regressions independently reach those rejection branches and redact formatted/escaped signatures. Earlier mutation survivor reports remain; final artifact mutation closure has no survivors. Early local historical traces do not inherit the final redactor retroactively; only the selected traces are certified by the current checks.

## E. Safety and quality

| Executed check | Result / selected artifact |
| --- | --- |
| Full backend | **1671/1671 PASS**, 68 suites; no skipped/cancelled/todo tests; `backend-closure.log` |
| Frontend | **46/46 PASS**; `frontend-closure.log` |
| Captain units / lint | **5/5 PASS / exit 0**, seven existing warnings, zero errors; `captain-tests.log`, `captain-lint.log`; native E2E not run |
| Browser execution / independent repeat | **11/11 check groups in each run**, all pass; `browser-source-closure.log`, `browser-repeat-closure.log` |
| Real disposable DB | **50/50 PASS**; `phase9-db.log` |
| Backend paired / saved-input replay | **37/37 / 36/36 PASS**; `backend-replay.log`, `backend-saved-replay.log` |
| Critical coverage | **100% statements/branches/functions/lines** over seven complete JS modules: **402 statements/lines, 160 branches, 25 functions**; three selected coverage reports and `coverage-merged.json` |
| Current mutations | **178/178 killed**, zero survivors/timeouts/ignored/errors: frontend 84, new backend diagnostics/call site 4, receipt/redaction 90; three final raw mutation JSON reports |
| Structural maxima | Cyclomatic **13**, cognitive **9**, Halstead Difficulty **24.706**, measured CRAP **11**, source LOC **302**; `quality-closure.json` |
| Typecheck / scoped lint / website build | **PASS**; `typecheck-closure.log`, `backend-lint-final.log`, `frontend-lint-closure.log`, `frontend-build-closure.log` |
| Clone detection | **0**, nine supplied modules, eight counted sources, five-line/50-token minimum; `clones-final/jscpd-report.json` |
| Frozen V5 | Original hash and **22/22 source identities unchanged**, checked by browser/backend replay |
| Git whitespace | **PASS**, actual Git exit zero; `git-diff-check.log` |

Coverage scope: the three frontend inspection/status/controller modules; full `responsibilityShadowAdjudication.js` and diagnostics helper; receipt and trace-redaction helpers. Mutation scope for the historical adjudicator is its newly changed diagnostics call site, plus the full new helper; it is not a new full mutation run of the entire adjudicator. Structural/clone scope adds the two new JSX presentation modules. JSX presentation coverage/CRAP and complete legacy `TrackingPage`/dashboard/router complexity are not certified by the scoped JS coverage numbers. Historical Phase 9B mutation totals are separate and are not added to 178.

The dedicated child uses an allowlisted environment, empty dotenv directory, denied runtime database URLs and only synthetic provider/auth keys. Owned `rcs_verify_*` databases and loopback-only transport fences reuse Phase 9B isolation. Fake checkout, payment, routing and notification transports are explicit; actual application finance remains real inside the disposable database. Advisory-analysis triggers deny consequence writes and financial snapshots remain unchanged. No production credentials, production database, real payment/refund/notification, live model evaluation or operative consequence job was used. These facts do not prove deployed production-role permissions.

Frozen Jev V5: **`e484afc4c7fa724ea29af6edd962c48b814dc73a10e4f4a5e33833ad26afbe75`**. No held-out rerun, Responsibility Luna comparison, Search or Hindi/Hinglish evaluation occurred. Owner-approved commission and per-owner retained deposits remain unchanged. Unrelated dirty-tree changes were preserved.

## F. Status and next implementation

Next implementation requirements, in order:

1. Extend the actual customer booking forms into this authenticated harness, including creation/review and duplicate-confirmation checks; add positive replacement, completion/final-payment and missing adversarial browser journeys.
2. Supply an Android SDK/emulator or isolated device and demonstrate the actual captain app journey, not HTTP substitutes.
3. Exercise existing permitted human review/appeal authority through an isolated admin UI workflow, nonempty authority/audit states and stale evidence/version checks. No automated consequence action is authorized by this checkpoint.
4. Extend saved-input replay to UI-specific external events and clocks if exact UI event reproduction is required; retain the present recipe-repeat boundary meanwhile.

Phase 9D has not started. Its existing prerequisites remain dedicated deployed shadow-only permissions, authorized privacy-preserving incident collection, independent human review, metrics/recovery, kill switch/rollback and human-final calibration. Production activation and real incident collection/model transmission still require separate authorization.

RESPONSIBILITY PHASES 1–7: VERIFIED

RESPONSIBILITY PHASE 8: COMPLETE

HISTORICAL PHASE 8.2: RETIRED — NO RECOVERED SCOPE

PHASE 9A: COMPLETE

PHASE 9B: COMPLETE — approved supported isolated backend scope

PHASE 9C: PARTIAL

PHASE 9D: NOT STARTED

PRODUCTION SHADOW: OFF

AUTO-ADJUDICATION: OFF

PRODUCTION CONSEQUENCES: OFF

SEARCH ROLLOUT: OFF

PROJECT-WIDE PROOFLOOP: NOT STARTED

PUBLIC PROOFLOOP GENERALIZATION: NOT STARTED
