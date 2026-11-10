# Search V1 — live decision-model pilot

Date: 2026-11-02, Asia/Kolkata. The owner approved the [reviewed v3 labels](search-v1-comparison-prerequisites-review-2026-11-02.md) and replied “DOn't worry about this” to the free-quota-verification question. That reply was treated as a waiver of the free-allocation prerequisite for this small pilot. It was **not** recorded as evidence of a free balance, a numeric spending allowance, or permission to purchase credits or change billing settings.

**The bounded live pilot is complete:** Jev, Clef-flash and Clef each completed all 24 cases. OpenAI Decisions stopped during case four on HTTP 429, without retry. There were **205 inference attempts**, **204 responses with usable token usage**, and **zero retries**. Known successful-call input tariff totals **$0.049287664**. Usage for the rejected request and actual account credit/invoice effects are unknown.

**Recommendation:** retain Jev as the current parser baseline. Clef is the strongest common-decision accuracy challenger in this pilot, but the current parser does not turn that advantage into better field results. Clef-flash's slightly lower input cost does not justify replacement. OpenAI Decisions is incomplete, with no multilingual measurements. No complete-workflow provider winner or production switch is established.

This report supersedes the earlier NOT_RUN status for this registered comparison only. The [B1 implementation checkpoint](search-v1-b1-hinglish-candidates-negation-checkpoint-2026-11-01.md), [public API/pricing comparison](search-v1-decision-model-comparison-2026-11-01.md) and [pre-inference review](search-v1-comparison-prerequisites-review-2026-11-02.md) remain historical evidence. No held-out/challenge execution, pending-queue resumption, frontend integration or rollout occurred.

**Authorization and experiment identity.** V4 adds an explicit owner-authorized execution path separate from the verified-free-allocation gate. Its input and label artifact hashes exactly match the approved v3 artifacts. All 24 original-label hashes and candidate lists remain unchanged. The 16 multilingual labels are now approved for this pilot by the recorded owner reply; their original agent-authored provenance is retained rather than rewritten.

```text
version: search-decision-pilot-v4
planHash: 6966f4ced88450323cf5c6226edcaa976a0b6eeb8da261d698f3e6d53282dced
approved labelArtifactHash: ce901a5e67a64cc972fe91433c2ffa9031d2b44db3a02fffaaa4271db3058568
allocation mode: OWNER_WAIVED_FREE_QUOTA_CHECK
```

The source snapshot was registered before inference. No prompt, candidate, label, model configuration or scoring definition was changed after inspecting predictions. Provider order was Jev → Decisions → Clef-flash → Clef. Each provider had at most 72 requests, concurrency one, a one-second minimum start gap, a ten-second timeout and zero retries. Known tariff had to leave room for the next conservative per-request reservation; missing usage or excess observed tariff would stop further calls. The same model-error stop rule applied to all providers.

The agent retained the registered aggregate **$0.74317824 planning estimate** as operational tariff thresholds, not a guaranteed invoice cap or an owner-specified budget. No threshold was reached. No credits, benefits, billing settings or token permissions were provisioned or changed. The execution command from `backend/` was:

```powershell
node --import tsx scripts/search-decision-pilot.mjs --revision=v4 --owner-authorized-pilot --live
```

The receipt is bound to this plan and the actual conversation replies in `owner-authorized-pilot-v4.json`. Durable exclusive claims prevent accidental replay of the same provider run. Historical v1/v2/v3 receipts were preserved.

**Level 1 — identical common decision tasks.** Each case used the same original query, fixed clock/timezone, policy, B1 candidate list and 26 categorical question meanings across providers. Gold labels and review glosses were excluded from requests. NONE, OTHER_OR_UNAVAILABLE and AMBIGUOUS were available where appropriate. A correct OTHER answer is correct recognition that the exact endpoint option is unavailable, not successful place extraction or grounding.

There are 589 eligible labelled decisions across the 24 cases. Sixteen multilingual ambiguity questions, eighteen missing-booking-field questions on three non-booking cases, and one unclear/unrelated booking-intent question are unlabelled and excluded. The micro score is influenced by repeated absent-feature questions; it is not a booking-success percentage. Exact-case agreement requires every eligible common-task answer to match its registered label.

| Provider | Cases with valid Level 1 output | Micro decisions correct | All labelled tasks exact | Query type | Complexity | Pickup / drop choice | Vehicle |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Jev | 24/24 | 509/589 (86.4%) | 2/24 | 23/24 | 14/24 | 20/24 / 22/24 | 23/24 |
| Clef-flash | 24/24 | 516/589 (87.6%) | 1/24 | 23/24 | 17/24 | 20/24 / 20/24 | 22/24 |
| Clef | 24/24 | **553/589 (93.9%)** | **7/24** | **24/24** | **19/24** | **22/24 / 24/24** | 22/24 |
| Decisions | 4/24; stopped | 87/589 registered; 87/98 observed | 0/24 registered; 0/4 observed | 4/24; 4/4 observed | 3/24; 3/4 observed | 3/24 / 3/24; each 3/4 observed | 4/24; 4/4 observed |

Decisions' unattempted cases remain in preregistered denominators. Its 87/98 observed score covers only the first four English cases and is not comparable to a completed multilingual pilot. Missing measurements are not evidence of incorrect Hindi understanding.

| Completed provider | Timing mode | Sharing | Exact four-class exclusion set | Positive-exclusion cohort | Explicit negative sharing | Exact missing-field set | Exact unsupported-kind set |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Jev | 22/24 | 24/24 | 24/24 | 6/6 | 3/3 | 3/21 | 20/24 |
| Clef-flash | 23/24 | 24/24 | 6/24 | 5/6 | 3/3 | 7/21 | 23/24 |
| Clef | 24/24 | 24/24 | 24/24 | 6/6 | 3/3 | 5/21 | 22/24 |

The exact missing-field and grouped exclusion/unsupported rows are descriptive aggregates of the fixed categorical questions; their individual task counts remain in the raw primary results. Clef-flash's positive-cohort result hides many errors outside that cohort, so its whole-set result matters. No model achieves reliable all-task interpretation across this sample.

| Language stratum | Jev: exact cases; pickup / drop | Clef-flash: exact cases; pickup / drop | Clef: exact cases; pickup / drop |
| --- | --- | --- | --- |
| English, 8 | 0/8; 7/8 / 8/8 | 1/8; 7/8 / 8/8 | 3/8; 7/8 / 8/8 |
| Romanized Hindi, 5 | 1/5; 4/5 / 5/5 | 0/5; 4/5 / 3/5 | 1/5; 5/5 / 5/5 |
| Hinglish, 3 | 0/3; 3/3 / 2/3 | 0/3; 3/3 / 2/3 | 0/3; 3/3 / 3/3 |
| Hindi, 8 | 1/8; 6/8 / 7/8 | 0/8; 6/8 / 7/8 | 3/8; 7/8 / 8/8 |

All three completed providers get zero all-task exact cases in the three-case Hinglish stratum. This small purposive development sample does not establish language-wide accuracy or independent generalization.

**Level 2 — existing parser integration.** Each provider was injected into the same parser with final B1 sources and frozen per-case clocks. Luna fallback, Places and final booking confirmation remained unexecuted. Existing English benchmark metrics and Hindi diagnostic checks were retained separately.

| Provider | Routing/extraction requests | Guard-accepted partial drafts | Fallback eligible | Local singleton-question failures | Returned-draft provenance violations |
| --- | ---: | ---: | ---: | ---: | ---: |
| Jev | 42 | 13/24 | 11/24 | 4/24 | 0 |
| Clef-flash | 39 | 8/24 | 16/24 | 4/24 | 0 |
| Clef | 40 | 10/24 | 14/24 | 4/24 | 0 |
| Decisions | 8 attempts, one HTTP 429 | 2/24 registered; four cases attempted | 2 among four attempted | 0 among four attempted | 0 among attempted |

“Guard-accepted” is the preregistered proxy: a draft exists, no invalid issues/provenance violations, and no eligible fallback. It can still require missing fields, timing clarification, grounding and explicit review. **Grounded, user-confirmed or submitted bookings: zero for all providers.** Fallback counts include local capability failures and are not pure model-quality or downstream-cost measurements.

The nine expected-SIMPLE multilingual cases have these retained diagnostic field results:

| Field | Jev | Clef-flash | Clef |
| --- | ---: | ---: | ---: |
| Exact pickup / drop | 8/9 / 9/9 | 7/9 / 7/9 | 5/9 / 6/9 |
| Vehicle | 7/9 | 6/9 | 6/9 |
| Timing mode | 9/9 | 8/9 | 8/9 |
| Source date / time | 9/9 / 9/9 | 9/9 / 8/9 | 8/9 / 8/9 |
| Flags / exclusion set | 8/9 / 8/9 | 8/9 / 8/9 | 8/9 / 8/9 |
| Missing-field set | 7/9 | 5/9 | 6/9 |

These nine-case endpoint denominators include roles expected absent and preserve the historical diagnostic contract. They are not the positive-span generator denominators or a new 80-case B1 extraction evaluation. Decisions made no multilingual calls; its multilingual results are **NOT_RUN**. Some legacy scalar helpers return an empty expected field match even when a prediction is missing. Their raw saved counts are retained, but those incidental matches are not reported as observed Decisions successes.

The eight-case English metrics remain available in the machine results. Jev's exact positive pickup/drop scores are 6/6 and 5/5; flash 5/6 and 4/5; Clef 4/6 and 3/5. These are field-level diagnostic comparisons, not complete safe drafts.

**Capability and policy limitations discovered by the run.** Four cases share an orchestration limitation: `hh-v1-seed-007`, `hh-v1-seed-040`, `hh-v1-added-004`, and `hh-v1-added-007`. With zero generated location candidates, the existing parser emits one-option pickup/drop choice questions containing only NONE_OR_UNCLEAR. The common experimental contract requires 2–255 choices and rejects them locally. Only routing reached the provider; the extraction request was never sent. The parser's generic catch labels this JEV_PROVIDER_ERROR, but the post-run offline audit proves these are **local contract/capability failures, not HTTP failures or malformed model output**. They affect all three completed providers identically. No model answer was fabricated to fill the singleton choice.

The production question builder and experimental common batch also express policy differently. For example, existing routing instructions explicitly allow unsupported rental alone to be SIMPLE, while the reviewed Hindi rental case expects COMPLEX. Exact missing-field questions rely on a compact policy statement rather than the full executable hierarchy. These are integration/policy-alignment limitations when interpreting errors, not reasons to alter the frozen scores after seeing results. The new common batch and legacy parser are distinct task contracts; stronger Level 1 accuracy does not establish a superior drop-in parser replacement.

**Reliability and latency.** Every completed-provider HTTP response passed the comparison layer's strict normalization. Across all providers there were 204 normalized responses and one HTTP 429; no observed timeout, malformed distribution, refusal or reported model drift. Downstream parser/field validation still rejected some outputs, as the Level 2 issues show. The model reported Jev `jev-1.14.0`, Decisions `gpt-6-luna`, and Cloudflare selectors `clef-flash` / `clef`; Cloudflare did not report an additional versioned weights identifier.

The 429 occurred on the extraction stage of `core-vehicle-preferences-002`, request 12 for Decisions, with `Retry-After: 6`. The provider stopped immediately with no retry or later inference. The response subtype was not retained because arbitrary error bodies are excluded from evidence; rate exhaustion versus another 429 quota subtype is not established.

| Provider | Level 1 provider latency median / p95 | Level 2 end-to-end median / p95 |
| --- | --- | --- |
| Jev | 312 / 427 ms, n=24 | 1,995 / 2,064 ms, n=24 |
| Clef-flash | 814 / 1,033 ms, n=24 | 1,530 / 2,122 ms, n=24 |
| Clef | 676 / 1,503 ms, n=24 | 1,781 / 2,992 ms, n=24 |
| Decisions | 171 ms / N/A, n=4 | 1,946 ms / N/A, n=4 |

Median uses the lower middle observation for even sample sizes (nearest-rank p50); p95 also uses nearest rank. Level 1 latency excludes recorded client throttle waiting. Level 2 includes orchestration and throttle waits and mixes one-call early escalations with two-call extraction paths. Its lower medians cannot be interpreted as faster completed bookings. P95 is descriptive for 24 samples, not a service guarantee. No server reported truncation status; truncation remains UNKNOWN despite conservative local payload checks.

**Measured tokens and economics.** Tariffs were rechecked against official documentation: [Jev $0.042/M input](https://docs.typesafe.ai/models), [Decisions $0.10/M uncached input](https://developers.openai.com/api/docs/guides/decisions), [flash $0.038/M input](https://developers.cloudflare.com/workers-ai/models/clef-flash/), and [Clef $0.24/M input](https://developers.cloudflare.com/workers-ai/models/clef/). Outputs are free on these endpoints. This statement does not apply to a future generative Responses fallback. OpenAI returned zero cached/cache-write usage; the pilot disabled cache writes through the documented explicit mode.

| Provider | All inference attempts | Requests with known usage | Known input / output tokens | Known input-tariff subtotal |
| --- | ---: | ---: | ---: | ---: |
| Jev | 66 | 66 | 148,657 / 45,524 | $0.006243594 |
| Decisions | 12 | 11 | 26,789 / 0, excluding failed request | $0.002678900, incomplete |
| Clef-flash | 63 | 63 | 146,995 / 0 | $0.005585810 |
| Clef | 64 | 64 | 144,914 / 0 | $0.034779360 |
| Total | **205** | **204** | **467,355 / 45,524**, excluding failed request | **$0.049287664 known subtotal** |

The rejected Decisions request has unreported usage, so the complete published-tariff total is UNKNOWN, not exactly $0.049287664. Actual additional invoice charges are also UNKNOWN because credits/free allocations were not verified. Reported output-token counters are preserved as returned. The owner waived the quota check; no numeric paid budget was invented, and each provider remained below its registered operational tariff threshold.

Level 1 is an extra comparison batch, not part of the existing parser workflow. Its costs are separated:

| Completed provider | Level 1 total | Per valid common batch | Per all-task-exact common batch | Level 1 per 1,000 / 10,000 queries |
| --- | ---: | ---: | ---: | ---: |
| Jev | $0.003827838 | $0.000159493 | $0.001913919 (2 exact) | $0.159493 / $1.594933 |
| Clef-flash | $0.003694170 | $0.000153924 | $0.003694170 (1 exact) | $0.153924 / $1.539238 |
| Clef | $0.023331600 | $0.000972150 | $0.003333086 (7 exact) | $0.972150 / $9.721500 |

These are common-batch correctness costs, not cost per successful booking. Decisions' four common batches cost $0.0018038, with zero all-task exact outcomes; cost per correct batch is N/A. Its limited sample is excluded from the completed-provider cost ranking.

| Completed provider | Bounded parser total | Per attempted Search query | Per guard-accepted partial draft | Bounded parser per 1,000 / 10,000 queries |
| --- | ---: | ---: | ---: | ---: |
| Jev | $0.002415756 | $0.000100657 | $0.000185827 | $0.100657 / $1.006565 |
| Clef-flash | $0.001891640 | $0.000078818 | $0.000236455 | $0.078818 / $0.788183 |
| Clef | $0.011447760 | $0.000476990 | $0.001144776 | $0.476990 / $4.769900 |

The parser projections omit required fallback, Places/Details, final controls and other unmeasured processing. Flash's cheaper per-attempt cost accompanies more escalation and fewer accepted partial drafts; it does not establish lower cost per successful interpretation. Decisions' parser cost is unknown because one request lacks usage. Full workflow cost per valid/correct interpretation, including 1,000/10,000-query projections, remains **UNKNOWN for all providers**. No correct-complete-draft denominator was fabricated.

**Validation, preservation and next step.** The final focused Search and comparison suite passes **461/461**, including sixteen comparison tests. Scoped lint checks 21 files with zero errors/warnings. Search production TypeScript did not change during this continuation; the earlier Search-only typecheck pass and unrelated full-backend StudyAI TS2719 failure remain as recorded. Coverage and exhaustive mutation closure were not rerun or claimed.

The additive directory `output/search-v1-b1-comparison-2026-11-02/` contains the v4 registration, unchanged input/label artifacts, owner reply receipt, exclusive provider claims, per-case raw successful responses, usage/latency/request identities, provider observations and `comparison-live-results-v4.json`. `comparison-analysis-v4.json` contains per-task and per-language counts, actual usage, costs and per-case mismatches. `capability-attribution-v4.json` records the offline singleton-question diagnosis without network calls or score changes. Earlier historical files remain intact.

Preservation verifies 2,005 protected files unchanged, all 44 registered source hashes current, and unchanged HEAD/staged identity. There were zero held-out, challenge, pending-queue Luna, generative fallback, Places, Details, booking or dispatch calls. No frontend change, runtime provider switch, purchase, billing mutation, commit, reset or deployment occurred.

The next proposed bounded experiment should first align singleton/no-candidate capability handling and the reviewed policy with the parser contract offline, explicitly representing unsupported tasks rather than inventing provider answers. Register any revised questions before another live comparison. Jev remains the sensible existing integration baseline; Clef merits the next accuracy-focused comparison, while flash needs exclusion/role containment work. Decisions requires a separately registered controlled resumption after its 429 restriction, not an automatic retry. Full production-equivalent fallback/grounding economics, S6 and independent evaluation remain separate unfinished work. This pilot does not authorize those stages or rollout.
