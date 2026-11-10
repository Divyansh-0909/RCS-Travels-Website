# Phase 9D-1 — owner retention decisions and final two-reviewer procedure

31 October 2026 IST. Reads the owner's annotated [retention/review document](../operations/phase9d-retention-and-review-decisions.md) and explicit agreement in this conversation. **Two-reviewer procedure/assignments: FINAL APPROVED. Nineteen business row decisions/amendments recorded; row 10 deferred for CA. Full field-level legal/production retention closure remains PARTIAL. Production OFF; production deletion DISABLED.**

Evidence: [current approval register](../../output/phase9d-retention-owner-decisions-2026-10-31/approval-current.json), [procedure approval](../../output/phase9d-retention-owner-decisions-2026-10-31/review-procedure-approval.json), [current intake](../../output/phase9d-retention-owner-decisions-2026-10-31/human-review-intake.json), [byte-exact annotated input](../../output/phase9d-retention-owner-decisions-2026-10-31/historical-input/annotated-decisions.md), [manifest](../../output/phase9d-retention-owner-decisions-2026-10-31/manifest.json).

## Final reviewer procedure

**Divyansh Singh and Rajuddin (Raju)** are the two initial reviewers. Each independently assesses the same fresh evidence, records facts/uncertainty and saves an initial answer before seeing AI output/confidence. Neither may have participated in the incident or already know its expected answer. Developer exposure and proprietor/business conflicts must be disclosed; affected cases are excluded from independent calibration. Corrections append to the originals.

Compare only after both answers are locked. Agreement may be recorded. Disagreement remains unresolved/review-required until another uninvolved independent person adjudicates it. A joint discussion is not independent adjudication. No third person is assigned now. This procedure is final by the user's explicit “I agree with this, make it final”; no further confirmation of that procedure is requested.

The agreement does not approve real-case collection, the useful minimized projection, sample sizes, harm thresholds, real-world accuracy, production activation or any automatic penalty/payment authority. The intake has zero real cases. Its offline assessment remains INCOMPLETE for those distinct gates, while no longer reporting missing reviewer assignments. Approval is recorded as conversation/file confirmation, not a digital signature or independent identity attestation.

## Recorded business schedule

Original twenty-row candidates remain historical. The new register preserves every verbatim response and records the following limited amendments. Calendar years are not silently converted to fixed 365-day TTLs. Longer mandatory legal, financial, hold, replay and verification dependencies override ordinary business targets.

| Row | Recorded decision |
| --- | --- |
| 1 | Ordinary closed-account contact/preferences eligible for removal after 90 days; essential customer and driver ride history remains beyond that window. Field list below is prepared for review; final history endpoint remains unset. |
| 2 | Approved document archives: **one year after replacement/offboarding**, subject to longer duties/evidence dependencies. The separate 7-day rejected/abandoned-upload candidate was not expressly answered and stays pending. |
| 3 | Delegated choice: **30-day review** of raw GPS/device/route telemetry after trip closure and safety/incident classification. Retain necessary derived facts under applicable case/financial schedules. Required exact evidence/security logs are not automatically included in this short window. |
| 4 | Incident/cancellation evidence: **one year after final dispute/appeal closure**, with longer-duty exceptions. |
| 5 | Ordinary support text: **12 months after final closure**; incident-linked text follows row 4. Approved as a business target. |
| 6 | Minimized export/analyst payloads: **90-day review** after terminal state and review/appeal closure. Approved as a business target. |
| 7 | Outbox identities/tombstones: **one-year review**; no automatic identity deletion or broken replay dependencies. |
| 8 | Receiver work/transport receipts: **one year after final linked-case closure**, extended for dependencies. |
| 9 | Result commitments: **one year**. The separate 90-day payload candidate was not expressly answered and remains pending. Unknown spending and late accounting stay preserved. |
| 10 | **On hold for CA.** No fixed financial-record period is selected or activated. |
| 11 | Ordinary operator/recovery history: **one year**, extended for classified dependencies. Approved. |
| 12 | Completed delivery/retry archives: **one year after linked-case closure**. Unresolved PENDING/REVIEW items are not deleted to reclaim capacity. |
| 13 | Committed lineage: **one-year review**, extended for dependent records and verified chain archival. |
| 14 | Independent events/receipts: ordinary **one-year target**; longest required dependent period wins. This is not a hard maximum. |
| 15 | Delegated choice: retain **public verification material plus trust/compromise history while any dependent receipt/archive/backup remains**. Disable retired/compromised issuance separately from historical verification. No automatic private-key destruction; secure key-owner retirement/recovery remains separate. |
| 16 | Minimized denial/security observations: **365 days**, subject to applicable duties/holds. Approved. |
| 17 | Delegated choice: **365-day classified security/processing logs**, **14-day separately classified redacted debug logs**. Unknown classification blocks short deletion; verify applicable India-preserved copies. |
| 18 | Existing synthetic evidence: **no automatic deletion**, annual storage review. Future separately approved personal labels: **12 months after campaign/appeal closure**. Business targets approved; real collection remains unapproved. |
| 19 | Delegated choice: **dependency/capacity lifecycle** for WAL/index/TOAST/temp/replicas. PostgreSQL manages normal WAL/temp; preserve required base-backup/WAL/replica/restore chains. No ad hoc WAL deletion, new production quota or VACUUM-as-erasure claim. |
| 20 | Operational backups: daily **30 days**, weekly **12 weeks**, monthly **12 months**, plus longer classified financial archives and held/unknown-scope generations. Business targets approved; actual provider/backup deletion remains disabled. |

Row 10 is explicitly deferred, and legal applicability for other rows is not certified. GST section 36 retains covered records according to the annual-return due date and relevant proceedings, so a one-year business target cannot truncate those records. [CBIC section 36](https://taxinformation.cbic.gov.in/content-page/explore-act/1000306/1000001). CERT-In directions also prescribe a rolling 180-day India-preserved ICT-log requirement for covered entities; actual applicability, log classes and provider arrangements require review. [Official directions](https://www.cert-in.org.in/PDF/CERT-In_Directions_70B_28.04.2022.pdf).

## Row 1: what stays and what is removed

**Clock:** retain the existing candidate trigger: account closure plus resolution of open rides/refunds/complaints. This is not automatic expiry of an active customer's preferences 90 days after registration or every ride. Ninety days is an ordinary cleanup target, not a reason to delay a supported earlier deletion request or retain unnecessary data for a minimum period.

| Data | Recommended treatment after that 90-day window | Current source/copy boundary |
| --- | --- | --- |
| Saved Home/Work/other places, labels, addresses and saved coordinates | Remove account convenience copies when no preservation exception applies | `SavedPlace` / public.saved_places; also cached saved/recent places in browser/app storage |
| Saved emergency contact, unnecessary DOB/gender and ordinary profile name/contact details | Remove/minimize closed-account profile copies; retain only separately classified required fields | `User.emergencyContact`, `dob`, `gender`, `name`, `phone`, `whatsappNumber`; driver identity/tax/incident records are separately classified, not blanket-deleted |
| Theme and convenience preferences | Clear/reset associated account/device convenience state | Theme currently lives in localStorage keys rcs.website.theme / legacy darkMode, not a SQL theme column; a server job cannot clear an unavailable/offline device |
| Recent search/place history, saved ride-form addresses/coordinates and cached route answers | Clear unnecessary client convenience copies independently of retained ride records | frontend useData persistence includes `phone`, `recentPlaces`, `savedPlaces`, pickup/drop coordinates and route metrics; local/session/device coverage needs implementation |
| Notification/promotional preferences and obsolete push tokens | Remove obsolete account/device settings; keep any separately justified minimal consent/opt-out evidence under its own approved purpose | User notification/autoshare flags and Driver.fcmToken; provider/device copies require verified integration |
| Booking reference, trip dates/status, necessary lifecycle stamps | Keep beyond 90 days for meaningful customer/driver ride history, support and approved duties | Booking.reference/id, scheduledAt, createdAt, confirmedAt, reachedAt, startedAt, completedAt, cancelledBy; retention endpoint still pending |
| Necessary origin/destination summary, distance/duration and trip options | Keep the useful history/receipt facts; review precision/access and separate exact coordinates from a display summary | pickup/drop addresses, distanceKm, durationMin, vehicleClass, isOutstation/sharing; exact lat/lng and routePolyline follow row 3/evidence exceptions, not blanket indefinite retention |
| Vehicle used, relevant driver attribution and historical fare | Keep necessary snapshots/links rather than replacing them with today's vehicle/profile | vehicleNumber, vehicleModel, driverId and userId relations; do not expose unrestricted personal contact merely to display a trip |
| Fare, charges, payments, refunds, invoices, commissions and settlement/compensation links | Keep classified accounting/history records; CA sets applicable endpoint and required fields | Booking fare/payment/commission fields and related Payment/WalletEntry/compensation records; no financial deletion while row 10 is unresolved |
| Case outcomes, required evidence, receipts, commitments and hold/audit history | Retain according to the amended case schedule and longer dependencies/holds | Responsibility case/review/appeal, custody and lineage records remain separate from ordinary preference cleanup |

“Ride history with all details” is recorded as preservation of useful ride/receipt facts, **not a promise to expose raw GPS, old emergency contacts, full customer phone numbers, bearer share tokens or every internal AI payload indefinitely**. Exact booking customerPhone/address fields may need financial/dispute preservation and restricted access; this review does not decide their legal endpoint. Closed-account archived history also does not automatically restore a deleted login. Active accounts' normal history access remains unchanged.

### Existing implementation differences — no application change made

- [users.js](../../backend/routes/users.js:311) already rejects account deletion during active rides, removes saved places and profile fields immediately, substitutes deleted identity sentinels, and attempts Clerk deletion. It does not implement this new 90-day schedule or a complete authenticated legal-hold barrier. A failed Clerk cleanup does not prove external deletion.
- [ThemeContext.jsx](../../frontend/src/context/ThemeContext.jsx:5) stores theme in the browser; [useData.js](../../frontend/src/hooks/useData.js:268) persists convenience/route fields. Device/browser cleanup and later reconnect handling are separate engineering tasks.
- Booking.customerPhone, pickup/drop fields and account/driver links persist in history. Required fields/constraints mean minimization needs a reviewed data model, field rules, hold-aware transaction, migration and provider/device copy handling. No NULL assignment, schema change or cascade deletion is performed here.

The proposed field split is an implementation/review packet. Subitem gaps remain: row 1's finite ride-history endpoint/precise field actions, row 2's rejected-upload window, row 9's payload window, CA/legal classifications and actual copy acknowledgements. No fresh approval question is needed to record the explicit decisions already given; unanswered details are not silently treated as approved.

## Evidence and preservation

The raw edited Markdown is preserved byte-for-byte before repairing its four-column table. The previous sealed manifest's original guide hash differs because the owner supplied new file answers. Only that known path differed in its 141-entry inventory at intake. Earlier approval records, source receipts, test results and manifests are not rewritten or reissued as new executions.

The new current approval/intake/readiness records are additive. They record nineteen row decisions with explicit subitem gaps and the approved procedure/assignments, while retaining original 78 criteria/20 audit rows. The resulting human evidence assessment still reports missing collection/projection/acceptance approvals and zero real cases; it no longer reports missing reviewer assignment.

Validation includes the unchanged 14 synthetic review-protocol tests, exact twenty response IDs/raw wording, four delegated rows, row-10 deferral, distinct reviewer assignments, current source hashes, scoped Python/whitespace checks and unchanged HEAD/index/protected inputs. No PostgreSQL/Docker test is rerun for this documentation/approval-only change; the prior **44/44 native hold tests** remain at their recorded source epoch. Exact changed hashes are in the new manifest and validation receipt.

Google/R2 activation, genuine off-host recovery, final independent administration/key handoff, field-level real retention/provider integration, financial classification, useful privacy projection, real human calibration and production activation remain pending. Default-cache profiler signal-11 remains OPEN/PAUSED; signal-9 remains SEPARATE/UNATTRIBUTED. No customer or provider data, real email, application transaction, permission, signing/ACK rule, production configuration or historical test evidence is changed. No commit, push, merge or deployment. **Production stays OFF; deletion DISABLED.**
