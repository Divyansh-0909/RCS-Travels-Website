# Search V1 — decision-model comparison checkpoint

Date: 2026-11-01. Isolated adapters, offline tests and a 24-case development preregistration are complete. **Jev, OpenAI Decisions, Clef-flash and Clef are all NOT_RUN for new inference. No provider winner has been measured. Actual additional API expenditure is $0.**

Existing TypeSafe and OpenAI credentials support successful read-only model discovery. Neither discovery establishes inference access, a remaining free balance or account rate limits. Cloudflare credentials/account configuration are absent. No verified no-additional-charge allocation was available for any provider. Sixteen multilingual diagnostic labels also lack the human approval required by the requested primary benchmark. These limitations were recorded rather than bypassed.

The [B1 checkpoint](search-v1-b1-hinglish-candidates-negation-checkpoint-2026-11-01.md) contains the deterministic implementation, coverage improvements and preservation evidence. Production model routing and customer integration were not changed.

**Verified public APIs and prices.** Official documentation was checked on November 1. Prices below are USD per million input tokens; decision output is free for these endpoints. That does not make downstream generative Responses output free.

| Provider | Documented API and identity | Questions / context | Input / cache pricing | This account and new pilot |
| --- | --- | --- | --- | --- |
| TypeSafe Jev | `POST https://api.typesafe.ai/v1/systemone`; `jev-latest` currently targets `jev-1.14.0` | Choice, noul, score; request 64k tokens, 32k per question; no separate question-count limit within context | $0.042; no separate cache tariff established | Credentials present; documented target found by GET `/v1/models`, HTTP 200. Inference/free allocation/rate entitlement unverified. **NOT_RUN**. [Models](https://docs.typesafe.ai/models), [API](https://docs.typesafe.ai/api/system-one). |
| OpenAI Decisions | `POST https://api.openai.com/v1/decisions`; `gpt-6-luna` | Choice, predicate, score; 1–400 questions, 2–255 choices; model advertises 1,050,000 context, but a Decisions-specific ceiling was not independently established | $0.10 uncached; $0.01 cache read; $0.125 30-minute cache write | Credentials present; GET `/v1/models/gpt-6-luna` HTTP 200. Decisions endpoint inference access and credits unverified. **NOT_RUN**. [Guide](https://developers.openai.com/api/docs/guides/decisions), [reference](https://developers.openai.com/api/reference/resources/decisions/methods/create), [model](https://developers.openai.com/api/docs/models/gpt-6-luna). |
| Cloudflare Clef-flash | Workers AI REST `/client/v4/accounts/{accountId}/ai/run/@cf/cloudflare/clef-flash`; body selector `clef-flash` | Typed System One choice/noul/score; 64 questions; 24,576 context tokens | $0.038; model-specific cache discount unverified | Token/account ID missing; account eligibility, free balance and access unknown. **NOT_RUN**. [Model](https://developers.cloudflare.com/workers-ai/models/clef-flash/), [REST reference](https://developers.cloudflare.com/api/resources/ai/methods/run/). |
| Cloudflare Clef | Same REST family, model `@cf/cloudflare/clef`; body selector `clef` | Typed System One choice/noul/score; 64 questions; 65,536 context tokens | $0.24; model-specific cache discount unverified | Same missing account configuration; **NOT_RUN**. [Model](https://developers.cloudflare.com/workers-ai/models/clef/), [release](https://developers.cloudflare.com/changelog/post/2026-10-01-clef-workers-ai/). |

The October 9 Cloudflare update reduced flash input pricing from $0.090 to $0.038 and describes the smaller hosted flash context. The current aggregate pricing page, updated October 20, agrees with the model page and changelog: **no unresolved current price discrepancy was found**. Flash is 3,455 neurons/M input tokens; Clef is 21,818. [October update](https://developers.cloudflare.com/changelog/post/2026-10-09-clef-omni-workers-ai/), [current pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/).

Cloudflare publishes **10,000 free neurons/day shared across Workers AI models**, resetting at 00:00 UTC / 05:30 IST, with paid-plan overage $0.011/1,000 neurons. Free-plan exhaustion fails requests instead of authorizing an upgrade. The two models are not listed among paid-only exceptions. These are public rules, not evidence of this account's eligibility or remaining allocation; the same shared balance cannot be reserved twice. [Pricing and allocation](https://developers.cloudflare.com/workers-ai/platform/pricing/).

OpenAI documents eligible subscription-linked API credit benefits, potentially up to $500, requiring eligibility, linking/activation and an organization allocation with cycle expiry. No benefit was activated, purchased or assumed present here. A ChatGPT subscription alone does not prove an available API balance. [Credit program](https://developers.openai.com/api/docs/guides/chatgpt-api-credits). Jev's usable free balance was not established by public documentation or the model-discovery response.

**Wire contracts, limits and data handling.** All adapters use typed decisions. Choice results retain the selected category, its confidence and the full per-option probability distribution. Jev/Clef use named answer objects and criteria maps; Decisions uses ordered named question/answer arrays and `(value, probability)` entries. Noul maps to Decisions predicate probability, with no invented categorical threshold. Score is publicly available but deliberately outside this comparison's common choice/predicate interface. Arbitrary generated booking JSON is not a common capability. [TypeSafe contract](https://docs.typesafe.ai/api/system-one), [Decisions schema](https://developers.openai.com/api/reference/resources/decisions/methods/create), [Clef contract](https://developers.cloudflare.com/workers-ai/models/clef/).

| Concern | Jev | OpenAI Decisions | Both Cloudflare models |
| --- | --- | --- | --- |
| Rate entitlement | Organization-specific console configuration; not verified here | Account/model tier dependent; model page's public tiers do not establish this account's tier | Text-generation default 300 RPM; account override/entitlement unknown |
| Latency | No RCS measurement or verified SLA | No RCS measurement or verified SLA | Vendor performance claims are not RCS measurements or an SLA |
| Size / truncation | Documented 32 MiB HTTP body and bounded model context | Guide/reference limits apply; no invented `temperature` or `max_output_tokens` parameter | Flash documents automatic long-state truncation; local conservative byte checks do not prove zero server truncation |
| Training / retention | No training on customer requests; enterprise ZDR by arrangement; default retention duration not established | No training; default abuse logs up to 30 days; ZDR depends on eligibility/configuration; cache exceptions apply | Stateless inference content not retained after processing, subject to documented exceptions; metadata and stateful/Gateway features differ; no training on customer content |
| Integration effort | Closest to existing Search interface; historical SDK path remains baseline | Different request/answer shape; installed OpenAI 7.10 lacks a Decisions resource, so experimental adapter uses documented REST | Similar System One body; account-scoped REST authentication and response envelope need adaptation |

Rate/size sources: [TypeSafe models](https://docs.typesafe.ai/models), [TypeSafe errors](https://docs.typesafe.ai/api/errors), [OpenAI model](https://developers.openai.com/api/docs/models/gpt-6-luna), [Cloudflare limits](https://developers.cloudflare.com/workers-ai/platform/limits/). Retention sources: [TypeSafe legal](https://docs.typesafe.ai/legal), [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data), [Cloudflare data usage](https://developers.cloudflare.com/workers-ai/platform/data-usage/). Deployment-specific retention settings were not verified.

Decisions caching covers qualifying shared input prefixes of at least 1,024 tokens, not question definitions. The pilot selects explicit caching with no breakpoints to disable cache writes; it does not assume free implicit writes. Usage accounting recognizes reported cached and cache-write input tokens. [Caching details](https://developers.openai.com/api/docs/guides/decisions), [usage fields](https://developers.openai.com/api/reference/resources/decisions/methods/create). Cloudflare's general prompt-caching feature does not establish a Clef-specific discount. [Cloudflare caching](https://developers.cloudflare.com/workers-ai/features/prompt-caching/).

**Account observations and spending boundary.** `account-access.json` records presence booleans, HTTP status and target membership only. Existing keys stayed in transport headers; no secret values or customer data were copied into evidence. Two documented read-only model-discovery GETs were made: one TypeSafe and one OpenAI. There were **zero inference, billing, provisioning or purchase calls**. No undocumented billing endpoint was used. Successful discovery is weaker evidence than successful endpoint execution. Free quota/credits, overage controls and actual account rate limits remain UNKNOWN.

**Experimental implementation.** Files under `backend/benchmarks/search/decisionComparison/` are isolated from runtime composition roots:

- `adapters.js`: documented request mapping and authenticated REST transports for all four providers, injectable fake transport, strict normalization, response-model checks, preserved raw successful outputs, request identities, usage and latency observations.
- `pilot.js`: fixed 24-case selection, common candidate/task generation, unchanged-label projections and scoring.
- `economics.js`: published marginal cost calculations and a source-bound no-charge/account/label gate.
- `README.md`: commands, artifact identities and the receipt contract. No SDK/package/lockfile upgrade was needed.

`backend/scripts/search-decision-pilot-prepare.mjs`, `search-decision-pilot.mjs` and `search-decision-account-check.mjs` prepare, execute or report the pilot. The runner is offline by default. It can inject the experimental provider into the existing Search parser without executing the existing Luna fallback or Places. Parser provenance, candidate membership, trusted fields and editable/unconfirmed draft authority remain enforced. The adapters cannot create bookings, charge payments, cancel rides or dispatch vehicles.

Strict tests reject unknown keys/options, wrong answer names/counts, duplicate probability entries, refusals, nonfinite/out-of-range confidence, invalid distribution sums and unexpected reported model versions. No probability repair, schema tolerance change or fabricated model answer is used. Missing usage remains unknown cost; an unrecognized Cloudflare usage schema is retained without falsely rejecting an otherwise valid semantic answer. Undocumented truncation stays UNKNOWN. HTTP error text is excluded from receipts to avoid copying sensitive bodies; error categories and status remain observable.

Local request bounds are at most 48 questions and 12,000 state characters plus a conservative serialized-byte reserve. The primary batch has 26 questions. Timeout is **10 seconds**, zero retries, concurrency one, at least one second between request starts. Oversize requests fail locally. Every observed provider error stops that provider, including 429, payment/auth errors, resource limits, model changes and timeouts; other eligible providers can continue. A durable exclusive provider claim prevents accidental replay of the same registered live run. No latency or server truncation result is inferred from the local timeout/size settings.

**Registered development experiment.** Current identity is `search-decision-pilot-v2`:

```text
planHash = db0fce7b1c7c669315a68d8234fa5009684862983448ce04b5fa7cb37a65f0e4
superseded v1 = eb351310a6d06d0ebaa9604669cb774737ca5c1602583cb81a036f452556988b
```

V1 was superseded before any new inference after an offline English contraction/quotation regression was fixed. Both registrations and receipts remain intact. V2 has the same 24-case selection, task requests and labels; the source snapshot and registration metadata changed. The runner rejects stale source hashes, and allocation receipts must bind to the exact current plan hash. There was no prompt tuning against new model predictions because no such predictions exist.

The plan records per-case source-input, question and original-label hashes, aggregate input/label artifact hashes, and **44 source hashes**: 38 Search service files, the comparison package's four files, and both pilot scripts. Selected records are filtered to DEVELOPMENT before truth inspection. Held-out/challenge labels are not used. Byte hashing the frozen datasets for preservation is not a held-out execution.

| Language | Case ID | Preselected coverage |
| --- | --- | --- |
| English | `core-standalone-002` | Location-only |
| English | `core-complete-simple-001` | Scheduled journey, exclusion |
| English | `core-date-only-001` | Incomplete pickup-only |
| English | `core-vehicle-preferences-002` | Exclusion-only |
| English | `core-role-order-003` | Destination-before-origin |
| English | `core-assisted-services-003` | Flags and negation |
| English | `core-ambiguity-conflict-001` | Conflicting clocks |
| English | `core-unclear-noisy-candidates-001` | Unrelated intent |
| Romanized Hindi | `hh-v1-seed-001` | Relative date, omitted minutes |
| Romanized Hindi | `hh-v1-seed-007` | Positive and negative vehicle |
| Romanized Hindi | `hh-v1-added-023` | Reversed roles, clock |
| Romanized Hindi | `hh-v1-added-028` | Conditional alternatives |
| Romanized Hindi | `hh-v1-added-030` | Negative vehicle, any alternative |
| Hinglish | `hh-v1-seed-040` | Negative sharing |
| Hinglish | `hh-v1-added-032` | Corrected destination |
| Hinglish | `hh-v1-added-033` | Conditional preferred class |
| Hindi | `hh-v1-seed-021` | Location-only |
| Hindi | `hh-v1-added-001` | Route, daypart clock |
| Hindi | `hh-v1-added-002` | Route, daypart |
| Hindi | `hh-v1-added-003` | Corrected destination |
| Hindi | `hh-v1-added-004` | Exclusion, conditional preference |
| Hindi | `hh-v1-added-007` | Unsupported rental |
| Hindi | `hh-v1-added-016` | Immediate route, negative sharing |
| Hindi | `hh-v1-added-018` | Unresolved timezone boundary |

Eight English records have existing approved human-reviewed synthetic truth. The other sixteen use unchanged agent-authored multilingual development labels, not human-approved truth. The plan therefore sets `labelsReadyForPrimaryComparison: false`. No label or approval was invented. A documented owner review of the registered multilingual labels is a prerequisite for the requested primary pilot. If review changes a label, it needs a new registration rather than a replacement of the old artifact.

**Fairness and scoring.** Level 1 asks the same **26 categorical questions** of every model: query type, complexity, intent, pickup, drop, vehicle, timing mode, sharing, ambiguity, four exclusions, six missing fields and seven unsupported-request kinds. Candidate options are the label-independent union of final B1 location-search and booking-request spans, with NONE, OTHER_OR_UNAVAILABLE and AMBIGUOUS choices. All providers receive the same original query, clock/timezone, policy, spans and task meanings. Row IDs, selection rationale and gold labels are excluded. Wire shape differs as documented above; no provider-specific semantic prompt tuning is allowed.

Scoring retains per-task correct/eligible/observed counts, exact all-task agreement, language and human/diagnostic cohorts. Failed/unattempted registered cases remain in eligible denominators. Truly unlabelled tasks are excluded explicitly, not supplied invented answers. Multilingual ambiguity and collapsed unclear/unrelated intent labels are not silently inferred. Date/time source extraction and arbitrary complex JSON are outside Level 1; selecting a supplied span is not evidence of independently finding or grounding a place.

Level 2 runs the existing parser with the same final B1 source and frozen per-case clock. It records routing, strict rejection, candidate membership, provenance, issues, draft fields, fallback eligibility and request count. Existing English benchmark metrics and unchanged Hindi diagnostic checks are kept separate. Missing generative capability is reported as required fallback, not counted as arbitrary JSON failure. Full complex interpretation, Places autocomplete/Details and explicit user confirmation are unexecuted downstream dependencies. A partial draft cannot be counted as a completed or authorized booking.

This is a purposive small development comparison, not population accuracy, held-out generalization or customer safety certification. B1 was developed on this diagnostic pool. Historical Jev 1.13 runs have different candidates/configuration and are not a fair fresh comparator to current Jev 1.14 or the other providers. Provider tokenizers and transport shapes differ; identical text does not imply identical token counts. Median and p95 are planned per-request/end-to-end observations, with p95 reported only for at least twenty samples and explicitly limited by small sample size. Timeouts, failures and truncation remain separate reliability metrics.

**Offline validation and actual results.** Four fake-provider wire/normalization cases plus ten other comparison tests pass: **14/14 comparison tests**. The combined focused Search suite passes **459/459**. Tests cover mappings, invalid probabilities and envelopes, model drift, missing usage, stop categories, timeout cancellation, size limits, credential confinement, costs, gates, no-label inputs and existing parser injection. Fake answers are protocol fixtures, not benchmark predictions. Scoped lint passes 21 files; Search-only TypeScript passes. Full backend typecheck fails on the existing unrelated StudyAI TS2719 at `services/AI/StudyAI/services/index_langGraph.ts:127`. [B1 validation details](search-v1-b1-hinglish-candidates-negation-checkpoint-2026-11-01.md).

| Provider | Actual inference | Semantic/schema accuracy | Fallback/provenance/usable-draft rates | Median / p95 | Tokens / cost per valid or correct interpretation |
| --- | --- | --- | --- | --- | --- |
| Jev | **NOT_RUN**, 0 calls | N/A | N/A | N/A | N/A |
| Decisions | **NOT_RUN**, 0 calls | N/A | N/A | N/A | N/A |
| Clef-flash | **NOT_RUN**, 0 calls | N/A | N/A | N/A | N/A |
| Clef | **NOT_RUN**, 0 calls | N/A | N/A | N/A | N/A |

Unrun task accuracies, schema failures, latency, retries, truncation, fallback frequency, endpoint quality and booking usability are **unmeasured**, not zero and not tied. The only replayed model evidence is the separate historical exact-request B1 diagnostic described in the other checkpoint. It is not a four-provider result.

**Planned versus actual accounting.** The maximum is **72 requests/provider**: 24 common batches plus at most 48 parser routing/extraction calls. The fixed plan conservatively reserves 24,576 input planning tokens/request, or 1,769,472/provider. This is an allocation estimate, not tokenizer-equivalent usage, a guaranteed provider charge cap or authorization to spend. No live request is allowed merely because this estimate is small.

| Provider | Level 1 serialized bytes, total / largest request | Planned calls, maximum | Planning tariff amount | Actual inference / additional charge |
| --- | ---: | ---: | ---: | ---: |
| Jev | 269,456 / 12,023 | 72 | $0.074317824 | 0 / $0 |
| Decisions | 325,592 / 14,394 | 72 | $0.176947200 | 0 / $0 |
| Clef-flash | 269,456 / 12,023 | 72 | $0.067239936 | 0 / $0 |
| Clef | 269,312 / 12,017 | 72 | $0.424673280 | 0 / $0 |
| Total | Different wire formats; not token counts | 288 | $0.743178240 | 0 / $0 |

The larger Decisions payload reflects its array schema, not a measured token-cost penalty. New inference consumed zero tokens because no inference requests occurred; future token usage and costs remain unknown. Published marginal liability for the unexecuted calls is zero. The authorized **additional-charge budget remains $0**, unspent; available provider credits/free quota remain UNKNOWN. Public tariffs above are not new paid budget approval.

For an executed run, the accountant uses actual returned uncached/cache-read/cache-write input usage and the verified model tariff. Output usage is retained even where the endpoint's output tariff is zero. Missing usage or a failed potentially billed call makes the affected total unknown. It reports per request, per Search query, per valid/correct interpretation and scaled 1,000/10,000-query costs, with zero successful denominators reported N/A.

Complete-workflow cost must be:

```text
decision routing + bounded extraction + actual retries
+ required generative fallback + required Places/Details
+ other measured processing costs
```

Level 1 benchmark batches and Level 2 parser costs are separated, so the redundant common batch is not billed to a claimed production workflow. Existing Luna **Responses** fallback has its own input/output tariff; Decisions' free output cannot be applied to it. No fallback/Places frequency or cost was measured here. Consequently actual cost per successful complete interpretation, including 1,000/10,000-query projections, is **UNKNOWN for every provider**. A cheaper published input tariff cannot establish the best effective provider.

**Recommendation and next bounded step.** The measured winner is **inconclusive**. Preserve the existing Jev implementation and separate Responses fallback boundary while reviewing B1. Clef-flash is a reasonable first price-sensitive pilot candidate from published input pricing, but Hindi accuracy, schema compatibility, truncation, latency and account access are unproven. Clef's higher price does not establish higher accuracy; Decisions' documented larger model context and cache features do not establish better workflow economics. No automatic model routing change is justified.

1. Review the sixteen registered multilingual label records. Retain actual approval evidence; if any labels or source/task configuration change, register a new additive identity before inference.
2. Obtain current account evidence of endpoint access, remaining no-charge allocation, applicable rates and hard overage controls. Reserve shared Cloudflare quota once across both models. Cloudflare additionally needs account/token configuration. Do not purchase credits, upgrade plans or activate a benefit under this task.
3. Once those prerequisites are established, run only the registered bounded pilot, provider by provider, preserving actual outputs/usage/errors. `--live` requires the exact-plan receipt described in the package README. Recheck allocation freshness at execution time. Paid execution would require separate authorization.
4. Compare per-language Level 1 accuracy and Level 2 strict usable drafts, observed failure/fallback rates and actual costs. Only then propose any broader development/fallback or provider-strategy experiment. The independent datasets, pending 50-case Luna queue, frontend and rollout remain outside this next pilot.

**Artifacts and preservation.** The ignored local directory `output/search-v1-b1-comparison-2026-11-01/` contains `provider-research.json`, `account-access.json`, `pilot-inputs-v2.json`, `pilot-labels-v2.json`, `pilot-registration-v2.json`, `comparison-status-v2.json`, offline validation logs and `preservation-v2.json`. All previous v1 files remain intact. There are no fabricated live results. Commands from `backend/` are documented in `backend/benchmarks/search/decisionComparison/README.md`; the current offline runner command is:

```powershell
node --import tsx scripts/search-decision-pilot.mjs --revision=v2
```

Its existing status receipt is exclusive and will not be overwritten. The default v1 runner rejects the now-stale source snapshot. A live receipt uses separate additive result files and a durable claim; it cannot proceed without the account and label evidence.

Final preservation verified 2,005 protected files unchanged, all 44 registered source hashes current, HEAD and staged identity unchanged. No held-out/challenge execution, pending-queue inference, Luna/Places call, production routing change, customer integration, commit or deployment occurred. S5/S6 remain incomplete and S7 remains unstarted.
