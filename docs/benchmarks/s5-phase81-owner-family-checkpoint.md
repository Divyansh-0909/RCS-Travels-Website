# Search S5 / Responsibility Phase 8.1 / Search S6 checkpoint

This checkpoint applies the product-owner decisions in attachment `b37377e0-7a7f-474f-8e32-085c756e9d36`. The three workstreams remain independent. No dataset freeze, final held-out inference, customer rollout, responsibility dual-shadow or automatic adjudication was performed.

## Part I — Search S5 owner decisions

The original 178 certified deterministic labels remain unchanged. Monday–Sunday weeks, default PM, explicit timezone conversion, SUV-family exclusions and one-shot interpretation followed by deterministic form resolution are implemented. All 19 owner-approved family rules were applied to 121 family-review cases. The other 21 policy-only cases retain their prior audited resolution. Case-specific exceptions: 0. Remaining core REVIEW_REQUIRED: 0. Remaining owner decisions: 0.

The [readable dataset receipt](../search/benchmark-v1/owner-approved-v3/README.md), [change audit](../search/benchmark-v1/owner-approved-v3/change-audit.json) and [freeze preparation](../search/benchmark-v1/owner-approved-v3/freeze-preparation.json) preserve the old/new expectations and owner authority. Validation independently checks the original approvals, even if a caller alters both a label and its supplied certification hash.

There are 320 approved core records: 178 ordinary and 142 adversarial. The proposed split is 222 development / 98 held-out; no template family crosses splits. Forty Hindi/Hinglish records remain EXPLORATORY_UNSCORED, separate from core approval and metrics. Dataset hash: `51c6b04c8b8dcc69f0c6b6d3a55d45403f14f014d9aa36eb4d5600e1c1d76430`. The label dataset is ready to freeze, but remains **not frozen**. This does not imply Search S5 engineering or live-quality signoff.

## Part II — Search S5 implementation

Temporal and vehicle policies are integrated into the parser modules. Application code resolves calendar components, defaults bare H12 to PM, converts recognized source timezones, rejects DST folds/gaps and applies the existing scheduling window separately. Vague dayparts and approximate times still require explicit form resolution. Location spans are excluded from timezone-token interpretation; saved original query/candidate provenance survives later form edits.

The form-resolution contract is ready. It separates blocking requirements from advisories, preserves original and USER_FIELD provenance and requires grounded locations, usable timing/vehicle selection, supported journey semantics, fresh quote/route state and explicit review. No AI conversational clarification loop or automatic booking is introduced.

Stops remain PLANNED_PRODUCT_FEATURE. The [multi-stop backlog](../search/multi-stop-product-backlog.md) records future schema, ordered locations, fare/route/ETA, dispatch and recovery work. Passenger counts remain advisory; straightforward rentals and soft AC preferences preserve their clauses without becoming complex solely through unsupported enforcement. Conditional journeys and competing pickup times retain their alternatives.

### Development provider evidence and defects

Six new live Jev requests were made on synthetic development inputs, without benchmark labels or held-out cases. The first pair of queries exposed:

1. **Candidate-generation defect, fixed:** “around 7” was retained inside the destination phrase and then hidden from time observation. Generator v2 now separates `at`, `around` and `about` clock suffixes. Deterministic regressions and a two-request post-fix live check preserve approximate 7 PM with EXACT_TIME_CONFIRMATION_REQUIRED, rather than TIME_REQUIRED.
2. **Live Jev calibration limitation, open:** an exclusion-only query returned EXPLICIT_ANY together with REQUIRED vehicle strength. The parser retains both SUV exclusions, marks the vehicle ambiguous and blocks completion through form resolution. No label was changed and no arbitrary confidence threshold was added.

The prior Google canonical-ID preflight passed. No new Google request was made in this checkpoint. The previous Luna Search adapter preflight passed, but the updated owner-policy prompt has not received a new live preflight because of the shared account rate-limit instruction. Fake-provider tests are contract evidence, not live accuracy measurements. Customer natural-language Search remains off.

Search S5 remains incomplete pending current mutation reconciliation and broader live development/held-out evaluation. Core label approval itself has no remaining product-owner blocker.

## Part III — Responsibility Phase 8.1

### A. Original two unsafe pre-guard cases

`development-documented-conflicting-commitments-0` and `development-documented-conflicting-commitments-1` each contain direct `ev_0007` evidence: acceptance of incompatible overlapping bookings, driver acknowledgement, dispatcher corroboration and cancellation of the original booking to serve the other. These facts were present in the exact normalized provider input; evidence serialization did not omit them.

In each case, the old evidence-aware Jev response said aggravation YES, serious failure NO, ordinary failure YES and human review NO. The mapping consequently produced MODERATE / LEVEL_1 and an unsafe simulated uphold instead of the required serious-case review. The unchanged factual guard blocks both. Expanding the common cohort added a third instance of the same failure; old criteria now have three pre-guard unsafe upholds on 36 comparable cases, zero after the guard. Details: `output/phase81/evidence-aware-development/unsafe-case-analysis.json`.

### B. Revised development criteria

The benchmark-only `responsibility-evidence-criteria-development-v2` adapter uses eight independent bounded choice questions with TypeSafe SDK 0.6.0 and the actual returned Jev model `jev-1.13.0`. It makes corroborated seriousness explicit and distinguishes ordinary failure from serious failure. The original normalization and factual guard remain unchanged. No production responsibility analyst, lifecycle or consequence code was modified.

All 113 development cases succeeded: 17 earlier probe results were reused only after verifying identical source inputs/configuration; 96 new requests completed. Classification: 101/113 (89.38%). Severity: 113/113. False DRIVER_CAUSED: 0. False LEVEL_2: 0. Gated unsafe auto-upholds before/after the factual guard: 0/0. Raw adverse recommendation errors: 1; this must not be confused with zero unsafe gated upholds.

Guarded safe-uphold precision: 2/2 (100%). Guarded recall: 2/8 (25%). Review rate: 108/113 (95.58%). Review recall: 81/83 (97.59%). Without the unchanged factual guard, safe-uphold recall is 5/8; the guard was not weakened to improve coverage.

Two review-required platform-delay cases were incorrectly recommended for waiver: `failed_pickup-rider_cancel_after_platform_delay` and `platform_assignment_failure-rider_cancel_after_platform_delay`. Their labels remain unchanged. The [saved review misses](../../output/phase81/criteria-v2-expanded-development/review-misses.json) explicitly prevent a freeze-ready conclusion.

### C–D. Luna coverage and rate limit

One new Luna request succeeded; the next returned RATE_LIMIT under a 100,000-TPM constraint, with a retry delay of 18,818,000 ms (approximately 5h 13m 38s). The paced development runner stopped with SERVER_DELAY_EXCEEDS_BUDGET. It reserves 5,595 tokens/request, enforces a 12-second minimum interval, reuses successful cached inputs and does not retry through the server delay. API funding/access is resolved by the successful call; current provider capacity remains blocked.

Successful Luna development responses: 36. DRIVER_CAUSED 17; PLATFORM_CAUSED 9; EXTERNAL_OR_UNCERTAIN 10; VALID_WAIVED **0**. LEVEL_0 19; LEVEL_1 14; LEVEL_2 **3**. Positive severity coverage improved, but waiver coverage remains inadequate. No old GPT-5 baseline was used.

### E. Identical-case comparison

Only the same 36 development cases are compared below. The revised Jev 113-case result is not compared directly with Luna's smaller cohort.

| Candidate | Classification | False DRIVER_CAUSED / LEVEL_2 | Unsafe gated uphold before → after guard | Guarded safe-uphold recall | Guarded precision | Review rate |
|---|---:|---:|---:|---:|---:|---:|
| Original evidence-aware Jev | 34/36 | 0 / 0 | 3 → 0 | 0/2 | Undefined: no upholds | 100% |
| Revised criteria-v2 Jev | 34/36 | 0 / 0 | 0 → 0 | 2/2 | 2/2 | 91.67% |
| GPT-6 Luna | 33/36 | 0 / 0 | 2 → 0 | 2/2 | 2/2 | 75% |

All three have review recall 15/15 on this common cohort. The two safe-uphold positives are too few for a production-confidence claim. Jev-v2 conditioned severity is 36/36; Luna is 32/36. Luna raw ordinal severity is separately 21/36; those metrics must not be conflated.

### F–H. Consistency, freeze and access

The earlier seven-case repeated cohort had classification/review stability 7/7 and severity stability 6/7. A documented deliberate-unavailability case changed seriousness from YES to NO across repetitions, yielding HIGH once and MODERATE four times despite stable aggravation evidence.

The revised criteria-v2 subset contains four development cases, five runs each: two safe-uphold and two serious cases. Classification, severity and guarded review were stable in all four; 20 responses succeeded, including 16 new calls and four exact cached first runs. This subset is not broad enough for severity freeze. The wider review misses, missing Luna VALID_WAIVED coverage and incomplete mutation signoff also block freeze and held-out readiness.

OpenAI Decisions API access remains **UNKNOWN**. SDK/account discovery yielded no usable Decisions contract; no undocumented endpoint or adapter was invented. Real human-final calibration remains 0; synthetic development success is not human-final calibration.

### I–J. Mutation and held-out readiness

The original 144 pending-review entries reconcile to 15 killed and 129 still requiring meaningful review. None of this original cohort has been reclassified as equivalent, non-actionable or historical debt. Separate historical justifications remain five equivalent and one non-actionable; they are not 144-cohort wins.

Exact-source-hash reconciliation deduplicates overlapping reports. The broader current registry has 2,711 killed, 129 pending meaningful review, 762 changed-source entries requiring retest and six separately justified entries. Changed-source reports cannot establish current-source signoff. Historical debt excluded: 0. Meaningful survivors are **not yet fully classified**, and no zero-survivor claim is made. The new criteria-v2 adapter alone passed 33/33 killed, zero surviving mutants; that does not sign off all Phase 8 code.

Responsibility held-out remains NOT RUN and NOT READY. Criteria/configuration remain DEVELOPMENT_ONLY_NOT_FROZEN. Production shadow, finalization and consequences are unchanged.

## Part IV — Search S6 development preparation

The [S6 audit](../search/search-s6-development-audit.md) and [strict development packet](../search/s6-development/verifier-input.json) cover 12 boundaries, 0 proposed model-callable tools, 2 application-orchestrated Places capabilities and 7 deterministic utilities. Two other boundaries are model inference interfaces; the remaining one is the prohibited booking/payment/dispatch boundary. The packet contains 11 development traces and no benchmark labels.

Five engineering issues were identified against the tool-design principles; three are fixed. Question/token efficiency and the observed live vehicle-choice inconsistency remain open. The proposed AI verifier was not executed because the configured Luna account's rate-limit retry instruction also applies to this Search call. AI findings: **unmeasured**, not zero.

Model-callable Search tools required: NO under the current one-shot design. Model-controlled Google Places: NO. One-shot AI → form resolution is preserved. No tool schema permits booking creation, payment, assignment or responsibility consequences. Final S6 evaluation is NOT RUN while S5 remains unfrozen.

### Validation evidence

Current measured test, coverage, lint, complexity/CRAP, duplicate and mutation results are recorded in the accompanying [validation receipt](../../output/phase81/owner-family-checkpoint-validation.json). Source hashes tie scoped measurements to this checkpoint. The receipt distinguishes completed checks from unresolved mutation work and earlier failed fixture runs. No database schema was changed, so no Prisma or real-database pass is claimed for this checkpoint.

Backend: **1,348/1,348 PASS**. Search plus the new criteria adapter: **406/406 PASS**. The additional landmark assertions subsequently passed in the 41-test candidate/owner-safety run; production source remained unchanged. Coverage is 100% statements/branches/functions/lines across the 20 measured source files and all included Search modules. Typecheck, scoped lint and diff check passed; duplicate clones: 0. Maximum measured LOC 204, cyclomatic 21, cognitive 19, Halstead difficulty 34.747 and CRAP 21; no threshold failures.

The final candidate-suffix mutation witness contains 60 mutants: 58 killed, two equivalent whitespace-quantifier survivors, zero timeouts/uncovered and zero meaningful survivors for this narrow witness. [Exact-source justifications](../../output/phase81/owner-candidate-suffix-mutation-dispositions.json) explain why immediate whitespace trimming makes the two intermediate cut points unobservable. Broader Search mutation reconciliation is unfinished; narrow witness results do not establish full S5 signoff. Whole-repository dead-code analysis was not run; unused-declaration lint, scoped dependency inspection and architectural firewalls passed.

### Changed-file scope

Search modules: calendarPolicy, timezonePolicy, temporal, vehiclePolicy, contracts, observations, extractor, questions; complex evidence/ownerConflicts/luna/service; locations candidates/sessionTemporal/followup/formResolution. Evaluation modules: familyOwnerReview, familyDefinitionProof, toolAudit and benchmark-only evidenceCriteriaV2. Scripts: owner-family artifact generation; paced responsibility development; criteria probe/expanded development/consistency; mutation reconciliation. Controlled-clock, candidate, owner-authority, form-resolution, temporal/session and adapter tests were added or updated. Temporal dependency and package lock were updated. Documentation contains the owner decision receipt, approved-v3 dataset/audit, multi-stop backlog and S6 development artifacts. Pre-existing unrelated working-tree changes are preserved.

Search and responsibility labels, prompts, metrics, caches and configuration hashes remain independent. Neither track was enabled in production. The only cross-domain operational limitation is shared provider account capacity; it is not shared domain policy.
