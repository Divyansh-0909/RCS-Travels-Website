# Search V1 — post-v6 Hindi binding closure

Date: 2026-11-03, Asia/Kolkata. **The bounded offline corrections are complete.** Hindi preferred-vehicle availability and affirmative rental wording now retain source evidence without weakening vehicle, provenance or submission guards. Jev remains the existing parser baseline. **S5 is not ready to resume the historical Luna queue as-is.** No inference, account probe, Places request or customer Search activation occurred.

The accepted [completed v6 comparison](search-v1-v6-retry-checkpoint-2026-11-03.md) remains historical: Jev **450/463**, Clef **456/463**, guard-accepted partials **13 / 9**, and Jev positive parser pickup/drop **12/13 / 12/12**. All **138 requests**, predictions, scores and original registrations remain unchanged. This implementation does not establish new model accuracy or a new provider winner.

**Recovered contract.** The root agent guidance, November 1 resumption audit and B1 checkpoint, v6 executor verification, owner SIMPLE checkpoint, S1–S4 architecture/validation documents and owner form policy were checked against source. R1 rental-only and R2 one preferred class “if available,” including exclusions, remain SIMPLE absent material conflicts or branching journeys. Rental remains unsupported; material conditional vehicle preferences retain form/submission restrictions. Missing values, vague time precision and grounding remain distinct from interpretation failure. Unsupported capability alone does not require Luna.

**Case-level diagnosis.** The additive [diagnosis artifact](../../output/search-v1-post-v6-hindi-binding-2026-11-03/case-diagnosis-and-request-compatibility.json) covers **all 24 saved Jev parser results**, including the fixed **17 expected-SIMPLE booking cases** and **all eight fallback-eligible cases**. It retains registered expectations, original decisions/candidates, historical scores, source observations and before/after fixture outcomes. Recomputing the original parser scores reproduces all 24 rows. The following cases contain the outstanding mismatches or require a specific fallback disposition:

| Case | Actual saved failure or containment | Disposition in this patch |
| --- | --- | --- |
| `hh-v1-seed-007` | Model requests required SUV and EXPLICIT_ANY together despite no any-vehicle source phrase. The conflict makes vehicle selection and its missing-field projection differ from gold. | Keep vehicle AMBIGUOUS and require form selection. No model override. The exclusion remains sedan. |
| `hh-v1-added-030` | Negative sedan is correctly retained. `koi aur gaadi chalegi` is outside explicit-ANY recognition, yielding EXCLUDED rather than the registered EXPLICIT_ANY representation. Model also incorrectly chooses CONDITIONAL_PREFERENCE. | Both vehicle representations still require concrete selection. Unsupported-kind binding failure correctly triggers fallback; no condition is invented to accept the answer. |
| `hh-v1-added-033` | Local observer misses the Romanized availability condition. Model selects sedan/PREFERRED but answers vehicle_any UNCLEAR. | Preserve the condition and remove that local unsupported-binding error. Keep the model-induced ambiguous vehicle and form resolution. This is not a correct vehicle draft. |
| `hh-v1-added-004` | Correct Hindi sedan/PREFERRED answer fails the Romanized-only strength validator; the corresponding conditional source evidence is also missing. Provider-failure handling clears the partial draft. | Fix the shared bounded suffix assertion and preserve the conditional source clause. Retain SUV exclusions and unsupported material review. |
| `hh-v1-added-007` | Correct RENTAL answer cannot bind to the English-only rental observer. | Recognize the closed affirmative Hindi rental phrase, preserve unsupported RENTAL and require form resolution. No rental capability is added. |
| `hh-v1-added-018` | Offered pickup is `लंदन के समय पर एयरपोर्ट`, rather than exact expected `एयरपोर्ट`. Model selects the offered candidate faithfully; source provenance is valid but endpoint correctness is false. | Retain the diagnosed generator/timezone-lexicon limitation. Removing words alone would risk silently losing the unrecognized Hindi London timezone and using IST. A coordinated timezone/prefix fix is a separate bounded task. |
| `hh-v1-added-032` | Model routes a correction SIMPLE instead of registered COMPLEX. Generator lacks the corrected exact destination; model chooses no drop while indicating PRESENT. | LOCATION_CANDIDATE_MISSING correctly triggers fallback. Do not infer a destination or add broad correction heuristics. |
| `hh-v1-added-003` | Model routes a correction SIMPLE; exact corrected destination is unavailable. It assigns campus to both roles while also marking pickup ABSENT. | Role, presence and overlapping-endpoint guards correctly reject the result. Preserve fallback and review rejection. |
| `core-ambiguity-conflict-001` | Two conflicting scheduled times. | Correct COMPLEX fallback; outside the 17-case field cohort. |
| `hh-v1-added-028` | Conditional alternative destinations. | Correct COMPLEX fallback with conditional evidence retained; outside the field cohort. |

The remaining fourteen cases have no identified mismatch in the checked pipeline fields or their non-booking route. Their ordinary missing-field, timing-precision, grounding and explicit-review requirements remain. Level 1 common-task mistakes are separate from parser-contract errors. No reversed or incorrect endpoint is repaired by selecting another candidate for the model.

**Small deterministic changes.** Only two production source files changed:

- `backend/services/search/negation.ts`: the existing Romanized `mile to/toh theek hai` preference assertion also recognizes the closed Hindi `मिले तो ठीक है` form. The shared helper returns an original UTF-16 end offset and rejects quoted wording. Existing simple extraction and Luna evidence validation consume the same assertion. No provider answer, routing instruction or availability fact is substituted.
- `backend/services/search/observations.ts`: retains availability-condition evidence only when attached directly to a recognized, non-negated, unquoted vehicle mention. It also recognizes affirmative `गाड़ी/कार/कैब किराये/किराए पर चाहिए` outside protected location candidates and quotations. Rental evidence is an unsupported source clause; the original query still preserves duration wording without creating a rental-duration booking field.

The primary extractor, parser, routing questions, candidate generator, temporal resolver, required-field hierarchy, fallback eligibility, form submission gates and production provider choice were not edited. The two existing alignment/readiness tests that asserted the old Hindi failures now assert preserved unsupported semantics and safe unresolved forms. Their original files were archived before editing. No benchmark labels or result receipts were updated.

**Before/after deterministic outcomes.** These are explicitly **counterfactual saved-answer fixtures**: the same recorded categorical answers exercise the changed application code, with synthetic diagnostic values for newly added diagnostic questions. Diagnostic probabilities do not select fields. These fixtures are not compatible-request cache replay and are not fresh Jev accuracy measurements.

| Fixture | Before | After | Remaining control |
| --- | --- | --- | --- |
| Hindi preferred sedan, `hh-v1-added-004` | JEV_INVALID_RESPONSE; empty vehicle; fallback; rejected review snapshot | SIMPLE_INCOMPLETE; sedan PREFERRED; excludes regular and premium SUV; conditional clause preserved; no binding fallback | Missing endpoints/timing and material conditional-preference resolution; submission false |
| Hindi rental, `hh-v1-added-007` | Unresolved unsupported binding; RENTAL missing; fallback; rejected review snapshot | SIMPLE_INCOMPLETE; RENTAL source preserved; no interpretation fallback | Rental unsupported plus missing ordinary fields; submission false |
| Romanized preferred sedan, `hh-v1-added-033` | Missing conditional binding plus ambiguous vehicle; fallback | Conditional clause preserved; vehicle still AMBIGUOUS from saved UNCLEAR answer; editable form | Vehicle conflict, grounding, missing fields and material conditional preference; submission false |

Removing a local binding failure means the form can faithfully retain understood input. It does not make the ride bookable. The rental outcome is successful containment. The third fixture remains semantically unresolved despite no longer needing interpretation fallback for a missing local condition observation. A guard-accepted partial-draft proxy must not be mistaken for complete or correct interpretation.

**Request identity and evidence limits.** Exact offline replay reproduces **21/24 current Jev parser outcomes** from identical saved wire requests. The changed cases are precisely `hh-v1-added-004`, `hh-v1-added-007` and `hh-v1-added-033`; their changed extraction requests are refused by strict replay. Routing requests remain identical. Across the original 144 amended Jev/Clef parser-path identities, **six extraction identities change**, three per provider; 138 remain identical. The six changed identities correspond to actual saved requests. Common comparison batches remain historical and unchanged.

All 24 before-change parser results are independently identical to the persisted live results after JSON canonicalization. The initial in-memory before-replay counter treated absent versus undefined properties differently; the independent persisted-result check records 24/24 and confirms no prediction difference. Original responses are never relabelled as observations under changed requests.

The current request question wording/version remains `ride-search-questions-v3-owner-simple`; added source observations and diagnostic questions change extraction wire bodies where applicable. Full execution/source equivalence is invalidated even for individually identical requests. **Four of the previous 66 registered source hashes differ:** the two production files and two updated regression files. Historical executor verification correctly stops with SOURCE_DRIFT; no manifest or guard is weakened to permit reuse.

New [offline source registration](../../output/search-v1-post-v6-hindi-binding-2026-11-03/offline-source-registration.json):

```text
version: search-post-v6-hindi-binding-closure-v1
sourceIdentityHash: 73c5639de94599e0609de969b6ed6785e5b87c87a5e479821f71d23925a97153
source files: 73
parent execution amendment: 821e405be4efbe0e29fe32ff7e31c33b36eb22b95a2fc9aa33a9b7edd2ade561
negation.ts: 40e51d7c2b86112d1311a149a7842711c2bb730684f432e9cd732f9e435b9560
observations.ts: a5786ec5a316a12a1b426984964ad7cbbb1384527928a274844607d6adaaeabd
liveAuthorized: false
```

This identity binds the current sources and counterfactual fixture artifact. It is not a new live comparison registration or authorization.

**Offline development and regression verification.** The original 80-case Hindi/Hinglish development data was read without changing its frozen labels. Its historical 51 expected-SIMPLE cases retain exactly the B1 deterministic diagnostics: pickup candidate **34/36**, drop **36/37**, opposite-role rejection probes **71/73**, exact positive exclusions **3/3**, negative-sharing observations **2/2**, and **zero invalid source-span cases**. These are source/generator diagnostics using gold query type, not all-80 model extraction scores or the owner-adjusted v6 cohort.

Strict historical SDK-request replay is supported by the offline harness but is incompatible for **all 80 Hindi/Hinglish records and all 20 saved English controls** at the routing request. Current owner-approved routing questions differ from those Jev 1.13 requests. Zero old requests were served as compatible responses, and no fresh inference was performed. Historical 67/80 schema validity and other model scores remain historical. The 20 controls also have descriptive current source diagnostics in the artifact; no before/after model-quality claim follows. All eight English v6 parser cases reproduce exactly through strict replay, alongside the focused English regression tests.

| Check | Final result |
| --- | --- |
| Focused Search and adapter/stage/language tests | **510/510 pass**, zero failures/skips/cancellations |
| New post-v6 binding tests, included above | **12 pass** |
| Four historical zero-candidate fixtures | Valid routing/extraction shapes through all four fake adapters; no singleton or invented endpoint |
| Scoped lint | **11 files**, zero errors/warnings; maximum cyclomatic complexity 21 enforced |
| Search-only strict TypeScript | **PASS** |
| Full backend TypeScript | Existing unrelated StudyAI TS2719 at `services/AI/StudyAI/services/index_langGraph.ts:127`; no Search errors |
| Original saved Jev pipeline scores recomputed | **24/24 identical** |
| Current exact-request Jev replay | **21/24 compatible and identical**; three refused changed cases |
| Counterfactual fixtures | **24**, zero returned-draft provenance violations; zero submission-allowed forms |

The focused suite excludes S5/freeze suites and the historical executor/retry suites bound to obsolete source identities. A new explicit source-fence test verifies that the old registration rejects current sources without creating an activation claim. Existing four-provider adapter tests exercise the new diagnostic question shapes offline. Broader backend tests, coverage and exhaustive mutation closure were not claimed.

Tests verify shared simple/Luna preference-strength evidence, rejection of an incorrect REQUIRED answer for a preferred phrase, retained negation, quotes and protected names, original UTF-16 offsets including surrogate pairs, missing-form hierarchy, unsafe role/endpoint rejection and refusal of incompatible requests. Synthetic explicit user-selection controls additionally supply otherwise complete locations, vehicle, immediate timing, fare/route and final confirmations through the existing review APIs: **RENTAL alone still blocks submission**, and **material CONDITIONAL_PREFERENCE alone still blocks submission**. No model creates those selections or confirmations. Architecture and provenance tests retain the booking/payment/dispatch dependency firewall.

**Preservation.** The pre-edit baseline covers **3,837 files**. Verification finds **3,833 unchanged**, exactly the four intentional source/test edits above, **zero unexpected changes**, unchanged HEAD and unchanged staged identity. Archived pre-edit copies retain those four original identities. All v1–v6 registrations, predictions, labels, request claims, frozen datasets, caches, S6 evidence, the original 50-case Luna queue and unrelated working-tree changes remain intact. The [preservation receipt](../../output/search-v1-post-v6-hindi-binding-2026-11-03/preservation.json) and completion receipt bind this result. The new artifact directory is additive and uses exclusive JSON creation; earlier diagnostic logs are retained.

**S5 continuation assessment and next task.** **NO-GO for resuming the old 50-case Luna evaluation as-is.** The pending manifest still has 50 Luna cases and zero pre-Luna Places cases, but **10/36 historical runtime source hashes differ** from current source, including changes preceding this patch. New source dependencies also need a complete current manifest. Trusted partials and request/cache compatibility require an additive current-source continuation audit. Current Luna availability is unverified, and this task grants no inference authorization. The previous preflight 429 window expiring does not establish availability. No pending stage was consumed or rewritten, and no S5/S6 completion or rollout readiness is established.

The next smallest parser improvement is coordinated, bounded recognition of the Hindi London-time clause and its route-prefix boundary, with exact source spans, protected place-name controls and timezone conversion tests. Preserve correction-grammar limitations and model vehicle mistakes as explicit cases rather than hiding them with deterministic selections. Any later Luna continuation needs its own current-source registration, availability/stop controls and separate authorization. Work stops here: **zero provider, Luna, Places, Details, booking, payment or dispatch calls; no provider switch, frontend wiring, Search activation, billing change, commit, push, merge, reset, clean or deployment.**
