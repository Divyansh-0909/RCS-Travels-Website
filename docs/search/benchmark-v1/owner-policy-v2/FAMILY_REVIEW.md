# Search V1 remaining family review

The owner approved the original **178 / 178** certified cases. Their labels are unchanged. P2–P5 are frozen.

Of the former 142 review cases, **21** now follow the explicit owner policies. **121 cases in 19 families** still need judgment.

The proposal is not frozen. No held-out inference has run. The 40 exploratory inputs remain unscored.

Reply `APPROVE FAMILY <family-id>` or `APPROVE EXCEPT <case-ids>`; corrections may identify a field. Each family has the same judgment rule. Different locations, cars and exact times are deterministic substitutions, not additional decisions.

The weekday qualifier policy is approved. Five next-Friday records retain an unscored resolved date because the existing application has no calendar-week start convention. This is a separately recorded implementation detail; no Monday/Sunday default was inserted into labels.

## partial-passengers — 7 cases

**IDs:** core-partial-003, core-partial-007, core-partial-011, core-partial-015, core-partial-019, core-partial-023, core-partial-027

**Judgment fields:** unsupportedRequests, fallbackExpected. All unrelated supported literal fields retain their prior labels.

**Review:** Confirm advisory passenger count is retained, with unsupported enforcement disclosed; missing fields alone do not trigger Luna.

**Recommended:** Preserve PASSENGER_COUNT; no fallback solely for passengers.

**Alternative:** Request explicit clarification about enforceable capacity; do not invent enforcement.

| Representative query | Proposed route | Pickup → drop | Vehicle / timing | Missing / ambiguity / unsupported |
|---|---|---|---|---|
| 4 people tomorrow 7 PM | BOOKING_REQUEST / SIMPLE / fallback NOT_REQUIRED | unspecified → unspecified | {"vehicle":{"state":"UNSPECIFIED"},"timing":"SCHEDULED","date":{"state":"RESOLVED","value":{"kind":"RELATIVE","anchor":"TOMORROW"}},"time":{"state":"RESOLVED","value":{"kind":"CLOCK","hour":7,"minute":0,"notation":"H12","period":"PM","precision":"EXACT"}}} | {"missing":["pickup","drop","vehicleClass"],"ambiguity":[],"unsupported":["PASSENGER_COUNT"]} |
| Please: 4 people tomorrow 10 PM | BOOKING_REQUEST / SIMPLE / fallback NOT_REQUIRED | unspecified → unspecified | {"vehicle":{"state":"UNSPECIFIED"},"timing":"SCHEDULED","date":{"state":"RESOLVED","value":{"kind":"RELATIVE","anchor":"TOMORROW"}},"time":{"state":"RESOLVED","value":{"kind":"CLOCK","hour":10,"minute":0,"notation":"H12","period":"PM","precision":"EXACT"}}} | {"missing":["pickup","drop","vehicleClass"],"ambiguity":[],"unsupported":["PASSENGER_COUNT"]} |

**Variant exceptions:** none approved. Full labels for every ID are in [REVIEW_REQUIRED.json](REVIEW_REQUIRED.json).

## time-daypart — 5 cases

**IDs:** core-time-only-002, core-time-only-005, core-time-only-008, core-time-only-011, core-time-only-014

**Judgment fields:** ambiguities, fallbackExpected. All unrelated supported literal fields retain their prior labels.

**Review:** Confirm a daypart requires a time follow-up rather than an invented exact time.

**Recommended:** Keep DAYPART and clarify exact time.

**Alternative:** No exact-time interpretation is frozen.

| Representative query | Proposed route | Pickup → drop | Vehicle / timing | Missing / ambiguity / unsupported |
|---|---|---|---|---|
| cab in the evening from Jaypee main gate | BOOKING_REQUEST / SIMPLE / fallback NOT_REQUIRED | Jaypee main gate [24,40) → unspecified | {"vehicle":{"state":"UNSPECIFIED"},"timing":"SCHEDULED","date":{"state":"UNSPECIFIED"},"time":{"state":"RESOLVED","value":{"kind":"DAYPART","value":"EVENING"}}} | {"missing":["drop","vehicleClass","timing.date"],"ambiguity":["EXACT_TIME_REQUIRED"],"unsupported":[]} |
| cab in the evening from Lotus Circle | BOOKING_REQUEST / SIMPLE / fallback NOT_REQUIRED | Lotus Circle [24,36) → unspecified | {"vehicle":{"state":"UNSPECIFIED"},"timing":"SCHEDULED","date":{"state":"UNSPECIFIED"},"time":{"state":"RESOLVED","value":{"kind":"DAYPART","value":"EVENING"}}} | {"missing":["drop","vehicleClass","timing.date"],"ambiguity":["EXACT_TIME_REQUIRED"],"unsupported":[]} |

**Variant exceptions:** none approved. Full labels for every ID are in [REVIEW_REQUIRED.json](REVIEW_REQUIRED.json).

## time-approximate — 5 cases

**IDs:** core-time-only-003, core-time-only-006, core-time-only-009, core-time-only-012, core-time-only-015

**Judgment fields:** ambiguities, fallbackExpected. All unrelated supported literal fields retain their prior labels.

**Review:** Confirm approximate H12 clock without period requires AM/PM clarification.

**Recommended:** Keep approximate hour; clarify period.

**Alternative:** No default AM/PM.

| Representative query | Proposed route | Pickup → drop | Vehicle / timing | Missing / ambiguity / unsupported |
|---|---|---|---|---|
| cab around 7 from Delta 2 | BOOKING_REQUEST / SIMPLE / fallback NOT_REQUIRED | Delta 2 [18,25) → unspecified | {"vehicle":{"state":"UNSPECIFIED"},"timing":"SCHEDULED","date":{"state":"UNSPECIFIED"},"time":{"state":"RESOLVED","value":{"kind":"CLOCK","hour":7,"minute":0,"notation":"H12","period":null,"precision":"APPROXIMATE"}}} | {"missing":["drop","vehicleClass","timing.date"],"ambiguity":["TIME_PERIOD_REQUIRED"],"unsupported":[]} |
| cab around 5 from Museum Road | BOOKING_REQUEST / SIMPLE / fallback NOT_REQUIRED | Museum Road [18,29) → unspecified | {"vehicle":{"state":"UNSPECIFIED"},"timing":"SCHEDULED","date":{"state":"UNSPECIFIED"},"time":{"state":"RESOLVED","value":{"kind":"CLOCK","hour":5,"minute":0,"notation":"H12","period":null,"precision":"APPROXIMATE"}}} | {"missing":["drop","vehicleClass","timing.date"],"ambiguity":["TIME_PERIOD_REQUIRED"],"unsupported":[]} |

**Variant exceptions:** none approved. Full labels for every ID are in [REVIEW_REQUIRED.json](REVIEW_REQUIRED.json).

## role-hinglish-order — 7 cases

**IDs:** core-role-order-001, core-role-order-006, core-role-order-011, core-role-order-016, core-role-order-021, core-role-order-026, core-role-order-031

**Judgment fields:** pickupSpans, dropSpans, complexity, fallbackExpected. All unrelated supported literal fields retain their prior labels.

**Review:** Confirm the proposed pickup/drop direction and whether the simple route is faithful.

**Recommended:** Use the explicit origin/destination markers; never reverse endpoints.

**Alternative:** Require clarification if either directional span is not trustworthy.

**Review:** Confirm raw se/jaana hai markers express direction without translation.

**Recommended:** Preserve source spans; evaluate this marker-specific case separately.

**Alternative:** Clarify direction if raw wording is ambiguous.

| Representative query | Proposed route | Pickup → drop | Vehicle / timing | Missing / ambiguity / unsupported |
|---|---|---|---|---|
| Sunrise Metro jaana hai Pari Chowk se | BOOKING_REQUEST / SIMPLE / fallback NOT_REQUIRED | Pari Chowk [24,34) → Sunrise Metro [0,13) | {"vehicle":{"state":"UNSPECIFIED"},"timing":"UNSPECIFIED","date":{"state":"UNSPECIFIED"},"time":{"state":"UNSPECIFIED"}} | {"missing":["vehicleClass","timing"],"ambiguity":[],"unsupported":[]} |
| Please: Sunrise Metro jaana hai Pari Chowk se | BOOKING_REQUEST / SIMPLE / fallback NOT_REQUIRED | Pari Chowk [32,42) → Sunrise Metro [8,21) | {"vehicle":{"state":"UNSPECIFIED"},"timing":"UNSPECIFIED","date":{"state":"UNSPECIFIED"},"time":{"state":"UNSPECIFIED"}} | {"missing":["vehicleClass","timing"],"ambiguity":[],"unsupported":[]} |

**Variant exceptions:** none approved. Full labels for every ID are in [REVIEW_REQUIRED.json](REVIEW_REQUIRED.json).

## role-at-drop — 7 cases

**IDs:** core-role-order-002, core-role-order-007, core-role-order-012, core-role-order-017, core-role-order-022, core-role-order-027, core-role-order-032

**Judgment fields:** pickupSpans, dropSpans, complexity, fallbackExpected. All unrelated supported literal fields retain their prior labels.

**Review:** Confirm the proposed pickup/drop direction and whether the simple route is faithful.

**Recommended:** Use the explicit origin/destination markers; never reverse endpoints.

**Alternative:** Require clarification if either directional span is not trustworthy.

| Representative query | Proposed route | Pickup → drop | Vehicle / timing | Missing / ambiguity / unsupported |
|---|---|---|---|---|
| pick me at Jaypee main gate, drop at Pine Avenue | BOOKING_REQUEST / SIMPLE / fallback NOT_REQUIRED | Jaypee main gate [11,27) → Pine Avenue [37,48) | {"vehicle":{"state":"UNSPECIFIED"},"timing":"UNSPECIFIED","date":{"state":"UNSPECIFIED"},"time":{"state":"UNSPECIFIED"}} | {"missing":["vehicleClass","timing"],"ambiguity":[],"unsupported":[]} |
| Please: pick me at Jaypee main gate, drop at Pine Avenue | BOOKING_REQUEST / SIMPLE / fallback NOT_REQUIRED | Jaypee main gate [19,35) → Pine Avenue [45,56) | {"vehicle":{"state":"UNSPECIFIED"},"timing":"UNSPECIFIED","date":{"state":"UNSPECIFIED"},"time":{"state":"UNSPECIFIED"}} | {"missing":["vehicleClass","timing"],"ambiguity":[],"unsupported":[]} |

**Variant exceptions:** none approved. Full labels for every ID are in [REVIEW_REQUIRED.json](REVIEW_REQUIRED.json).

## role-drop-before-from — 7 cases

**IDs:** core-role-order-003, core-role-order-008, core-role-order-013, core-role-order-018, core-role-order-023, core-role-order-028, core-role-order-033

**Judgment fields:** pickupSpans, dropSpans, complexity, fallbackExpected. All unrelated supported literal fields retain their prior labels.

**Review:** Confirm the proposed pickup/drop direction and whether the simple route is faithful.

**Recommended:** Use the explicit origin/destination markers; never reverse endpoints.

**Alternative:** Require clarification if either directional span is not trustworthy.

| Representative query | Proposed route | Pickup → drop | Vehicle / timing | Missing / ambiguity / unsupported |
|---|---|---|---|---|
| drop me at Delta 1 from Delta 2 | BOOKING_REQUEST / SIMPLE / fallback NOT_REQUIRED | Delta 2 [24,31) → Delta 1 [11,18) | {"vehicle":{"state":"UNSPECIFIED"},"timing":"UNSPECIFIED","date":{"state":"UNSPECIFIED"},"time":{"state":"UNSPECIFIED"}} | {"missing":["vehicleClass","timing"],"ambiguity":[],"unsupported":[]} |
| Please: drop me at Delta 1 from Delta 2 | BOOKING_REQUEST / SIMPLE / fallback NOT_REQUIRED | Delta 2 [32,39) → Delta 1 [19,26) | {"vehicle":{"state":"UNSPECIFIED"},"timing":"UNSPECIFIED","date":{"state":"UNSPECIFIED"},"time":{"state":"UNSPECIFIED"}} | {"missing":["vehicleClass","timing"],"ambiguity":[],"unsupported":[]} |

**Variant exceptions:** none approved. Full labels for every ID are in [REVIEW_REQUIRED.json](REVIEW_REQUIRED.json).

## role-repeated-place — 7 cases

**IDs:** core-role-order-004, core-role-order-009, core-role-order-014, core-role-order-019, core-role-order-024, core-role-order-029, core-role-order-034

**Judgment fields:** pickupSpans, dropSpans, ambiguities. All unrelated supported literal fields retain their prior labels.

**Review:** Confirm equivalent repeated source occurrences and distinct endpoint roles.

**Recommended:** Allow labelled equivalent pickup occurrences; preserve actual destination.

**Alternative:** Require role clarification when occurrences disagree.

| Representative query | Proposed route | Pickup → drop | Vehicle / timing | Missing / ambiguity / unsupported |
|---|---|---|---|---|
| from Botanical Garden to Garden Gate 3; pickup is Botanical Garden | BOOKING_REQUEST / SIMPLE / fallback NOT_REQUIRED | Botanical Garden [5,21); Botanical Garden [50,66) → Garden Gate 3 [25,38) | {"vehicle":{"state":"UNSPECIFIED"},"timing":"UNSPECIFIED","date":{"state":"UNSPECIFIED"},"time":{"state":"UNSPECIFIED"}} | {"missing":["vehicleClass","timing"],"ambiguity":[],"unsupported":[]} |
| Please: from Botanical Garden to Garden Gate 3; pickup is Botanical Garden | BOOKING_REQUEST / SIMPLE / fallback NOT_REQUIRED | Botanical Garden [13,29); Botanical Garden [58,74) → Garden Gate 3 [33,46) | {"vehicle":{"state":"UNSPECIFIED"},"timing":"UNSPECIFIED","date":{"state":"UNSPECIFIED"},"time":{"state":"UNSPECIFIED"}} | {"missing":["vehicleClass","timing"],"ambiguity":[],"unsupported":[]} |

**Variant exceptions:** none approved. Full labels for every ID are in [REVIEW_REQUIRED.json](REVIEW_REQUIRED.json).

## role-reversed-clause — 7 cases

**IDs:** core-role-order-005, core-role-order-010, core-role-order-015, core-role-order-020, core-role-order-025, core-role-order-030, core-role-order-035

**Judgment fields:** pickupSpans, dropSpans, complexity, fallbackExpected. All unrelated supported literal fields retain their prior labels.

**Review:** Confirm the proposed pickup/drop direction and whether the simple route is faithful.

**Recommended:** Use the explicit origin/destination markers; never reverse endpoints.

**Alternative:** Require clarification if either directional span is not trustworthy.

| Representative query | Proposed route | Pickup → drop | Vehicle / timing | Missing / ambiguity / unsupported |
|---|---|---|---|---|
| destination: West Campus; pickup: Sector 18 Market | BOOKING_REQUEST / SIMPLE / fallback NOT_REQUIRED | Sector 18 Market [34,50) → West Campus [13,24) | {"vehicle":{"state":"UNSPECIFIED"},"timing":"UNSPECIFIED","date":{"state":"UNSPECIFIED"},"time":{"state":"UNSPECIFIED"}} | {"missing":["vehicleClass","timing"],"ambiguity":[],"unsupported":[]} |
| Please: destination: West Campus; pickup: Sector 18 Market | BOOKING_REQUEST / SIMPLE / fallback NOT_REQUIRED | Sector 18 Market [42,58) → West Campus [21,32) | {"vehicle":{"state":"UNSPECIFIED"},"timing":"UNSPECIFIED","date":{"state":"UNSPECIFIED"},"time":{"state":"UNSPECIFIED"}} | {"missing":["vehicleClass","timing"],"ambiguity":[],"unsupported":[]} |

**Variant exceptions:** none approved. Full labels for every ID are in [REVIEW_REQUIRED.json](REVIEW_REQUIRED.json).

## stop-via — 8 cases

**IDs:** core-multi-stop-001, core-multi-stop-003, core-multi-stop-005, core-multi-stop-007, core-multi-stop-009, core-multi-stop-011, core-multi-stop-013, core-multi-stop-015

**Judgment fields:** stopSpans, unsupportedRequests, complexity, fallbackExpected. All unrelated supported literal fields retain their prior labels.

**Review:** Confirm stops are retained and not flattened into a one-way supported booking.

**Recommended:** Preserve STOP and complex fallback where proposed.

**Alternative:** Keep unsupported follow-up if meaning is simple; never discard the stop.

| Representative query | Proposed route | Pickup → drop | Vehicle / timing | Missing / ambiguity / unsupported |
|---|---|---|---|---|
| from Pari Chowk to Sunrise Metro via Lotus Circle | BOOKING_REQUEST / COMPLEX / fallback REQUIRED | Pari Chowk [5,15) → Sunrise Metro [19,32) | {"vehicle":{"state":"UNSPECIFIED"},"timing":"UNSPECIFIED","date":{"state":"UNSPECIFIED"},"time":{"state":"UNSPECIFIED"}} | {"missing":["vehicleClass","timing"],"ambiguity":[],"unsupported":["STOP"]} |
| from Museum Road to hostel gate near the tea stall via Noida Sector 62 | BOOKING_REQUEST / COMPLEX / fallback REQUIRED | Museum Road [5,16) → hostel gate near the tea stall [20,50) | {"vehicle":{"state":"UNSPECIFIED"},"timing":"UNSPECIFIED","date":{"state":"UNSPECIFIED"},"time":{"state":"UNSPECIFIED"}} | {"missing":["vehicleClass","timing"],"ambiguity":[],"unsupported":["STOP"]} |

**Variant exceptions:** none approved. Full labels for every ID are in [REVIEW_REQUIRED.json](REVIEW_REQUIRED.json).

## stop-friend — 7 cases

**IDs:** core-multi-stop-002, core-multi-stop-004, core-multi-stop-006, core-multi-stop-008, core-multi-stop-010, core-multi-stop-012, core-multi-stop-014

**Judgment fields:** stopSpans, unsupportedRequests, complexity, fallbackExpected. All unrelated supported literal fields retain their prior labels.

**Review:** Confirm stops are retained and not flattened into a one-way supported booking.

**Recommended:** Preserve STOP and complex fallback where proposed.

**Alternative:** Keep unsupported follow-up if meaning is simple; never discard the stop.

| Representative query | Proposed route | Pickup → drop | Vehicle / timing | Missing / ambiguity / unsupported |
|---|---|---|---|---|
| pick me from Jaypee main gate, pick my friend at Museum Road, then go to Pine Avenue | BOOKING_REQUEST / COMPLEX / fallback REQUIRED | Jaypee main gate [13,29) → Pine Avenue [73,84) | {"vehicle":{"state":"UNSPECIFIED"},"timing":"UNSPECIFIED","date":{"state":"UNSPECIFIED"},"time":{"state":"UNSPECIFIED"}} | {"missing":["vehicleClass","timing"],"ambiguity":[],"unsupported":["STOP"]} |
| pick me from Lotus Circle, pick my friend at Greater Noida, then go to airport | BOOKING_REQUEST / COMPLEX / fallback REQUIRED | Lotus Circle [13,25) → airport [71,78) | {"vehicle":{"state":"UNSPECIFIED"},"timing":"UNSPECIFIED","date":{"state":"UNSPECIFIED"},"time":{"state":"UNSPECIFIED"}} | {"missing":["vehicleClass","timing"],"ambiguity":[],"unsupported":["STOP"]} |

**Variant exceptions:** none approved. Full labels for every ID are in [REVIEW_REQUIRED.json](REVIEW_REQUIRED.json).

## return-complicated — 7 cases

**IDs:** core-assisted-services-001, core-assisted-services-004, core-assisted-services-007, core-assisted-services-010, core-assisted-services-013, core-assisted-services-016, core-assisted-services-019

**Judgment fields:** unsupportedRequests, complexity, fallbackExpected. All unrelated supported literal fields retain their prior labels.

**Review:** Confirm return intent is preserved without inventing a supported return booking mode.

**Recommended:** Preserve RETURN_JOURNEY and proposed fallback.

**Alternative:** Clarify the return requirement, retaining unsupported intent.

| Representative query | Proposed route | Pickup → drop | Vehicle / timing | Missing / ambiguity / unsupported |
|---|---|---|---|---|
| go from Pari Chowk to Sunrise Metro tomorrow and bring me back in the evening | BOOKING_REQUEST / COMPLEX / fallback REQUIRED | Pari Chowk [8,18) → Sunrise Metro [22,35) | {"vehicle":{"state":"UNSPECIFIED"},"timing":"SCHEDULED","date":{"state":"RESOLVED","value":{"kind":"RELATIVE","anchor":"TOMORROW"}},"time":{"state":"UNSPECIFIED"}} | {"missing":["vehicleClass","timing.time"],"ambiguity":[],"unsupported":["RETURN_JOURNEY"]} |
| go from Civic Centre to Delhi tomorrow and bring me back in the evening | BOOKING_REQUEST / COMPLEX / fallback REQUIRED | Civic Centre [8,20) → Delhi [24,29) | {"vehicle":{"state":"UNSPECIFIED"},"timing":"SCHEDULED","date":{"state":"RESOLVED","value":{"kind":"RELATIVE","anchor":"TOMORROW"}},"time":{"state":"UNSPECIFIED"}} | {"missing":["vehicleClass","timing.time"],"ambiguity":[],"unsupported":["RETURN_JOURNEY"]} |

**Variant exceptions:** none approved. Full labels for every ID are in [REVIEW_REQUIRED.json](REVIEW_REQUIRED.json).

## rental-duration — 7 cases

**IDs:** core-assisted-services-002, core-assisted-services-005, core-assisted-services-008, core-assisted-services-011, core-assisted-services-014, core-assisted-services-017, core-assisted-services-020

**Judgment fields:** unsupportedRequests, complexity, fallbackExpected. All unrelated supported literal fields retain their prior labels.

**Review:** Confirm rental duration is unsupported and cannot become an ordinary one-way ride silently.

**Recommended:** Preserve RENTAL; follow proposed unsupported route.

**Alternative:** Ask about supported service; do not invent a rental mode.

| Representative query | Proposed route | Pickup → drop | Vehicle / timing | Missing / ambiguity / unsupported |
|---|---|---|---|---|
| rent a hatchback for 8 hours from Jaypee main gate | BOOKING_REQUEST / SIMPLE / fallback NOT_REQUIRED | Jaypee main gate [34,50) → unspecified | {"vehicle":{"state":"RESOLVED","value":"hatchback","strength":"REQUIRED","excluded":[]},"timing":"UNSPECIFIED","date":{"state":"UNSPECIFIED"},"time":{"state":"UNSPECIFIED"}} | {"missing":["drop","timing"],"ambiguity":[],"unsupported":["RENTAL"]} |
| rent a suv for 8 hours from college | BOOKING_REQUEST / SIMPLE / fallback NOT_REQUIRED | college [28,35) → unspecified | {"vehicle":{"state":"RESOLVED","value":"suv","strength":"REQUIRED","excluded":[]},"timing":"UNSPECIFIED","date":{"state":"UNSPECIFIED"},"time":{"state":"UNSPECIFIED"}} | {"missing":["drop","timing"],"ambiguity":[],"unsupported":["RENTAL"]} |

**Variant exceptions:** none approved. Full labels for every ID are in [REVIEW_REQUIRED.json](REVIEW_REQUIRED.json).

## conditional-alternative — 8 cases

**IDs:** core-conditional-001, core-conditional-003, core-conditional-005, core-conditional-007, core-conditional-009, core-conditional-011, core-conditional-013, core-conditional-015

**Judgment fields:** dropSpans, complexity, fallbackExpected, unsupportedRequests. All unrelated supported literal fields retain their prior labels.

**Review:** Confirm conditional destinations require interpretation and cannot be resolved by choosing one branch.

**Recommended:** COMPLEX; preserve conditional alternatives.

**Alternative:** Clarify which branch applies before producing an effective destination.

| Representative query | Proposed route | Pickup → drop | Vehicle / timing | Missing / ambiguity / unsupported |
|---|---|---|---|---|
| from Pari Chowk to Sunrise Metro, but if my flight changes take me to Lotus Circle | BOOKING_REQUEST / COMPLEX / fallback REQUIRED | Pari Chowk [5,15) → Sunrise Metro [19,32) | {"vehicle":{"state":"UNSPECIFIED"},"timing":"UNSPECIFIED","date":{"state":"UNSPECIFIED"},"time":{"state":"UNSPECIFIED"}} | {"missing":["vehicleClass","timing"],"ambiguity":[],"unsupported":["CONDITIONAL_PREFERENCE"]} |
| from Museum Road to hostel gate near the tea stall, but if my flight changes take me to Noida Sector 62 | BOOKING_REQUEST / COMPLEX / fallback REQUIRED | Museum Road [5,16) → hostel gate near the tea stall [20,50) | {"vehicle":{"state":"UNSPECIFIED"},"timing":"UNSPECIFIED","date":{"state":"UNSPECIFIED"},"time":{"state":"UNSPECIFIED"}} | {"missing":["vehicleClass","timing"],"ambiguity":[],"unsupported":["CONDITIONAL_PREFERENCE"]} |

**Variant exceptions:** none approved. Full labels for every ID are in [REVIEW_REQUIRED.json](REVIEW_REQUIRED.json).

## conditional-ac — 7 cases

**IDs:** core-conditional-002, core-conditional-004, core-conditional-006, core-conditional-008, core-conditional-010, core-conditional-012, core-conditional-014

**Judgment fields:** unsupportedRequests, complexity, fallbackExpected. All unrelated supported literal fields retain their prior labels.

**Review:** Confirm AC/availability conditions are unsupported and preserved.

**Recommended:** Retain AC_PREFERENCE and CONDITIONAL_PREFERENCE.

**Alternative:** Clarify availability preference without promising enforcement.

| Representative query | Proposed route | Pickup → drop | Vehicle / timing | Missing / ambiguity / unsupported |
|---|---|---|---|---|
| AC car if available from Jaypee main gate to Pine Avenue | BOOKING_REQUEST / COMPLEX / fallback REQUIRED | Jaypee main gate [25,41) → Pine Avenue [45,56) | {"vehicle":{"state":"UNSPECIFIED"},"timing":"UNSPECIFIED","date":{"state":"UNSPECIFIED"},"time":{"state":"UNSPECIFIED"}} | {"missing":["vehicleClass","timing"],"ambiguity":[],"unsupported":["AC_PREFERENCE","CONDITIONAL_PREFERENCE"]} |
| AC car if available from Lotus Circle to airport | BOOKING_REQUEST / COMPLEX / fallback REQUIRED | Lotus Circle [25,37) → airport [41,48) | {"vehicle":{"state":"UNSPECIFIED"},"timing":"UNSPECIFIED","date":{"state":"UNSPECIFIED"},"time":{"state":"UNSPECIFIED"}} | {"missing":["vehicleClass","timing"],"ambiguity":[],"unsupported":["AC_PREFERENCE","CONDITIONAL_PREFERENCE"]} |

**Variant exceptions:** none approved. Full labels for every ID are in [REVIEW_REQUIRED.json](REVIEW_REQUIRED.json).

## conflicting-times — 5 cases

**IDs:** core-ambiguity-conflict-001, core-ambiguity-conflict-006, core-ambiguity-conflict-011, core-ambiguity-conflict-016, core-ambiguity-conflict-021

**Judgment fields:** time, ambiguities, complexity, fallbackExpected. All unrelated supported literal fields retain their prior labels.

**Review:** Confirm conflicting stated times remain ambiguous, with no arbitrary last-clause winner.

**Recommended:** Preserve alternatives and clarify.

**Alternative:** Treat as a correction only after explicit owner-approved interpretation.

| Representative query | Proposed route | Pickup → drop | Vehicle / timing | Missing / ambiguity / unsupported |
|---|---|---|---|---|
| from Pari Chowk to Sunrise Metro tomorrow at 6 PM and at 8 PM | BOOKING_REQUEST / COMPLEX / fallback REQUIRED | Pari Chowk [5,15) → Sunrise Metro [19,32) | {"vehicle":{"state":"UNSPECIFIED"},"timing":"SCHEDULED","date":{"state":"RESOLVED","value":{"kind":"RELATIVE","anchor":"TOMORROW"}},"time":"UNSCORED: UNRESOLVED_POLICY_OR_JUDGMENT"} | {"missing":["vehicleClass"],"ambiguity":["CONFLICTING_TIME"],"unsupported":[]} |
| from airport to Noida Sector 62 tomorrow at 6 PM and at 8 PM | BOOKING_REQUEST / COMPLEX / fallback REQUIRED | airport [5,12) → Noida Sector 62 [16,31) | {"vehicle":{"state":"UNSPECIFIED"},"timing":"SCHEDULED","date":{"state":"RESOLVED","value":{"kind":"RELATIVE","anchor":"TOMORROW"}},"time":"UNSCORED: UNRESOLVED_POLICY_OR_JUDGMENT"} | {"missing":["vehicleClass"],"ambiguity":["CONFLICTING_TIME"],"unsupported":[]} |

**Variant exceptions:** none approved. Full labels for every ID are in [REVIEW_REQUIRED.json](REVIEW_REQUIRED.json).

## vehicle-self-conflict — 5 cases

**IDs:** core-ambiguity-conflict-005, core-ambiguity-conflict-010, core-ambiguity-conflict-015, core-ambiguity-conflict-020, core-ambiguity-conflict-025

**Judgment fields:** vehicle, ambiguities, fallbackExpected. All unrelated supported literal fields retain their prior labels.

**Frozen P5 context:** the negative clause excludes both suv and suv_premium. The positive clause requires suv. This remains a contradiction, not a new policy question; the existing AMBIGUOUS vehicle schema has no exclusion-list member. Both clauses remain in the source query and the separate policy context audit.

**Review:** Confirm required and excluded SUV conflict remains ambiguous.

**Recommended:** AMBIGUOUS; retain both contradictory clauses.

**Alternative:** Ask which clause the user intended; do not silently choose.

| Representative query | Proposed route | Pickup → drop | Vehicle / timing | Missing / ambiguity / unsupported |
|---|---|---|---|---|
| SUV only but no SUV from Sector 18 Market to West Campus | BOOKING_REQUEST / COMPLEX / fallback REQUIRED | Sector 18 Market [25,41) → West Campus [45,56) | {"vehicle":{"state":"AMBIGUOUS","alternatives":["suv"]},"timing":"UNSPECIFIED","date":{"state":"UNSPECIFIED"},"time":{"state":"UNSPECIFIED"}} | {"missing":["vehicleClass","timing"],"ambiguity":["VEHICLE_CONFLICT"],"unsupported":[]} |
| SUV only but no SUV from campus to Jaypee main gate | BOOKING_REQUEST / COMPLEX / fallback REQUIRED | campus [25,31) → Jaypee main gate [35,51) | {"vehicle":{"state":"AMBIGUOUS","alternatives":["suv"]},"timing":"UNSPECIFIED","date":{"state":"UNSPECIFIED"},"time":{"state":"UNSPECIFIED"}} | {"missing":["vehicleClass","timing"],"ambiguity":["VEHICLE_CONFLICT"],"unsupported":[]} |

**Variant exceptions:** none approved. Full labels for every ID are in [REVIEW_REQUIRED.json](REVIEW_REQUIRED.json).

## noisy-route — 5 cases

**IDs:** core-unclear-noisy-candidates-002, core-unclear-noisy-candidates-006, core-unclear-noisy-candidates-010, core-unclear-noisy-candidates-014, core-unclear-noisy-candidates-018

**Judgment fields:** pickupSpans, dropSpans, fallbackExpected, queryType, complexity. All unrelated supported literal fields retain their prior labels.

**Review:** Confirm intended phrases despite noisy directional spelling and expected candidate-failure fallback.

**Recommended:** Retain proposed spans if human-confirmed; fallback on actual candidate miss.

**Alternative:** Clarify route if noisy text cannot establish direction.

**Review:** Confirm the intended query type and interpretation route.

**Recommended:** No class approval for semantic judgment.

**Alternative:** Mark unclear and ask a focused follow-up.

| Representative query | Proposed route | Pickup → drop | Vehicle / timing | Missing / ambiguity / unsupported |
|---|---|---|---|---|
| cab plz frm Jaypee main gate 2 Pine Avenue | BOOKING_REQUEST / SIMPLE / fallback UNSCORED: UNRESOLVED_POLICY_OR_JUDGMENT | Jaypee main gate [12,28) → Pine Avenue [31,42) | {"vehicle":{"state":"UNSPECIFIED"},"timing":"UNSPECIFIED","date":{"state":"UNSPECIFIED"},"time":{"state":"UNSPECIFIED"}} | {"missing":["vehicleClass","timing"],"ambiguity":[],"unsupported":[]} |
| cab plz frm Hilltop Clinic 2 campus | BOOKING_REQUEST / SIMPLE / fallback UNSCORED: UNRESOLVED_POLICY_OR_JUDGMENT | Hilltop Clinic [12,26) → campus [29,35) | {"vehicle":{"state":"UNSPECIFIED"},"timing":"UNSPECIFIED","date":{"state":"UNSPECIFIED"},"time":{"state":"UNSPECIFIED"}} | {"missing":["vehicleClass","timing"],"ambiguity":[],"unsupported":[]} |

**Variant exceptions:** none approved. Full labels for every ID are in [REVIEW_REQUIRED.json](REVIEW_REQUIRED.json).

## overlap-location — 5 cases

**IDs:** core-unclear-noisy-candidates-003, core-unclear-noisy-candidates-007, core-unclear-noisy-candidates-011, core-unclear-noisy-candidates-015, core-unclear-noisy-candidates-019

**Judgment fields:** pickupSpans, fallbackExpected. All unrelated supported literal fields retain their prior labels.

**Review:** Confirm the full landmark phrase must be retained, including near/gate qualifiers.

**Recommended:** Preserve full source span and useful overlap alternatives.

**Alternative:** Clarify landmark precision rather than dropping qualifiers.

| Representative query | Proposed route | Pickup → drop | Vehicle / timing | Missing / ambiguity / unsupported |
|---|---|---|---|---|
| from hostel gate near the tea stall to Delta 1 | BOOKING_REQUEST / SIMPLE / fallback NOT_REQUIRED | hostel gate near the tea stall [5,35) → Delta 1 [39,46) | {"vehicle":{"state":"UNSPECIFIED"},"timing":"UNSPECIFIED","date":{"state":"UNSPECIFIED"},"time":{"state":"UNSPECIFIED"}} | {"missing":["vehicleClass","timing"],"ambiguity":[],"unsupported":[]} |
| from hostel gate near the tea stall to Delhi | BOOKING_REQUEST / SIMPLE / fallback NOT_REQUIRED | hostel gate near the tea stall [5,35) → Delhi [39,44) | {"vehicle":{"state":"UNSPECIFIED"},"timing":"UNSPECIFIED","date":{"state":"UNSPECIFIED"},"time":{"state":"UNSPECIFIED"}} | {"missing":["vehicleClass","timing"],"ambiguity":[],"unsupported":[]} |

**Variant exceptions:** none approved. Full labels for every ID are in [REVIEW_REQUIRED.json](REVIEW_REQUIRED.json).

## changed-mind — 5 cases

**IDs:** core-unclear-noisy-candidates-004, core-unclear-noisy-candidates-008, core-unclear-noisy-candidates-012, core-unclear-noisy-candidates-016, core-unclear-noisy-candidates-020

**Judgment fields:** dropSpans, complexity, fallbackExpected. All unrelated supported literal fields retain their prior labels.

**Review:** Confirm how the explicit actually-use clause changes the destination.

**Recommended:** Preserve correction semantics and proposed complex route.

**Alternative:** Ask which destination is current if the correction is not definitive.

| Representative query | Proposed route | Pickup → drop | Vehicle / timing | Missing / ambiguity / unsupported |
|---|---|---|---|---|
| from Botanical Garden to Garden Gate 3, actually use Amber Tower as destination | BOOKING_REQUEST / COMPLEX / fallback REQUIRED | Botanical Garden [5,21) → Amber Tower [53,64) | {"vehicle":{"state":"UNSPECIFIED"},"timing":"UNSPECIFIED","date":{"state":"UNSPECIFIED"},"time":{"state":"UNSPECIFIED"}} | {"missing":["vehicleClass","timing"],"ambiguity":[],"unsupported":[]} |
| from college to Greater Noida, actually use Delta 2 as destination | BOOKING_REQUEST / COMPLEX / fallback REQUIRED | college [5,12) → Delta 2 [44,51) | {"vehicle":{"state":"UNSPECIFIED"},"timing":"UNSPECIFIED","date":{"state":"UNSPECIFIED"},"time":{"state":"UNSPECIFIED"}} | {"missing":["vehicleClass","timing"],"ambiguity":[],"unsupported":[]} |

**Variant exceptions:** none approved. Full labels for every ID are in [REVIEW_REQUIRED.json](REVIEW_REQUIRED.json).

