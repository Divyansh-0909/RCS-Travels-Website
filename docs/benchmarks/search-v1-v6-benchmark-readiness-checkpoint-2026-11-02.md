# Search V1 v6 — benchmark readiness

Date: 2026-11-02, Asia/Kolkata. **GO for the design of a separately authorized, bounded Jev/Clef pilot; NO-GO for inference now.** The 24-case registration, scoring definitions and offline checks are complete. No live provider, account-metadata, billing, Luna or Places requests were made. Public documentation reads were limited to tariff/model documentation.

Both owner routing decisions are closed: rental-only intent and one preferred vehicle “if available,” including exclusions, are SIMPLE absent branching journeys or material conflicts. Unsupported rental and material-preference submission restrictions remain. This checkpoint continues the [owner routing decision](search-v1-owner-simple-routing-checkpoint-2026-11-02.md), [contract alignment](search-v1-decision-contract-alignment-checkpoint-2026-11-02.md), [v4 pilot](search-v1-decision-model-live-pilot-2026-11-02.md), [B1 checkpoint](search-v1-b1-hinglish-candidates-negation-checkpoint-2026-11-01.md), and [resumption audit](search-v1-hinglish-resumption-audit-2026-11-01.md). Historical `CONTEXT.md`/`ROADMAP.txt` evaluation states remain historical; current behavior was verified in source.

**Locked registration.** Artifacts are additive under `output/search-v1-v6-readiness-2026-11-02/`. The previous owner-approved v6 inputs, categorical label vectors and candidate lists are byte-equivalent under the existing canonical JSON hash. No v4 predictions were used as v6 measurements.

```text
readiness registration: search-decision-v6-readiness-v1
common contract: search-decision-common-v6-owner-simple
production questions: ride-search-questions-v3-owner-simple
parent v6 proposal: e1b031296b4e6fd0480be0ca67cfe7d995f0b1e51bc116509b28e865f83cbaf0
planHash: a9f820d6121ad94f14534136868fd31c07c4ddadbd4fca9c2b5d44fd07fce22c
inputArtifactHash: 5eca0b3f169315c3de916331beb0d2aa6374cfed594ae8f232fbf0b1fc479501
labelArtifactHash: 1a015eaafd20d75392198ca5959ae7ea5b085581363078067f4fa9fd0b01f836
pipelineLabelArtifactHash: 5b664ac46f2252c2bcf9fe5ae6c097a02325a36b4aadef0e110e3a99a4b55f5d
requestManifestHash: 4c1885a85e3e267a234a267ccf0e96784f69d792aa1990cea183bc3454b8ca10
status: OFFLINE_REGISTERED_NOT_RUN
liveAuthorized / executable: false / false
```

The [registration](../../output/search-v1-v6-readiness-2026-11-02/pilot-registration-v6.json) binds 56 source hashes, provider configurations, case order, clocks, budgets, request identities and scoring. [Inputs](../../output/search-v1-v6-readiness-2026-11-02/pilot-inputs-v6.json), [categorical labels](../../output/search-v1-v6-readiness-2026-11-02/pilot-labels-v6.json), [pipeline annotations](../../output/search-v1-v6-readiness-2026-11-02/pipeline-labels-v6.json) and the [request manifest](../../output/search-v1-v6-readiness-2026-11-02/request-manifest-v6.json) provide the exact per-case contract. `identity-verification.json` independently recomputes all five identities above and verifies them against the registration.

**Twenty-question audit.** [question-contract-v6.json](../../output/search-v1-v6-readiness-2026-11-02/question-contract-v6.json) contains the exact instructions and fixed choice descriptions. Pickup/drop options vary only with the registered, gold-independent source candidate union.

| Question | Semantic target and production relationship | Eligible labels |
| --- | --- | ---: |
| `query_type` | Exact production routing wording; incomplete booking shorthand remains booking | 24 |
| `complexity` | Exact production wording, including R1/R2 SIMPLE and retained material-conflict/branching COMPLEX rules | 24 |
| `booking_intent` | Source ride-form intent, independent of missing fields | 23 |
| `pickup` | Original pickup span; never another role or an extra stop | 24 |
| `drop` | Original destination span; preserve conditional alternatives and settled-correction semantics | 24 |
| `vehicle` | Positive class or explicit ANY; exclusion alone never chooses another class | 24 |
| `timing_mode` | IMMEDIATE/SCHEDULED/UNSPECIFIED/AMBIGUOUS; negative immediate wording does not assert now | 24 |
| `sharing` | Positive/negative/absent/conflicting sharing, including Hindi negation | 24 |
| `ambiguity` | Competing source alternatives or material conflict; missing values, grounding and omitted precision are separate controls | 8 |
| `exclude_hatchback` | Explicit exclusion; unmentioned is NO | 24 |
| `exclude_sedan` | Explicit exclusion; unmentioned is NO | 24 |
| `exclude_suv` | Generic negative SUV excludes regular and premium; subtype wording remains specific | 24 |
| `exclude_suv_premium` | Same source-negative policy, independently answered | 24 |
| `unsupported_PASSENGER_COUNT` | Presence of advisory passenger semantics, not a claim of enforceable capacity | 24 |
| `unsupported_STOP` | Presence of planned stop capability; not bookable through this experiment | 24 |
| `unsupported_RETURN_JOURNEY` | Source return request; support and routing complexity remain separate | 24 |
| `unsupported_RENTAL` | Rental source intent; SIMPLE routing does not enable rental submission | 24 |
| `unsupported_AC_PREFERENCE` | AC preference presence; straightforward soft AC stays advisory | 24 |
| `unsupported_CONDITIONAL_PREFERENCE` | Preserve the availability condition even when routing is SIMPLE | 24 |
| `unsupported_OTHER` | Other unsupported source capability; absence/uncertainty alone is not an unsupported service | 24 |

There are **463 eligible labels**, with sixteen multilingual ambiguity targets and one unclear booking-intent target intentionally unlabelled. No uncertainty was silently assigned a gold answer. Missing required fields are **not among the twenty model questions**. An independent annotation-based hierarchy produces expected application requirements, and production `requiredFieldProjection` is checked against that hierarchy on all 21 booking cases. UNSPECIFIED timing requires the parent only; IMMEDIATE has no scheduled children; SCHEDULED checks absent date/time children. Explicit ANY/exclusion-only still requires a concrete vehicle selection. Source ambiguity, grounding, dayparts and omitted minutes retain their separate controls.

The common batch supports finer NONE / OTHER_OR_UNAVAILABLE / AMBIGUOUS distinctions than the parser's role choice plus presence/consistency checks. These are different task contracts. OTHER means stated but unavailable as an exact candidate, not successful endpoint extraction. Arbitrary complex JSON, Places grounding and booking confirmation are explicitly unsupported tasks, not fabricated model answers or failed categorical decisions. Feature presence is distinct from submission support and fallback eligibility.

**Historical local failures.** All four affected inputs correctly have zero BOOKING_REQUEST endpoint candidates. No broader grammar change is justified by these inputs. Each now makes two valid fake routing/extraction requests with the endpoint-choice questions omitted, presence diagnostics retained, unresolved endpoints and zero returned-draft provenance violations. Every fixture was round-tripped through each of the four adapters.

| Case | Current deterministic fixture result | Remaining limitation |
| --- | --- | --- |
| `hh-v1-seed-007` | SIMPLE_INCOMPLETE; SUV plus sedan exclusion retained | Form needs missing endpoints/timing |
| `hh-v1-seed-040` | SIMPLE_INCOMPLETE; negative sharing retained | Form needs missing fields |
| `hh-v1-added-004` | Valid request; existing JEV_INVALID_RESPONSE binding rejection, fallback required | Hindi PREFERRED phrase remains outside strict accepted source binding |
| `hh-v1-added-007` | Valid request; EXTRACTION_BINDING_UNRESOLVED fallback | Hindi rental lexicon binding remains incomplete |

These are local fake-fixture outcomes, not model predictions or fresh accuracy. No singleton, fabricated alternative, confirmed endpoint or generic network error remains in these fixtures. Local contract failures retain JEV_SCHEMA_ERROR attributed to `questions`. No production Search source needed modification during readiness work.

**Cases and scoring.** The unchanged selection contains eight English, five Romanized Hindi, three Hinglish and eight Hindi records. Exact order is:

```text
core-standalone-002, core-complete-simple-001, core-date-only-001,
core-vehicle-preferences-002, core-role-order-003, core-assisted-services-003,
core-ambiguity-conflict-001, core-unclear-noisy-candidates-001,
hh-v1-seed-001, hh-v1-seed-007, hh-v1-added-023, hh-v1-added-028,
hh-v1-added-030, hh-v1-seed-040, hh-v1-added-032, hh-v1-added-033,
hh-v1-seed-021, hh-v1-added-001, hh-v1-added-002, hh-v1-added-003,
hh-v1-added-004, hh-v1-added-007, hh-v1-added-016, hh-v1-added-018
```

Level 1 reports micro 463-label accuracy, exact cases over all 24, per-question and language counts. Unattempted/failed cases remain in registered denominators; observed subsets are additional descriptive results. Correct role-choice categories and positive exact-source endpoints are separate metrics. The positive endpoint denominators are **17 pickup / 15 drop**; correctly answering OTHER cannot earn positive-span credit.

Level 2 runs the same parser at each registered case clock with an injected provider and no downstream fallback or grounding execution. All 24 have routing, request, error and fallback observations. **17 expected-SIMPLE booking cases** form the fixed field-scoring cohort, including the three owner-resolved cases. A provider cannot improve the denominator by routing a difficult case COMPLEX. Positive exact endpoint denominators are **13 pickup / 12 drop**; absence/ambiguity correctness is reported separately over the 17 field cases. Missing-field exact sets use those 17 cases and the independently derived hierarchy, not the legacy 21-case absent-field score.

Negation reports the exact four-class exclusion set over all 17 field cases, the six positive-exclusion cases, false positives outside that cohort, and three explicit negative-sharing cases. Vehicle state/class and timing mode are separate checks. Absent model output or an unexecuted extraction cannot earn empty-field correctness. Source provenance requires original query/revision, exact candidate membership and original UTF-16 slices; endpoint correctness also requires the expected role. A guard-accepted booking partial is observed extraction with no INVALID issue, eligible/declared fallback or provenance violation. It is not a correct complete draft or submitted booking.

The inherited annotations still record REQUIRED_COMPLEX_SEMANTICS for the three owner-resolved cases. New pipeline labels explicitly override their routing complexity to SIMPLE, retain the original fallback annotation as history, and declare fallback scoring DESCRIPTIVE_ELIGIBILITY. The scorer never uses those stale COMPLEX-only expectations as required fallback gold. Actual binding/capability failures remain observable and eligible under the unchanged production rules.

**Provider compatibility and configuration.** The offline audit normalizes **96 fake responses/provider**, 384 total, covering all twenty-question batches, routing, and both possible extraction branches for every case. These hypothetical branches are not 96 planned live requests: only the executed parser branch can run. Strict choice/probability/output/usage normalization remains the existing adapter contract, locked by source hash. No gold labels or glosses enter request state.

| Provider | Locked request model / response expectation | Comparison role |
| --- | --- | --- |
| Jev | `jev-latest`; require reported `jev-1.14.0` before continuing | Primary baseline |
| Clef | Endpoint `@cf/cloudflare/clef`, selector `clef`; versioned weights not reported | Primary challenger |
| Clef-flash | Endpoint `@cf/cloudflare/clef-flash`, selector `clef-flash`; versioned weights not reported | Optional secondary |
| Decisions | `gpt-6-luna`; explicit cache mode with no marked breakpoints | Offline-compatible; blocked after prior 429 |

Identical semantic state, instructions and choices are verified after decoding every provider's wire mapping. No temperature, sampling or generative output parameters are added. The Jev alias is retained for compatibility, with a stricter registered reported-version stop than the adapter's alias acceptance. Cloudflare selector identity cannot establish immutable weights; this reproducibility limit remains explicit. Decisions gets zero requests in this activation and needs a separately controlled continuation, not an automatic retry.

**Requests, tokens and tariff ceiling.** Per completed provider: 24 common batches, 24 routing calls and zero to 24 extraction calls, **48–72 total**. Errors may stop earlier. Conservatively reserve 24,576 input tokens/call: **1,769,472/provider**, **3,538,944 for the primary pair**, or **5,308,416 including flash**. These are planning reservations, not tokenizer measurements. Largest serialized request sizes are 15,776 bytes for Jev/flash, 15,770 for Clef and 17,679 for Decisions; all pass the local additional 4,096-byte planning reserve. Server truncation status remains unverified.

| Provider | Max requests | Input tariff / million | Max planning tariff | Proposed operational ceiling |
| --- | ---: | ---: | ---: | ---: |
| Jev | 72 | $0.042 | $0.074317824 | $0.10 |
| Clef | 72 | $0.24 | $0.424673280 | $0.50 |
| Clef-flash, optional | 72 | $0.038 | $0.067239936 | $0.10 |
| Primary pair | 144 | — | **$0.498991104** | **$0.60** |
| Primary pair plus flash | 216 | — | **$0.566231040** | **$0.70** |

Public tariffs were checked on November 2 against [TypeSafe models](https://docs.typesafe.ai/models), [Clef](https://developers.cloudflare.com/workers-ai/models/clef/) and [Clef-flash](https://developers.cloudflare.com/workers-ai/models/clef-flash/). These endpoints do not charge output tokens. [OpenAI Decisions](https://developers.openai.com/api/docs/guides/decisions) remains $0.10/M uncached input, output uncharged on that endpoint; a hypothetical separate 72-call reservation would be $0.176947200 and is excluded from this pilot. OpenAI cache writes, regional premiums or future generative fallback are not assumed free.

No available credit/free allocation, account access, billing cap or actual additional charge was verified. The proposed operational ceilings are **not spending authorization or guaranteed invoice caps**. An already sent request can have unknown or excess usage; record that uncertainty and halt. Complete-workflow economics including Luna, Places/Details and confirmation remain UNKNOWN. Separate Level 1 and bounded parser token/cost totals; never call either cost per successful booking.

**Stopping and activation contract.** Provider order is Jev → Clef → optional Clef-flash; case order above is fixed, common batch then parser. Concurrency is one across the activation, with at least 1,000 ms between starts, 10,000 ms timeout and **zero retries**. An exclusive durable provider claim must be bound to this plan before the first live request; interruption/crash cannot silently replay it.

Any 429, 401/403, 402, resource error, other HTTP/transport failure, timeout, malformed output/usage, refusal, model drift, local contract failure, unknown usage or budget breach halts the **entire activation**, including later providers. Record status/category and Retry-After only; do not retain arbitrary error bodies or resume automatically. Reserve the next full conservative tariff amount before each send; refuse sends after 72 requests/provider or without reserve headroom. Unknown usage, more than 24,576 observed input tokens or excess per-request tariff stops subsequent sends. Ordinary semantic/binding fallback is measured, not retried or executed. The pure stop ledger's failure behavior is tested without creating a network transport.

This package deliberately exposes only offline `--register` and `--verify` commands. The historical v4 live CLI must not be pointed at v6. A separately authorized activation must use a v6-aware executor enforcing these registered limits and claims, with current identity verification; any executor/source change requires a new bound registration or amendment before inference. No v4 owner waiver automatically authorizes this pilot.

**Validation and preservation.** Focused Search plus comparison tests pass **486/486**, zero failures/skips/cancellations, including fourteen new readiness tests. Independent checks cover approved owner overrides, gold-versus-production required-field hierarchy, all four historical failures through all four fake adapters, positive-span versus OTHER correctness, role/provenance errors, empty-output scoring, 429/auth/malformed/unknown-usage stops, budget/request/concurrency/throttle limits and reported-version drift. Synthetic perfect vectors test the scorer only; they are not model accuracy. Scoped lint passes three new files, zero errors/warnings, including maximum cyclomatic complexity 21. Full backend typecheck still reports only the existing unrelated StudyAI TS2719 at `services/AI/StudyAI/services/index_langGraph.ts:127`. No new Search production TypeScript was changed; previous Search typecheck evidence is preserved, not represented as rerun here.

The preservation receipt checks **2,178 protected files**, all **56 registered sources**, the prior 53 owner-checkpoint sources, HEAD and staged identity. All v1–v4 evidence, the v5/v6 proposals, original labels, frozen datasets, caches, previous checkpoints and unrelated changes remain intact. No 98-case held-out, Hindi challenge, separate 50-case Luna queue, billing mutation, production provider switch, rollout, commit, push, merge or deployment occurred.

**Remaining execution conditions.** There are no open R1/R2 policy decisions or singleton contract blockers. The two Hindi binding limits constrain interpretation of Level 2 results; they do not prevent a fair bounded comparison with fixed denominators. Current account availability/free allocations are unverified. Decisions remains excluded. Separate live authorization, an explicitly accepted activation envelope and a validated v6-aware executor are required before any inference. Thus the benchmark design is GO; **live execution remains NO-GO at this checkpoint**. Production rollout and a complete-workflow provider winner remain unestablished.
