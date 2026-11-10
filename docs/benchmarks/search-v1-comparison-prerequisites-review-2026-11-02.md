# Search V1 — comparison prerequisites and multilingual label review

Date: 2026-11-02, Asia/Kolkata. This continues the [November 1 comparison checkpoint](search-v1-decision-model-comparison-2026-11-01.md). The remaining comparison work was resumed after Cloudflare credentials were supplied. Customer integration, rollout, the pending 50-case Luna queue, independent datasets and unrelated Proofloop work remain outside this bounded task.

**Completed:** Cloudflare token verification, account-scoped model discovery, retrieval of both actual Cloudflare model schemas, offline request/schema compatibility checks, consistency review of all 16 multilingual cases, two comparison-contract corrections, a new source-bound registration, and focused regression/lint checks. All four providers now have credentials and successful read-only model discovery. **New inference remains NOT_RUN; actual additional API expenditure is $0.**

The earlier request requires existing human-approved development labels and verified no-additional-charge allocation. The review below is agent work prepared for the owner's decision; it does not fabricate human approval or account billing evidence. No verified allocation receipt is present, and no connected billing-dashboard tool is available in this session.

**Current experiment:** `search-decision-pilot-v3`, plan hash `8ac994633d7d9bedc345a827b1e345e832434f254eb7888807277113b3faeb4e`. This supersedes v2 before any new inference. The same 24 cases, original queries, clocks/timezones, original truth and candidate lists are retained. Original-label hashes are unchanged for all 24 cases.

Two defects were corrected in the experimental comparison layer only:

- `hh-v1-added-028` states competing conditional destinations. Its frozen truth retains an unresolved drop, but the earlier common-choice projection mapped an empty resolved-span list to NONE. V3 correctly projects the common drop answer to **AMBIGUOUS**. The original frozen label, missing-drop requirement and conditional alternatives remain unchanged.
- The common complexity instructions now explicitly retain **COMPLEX** routing for settled changed-mind corrections requiring superseded provenance, consistent with the [existing owner policy](../search/search-owner-decisions-2026-10-06.md). This closes an instruction gap for `hh-v1-added-032` and `hh-v1-added-003`; their expected complexity was not changed. The same instruction change applies to every provider and selected case.

No outputs from a new model were seen before these corrections. V1/v2 artifacts remain preserved and their source hashes are intentionally stale for the current comparison code. Production routing, B1 candidate generation and original benchmark scoring definitions were not edited in this continuation.

**Human review sheet.** All cases below are synthetic development records. Eight English cases already have approved human-reviewed truth; these sixteen do not yet have human approval. English glosses are explanations for review, not alternate model inputs. All sixteen source-bound expected interpretations were reviewed for consistency. All **21 expected endpoint spans** pass exact original UTF-16 slice checks. “Unavailable” in the common-task column means the exact span is absent from the fixed B1 options, not that the customer failed to state the location.

| Case | Original query | English meaning and expected interpretation |
| --- | --- | --- |
| `hh-v1-seed-001` | campus se delta 2 kal 6 baje | From campus to Delta 2 tomorrow at six. BOOKING_REQUEST / SIMPLE; pickup campus, drop delta 2; vehicle absent; SCHEDULED. Bare H12 follows existing PM policy; no minutes are invented. |
| `hh-v1-seed-007` | suv chahiye par sedan nahi | Need an SUV, but no sedan. BOOKING_REQUEST / SIMPLE; no endpoints; required `suv`; exclude `sedan`; timing absent. |
| `hh-v1-added-023` | beta 1 jaana hai alpha 2 se, subah 9 baje | Go to Beta 1 from Alpha 2 at nine in the morning. BOOKING_REQUEST / SIMPLE; pickup alpha 2, drop beta 1; vehicle absent; SCHEDULED, date absent. |
| `hh-v1-added-028` | agar dost aaya toh mall warna airport, hostel se | If my friend comes, mall; otherwise airport, from hostel. BOOKING_REQUEST / COMPLEX; pickup hostel (unavailable in common options); unresolved conditional drop **AMBIGUOUS**; vehicle/timing absent. Neither destination is selected. |
| `hh-v1-added-030` | sedan mat bhejna, koi aur gaadi chalegi campus se ghar | Do not send a sedan; any other car is fine, from campus to home. BOOKING_REQUEST / SIMPLE; pickup campus, drop ghar; EXPLICIT_ANY with sedan excluded; timing absent. Actual vehicle selection is still required. |
| `hh-v1-seed-040` | shared cab nahi chahiye | Do not want a shared cab. BOOKING_REQUEST / SIMPLE; no endpoints or positive vehicle class; sharing NO; timing absent. |
| `hh-v1-added-032` | actually alpha 2 nahi, beta 1 jaana hai from campus | Actually not Alpha 2; go to Beta 1 from campus. BOOKING_REQUEST / COMPLEX; pickup campus, corrected drop beta 1 (unavailable in common options); vehicle/timing absent. Retain superseded Alpha 2 provenance. Settled correction alone is not ambiguity. |
| `hh-v1-added-033` | SUV nahi chahiye, sedan mile toh theek hai from office to hotel | No SUV; a sedan if available is fine, from office to hotel. BOOKING_REQUEST / COMPLEX; pickup office, drop hotel; preferred sedan; exclude both `suv` and `suv_premium`; timing absent. Preserve conditional preference. |
| `hh-v1-seed-021` | परी चौक | Pari Chowk. LOCATION_SEARCH / NOT_APPLICABLE; no booking pickup/drop roles, vehicle or timing. |
| `hh-v1-added-001` | कृपया कल सुबह 7 बजे पुस्तकालय से अस्पताल तक सेडान भेजिए | Please send a sedan tomorrow morning at seven, from the library to the hospital. BOOKING_REQUEST / SIMPLE; pickup पुस्तकालय, drop अस्पताल; required sedan; SCHEDULED. No missing minutes are invented. |
| `hh-v1-added-002` | मुझे शाम को परी चौक से छात्रावास जाना है | Go in the evening from Pari Chowk to the hostel. BOOKING_REQUEST / SIMPLE; pickup परी चौक, drop छात्रावास; vehicle absent; SCHEDULED, date absent. Daypart evidence is not an exact clock time. |
| `hh-v1-added-003` | अल्फा 2 नहीं, असल में बीटा 1 जाना है कैंपस से | Not Alpha 2; actually go to Beta 1, from campus. BOOKING_REQUEST / COMPLEX; pickup कैंपस, corrected drop बीटा 1 (unavailable in common options); vehicle/timing absent. Retain superseded destination provenance. |
| `hh-v1-added-004` | एसयूवी नहीं चाहिए, सेडान मिले तो ठीक है | No SUV; sedan if available is fine. BOOKING_REQUEST / COMPLEX; no endpoints; preferred sedan; exclude both SUV classes; timing absent; preserve conditional preference. |
| `hh-v1-added-007` | चार घंटे के लिए गाड़ी किराये पर चाहिए | Want to rent a car for four hours. BOOKING_REQUEST / COMPLEX; no endpoints, vehicle class or pickup timing; RENTAL unsupported. Rental duration is not a pickup clock. |
| `hh-v1-added-016` | अभी अस्पताल से घर, साझा कैब नहीं चाहिए | Now, hospital to home; no shared cab. BOOKING_REQUEST / SIMPLE; pickup अस्पताल, drop घर; vehicle absent; IMMEDIATE; sharing NO. |
| `hh-v1-added-018` | सुबह 7 बजे लंदन के समय पर एयरपोर्ट से होटल जाना है | At seven in the morning London time, airport to hotel. BOOKING_REQUEST / SIMPLE; pickup एयरपोर्ट (unavailable in common options), drop होटल; vehicle absent; SCHEDULED, date absent. Preserve the London source zone; conversion depends on date/context. |

The remaining expected form requirements and unsupported-request answers are:

| Case suffix | Missing-field set | Unsupported requests |
| --- | --- | --- |
| seed-001 | vehicleClass | None |
| seed-007 | pickup, drop, timing | None |
| added-023 | vehicleClass, timing.date | None |
| added-028 | drop, vehicleClass, timing | CONDITIONAL_PREFERENCE |
| added-030 | vehicleClass, timing | None |
| seed-040 | pickup, drop, vehicleClass, timing | None |
| added-032 | vehicleClass, timing | None |
| added-033 | timing | CONDITIONAL_PREFERENCE |
| seed-021 | None; missing-booking-field questions unlabelled for location-only input | None |
| added-001 | None | None |
| added-002 | vehicleClass, timing.date | None |
| added-003 | vehicleClass, timing | None |
| added-004 | pickup, drop, timing | CONDITIONAL_PREFERENCE |
| added-007 | pickup, drop, vehicleClass, timing | RENTAL |
| added-016 | vehicleClass | None |
| added-018 | vehicleClass, timing.date | None |

All other exclusions are absent. Sharing is unmentioned except the two explicit NO cases above; outstation, safe-route and carrier flags are unmentioned throughout this selection. All unsupported kinds not listed are absent. The sixteen original records do not supply separately approved ambiguity labels, so that common task remains unlabelled rather than receiving invented truth. The conditional-drop answer is derived from explicit retained conditional-destination metadata. Empty missing-field sets do not establish grounded locations, exact times, fare confirmation or booking authority.

The exact 26-question vectors, source spans, English glosses and review notes are preserved in `output/search-v1-b1-comparison-2026-11-02/multilingual-label-review-v3.json`. It records agent review completed and human approval pending. Current label artifact hash: `ce901a5e67a64cc972fe91433c2ffa9031d2b44db3a02fffaaa4271db3058568`. Owner approval must refer to this reviewed v3 artifact; any requested correction requires a new additive registration.

**Account and schema results.** The token verified active with HTTP 200. Account-scoped catalog discovery lists both `@cf/cloudflare/clef-flash` and `@cf/cloudflare/clef`. Their actual read-only schemas confirm the typed System One wire shape, model selector, named questions/answers and `input_tokens` / `output_tokens` usage fields. All 48 v2 registered Cloudflare request bodies pass offline validation against those returned schemas. The final v3 bodies were then checked separately: **48/48 pass**, zero failures. This is stronger integration evidence than fake-provider tests, but it is not an executed inference or a quota receipt. [Model catalog API](https://developers.cloudflare.com/api/resources/ai/subresources/models/methods/list/), [schema API](https://developers.cloudflare.com/api/resources/ai/subresources/models/subresources/schema/methods/get/).

A single documented read-only subscription lookup returned **HTTP 403, error code 10000**. That endpoint requires Billing Read or Billing Write; the supplied token's successful Workers AI access does not establish billing visibility. Cloudflare calls stopped after the access failure. The actual plan and remaining daily allocation remain UNKNOWN. Dashboard plan/usage observations are needed; no permission or billing configuration was changed. This continuation made six read-only account requests (one Cloudflare catalog, two schemas, two other-provider discovery requests, one subscription lookup), in addition to the preceding turn's one token-verification request. [Subscription API and required permission](https://developers.cloudflare.com/api/resources/accounts/subresources/subscriptions/methods/get/).

| Provider | Current credential/discovery status | Remaining prerequisite |
| --- | --- | --- |
| Jev | Credentials present; documented model listed, HTTP 200 | Existing free balance/credits, account limits and overage controls unverified |
| OpenAI Decisions | Credentials present; model discovery HTTP 200 | Decisions endpoint execution, current free credits, account limits and overage controls unverified |
| Clef-flash | Credentials present; account-scoped catalog and schema HTTP 200 | Free/Paid plan, today's neuron usage, account limits and overage controls unverified |
| Clef | Credentials present; account-scoped catalog and schema HTTP 200 | Same shared Cloudflare allocation; do not reserve it twice |

Cloudflare publishes 10,000 free neurons per account/day, shared across models, resetting at **05:30 IST**. Free-plan exhaustion fails requests; paid plans charge overage. The account's actual plan/usage must therefore be observed before applying these rules. [Official pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/).

At the deliberately conservative existing reservation of 72 requests × 24,576 planning tokens/provider, flash reserves **6,113.52576 neurons** and Clef **38,606.340096 neurons**, totaling **44,719.865856 shared neurons**. This exceeds one published daily free allocation; it does not establish actual token use or require buying credits. A verified free-only run may need smaller separately registered tranches or later daily allocations, rather than claiming both full maximum reservations fit today. Current maximum published tariff estimates remain Jev $0.074317824, Decisions $0.1769472, flash $0.067239936 and Clef $0.42467328; none is an approved paid budget.

The official OpenAI documentation directs account owners to billing settings for active free credits. Free grants are organization-specific and usage may continue into purchased credit after free credit exhaustion. Public eligibility and successful model discovery do not establish a no-charge allocation. No benefit was activated and no billing settings were changed. [API credit rules](https://developers.openai.com/api/docs/guides/chatgpt-api-credits). Jev's current account rates/limits are available in its developer console; no balance is inferred from an API key. [TypeSafe limits](https://docs.typesafe.ai/models).

**Validation and preservation.** The focused Search and comparison suite passes **460/460**, including the new conditional-drop/correction-policy regression. Scoped lint checks 21 files with **zero errors and warnings**. No production TypeScript source changed in this continuation; the prior Search-only typecheck pass and unrelated full-backend StudyAI typecheck failure remain as recorded. New coverage percentages were not measured, so the November 1 coverage numbers are historical.

The preservation receipt verifies **2,005 protected file hashes unchanged**, **44/44 current registered sources matching**, the v3 plan hash valid, and HEAD/staged identities unchanged. Historical model responses, v1/v2 receipts, frozen datasets, S6 evidence and Responsibility sources are retained. New output is additive under `output/search-v1-b1-comparison-2026-11-02/`:

- `cloudflare-model-access.json`, `cloudflare-model-schemas.json`, `cloudflare-schema-compatibility.json`, `cloudflare-schema-compatibility-v3.json`, `cloudflare-billing-access.json`;
- `all-provider-access-status-v3.json`;
- `pilot-inputs-v3.json`, `pilot-labels-v3.json`, `pilot-registration-v3.json`, `comparison-status-v3.json`;
- `multilingual-label-review-v3.json`, `search-regressions-v3.log`, `scoped-lint-v3.json`, `preservation-v3.json`.

The current runner is `node --import tsx scripts/search-decision-pilot.mjs --revision=v3` from `backend/`; it remains offline by default and its existing status receipt cannot be overwritten. Live execution additionally requires exact-plan owner-label approval and verified no-charge account evidence. No such receipt was fabricated. All four live results remain **NOT_RUN**, with accuracy, latency and complete-workflow economics unmeasured. The remaining owner inputs are approval/corrections for the review sheet and the actual provider allocation/usage observations. No API inference, charge, purchase, deployment, commit, held-out run or pending-queue execution occurred.
