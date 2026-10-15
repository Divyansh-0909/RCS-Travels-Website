# Search provider-light diagnostics — 7 October 2026

Development only. No provider calls, new retries, labels/split changes, parser changes or cache invalidations.

## Eight apparent location inventions

All eight are existing source pickup locations assigned to an absent drop role. Keep eight raw wrong-role failures and the legacy intermediate count. Fabricated geography among these eight: 0; authoritative-state violations: 0. Diagnostic BookingDraft contains the wrong role; ROLE_CONFLICT prevents Places and S4 form adoption.

| Case | Query | Candidate span/text | Literal/source-valid | Places | Diagnostic/adopted draft | Selection/submission | Classification |
|---|---|---|---|---|---|---|---|
| core-date-only-001 | tomorrow from Pari Chowk | 14..24: Pari Chowk | YES/YES | NO | YES/NO | NO/NO | Intermediate artifact; raw wrong role |
| core-date-only-004 | tomorrow from Botanical Garden | 14..30: Botanical Garden | YES/YES | NO | YES/NO | NO/NO | Intermediate artifact; raw wrong role |
| core-date-only-010 | tomorrow from Delta 1 | 14..21: Delta 1 | YES/YES | NO | YES/NO | NO/NO | Intermediate artifact; raw wrong role |
| core-date-only-016 | tomorrow from Central Station | 14..29: Central Station | YES/YES | NO | YES/NO | NO/NO | Intermediate artifact; raw wrong role |
| core-date-only-019 | tomorrow from Civic Centre | 14..26: Civic Centre | YES/YES | NO | YES/NO | NO/NO | Intermediate artifact; raw wrong role |
| core-time-only-001 | cab at 5 PM from Pari Chowk | 17..27: Pari Chowk | YES/YES | NO | YES/NO | NO/NO | Intermediate artifact; raw wrong role |
| core-time-only-010 | cab at 7 PM from Delta 1 | 17..24: Delta 1 | YES/YES | NO | YES/NO | NO/NO | Intermediate artifact; raw wrong role |
| core-time-only-011 | cab in the evening from Garden Gate 3 | 24..37: Garden Gate 3 | YES/YES | NO | YES/NO | NO/NO | Intermediate artifact; raw wrong role |

Per-case raw decisions, confidence, candidate provenance, expected roles, validation and authority paths are in output/provider-light-2026-10-07/search-eight-locations.json.

## Remaining routing miss

core-standalone-003: Delta 2. Jev returned LOCATION_SEARCH with SIMPLE complexity, an invalid cross-question pair. Draft schema rejects it and providerFailure resets routing to UNCLEAR_OR_UNRELATED/NOT_APPLICABLE, requiring Luna fallback.

Offline fake replay reproduces rejection and confirms the valid pair succeeds. No generalized parser defect was demonstrated. No code override is made; current interpreted query-type accuracy stays 130/131. Raw provider query-type accuracy is 131/131; raw complexity accuracy is 130/131.

## Metric layers

- **locations:** Raw selected candidate in an absent role remains a provider error. Intermediate absent-role assignment retains legacy count. Final error requires invalid adoption/grounding or submission; rejected diagnostics are counted as blocked, never as correct completions.
- **conflictingTimes:** Raw temporal choices and failures are retained; intermediate ambiguous/component outputs and TEMPORAL_CONFLICT are measured. Final error means conflicting time silently resolved in an adopted draft.
- **conflictingVehicles:** Raw class/strength/ANY/exclusion choices are retained; source-binding rejects and intermediate ambiguity are separate. Final error means an unsupported or conflicting preference silently adopted.
- **unsupportedIntent:** Raw unsupported-service choice is retained. Intermediate unsupportedRequests recall and issue preservation are measured. Final loss means adopted state or submission silently discards supported evidence of unsupported intent.
- **roleReversal:** Compare source-owned pickup/drop spans with frozen role labels. Report raw candidate assignment, intermediate reversal count and adopted reversal count separately.
- **missingFields:** Mandatory requirements derive from deterministic policy, not provider guesses. Report intermediate and adopted requirement recall/false positives; raw choice accuracy is not a missing-fields metric.
- **candidateSpans:** Exact UTF-16 offsets, candidate IDs, source query ownership and revision are required at every stage. Literal validity is distinct from correct span/role and canonical selected-place validity.

All 131 cached attempts stay in the intermediate report. S4 adoption accepts 116 and rejects 15; the 116 include one incomplete Places case and two unresolved standalone candidates. They retain missing requirements and cannot authorize submission. Adoption-probe selected locations/submissions: 0. Full 222-case and selected canonical-place safety are unmeasured. Completed subset remains 113. Caught failures remain errors and pending work.
