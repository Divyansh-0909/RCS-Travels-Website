# Search V1 S5 — current-source continuation readiness

Date: 2026-11-03, Asia/Kolkata. **Offline reconciliation and additive registration are complete. GO for the registered continuation design; NO-GO for live execution now.** Fourteen exact Jev API observations covering eight development cases can be reused. The other **214 cases require current routing**; their extraction and Luna dependencies remain conditional. The smallest proposed activation is **one Luna Responses request**, using an already reconciled current Jev parent, with a **$0.01024 conservative tariff reservation and proposed $0.02 operational ceiling**. No inference or account probe occurred. Production Search remains OFF.

This continues the [post-v6 binding closure](search-v1-post-v6-hindi-binding-closure-2026-11-03.md), [completed v6 comparison](search-v1-v6-retry-checkpoint-2026-11-03.md), [November 1 resumption audit](search-v1-hinglish-resumption-audit-2026-11-01.md), [B1 checkpoint](search-v1-b1-hinglish-candidates-negation-checkpoint-2026-11-01.md), [owner SIMPLE checkpoint](search-v1-owner-simple-routing-checkpoint-2026-11-02.md), S1–S4 contracts and S5 evaluation records. Rental and conditional-vehicle routing policy is settled; no new owner policy decision is requested.

**Authoritative historical baseline.** The original S5 records are 131 rows in `output/search-s5-authorized-development/live-development-source-any-strength-guard/rows.json` plus 91 separated-stage rows in `output/provider-resume-2026-10-07/rows.json`. They contain exactly **222 distinct development IDs**, **428 historical Jev attempts** and **421 normalized batches**, all reported as Jev 1.13. The subsequent 48 Places-continuation rows preserve **96 autocomplete observations**, without Details or authoritative selections. Historical provider-stage completion remains **172**, with **50 Luna-pending cases**. Those counts have not been promoted to current-source completion.

The 98 held-out cases and 18-case independent Hindi challenge remain NOT_RUN. S6 independent verification remains incomplete; customer Search integration is not implemented and rollout is OFF. Frozen combined datasets were not deserialized for tuning or scoring. The tooling reads the already registered, development-only 222-input artifact and saved development evidence. Preservation hashing is separate from label access.

**Current implementation and dependency map.** New tooling is under `backend/benchmarks/search/s5Continuation/`, with an offline-only CLI at `backend/scripts/search-s5-current-source.mjs`. The [dependency inventory](../../output/search-v1-s5-current-source-2026-11-03/v2/dependency-inventory.json) binds **55 source files**, transitive local import edges and installed dependency metadata. Source entry points cover routing/questions, Jev normalization, extraction, candidate generation, Hindi temporal/vehicle/rental recognition, provenance, fallback eligibility, Luna input preparation/adoption, grounding, form requirements and existing Search metric/prediction functions.

| Layer | Bound implementation and compatibility requirement |
| --- | --- |
| Routing | `questions.ts` v3 owner SIMPLE; original query ID/revision/text, fixed clock and timezone; exact question meanings and options |
| Jev | Existing SDK adapter; `jev-latest`, require reported `jev-1.14.0`; SDK 0.6.0; 10-second timeout; zero retries |
| Extraction/candidates | Existing parser and source observers; generated candidate membership, IDs, original spans and selected branch |
| Hindi binding | Current `negation.ts` and `observations.ts` exactly match the accepted post-v6 source hashes |
| Calendar/provenance | Current Hindi temporal/calendar helpers, timezone policy, contracts and UTF-16/source-reference validation |
| Fallback/Luna parent | Actual eligibility rules and production composition-service input construction, including trusted fields, partial draft, candidates and fixed context |
| Luna Responses | Existing interpreter; `gpt-6-luna`, SDK 7.10.0, strict `ride-search-luna-v1`, reasoning low, 4,096 maximum output tokens, 15-second timeout, zero retries |
| Adoption/form | Existing source evidence, role, trusted-field, unsupported-capability and submission checks; no model-controlled confirmation or creation authority |
| Grounding | Existing Places provider/grounder and explicit selection contracts; Google HTTP proxy boundary hashes recorded separately; zero grounding calls in the proposed first activation |
| Evaluation | Existing Search prediction/metric contracts; original approved development labels only; no new model scores computed here |

The October 8 runtime snapshot differs in **10/36** source hashes, as previously reported. The later October 9 case-fold snapshot differs in **9/36**; the difference is the already preserved Hindi temporal case-fold change. Neither snapshot is silently relabelled current. An exact Git blob matches the historical routing-source hash: its state-builder function is unchanged, but routing question definitions differ from current source. Historical reported Jev 1.13 also differs from the required current 1.14. This is why unchanged query text alone cannot justify reusing those model decisions.

**Compatibility at the appropriate layer.** The [222-case reconciliation](../../output/search-v1-s5-current-source-2026-11-03/v2/reconciliation.json) validates historical output hashes against actual cache identities, input hashes and saved parses. All original work remains evidence. Under each saved guarded route, **222/222 candidate text-span sets are unchanged**. Complete candidate identities match in 41 cases; the other 181 require current candidate IDs, chiefly because the generator version changed. These are deterministic diagnostics under saved routing, not predictions of the new model's route.

No original S5 Jev 1.13 response is accepted as a current Jev 1.14 API observation. Exact reusable API observations instead come from the saved v6 Jev 1.14 responses for the eight overlapping S5 development inputs. Full wire request state/questions/model, clock/context, timeout/retry settings, reported model and successful response identity are checked. The current production SDK normalizer accepts all fourteen responses. Replaying them through current deterministic code reproduces the original semantic draft, issues, route, temporal result and fallback outcome in all eight cases, with zero returned-draft provenance violations.

| Reusable S5 input | Exact Jev requests | Current fallback |
| --- | ---: | --- |
| `core-standalone-002` | 2 | None |
| `core-complete-simple-001` | 2 | None |
| `core-date-only-001` | 2 | None |
| `core-vehicle-preferences-002` | 2 | None |
| `core-role-order-003` | 2 | None |
| `core-assisted-services-003` | 2 | None |
| `core-ambiguity-conflict-001` | 1 | COMPLEX_QUERY |
| `core-unclear-noisy-candidates-001` | 1 | None |

This is explicit cross-registration API-evidence reuse, with original v6 request/response identities retained. **It is not fresh inference, a new v6 score, or substitution of v6 aggregate accuracy for S5 evaluation.** Changed-code replay remains labelled diagnostic evidence. No current S5 accuracy aggregate or fully completed workflow count is claimed. Five of these eight were historically provider-stage-complete; three were in the old Luna queue.

**All fifty original pending cases.** The original queue order is unchanged. The [machine-readable disposition artifact](../../output/search-v1-s5-current-source-2026-11-03/v2/original-50-stage-dispositions.json) contains every original query, Jev output/cache identity, fallback reason, extraction/candidate context, prospective historical Luna input/hash and stage-specific current disposition. The [stage analysis](../../output/search-v1-s5-current-source-2026-11-03/stage-readiness-analysis.json) also distinguishes identity review and conditional post-Luna grounding.

In the table, REFRESH means REQUIRES_CURRENT_JEV; REUSE means EXACT_REUSE_SUPPORTED. UNKNOWN means current Luna eligibility cannot be established without current Jev. YES means REQUIRES_NEW_LUNA; NO means current fallback is not eligible. Every UNKNOWN/YES Luna path has grounding conditional on an accepted interpretation producing source-owned locations. NO rows have separate ordinary partial-draft grounding requirements. Historical fallback reasons below are preserved, not rewritten to current reasons.

| Order | Original case | Historical fallback | Current Jev | Luna now |
| ---: | --- | --- | --- | --- |
| 1 | `core-standalone-003` | JEV_SCHEMA_ERROR | REFRESH | UNKNOWN |
| 2 | `core-standalone-020` | LOCATION_CANDIDATE_MISSING | REFRESH | UNKNOWN |
| 3 | `core-standalone-021` | LOCATION_CANDIDATE_MISSING | REFRESH | UNKNOWN |
| 4 | `core-complete-simple-029` | EXTRACTION_BINDING_UNRESOLVED | REFRESH | UNKNOWN |
| 5 | `core-date-only-001` | ROLE_CONFLICT | REUSE | NO |
| 6 | `core-date-only-004` | ROLE_CONFLICT | REFRESH | UNKNOWN |
| 7 | `core-date-only-007` | JEV_INVALID_RESPONSE | REFRESH | UNKNOWN |
| 8 | `core-date-only-010` | ROLE_CONFLICT | REFRESH | UNKNOWN |
| 9 | `core-date-only-016` | ROLE_CONFLICT | REFRESH | UNKNOWN |
| 10 | `core-date-only-019` | ROLE_CONFLICT | REFRESH | UNKNOWN |
| 11 | `core-time-only-001` | ROLE_CONFLICT | REFRESH | UNKNOWN |
| 12 | `core-time-only-010` | ROLE_CONFLICT | REFRESH | UNKNOWN |
| 13 | `core-time-only-011` | ROLE_CONFLICT | REFRESH | UNKNOWN |
| 14 | `core-time-only-013` | JEV_INVALID_RESPONSE | REFRESH | UNKNOWN |
| 15 | `core-vehicle-preferences-002` | JEV_INVALID_RESPONSE | REUSE | NO |
| 16 | `core-vehicle-preferences-010` | EXTRACTION_BINDING_UNRESOLVED | REFRESH | UNKNOWN |
| 17 | `core-vehicle-preferences-025` | ROLE_CONFLICT | REFRESH | UNKNOWN |
| 18 | `core-role-order-013` | JEV_INVALID_RESPONSE | REFRESH | UNKNOWN |
| 19 | `core-role-order-019` | JEV_INVALID_RESPONSE | REFRESH | UNKNOWN |
| 20 | `core-multi-stop-002` | COMPLEX_QUERY | REFRESH | UNKNOWN |
| 21 | `core-multi-stop-004` | COMPLEX_QUERY | REFRESH | UNKNOWN |
| 22 | `core-multi-stop-006` | COMPLEX_QUERY | REFRESH | UNKNOWN |
| 23 | `core-multi-stop-008` | COMPLEX_QUERY | REFRESH | UNKNOWN |
| 24 | `core-multi-stop-010` | COMPLEX_QUERY | REFRESH | UNKNOWN |
| 25 | `core-multi-stop-012` | COMPLEX_QUERY | REFRESH | UNKNOWN |
| 26 | `core-multi-stop-014` | COMPLEX_QUERY | REFRESH | UNKNOWN |
| 27 | `core-assisted-services-001` | JEV_INVALID_RESPONSE | REFRESH | UNKNOWN |
| 28 | `core-assisted-services-004` | JEV_INVALID_RESPONSE | REFRESH | UNKNOWN |
| 29 | `core-assisted-services-007` | JEV_INVALID_RESPONSE | REFRESH | UNKNOWN |
| 30 | `core-assisted-services-010` | JEV_INVALID_RESPONSE | REFRESH | UNKNOWN |
| 31 | `core-assisted-services-013` | JEV_INVALID_RESPONSE | REFRESH | UNKNOWN |
| 32 | `core-assisted-services-016` | JEV_INVALID_RESPONSE | REFRESH | UNKNOWN |
| 33 | `core-assisted-services-019` | JEV_INVALID_RESPONSE | REFRESH | UNKNOWN |
| 34 | `core-ambiguity-conflict-001` | EXTRACTION_BINDING_UNRESOLVED | REUSE | YES |
| 35 | `core-ambiguity-conflict-003` | JEV_INVALID_RESPONSE | REFRESH | UNKNOWN |
| 36 | `core-ambiguity-conflict-005` | EXTRACTION_BINDING_UNRESOLVED | REFRESH | UNKNOWN |
| 37 | `core-ambiguity-conflict-006` | EXTRACTION_BINDING_UNRESOLVED | REFRESH | UNKNOWN |
| 38 | `core-ambiguity-conflict-010` | EXTRACTION_BINDING_UNRESOLVED | REFRESH | UNKNOWN |
| 39 | `core-ambiguity-conflict-011` | COMPLEX_QUERY | REFRESH | UNKNOWN |
| 40 | `core-ambiguity-conflict-015` | EXTRACTION_BINDING_UNRESOLVED | REFRESH | UNKNOWN |
| 41 | `core-ambiguity-conflict-016` | COMPLEX_QUERY | REFRESH | UNKNOWN |
| 42 | `core-ambiguity-conflict-020` | EXTRACTION_BINDING_UNRESOLVED | REFRESH | UNKNOWN |
| 43 | `core-ambiguity-conflict-021` | COMPLEX_QUERY | REFRESH | UNKNOWN |
| 44 | `core-ambiguity-conflict-025` | EXTRACTION_BINDING_UNRESOLVED | REFRESH | UNKNOWN |
| 45 | `core-unclear-noisy-candidates-002` | LOCATION_CANDIDATE_MISSING | REFRESH | UNKNOWN |
| 46 | `core-unclear-noisy-candidates-006` | JEV_INVALID_RESPONSE | REFRESH | UNKNOWN |
| 47 | `core-unclear-noisy-candidates-010` | LOCATION_CANDIDATE_MISSING | REFRESH | UNKNOWN |
| 48 | `core-unclear-noisy-candidates-014` | LOCATION_CANDIDATE_MISSING | REFRESH | UNKNOWN |
| 49 | `core-unclear-noisy-candidates-015` | ROLE_CONFLICT | REFRESH | UNKNOWN |
| 50 | `core-unclear-noisy-candidates-018` | LOCATION_CANDIDATE_MISSING | REFRESH | UNKNOWN |

Thus the old queue has **47 refreshes, two confirmed removals from fallback, and one confirmed current Luna case**. It is not the final current-source Luna cohort. The other 167 historically completed but non-reusable cases also need current routing, because the actual request/model configuration changed; they are not rerun merely to increase counts. Their new outcomes may add or remove fallback cases. Old prospective Luna inputs are not executed predictions and cannot be reused as current parents.

**Exact fresh-request bounds.** Reusable current Jev work is **eight cases / fourteen requests**. Required fresh Jev routing is **214 requests**. There can be **zero to 214 additional extraction/location-selection requests**, determined by actual new routing and local validation. One new Luna request is currently established. Eligibility for the other 214 cases is unknown; at most 215 Luna requests could be needed in a one-attempt pass under this registration's model assumptions. Therefore **215 is the known lower bound on fresh model calls**, while **643 is a conservative one-pass upper bound**. The exact final count is not knowable offline and may be interrupted by a stop condition. No automatic retries or failed-call budget replenishment are assumed.

Grounding is separate. The six reusable cases with current resolved location phrases expose **ten autocomplete slots** if that phase is enabled. Accepted future Luna outputs may expose further slots; that count is unknown until adoption. The one-query-revision planning bound is at most 444 autocomplete calls across the full development set. All initial proposed activations keep Places and Details at zero. Explicit Details/selection verification remains unperformed and needs separately registered selection fixtures; no first-result selection is fabricated. Old autocomplete results retain their original requests/sessions and are not silently transferred into fresh sessions or treated as confirmed locations. Google session/freshness and cache policy remain identity-review conditions. S6 remains a separate, unexecuted verifier stage.

**Locked additive registration.** Current artifacts are under `output/search-v1-s5-current-source-2026-11-03/v2/`. The earlier preparation iteration is preserved at the directory root, with all 55 original source bytes archived under `v1-source-snapshot/`; it is not the current package.

```text
registration: search-s5-current-source-continuation-v2
registrationHash: 6bc21e82c8bd6046cbe88359306eb343fde5168be13f02e21dc1cebcc6bce1c3
sourceIdentity: 77a6b34321b35b42919096aaaec36aa41cfb137a2745dbc140bf0256fce9eddb
datasetHash: 2c2a0d7099c4b65be9495d08d5049e72fb44b6d49f84b82c65dbaf643ca61296
splitHash: aea66b52ac37ddea99d4bb1c2861d63c70c7e7a3e84f7946a9c0a1a5414ef5de
source files: 55
known request identities: 667
liveAuthorized / liveExecutable: false / false
```

The [registration](../../output/search-v1-s5-current-source-2026-11-03/v2/registration.json) binds source/import dependencies, installed package metadata, backend lockfile, owner policy documents, historical/cache artifacts, original development and 50-case orders, clocks, schemas, requests and stopping/budget definitions. Verification independently checks the registration, source, artifact, dependency and request identities. There are **666 prospective Jev request shapes**, covering routing and both hypothetical extraction branches for each input, plus **one concrete Luna request**. These are not 667 planned sends: only a routing-selected branch may execute, and the fourteen reusable Jev observations must not be sent again.

The concrete Luna request is generated through the actual current composition service and existing Luna adapter with a fake transport. Its strict schema is serialized into the registered wire body. Other Luna requests deliberately remain unbound until a current Jev receipt establishes eligibility, candidates, partial draft, trusted fields and context. They need additive input-binding receipts before inference. A matching case/query cannot bypass the current-parent fence. No old 429, historical timestamp or synthetic success establishes current account availability.

**Proposed small activations and economics.** The smallest justified Luna batch contains only `core-ambiguity-conflict-001`. Its new current fallback reason is COMPLEX_QUERY, with two conflicting schedules. The parent is the exactly reused Jev 1.14 routing observation and the current deterministic parse. Its prospective request is 56,611 serialized bytes; the additional 4,096-byte planning margin fits the 65,536-input-token reservation. That is a conservative reservation, not a tokenizer measurement. No source answer is invented to resolve either schedule.

The subsequent proposed Jev refresh batch preserves old queue order among cases still needing refresh: `core-standalone-003`, `core-standalone-020`, `core-standalone-021`, `core-complete-simple-029`, `core-date-only-004`. It permits five routing calls and at most five routing-selected extractions. Success does not activate another batch or generate an automatic Luna queue.

Public tariffs were checked on November 3: Jev input **$0.042/M**, output uncharged; Luna Responses Standard input **$0.10/M**, output **$0.50/M**. This is generative Responses pricing, not the Decisions endpoint's output-free tariff. [TypeSafe models](https://docs.typesafe.ai/models), [OpenAI Luna model](https://developers.openai.com/api/docs/models/gpt-6-luna).

The conservative Luna reservation prices all reserved input at the default 30-minute cache-write rate of **$0.125/M**, including the write rate rather than adding it twice, and reserves the full output allowance. No cache-read discount is assumed. The existing adapter's processing/cache defaults are retained and must be verified against the account before activation; a different tier, region or TTL needs a revised envelope. [OpenAI prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching).

| Scope | Requests | Reserved input / output | Planning tariff maximum | Proposed operational ceiling |
| --- | ---: | ---: | ---: | ---: |
| First Luna batch | 1 Luna | 65,536 / 4,096 | **$0.010240000** | **$0.02** |
| First Jev refresh batch | 5–10 Jev | Up to 245,760 input; output uncharged | **$0.010321920** | **$0.02** |
| Both bounded phases, only if separately authorized in scope | Up to 11 | Separate reservations above | **$0.020561920** | **$0.04** total |
| Whole one-pass model reconciliation, planning only | Up to 428 Jev + 215 Luna | Reserved per call; not predicted actual usage | **$2.643378176** | **$3.00** total: $0.50 Jev / $2.50 Luna |

These ceilings are proposals, not spending authorization or invoice guarantees. Actual account access, quota, credits/free allocation, additional charges and billing configuration are unverified. Sent requests may have unknown/excess usage; halt subsequent sends and record the uncertainty. Full workflow cost, Google charges, Details/selection and S6 verification are excluded and remain unknown. No complete-workflow cost per successful booking is established.

**Execution controls and remaining activation conditions.** The package exposes only offline baseline/register/verify/preservation commands. Its functioning executor exercises **synthetic transports only**; it refuses LIVE transports before any send. A future S5 live executor/transport amendment must bind this registration, the actual existing adapters and explicit authorization. The historical v6 CLI and the old 50-case queue script must not be pointed at this package.

The proposed envelope is concurrency one, minimum 1,000 ms between starts, Jev 10-second and Luna 15-second timeouts, and zero retries. Reserve a full next-call amount before sending. Stop the entire activation on any 429, 401/403, 402/resource error, other HTTP/transport failure, timeout, refusal, malformed output/usage, model drift, unknown/excess usage, budget/request limit, source/request drift, stale query/parent, duplicate stage, interruption or unresolved intent. Keep only status/category and Retry-After for errors; never arbitrary error bodies. Do not sleep and retry a 429 automatically or continue to another provider.

Synthetic tests verify exclusive fsynced activation claims and per-stage intents/completions, no duplicate dispatch within an activation, selected-branch enforcement, interruption preservation and refusal to restart a claimed activation. A future live amendment must fix the durable global stage/cache paths across batches, persist actual normalized/raw response evidence and enforce authorization expiry and account/tariff checks. It must use current adoption guards and explicitly defer Places; those live bindings are not implemented or claimed here. No policy decision is reopened by these execution conditions.

**Language and safety limitations.** The Hindi London-time/candidate-boundary defect is outside these 222 core development inputs. Its saved diagnostic fixture has a semantic error despite valid source provenance; missing schedule precision/date, grounding and review prevent submission, which is not language-wide safety signoff. Correction/supersession failures remain explicit candidate/role fallback cases. Model vehicle conflicts and UNCLEAR answers retain form requirements. No broad grammar or scheduling-policy change was made. The accepted Hindi preferred-strength/rental fixes remain byte-identical. Unsupported rental and material availability conditions still block submission, including after otherwise completed form controls.

**Offline verification and preservation.** Focused Search, adapter/stage/language and continuation tests pass **536/536**, with zero failures/skips/cancellations, including **26 new continuation tests**. Tests cover exact source/request/cache identity, rejection of stale Luna parents and altered revisions/clock/candidates/trusted fields, original queue order and guarded fallback classification, fabricated user-selection rejection, scoped budgets/concurrency, HTTP 429/auth/payment/server stops, malformed/refused/model-drift/unknown/excess usage, timeout, source drift, duplicate stages, durable interruption/restart refusal and blocked held-out/challenge/verifier JSON access. Existing Hindi, negation, UTF-16, source-role, unsupported-rental and submission-gate regressions are included.

Scoped lint passes **10 new files**, zero errors/warnings, with maximum cyclomatic complexity 21 enforced. Search-only strict TypeScript passes. Full backend typecheck still reports only the existing unrelated StudyAI TS2719 at `services/AI/StudyAI/services/index_langGraph.ts:127`. The full backend test suite, S5/freeze and historical source-bound executor suites, held-out/challenge and S6 execution were not run or claimed. Source-compatibility counts and synthetic receipts are not new model-accuracy results.

The [preservation receipt](../../output/search-v1-s5-current-source-2026-11-03/preservation.json) verifies **3,911 protected files unchanged**, no unexpected or intentional edits to pre-existing source/evidence, unchanged HEAD and staged identity. Original S5 manifests/caches/receipts, all original 50 queue entries, frozen labels/split, Hindi diagnostics, v6 comparison, S6 evidence and unrelated work remain intact. New source registration and artifacts are additive. No credentials or production data were read, printed or provisioned.

**Recommendation.** The offline source-bound design is GO. **Live S5 execution remains NO-GO** until a separately authorized, tested S5 live executor amendment is bound, current account/model access and quotas are verified, tariffs/default processing terms are rechecked, maximum spending is explicitly accepted and fresh exclusive claims are available. The first proposed measured availability/adoption batch is one Luna request; it is a new current-source batch, not resumption or reordering of the historical 50-case queue. Do not infer quality or availability from a synthetic result. Work stops here: **zero provider inference, Luna, Clef/Decisions, Places/Details, booking, payment or dispatch calls; no pending queue consumption, provider switch, frontend Search activation, billing mutation, commit, push, merge, reset, clean or deployment.**
