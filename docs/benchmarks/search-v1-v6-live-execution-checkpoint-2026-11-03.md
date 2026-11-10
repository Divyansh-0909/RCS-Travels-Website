# Search V1 v6 — authorized live execution, stopped

Date: 2026-11-03, Asia/Kolkata. **STOPPED: THROTTLE_CLOCK_FAILURE after six Jev requests and two cases. Clef was not started.** The local scheduler refused the next request before reserving or sending it. The exclusive activation claim is retained. There were **zero retries, restarts or resume attempts**. This is a partial execution, not a completed Jev/Clef comparison.

The [verified executor](search-v1-v6-executor-verification-checkpoint-2026-11-02.md) and [v6 registration](search-v1-v6-benchmark-readiness-checkpoint-2026-11-02.md) remain unchanged. No provider switch, production rollout or downstream booking operation occurred.

**Actual authorization and preflight.** The owner explicitly authorized one activation with Jev $0.10, Clef $0.50 and $0.60 combined operational thresholds. The current session's user-message record supplies the actual instruction timestamp, rather than the attachment's earlier write time or an invented approval time.

| Event | UTC timestamp |
| --- | --- |
| Actual owner instruction | 2026-11-03T04:20:33.982Z |
| Authorization expiry, exactly 24 hours later | 2026-11-04T04:20:33.982Z |
| Activation started | 2026-11-03T04:24:20.256Z |
| Terminal evidence file persisted, filesystem mtime | 2026-11-03T04:24:27.044Z |

The new `owner-live-authorization.json` binds that instruction, its source-event hash, full attachment text/hash, timestamps and exact envelope to:

```text
planHash: a9f820d6121ad94f14534136868fd31c07c4ddadbd4fca9c2b5d44fd07fce22c
amendmentHash: 2698ba11d6baa0ff274f820c3ce8f735f608bb6936ea62780cbc06d73047db71
authorizationHash: 237de10b536f70b1e807ccf69f9fdec265729a3cd041aa7c05aa7b400c745895
contract: search-decision-common-v6-owner-simple
cases / questions / eligible labels: 24 / 20 / 463
Level 2 fixed field cohort: 17 expected-SIMPLE booking cases
```

All 62 source hashes, original artifact hashes, request identities, candidate lists, fixed clocks and contracts matched. The activation directory and live receipt did not previously exist. Both credential configurations were locally present; credentials were neither printed nor written into evidence. Account access/free allocations were not preflighted through additional external calls. The earlier v4 quota waiver was not reused.

The exact authorized command ran **once**, from `backend/`:

```powershell
node --import tsx scripts/search-v6-executor.mjs --live --expected-amendment=2698ba11d6baa0ff274f820c3ce8f735f608bb6936ea62780cbc06d73047db71 --authorization=../output/search-v1-v6-executor-2026-11-02/owner-live-authorization.json
```

It exited with code 1 and `STOPPED / THROTTLE_CLOCK_FAILURE / dispatchedCalls:6`. The still-valid timestamp window does not authorize a second activation or resume after this stop.

**Execution coverage.** Jev completed `core-standalone-002` and `core-complete-simple-001`, in the registered order. Each used one common batch, one routing call and one extraction call. All six responses were HTTP 200, strictly normalized, reported `jev-1.14.0`, and supplied usable token usage. No refusal, malformed response, provider failure, 429, authentication error or reported model drift occurred. There is no unresolved request intent or missing per-request usage.

| Provider | Cases with common output | Cases with parser output | Common / routing / extraction requests | Total requests |
| --- | ---: | ---: | ---: | ---: |
| Jev | 2/24 | 2/24 | 2 / 2 / 2 | **6** |
| Clef | 0/24, NOT_RUN | 0/24, NOT_RUN | 0 / 0 / 0 | **0** |

The third scheduled case, `core-date-only-001`, was not sent. The guard stopped before the seventh reservation/intent. One global activation claim and the Jev claim remain; no Clef claim was created. All sent requests respected the registered construction and reservation checks. The source guard enforces the minimum start gap before dispatch; exact dispatch timestamps and the failed wait's shortfall were not separately persisted.

**Level 1 — actual common decisions.** Jev matched **39/40 observed eligible answers (97.5%)** and every labelled task on **1/2 observed cases**. The preregistered totals remain **39/463 decisions and 1/24 exact cases**; unattempted cases are not removed. Those registered numerators are coverage-inclusive accounting, not evidence of Hindi mistakes or a language-wide accuracy rate. Clef has no observed accuracy denominator.

| Task | Jev observed correct / eligible | Clef |
| --- | ---: | --- |
| Query type | 2/2 | NOT_RUN |
| Complexity | 2/2 | NOT_RUN |
| Booking intent | 2/2 | NOT_RUN |
| Pickup choice | **1/2** | NOT_RUN |
| Drop choice | 2/2 | NOT_RUN |
| Vehicle | 2/2 | NOT_RUN |
| Timing mode | 2/2 | NOT_RUN |
| Sharing | 2/2 | NOT_RUN |
| Source ambiguity | 2/2 | NOT_RUN |
| Four exclusion questions | 8/8; each 2/2 | NOT_RUN |
| Seven unsupported-kind questions | 14/14; each 2/2 | NOT_RUN |

The single mismatch is `pickup` on the location-only input `core-standalone-002`: expected NONE, predicted `loc_880b01b06ceb704ac78ccedb`, the standalone place candidate. Query type was correctly LOCATION_SEARCH. The second case matched all twenty labels. Both cases correctly recognized the absence of unsupported services; no positive rental/conditional/AC/stop example was tested. The vehicle-bearing case retained hatchback and the explicit sedan exclusion. These observations do not establish Hindi negation or availability/rental understanding.

| Language stratum | Registered cases / eligible decisions | Jev observed decisions; exact cases | Clef |
| --- | ---: | --- | --- |
| English | 8 / 159 | 39/40; 1/2 | NOT_RUN |
| Romanized Hindi | 5 / 95 | NOT_RUN | NOT_RUN |
| Hinglish | 3 / 57 | NOT_RUN | NOT_RUN |
| Hindi | 8 / 152 | NOT_RUN | NOT_RUN |

Positive exact-source endpoint scores, separately from NONE/OTHER/AMBIGUOUS choice correctness, are Jev **1/17 pickup and 1/15 drop registered**, each **1/1 observed positive target**. Correctly answering an absent/unavailable role is not positive extraction or geographic grounding.

**Level 2 — actual parser integration.** Query type and complexity are each correct on 2/2 observed cases, with 24-case registered denominators retained. Only `core-complete-simple-001` belongs to the fixed field-scoring cohort; the other result is a location lookup. Thus only **1/17 registered field cases** has observed extraction.

| Field/result | Jev observed | Registered accounting |
| --- | ---: | ---: |
| Positive exact pickup | 1/1 | 1/13 |
| Positive exact drop | 1/1 | 1/12 |
| Vehicle state/class | 1/1 | 1/17 |
| Timing mode | 1/1, SCHEDULED | 1/17 |
| Deterministic missing-field set | 1/1 | 1/17 |
| Exact exclusion set | 1/1 | 1/17; positive cohort 1/6 |
| Exact unsupported-kind set | 1/1, empty | 1/17 |
| Explicit negative sharing | NOT_RUN | 0/3 observed successes; no cases attempted |

The location case returned LOCATION_SEARCH. The booking case returned the parser route SIMPLE_COMPLETE, but still had PLACES_GROUNDING_REQUIRED for both endpoints. It counts as **one guard-accepted booking partial**, requiring grounding and explicit review, not a complete booking. Eligible fallback is zero among the two observed parser results; no required-COMPLEX case was attempted. Exact negative-sharing and multilingual fallback comparisons remain unmeasured.

There are **zero returned-draft provenance violations across two observed drafts**, with 22 Jev cases unobserved. Clef has 24 unobserved cases, not a demonstrated zero-violation run. Grounded, confirmed or submitted bookings are **zero**. Neither Luna nor Places/Details ran.

The existing Hindi limitations remain separate and **NOT_RUN**: `hh-v1-added-004` preferred-strength source binding and `hh-v1-added-007` rental lexicon binding. None of their labels, routing decisions or implementation was changed.

**Latency.** Values are milliseconds. Median uses the registered lower-middle nearest rank; no p95 is reported for these small samples.

| Measurement | Jev observed values | Median | Clef |
| --- | --- | ---: | --- |
| Common-batch provider latency, n=2 | 1,368.500; 323.786 | 323.786 | NOT_RUN |
| Parser end-to-end, n=2 | 1,412.475; 2,142.332 | 1,412.475 | NOT_RUN |

Provider latency excludes the recorded client throttle wait; parser duration includes orchestration and waiting. The two parser paths differ. These data do not support a speed comparison, multilingual latency claim or completed-booking latency estimate.

**Actual reported usage and registered-tariff economics.** All six inference attempts have usable usage. At the locked Jev input tariff of $0.042/M, output uncharged on this endpoint:

| Scope | Requests | Input / output tokens | Known tariff subtotal |
| --- | ---: | ---: | ---: |
| Jev Level 1 | 2 | 8,317 / 2,118 | $0.000349314 |
| Jev bounded parser | 4 | 5,834 / 1,284 | $0.000245028 |
| **Total** | **6** | **14,151 / 3,402** | **$0.000594342** |
| Clef | 0 | No observations | $0 from this activation; no unit-cost measurement |

There are no failed provider requests with unreported usage. The local scheduling failure happened before another request was reserved/sent. The known total is therefore complete for the six observed requests **at the registered tariff**. Actual invoice/credit effects remain UNKNOWN because free allocations and account charges were not checked. The $0.10 / $0.50 / $0.60 operational ceilings were not approached; unused headroom does not permit an automatic retry.

Observed Level 1 cost per attempted common batch is **$0.000174657**. Bounded parser cost per attempted Search interpretation is **$0.000122514**, over the two mixed location/booking attempts. Parser cost per guard-accepted booking partial is **$0.000245028**, using all four parser requests divided by one partial. Combined experiment cost per visited case is $0.000297171 and includes the extra comparison batch; it is not production Search cost. Complete-workflow cost per correct/grounded/confirmed booking remains UNKNOWN. Clef per-attempt and per-partial costs are N/A.

**Defect and diagnostic limits.** The immutable `executor.js:31–38` computes a remaining monotonic wait, sleeps once, then fails closed if elapsed time is still below 1,000 ms. That post-wait check caused this stop. It preserved the rate boundary but made the activation brittle to a short wait. The exact live shortfall and underlying timer/rounding behavior were not recorded, so they cannot be quantified or conclusively attributed.

An additive offline runtime diagnostic sampled eighteen short fractional delays without provider calls and observed **zero** early wakes. It did not reproduce the live boundary failure. `timer-diagnostic-v2.json` is the authoritative interpretation and corrects the earlier generic diagnostic caveat while preserving all original sample data. The prior 514-test offline suite did not catch this live scheduling boundary; it is historical verification, not evidence that the stopped run completed. No executor source was hot-fixed and no request was replayed.

**Evidence and preservation.** The immutable activation evidence remains under `output/search-v1-v6-executor-2026-11-02/activation/`: global/Jev claims, six intents, six response records, two case results and the terminal result. It contains 17 files. The original successful responses and normalized results remain intact; no provider-error body was retained because no provider error occurred.

Additive analysis is under `output/search-v1-v6-live-2026-11-03/`:

- `baseline.json`, `authorization-source.json`, `owner-authorization-receipt-copy.json`, `preflight.json`.
- [comparison-live-results-v6.json](../../output/search-v1-v6-live-2026-11-03/comparison-live-results-v6.json), an exact copy of the terminal result.
- [comparison-analysis-v6.json](../../output/search-v1-v6-live-2026-11-03/comparison-analysis-v6.json), with per-task/language counts, observed versus registered denominators, costs and mismatches.
- `timer-diagnostic-v2.json`, `activation-artifact-hashes.json`, and [preservation.json](../../output/search-v1-v6-live-2026-11-03/preservation.json).

Offline analysis independently re-normalized all six original responses, checked all six actual request identities against the amended manifest and recomputed both providers' registered categorical counts. No fresh inference was used to fill missing results. Preservation verifies **3,381 protected files unchanged**, all **62 registered source hashes current**, unchanged HEAD and staged identity, and retained activation/Jev claims. All original v1–v6 registrations, frozen inputs/labels/splits, v4 predictions/costs, B1 sources, caches, S6/Responsibility V5 artifacts and unrelated changes remain intact. There were zero held-out, challenge, pending-queue Luna, Places, customer booking, payment or dispatch calls. No billing mutation, provider switch, deployment, feature activation, commit, push, merge or reset occurred.

**Historical context and next step.** The completed v4 comparison had Jev 509/589 and Clef 553/589 common decisions on 24 cases each. Those are historical results under different questions/policy, source identities, denominators and parser limitations; they are not directly equivalent to this two-case v6 fragment. This activation provides **no Jev-versus-Clef performance ranking**.

Retain Jev as the existing integration baseline. Clef still merits a controlled comparison based on the prior evidence, but this run supplies no new Clef measurement. The next bounded development task should fix and instrument the scheduler offline: recompute remaining time and wait to the monotonic deadline while honoring interruption, without retrying a provider request. Add fractional/early-wake boundary regressions, bind any changed executor to a new amendment, and obtain separate authorization for a controlled new execution. Preserve this claim and evidence. No continuation, automatic provider switch or rollout was performed; work stopped after reporting the single authorized activation.
