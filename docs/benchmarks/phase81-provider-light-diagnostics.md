# Responsibility provider-light diagnostics — 7 October 2026

Development only; 113 cached V5 records, no inference, unchanged evidence/labels/criteria/guards. V3 remains reference; V5 remains internal, not selected or frozen.

## Evidence-sufficiency disagreements

False positives 28; false negatives 0; route-affecting 0; non-route-affecting 28; unsafe guarded consequences 0; unnecessary reviews caused 0; missed safe automation caused 0.

All 28 retain EXTERNAL_OR_UNCERTAIN classification and mandatory guarded review. Correcting only sufficiency changes failed-gate detail, not final route. No false driver attribution, false LEVEL_2, unsafe uphold/waive, missed mandatory review or contradiction bypass is caused by these disagreements. They remain raw model quality errors.

Missing material records below means explicit mandatory-record absence/unavailability. Present records are not necessarily fresh, corroborated or sufficient for reliable attribution. The separate quality gap remains in all 28. Critical contradiction follows the frozen flag; semantic timestamp conflicts are not silently relabeled critical.

| Case | Gold responsibility | Gold → V5 sufficiency | Error | V5 class/severity | Raw/normalized review | Raw route | Guarded route | Uphold/waive eligible | Critical/missing | Route changes | Cause family |
|---|---|---|---|---|---|---|---|---|---|---|---|
| driver_cancellation-stale_rider_gps | EXTERNAL_OR_UNCERTAIN | false → true | FALSE_POSITIVE | EXTERNAL_OR_UNCERTAIN/LOW | NO/false | REVIEW_OR_NO_AUTOMATION | NEEDS_ADMIN_REVIEW | NO/NO | NO/NO | NO | stale_rider_gps |
| failed_pickup-stale_rider_gps | EXTERNAL_OR_UNCERTAIN | false → true | FALSE_POSITIVE | EXTERNAL_OR_UNCERTAIN/LOW | NO/true | REVIEW_OR_NO_AUTOMATION | NEEDS_ADMIN_REVIEW | NO/NO | NO/NO | NO | stale_rider_gps |
| driver_late-stale_rider_gps | EXTERNAL_OR_UNCERTAIN | false → true | FALSE_POSITIVE | EXTERNAL_OR_UNCERTAIN/LOW | NO/false | REVIEW_OR_NO_AUTOMATION | NEEDS_ADMIN_REVIEW | NO/NO | NO/NO | NO | stale_rider_gps |
| driver_offline-stale_rider_gps | EXTERNAL_OR_UNCERTAIN | false → true | FALSE_POSITIVE | EXTERNAL_OR_UNCERTAIN/LOW | NO/true | REVIEW_OR_NO_AUTOMATION | NEEDS_ADMIN_REVIEW | NO/NO | NO/NO | NO | stale_rider_gps |
| rider_cancellation-stale_rider_gps | EXTERNAL_OR_UNCERTAIN | false → true | FALSE_POSITIVE | EXTERNAL_OR_UNCERTAIN/LOW | NO/false | REVIEW_OR_NO_AUTOMATION | NEEDS_ADMIN_REVIEW | NO/NO | NO/NO | NO | stale_rider_gps |
| platform_assignment_failure-stale_rider_gps | EXTERNAL_OR_UNCERTAIN | false → true | FALSE_POSITIVE | EXTERNAL_OR_UNCERTAIN/LOW | NO/false | REVIEW_OR_NO_AUTOMATION | NEEDS_ADMIN_REVIEW | NO/NO | NO/NO | NO | stale_rider_gps |
| replacement_failure-stale_rider_gps | EXTERNAL_OR_UNCERTAIN | false → true | FALSE_POSITIVE | EXTERNAL_OR_UNCERTAIN/LOW | NO/true | REVIEW_OR_NO_AUTOMATION | NEEDS_ADMIN_REVIEW | NO/NO | NO/NO | NO | stale_rider_gps |
| driver_cancellation-contradictory_timestamps | EXTERNAL_OR_UNCERTAIN | false → true | FALSE_POSITIVE | EXTERNAL_OR_UNCERTAIN/LOW | YES/true | REVIEW_OR_NO_AUTOMATION | NEEDS_ADMIN_REVIEW | NO/NO | NO/NO | NO | contradictory_timestamps |
| failed_pickup-contradictory_timestamps | EXTERNAL_OR_UNCERTAIN | false → true | FALSE_POSITIVE | EXTERNAL_OR_UNCERTAIN/LOW | NO/false | REVIEW_OR_NO_AUTOMATION | NEEDS_ADMIN_REVIEW | NO/NO | NO/NO | NO | contradictory_timestamps |
| driver_late-contradictory_timestamps | EXTERNAL_OR_UNCERTAIN | false → true | FALSE_POSITIVE | EXTERNAL_OR_UNCERTAIN/LOW | NO/false | REVIEW_OR_NO_AUTOMATION | NEEDS_ADMIN_REVIEW | NO/NO | NO/NO | NO | contradictory_timestamps |
| driver_offline-contradictory_timestamps | EXTERNAL_OR_UNCERTAIN | false → true | FALSE_POSITIVE | EXTERNAL_OR_UNCERTAIN/LOW | YES/true | REVIEW_OR_NO_AUTOMATION | NEEDS_ADMIN_REVIEW | NO/NO | NO/NO | NO | contradictory_timestamps |
| rider_cancellation-contradictory_timestamps | EXTERNAL_OR_UNCERTAIN | false → true | FALSE_POSITIVE | EXTERNAL_OR_UNCERTAIN/LOW | YES/true | REVIEW_OR_NO_AUTOMATION | NEEDS_ADMIN_REVIEW | NO/NO | NO/NO | NO | contradictory_timestamps |
| platform_assignment_failure-contradictory_timestamps | EXTERNAL_OR_UNCERTAIN | false → true | FALSE_POSITIVE | EXTERNAL_OR_UNCERTAIN/LOW | NO/true | REVIEW_OR_NO_AUTOMATION | NEEDS_ADMIN_REVIEW | NO/NO | NO/NO | NO | contradictory_timestamps |
| replacement_failure-contradictory_timestamps | EXTERNAL_OR_UNCERTAIN | false → true | FALSE_POSITIVE | EXTERNAL_OR_UNCERTAIN/LOW | NO/false | REVIEW_OR_NO_AUTOMATION | NEEDS_ADMIN_REVIEW | NO/NO | NO/NO | NO | contradictory_timestamps |
| driver_cancellation-suggestive_not_proof | EXTERNAL_OR_UNCERTAIN | false → true | FALSE_POSITIVE | EXTERNAL_OR_UNCERTAIN/LOW | NO/false | REVIEW_OR_NO_AUTOMATION | NEEDS_ADMIN_REVIEW | NO/NO | NO/NO | NO | suggestive_not_proof |
| failed_pickup-suggestive_not_proof | EXTERNAL_OR_UNCERTAIN | false → true | FALSE_POSITIVE | EXTERNAL_OR_UNCERTAIN/LOW | NO/false | REVIEW_OR_NO_AUTOMATION | NEEDS_ADMIN_REVIEW | NO/NO | NO/NO | NO | suggestive_not_proof |
| driver_late-suggestive_not_proof | EXTERNAL_OR_UNCERTAIN | false → true | FALSE_POSITIVE | EXTERNAL_OR_UNCERTAIN/LOW | NO/false | REVIEW_OR_NO_AUTOMATION | NEEDS_ADMIN_REVIEW | NO/NO | NO/NO | NO | suggestive_not_proof |
| driver_offline-suggestive_not_proof | EXTERNAL_OR_UNCERTAIN | false → true | FALSE_POSITIVE | EXTERNAL_OR_UNCERTAIN/LOW | NO/false | REVIEW_OR_NO_AUTOMATION | NEEDS_ADMIN_REVIEW | NO/NO | NO/NO | NO | suggestive_not_proof |
| rider_cancellation-suggestive_not_proof | EXTERNAL_OR_UNCERTAIN | false → true | FALSE_POSITIVE | EXTERNAL_OR_UNCERTAIN/LOW | NO/false | REVIEW_OR_NO_AUTOMATION | NEEDS_ADMIN_REVIEW | NO/NO | NO/NO | NO | suggestive_not_proof |
| platform_assignment_failure-suggestive_not_proof | EXTERNAL_OR_UNCERTAIN | false → true | FALSE_POSITIVE | EXTERNAL_OR_UNCERTAIN/LOW | NO/false | REVIEW_OR_NO_AUTOMATION | NEEDS_ADMIN_REVIEW | NO/NO | NO/NO | NO | suggestive_not_proof |
| replacement_failure-suggestive_not_proof | EXTERNAL_OR_UNCERTAIN | false → true | FALSE_POSITIVE | EXTERNAL_OR_UNCERTAIN/LOW | NO/false | REVIEW_OR_NO_AUTOMATION | NEEDS_ADMIN_REVIEW | NO/NO | NO/NO | NO | suggestive_not_proof |
| driver_cancellation-received_at_vs_observed_at | EXTERNAL_OR_UNCERTAIN | false → true | FALSE_POSITIVE | EXTERNAL_OR_UNCERTAIN/LOW | NO/false | REVIEW_OR_NO_AUTOMATION | NEEDS_ADMIN_REVIEW | NO/NO | NO/NO | NO | received_at_vs_observed_at |
| failed_pickup-received_at_vs_observed_at | EXTERNAL_OR_UNCERTAIN | false → true | FALSE_POSITIVE | EXTERNAL_OR_UNCERTAIN/LOW | NO/false | REVIEW_OR_NO_AUTOMATION | NEEDS_ADMIN_REVIEW | NO/NO | NO/NO | NO | received_at_vs_observed_at |
| driver_late-received_at_vs_observed_at | EXTERNAL_OR_UNCERTAIN | false → true | FALSE_POSITIVE | EXTERNAL_OR_UNCERTAIN/LOW | NO/false | REVIEW_OR_NO_AUTOMATION | NEEDS_ADMIN_REVIEW | NO/NO | NO/NO | NO | received_at_vs_observed_at |
| driver_offline-received_at_vs_observed_at | EXTERNAL_OR_UNCERTAIN | false → true | FALSE_POSITIVE | EXTERNAL_OR_UNCERTAIN/LOW | NO/false | REVIEW_OR_NO_AUTOMATION | NEEDS_ADMIN_REVIEW | NO/NO | NO/NO | NO | received_at_vs_observed_at |
| rider_cancellation-received_at_vs_observed_at | EXTERNAL_OR_UNCERTAIN | false → true | FALSE_POSITIVE | EXTERNAL_OR_UNCERTAIN/LOW | NO/true | REVIEW_OR_NO_AUTOMATION | NEEDS_ADMIN_REVIEW | NO/NO | NO/NO | NO | received_at_vs_observed_at |
| platform_assignment_failure-received_at_vs_observed_at | EXTERNAL_OR_UNCERTAIN | false → true | FALSE_POSITIVE | EXTERNAL_OR_UNCERTAIN/LOW | NO/false | REVIEW_OR_NO_AUTOMATION | NEEDS_ADMIN_REVIEW | NO/NO | NO/NO | NO | received_at_vs_observed_at |
| replacement_failure-received_at_vs_observed_at | EXTERNAL_OR_UNCERTAIN | false → true | FALSE_POSITIVE | EXTERNAL_OR_UNCERTAIN/LOW | NO/false | REVIEW_OR_NO_AUTOMATION | NEEDS_ADMIN_REVIEW | NO/NO | NO/NO | NO | received_at_vs_observed_at |

- **stale_rider_gps (7 cases):** GPS is explicitly stale (sample age 1800 seconds). Category presence and mandatory-record completeness do not establish fresh causal attribution; the model reports sufficiency while retaining uncertain attribution. Root-cause categories: evidence interpretation; criteria wording; label boundary; downstream guard intentionally compensates.
- **contradictory_timestamps (7 cases):** Cancellation precedes trip start and a trip-start entry is received before it was observed. This is semantic chronology conflict, not a frozen critical-contradiction flag. The model preserves uncertain attribution/review but calls the supplied records sufficient. Root-cause categories: evidence interpretation; contradiction conservatism; criteria wording; downstream guard intentionally compensates.
- **suggestive_not_proof (7 cases):** An uncorroborated might-be-late message suggests risk without proving responsibility. Mandatory categories are present; reliable attribution remains unsupported. Root-cause categories: evidence interpretation; criteria wording; label boundary; downstream guard intentionally compensates.
- **received_at_vs_observed_at (7 cases):** An offline event observed one hour earlier is only received at incident time. Receipt time is not event time or contemporaneous proof of driver availability. Root-cause categories: evidence interpretation; criteria wording; label boundary; downstream guard intentionally compensates.

Cause assessments are offline inferences from recorded evidence and outputs, not provider explanations. Categorical adapter mapping is exact in all 28.

## Safety strata

Strata overlap. Accuracy below is classification only; automation eligibility comes from unchanged frozen labels.

Unsafe raw includes adverse errors and waiver errors before confidence/external-cause/cross-question gates. Canonical unsafe raw adverse remains 0; this additional audit finds 11 raw waiver candidates on mandatory-review cases (4 uncertain network-loss, 7 impossible-assignment cases), all contained. Policy-ineligible candidates alone are not labeled factual errors. These are distinct from the 28 sufficiency disagreements.

| Stratum | Cases | Correct class | Unsafe raw | Unsafe guarded | Safe automation | Review |
|---|---:|---:|---:|---:|---:|---:|
| DRIVER_CAUSED LEVEL_1 | 20 | 20/20 | 0 | 0 | 5 | 15 |
| DRIVER_CAUSED LEVEL_2 | 6 | 6/6 | 0 | 0 | 0 | 6 |
| PLATFORM_CAUSED | 21 | 21/21 | 7 | 0 | 7 | 14 |
| VALID_WAIVED | 3 | 3/3 | 0 | 0 | 3 | 0 |
| EXTERNAL_OR_UNCERTAIN | 63 | 52/63 | 4 | 0 | 0 | 63 |
| Deliberate unavailability | 3 | 3/3 | 0 | 0 | 0 | 3 |
| Conflicting commitments | 3 | 3/3 | 0 | 0 | 0 | 3 |
| Missing evidence | 7 | 7/7 | 0 | 0 | 0 | 7 |
| Contradictory evidence | 14 | 9/14 | 0 | 0 | 0 | 14 |
| Safe uphold | 8 | 8/8 | 0 | 0 | 5 | 3 |
| Safe waive | 10 | 10/10 | 0 | 0 | 10 | 0 |
| Mandatory review | 83 | 72/83 | 11 | 0 | 0 | 83 |

## Minimality and bounded ablation

V3→V4 changes only externalCauseMaterial, needsHumanReview. V4→V5 changes only needsHumanReview. V5 adds zero questions; total bounded questions 8. Sufficiency and severity predicates are unchanged.

| Fixed V5 outputs with donor predicates | Safe upholds | Safe waives | Reviews | Unsafe raw | Unsafe guarded |
|---|---:|---:|---:|---:|---:|
| V3: externalCauseMaterial | 5 | 2 | 106 | 11 | 0 |
| V3: needsHumanReview | 5 | 3 | 105 | 3 | 0 |
| V3: externalCauseMaterial + needsHumanReview | 5 | 0 | 108 | 3 | 0 |
| V4: externalCauseMaterial | 5 | 10 | 98 | 11 | 0 |
| V4: needsHumanReview | 0 | 10 | 103 | 8 | 0 |
| V4: externalCauseMaterial + needsHumanReview | 0 | 10 | 103 | 8 | 0 |

These are cached-output causal replays, not shortened-prompt inference. The observed route contribution of each changed predicate is explicit; irreducibility of the wording is unmeasured. Retain V5 unchanged rather than adding V6 or weakening evidence rules.

Waiver recovery needs both the V4 distinction between an authenticated valid administrative/rider release and a material external cause, and bounded review wording. Swapping only V3 external-cause answers leaves 2/10 waives; only V3 review leaves 3/10; both leave 0/10. V5 preserves the five ordinary safe upholds because its review question distinguishes them from serious unresolved reliability cases: replacing only review with V4 collapses safe upholds to 0. All three V3 deliberate-unavailability cases retain identical attribution, sufficiency, platform/external and severity answers in V5; needsHumanReview changes NO→YES and removes their raw adverse recommendation. The factual guard remains unchanged. Exactly 15 safe automated routes (5 uphold + 10 waive) leave 98 reviews; 83 mandatory-review labels plus 15 other conservative/policy reviews.

The machine-readable minimality report contains every decision and guard failure for each of the ten eligible waivers, five preserved upholds and three removed V3 unsafe adverse cases.

Remaining freeze blockers: adequate Luna development and VALID_WAIVED coverage, Luna consistency and an adequate common-cohort comparison, then final selection and configuration freeze. Human-final calibration remains zero; production consequences remain off.
