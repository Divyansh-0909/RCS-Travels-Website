# Search V1 v6 — scheduler fix and completed comparison

Date: 2026-11-03, Asia/Kolkata. **COMPLETE: Jev and Clef each finished all 24 registered cases.** The owner's “retry the failed thing” instruction authorized one controlled continuation after the [six-request scheduler stop](search-v1-v6-live-execution-checkpoint-2026-11-03.md). The six successful responses and two completed Jev cases were retained, not inferred again. There were **132 new requests, 138 aggregate requests, and zero automatic provider retries**.

**Recommendation:** retain Jev for the existing parser. Clef has a small common-decision advantage, but Jev produces stronger endpoint results, more guard-accepted booking partials and lower cost through this integration. No production provider switch occurred. Neither provider demonstrated complete, grounded or confirmed bookings.

**Scheduler correction and identity.** Four additive files implement and verify the continuation: `executorRetry.js`, `executorRetryRegistration.js`, `scripts/search-v6-retry.mjs` and `tests/rideSearchV6Retry.test.js`, under the existing backend benchmark structure. All original 62 registered sources, the failed claim and its evidence remain unchanged. The scheduler now rounds the remaining delay up, checks the monotonic deadline after waking, and waits again when necessary. A maximum of eight waits bounds a stalled clock; interruption and backward-clock checks remain. These are client waits, not provider retries.

```text
original planHash: a9f820d6121ad94f14534136868fd31c07c4ddadbd4fca9c2b5d44fd07fce22c
predecessor amendmentHash: 2698ba11d6baa0ff274f820c3ce8f735f608bb6936ea62780cbc06d73047db71
continuation amendment: search-v6-executor-amendment-v2-deadline-wait
continuation amendmentHash: 821e405be4efbe0e29fe32ff7e31c33b36eb22b95a2fc9aa33a9b7edd2ade561
retry authorizationHash: a6c5cb39e3a7bb8390b006d606b8cfa33be69be89677f62ae38c2c9d9646ab46
registered sources: 66, including all 62 unchanged predecessor sources
common contract: search-decision-common-v6-owner-simple
cases / questions / eligible labels: 24 / 20 / 463
Level 2 field cohort: 17 expected-SIMPLE booking cases
```

The new amendment hashes all predecessor evidence, verifies the exact completed prefix and carries its request counts and tariff into the ledger. It permits at most 66 further Jev and 72 Clef requests, keeping the original aggregate limit at 144 and spending thresholds at $0.10 / $0.50 / $0.60. The prior claim was never deleted or bypassed. A new exclusive continuation claim protects this attempt from duplicate execution.

The session records the retry instruction at **2026-11-03T04:37:17.413Z**. Its receipt binds the instruction to this amendment and retains the earlier, stricter expiry **2026-11-04T04:20:33.982Z**. The continuation began at **04:45:21.983Z**; terminal evidence was persisted at **04:47:43.021Z**. Original inputs, labels, candidates, clocks, provider configuration and scoring were not revised after predictions. R1/R2 remain SIMPLE.

The continuation command ran once from `backend/`:

```powershell
node --import tsx scripts/search-v6-retry.mjs --live --expected-amendment=821e405be4efbe0e29fe32ff7e31c33b36eb22b95a2fc9aa33a9b7edd2ade561 --authorization=../output/search-v1-v6-retry-2026-11-03/owner-live-authorization.json
```

**Coverage and reliability.** Jev ran first, with its two completed cases skipped, then Clef ran all 24. The ledger and results include the six inherited responses exactly once. All 138 responses normalized successfully, reported usable usage, and matched registered request identities. Jev reported `jev-1.14.0`; Clef reported its selector without immutable weights identification. There were no HTTP errors, timeouts, refusals, unknown usage, model drift or local singleton failures. No Clef-flash, Decisions or other provider was called.

| Provider | Inherited / new / aggregate requests | Common / routing / extraction | Cases |
| --- | ---: | ---: | ---: |
| Jev | 6 / 63 / 69 | 24 / 24 / 21 | 24/24 |
| Clef | 0 / 69 / 69 | 24 / 24 / 21 | 24/24 |
| Total | **6 / 132 / 138** | 48 / 48 / 42 | 48 provider-case results |

New dispatch timestamps show a minimum gap of **1,011.939 ms**. All actual scheduler waits completed in one wake; the offline tests exercise repeated early wakes. Concurrency remained one, timeout 10,000 ms, provider retries zero. The predecessor's exact six responses and their original latencies remain in the combined result; they are not presented as new continuation calls.

**Level 1 — common categorical decisions.** These metrics cover the same 463 eligible labels for both providers. Repeated absent-feature decisions affect micro accuracy. Sixteen multilingual ambiguity targets and one unclear booking-intent target remain unlabelled. This is a purposive development pilot, not independent language-wide accuracy.

| Metric | Jev | Clef |
| --- | ---: | ---: |
| Correct categorical decisions | **450/463 (97.2%)** | **456/463 (98.5%)** |
| All labelled tasks exact | 16/24 | 17/24 |
| Query type | 24/24 | 24/24 |
| Complexity | 21/24 | 23/24 |
| Booking intent | 22/23 | 23/23 |
| Pickup / drop choice | 21/24 / 23/24 | 23/24 / 24/24 |
| Exact positive pickup / drop span | 15/17 / 13/15 | 15/17 / 13/15 |
| Vehicle | 23/24 | 22/24 |
| Timing mode / sharing | 24/24 / 24/24 | 24/24 / 24/24 |
| Labelled source ambiguity | 7/8 | 7/8 |
| Four exclusions, individual decisions | 96/96 | 96/96 |
| Passenger / stop / return / rental / AC presence | Each 24/24 | Each 24/24 |
| Conditional-preference presence | 22/24 | 22/24 |
| Other unsupported-kind presence | 23/24 | 24/24 |

Clef's categorical role-choice advantage does not improve aggregate positive exact-span results here. Correct NONE/OTHER_OR_UNAVAILABLE/AMBIGUOUS recognition remains separate from extracting a positive source endpoint and from geographic grounding.

| Language | Jev decisions; exact cases | Clef decisions; exact cases |
| --- | --- | --- |
| English, 8 | 154/159; 5/8 | 157/159; 6/8 |
| Romanized Hindi, 5 | 91/95; 3/5 | 94/95; 4/5 |
| Hinglish, 3 | 56/57; 2/3 | 55/57; 1/3 |
| Hindi, 8 | 149/152; 6/8 | 150/152; 6/8 |

**Level 2 — actual parser and guards.** The fixed 17-case field cohort is unchanged. A rejected extraction or premature escalation earns no field success; these are integration outcomes, not isolated model-language error rates. Existing parser state/question context differs from the common batch, even where instruction wording matches.

| Metric | Jev | Clef |
| --- | ---: | ---: |
| Query type / complexity over all cases | 24/24 / 22/24 | 24/24 / 20/24 |
| Observed extractions without INVALID/provenance rejection | 16/17 | 12/17 |
| Exact positive pickup | **12/13** | **7/13** |
| Exact positive drop | **12/12** | **7/12** |
| Role correctness including expected absence | Pickup 15/17; drop 16/17 | Pickup 10/17; drop 11/17 |
| Vehicle / timing mode | 13/17 / 16/17 | 11/17 / 12/17 |
| Deterministic missing-field set | 14/17 | 11/17 |
| Exact exclusion set | 16/17 | 12/17 |
| Positive-exclusion cohort | 5/6 | 4/6 |
| Exclusion false positives | 0 | 0 |
| Explicit negative-sharing cohort | 3/3 | 2/3 |
| Exact unsupported-kind set | 14/17 | 11/17 |
| Guard-accepted booking partials | **13/24** | **9/24** |
| Eligible fallback | 8/24 | 12/24 |
| Required-COMPLEX fallback eligibility | 4/4 | 4/4 |
| Local singleton/contract failures | 0 | 0 |
| Returned-draft provenance violations | 0 | 0 |

“Guard-accepted” remains a partial-draft proxy. It does not establish semantic perfection, supported journey completion, grounding, fare validity or confirmation. No grounded, user-confirmed or submitted booking was measured. Source-role correctness, original spans and provenance are checked separately. Fallback reasons and per-case mismatches remain in the machine-readable evidence.

The two known Hindi binding limits persist for both providers: `hh-v1-added-004` still reaches source-binding/vehicle validation rejection; `hh-v1-added-007` still reports EXTRACTION_BINDING_UNRESOLVED for unsupported rental semantics. Both remain fallback-required. Their HTTP responses passed strict normalization; these are downstream binding limitations, not provider/network failures. Missing fields and unsupported rental still require resolution; the SIMPLE routing decision does not make rentals bookable.

**Latency.** Nearest-rank median/p95, milliseconds, n=24/provider. Jev includes the two inherited observations. The sample is small; parser timing includes orchestration and throttle waits and mixes different outcomes, so it is not completed-booking latency.

| Measurement | Jev median / p95 | Clef median / p95 |
| --- | --- | --- |
| Common provider latency | 336 / 710 | 722 / 1,442 |
| Parser end-to-end | 2,069 / 2,185 | 1,747 / 2,191 |

Clef's lower parser median does not establish faster successful interpretation or booking: its parser escalation/rejection mix differs, and client waits depend on the preceding common request.

**Reported tokens and registered-tariff costs.** All 138 requests have usable usage. Output counters are preserved as reported; these categorical endpoints charge input under the registered tariffs. Actual account invoice/credit effects and free allocations remain unverified.

| Provider | Input / output tokens | Level 1 tariff | Parser tariff | Total tariff |
| --- | ---: | ---: | ---: | ---: |
| Jev, including inherited six | 165,851 / 41,118 | $0.004300590 | $0.002665152 | **$0.006965742** |
| Clef | 162,338 / 0 | $0.025030800 | $0.013930320 | **$0.038961120** |
| Combined | **328,189 / 41,118** | $0.029331390 | $0.016595472 | **$0.045926862** |

The new continuation subtotal is **$0.045332520**; adding the predecessor's $0.000594342 gives the combined total above. It is not charged twice. There is no unreported failed-request usage. All provider/aggregate operational thresholds remained satisfied; they are not invoice guarantees.

| Unit cost, 24 cases/provider | Jev | Clef |
| --- | ---: | ---: |
| Common batch per case | $0.000179191 | $0.001042950 |
| Bounded parser per attempted interpretation | **$0.000111048** | **$0.000580430** |
| Parser per guard-accepted booking partial | **$0.000205012** | **$0.001547813** |

These parser costs omit Luna, Places/Details, final controls and other unmeasured workflow processing. Full workflow cost per correct/grounded/confirmed booking remains UNKNOWN. Common-batch cost is extra experimental overhead, not production Search cost.

**Verification and preservation.** Before inference, **520/520 focused Search/comparison tests passed**, including six new continuation/deadline tests. Tests cover repeated fractional early wakes, clock stalls/backward movement, interruption, skipping completed cases, aggregate request/budget accounting, duplicate-claim refusal and whole-activation stopping on 429. Scoped lint checks four new files with zero errors/warnings. Full backend typechecking still reports only the existing unrelated StudyAI TS2719; it was not repaired.

Offline analysis independently re-normalized all **138** responses, checked unique actual request identities against the registered manifest, rechecked that the inherited six are byte-equivalent as canonical observations, and recomputed both providers' complete registered metrics. No synthetic response or new gold annotation entered the live results.

Evidence is under `output/search-v1-v6-retry-2026-11-03/`: `execution-amendment-v2.json`, the actual retry authorization/source receipt, preflight and test/lint logs, the new `activation/` claim/request/case/terminal records, [comparison-live-results-v6-complete.json](../../output/search-v1-v6-retry-2026-11-03/comparison-live-results-v6-complete.json), [comparison-analysis-v6-complete.json](../../output/search-v1-v6-retry-2026-11-03/comparison-analysis-v6-complete.json), preservation verification and activation artifact hashes. The continuation directory contains 314 evidence files; its terminal result explicitly distinguishes 132 new from six inherited requests. The old 17-file activation remains intact.

Preservation verifies **3,411 protected files unchanged**, all **66 registered source hashes matching**, unchanged HEAD/staged identity and retained predecessor/new claims. The verifier's no-network mode is separate from the actual bound live authorization receipt. Original v1–v6 evidence, frozen datasets/labels/splits, B1 and Responsibility V5 sources, S6 artifacts, pending 50-case Luna queue and unrelated changes remain intact. No held-out/challenge execution, generative fallback, Places/Details, customer booking, payment, dispatch, billing mutation, production routing change, rollout, deployment, commit, push, merge or reset occurred.

**Next development step.** Keep Jev as the current integration baseline. Clef's six-answer common-task advantage merits continued consideration, but it is not a better drop-in parser on this sample. First address the bounded Hindi preferred-strength/rental source-binding gaps and inspect the parser role/vehicle failures offline, with provenance, negation and submission controls retained. Any further live experiment needs its own authorization. V4 results remain historical context under a different contract and cannot be treated as a direct accuracy-improvement comparison. This authorized continuation is complete; no further execution or provider switch was performed.
