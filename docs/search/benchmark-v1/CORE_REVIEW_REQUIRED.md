# Search Benchmark V1 — risk-ordered core review

**PROPOSED. No labels approved or dataset frozen.**

178 cases have an independent class-approval certificate. Class approval still needs the product owner. Review 142 core cases below, grouped by shared decision. The 40 exploratory inputs are unscored and excluded.

Dataset hash: `3517a2aebdd38d2c19beb689abd0a8bfafa6ec8b8162d46da722e935936f4a6b`. Proposed split: 222 development / 98 held-out; template leakage 0.

Approve/correct a family and list any variant exceptions by case ID. Only the listed fields need judgment; query type/complexity shown as context do not imply a request to re-review unrelated deterministic fields.

## Priority 1

### changed-mind (5 cases)

- **Decision:** Confirm how the explicit actually-use clause changes the destination. **Fields:** dropSpans, complexity, fallbackExpected. **Recommended:** Preserve correction semantics and proposed complex route. **Alternative:** Ask which destination is current if the correction is not definitive.

| Case ID | Query | Type / complexity (context) | Proposed labels requiring review |
|---|---|---|---|
| core-unclear-noisy-candidates-004 | from Botanical Garden to Garden Gate 3, actually use Amber Tower as destination | BOOKING_REQUEST / COMPLEX | dropSpans: Amber Tower [53,64) • complexity: COMPLEX • fallbackExpected: REQUIRED |
| core-unclear-noisy-candidates-008 | from Sunrise Metro to Museum Road, actually use airport as destination | BOOKING_REQUEST / COMPLEX | dropSpans: airport [48,55) • complexity: COMPLEX • fallbackExpected: REQUIRED |
| core-unclear-noisy-candidates-012 | from West Campus to Civic Centre, actually use campus as destination | BOOKING_REQUEST / COMPLEX | dropSpans: campus [47,53) • complexity: COMPLEX • fallbackExpected: REQUIRED |
| core-unclear-noisy-candidates-016 | from Central Station to Jaypee main gate near Gate 3, actually use Knowledge Park II as destination | BOOKING_REQUEST / COMPLEX | dropSpans: Knowledge Park II [67,84) • complexity: COMPLEX • fallbackExpected: REQUIRED |
| core-unclear-noisy-candidates-020 | from college to Greater Noida, actually use Delta 2 as destination | BOOKING_REQUEST / COMPLEX | dropSpans: Delta 2 [44,51) • complexity: COMPLEX • fallbackExpected: REQUIRED |

### conditional-ac (7 cases)

- **Decision:** Confirm AC/availability conditions are unsupported and preserved. **Fields:** unsupportedRequests, complexity, fallbackExpected. **Recommended:** Retain AC_PREFERENCE and CONDITIONAL_PREFERENCE. **Alternative:** Clarify availability preference without promising enforcement.

| Case ID | Query | Type / complexity (context) | Proposed labels requiring review |
|---|---|---|---|
| core-conditional-002 | AC car if available from Jaypee main gate to Pine Avenue | BOOKING_REQUEST / COMPLEX | unsupportedRequests: AC_PREFERENCE; CONDITIONAL_PREFERENCE • complexity: COMPLEX • fallbackExpected: REQUIRED |
| core-conditional-004 | AC car if available from Botanical Garden to Garden Gate 3 | BOOKING_REQUEST / COMPLEX | unsupportedRequests: AC_PREFERENCE; CONDITIONAL_PREFERENCE • complexity: COMPLEX • fallbackExpected: REQUIRED |
| core-conditional-006 | AC car if available from North Library to Old Bus Stand | BOOKING_REQUEST / COMPLEX | unsupportedRequests: AC_PREFERENCE; CONDITIONAL_PREFERENCE • complexity: COMPLEX • fallbackExpected: REQUIRED |
| core-conditional-008 | AC car if available from Sunrise Metro to Museum Road | BOOKING_REQUEST / COMPLEX | unsupportedRequests: AC_PREFERENCE; CONDITIONAL_PREFERENCE • complexity: COMPLEX • fallbackExpected: REQUIRED |
| core-conditional-010 | AC car if available from Delta 1 to Amber Tower | BOOKING_REQUEST / COMPLEX | unsupportedRequests: AC_PREFERENCE; CONDITIONAL_PREFERENCE • complexity: COMPLEX • fallbackExpected: REQUIRED |
| core-conditional-012 | AC car if available from West Campus to Civic Centre | BOOKING_REQUEST / COMPLEX | unsupportedRequests: AC_PREFERENCE; CONDITIONAL_PREFERENCE • complexity: COMPLEX • fallbackExpected: REQUIRED |
| core-conditional-014 | AC car if available from Lotus Circle to airport | BOOKING_REQUEST / COMPLEX | unsupportedRequests: AC_PREFERENCE; CONDITIONAL_PREFERENCE • complexity: COMPLEX • fallbackExpected: REQUIRED |

### conditional-alternative (8 cases)

- **Decision:** Confirm conditional destinations require interpretation and cannot be resolved by choosing one branch. **Fields:** dropSpans, complexity, fallbackExpected, unsupportedRequests. **Recommended:** COMPLEX; preserve conditional alternatives. **Alternative:** Clarify which branch applies before producing an effective destination.

| Case ID | Query | Type / complexity (context) | Proposed labels requiring review |
|---|---|---|---|
| core-conditional-001 | from Pari Chowk to Sunrise Metro, but if my flight changes take me to Lotus Circle | BOOKING_REQUEST / COMPLEX | dropSpans: Sunrise Metro [19,32) • complexity: COMPLEX • fallbackExpected: REQUIRED • unsupportedRequests: CONDITIONAL_PREFERENCE |
| core-conditional-003 | from Delta 2 to Delta 1, but if my flight changes take me to Central Station | BOOKING_REQUEST / COMPLEX | dropSpans: Delta 1 [16,23) • complexity: COMPLEX • fallbackExpected: REQUIRED • unsupportedRequests: CONDITIONAL_PREFERENCE |
| core-conditional-005 | from Sector 18 Market to West Campus, but if my flight changes take me to Hilltop Clinic | BOOKING_REQUEST / COMPLEX | dropSpans: West Campus [25,36) • complexity: COMPLEX • fallbackExpected: REQUIRED • unsupportedRequests: CONDITIONAL_PREFERENCE |
| core-conditional-007 | from Lakeview Hostel to Lotus Circle, but if my flight changes take me to college | BOOKING_REQUEST / COMPLEX | dropSpans: Lotus Circle [24,36) • complexity: COMPLEX • fallbackExpected: REQUIRED • unsupportedRequests: CONDITIONAL_PREFERENCE |
| core-conditional-009 | from Pine Avenue to Central Station, but if my flight changes take me to hostel gate near the tea stall | BOOKING_REQUEST / COMPLEX | dropSpans: Central Station [20,35) • complexity: COMPLEX • fallbackExpected: REQUIRED • unsupportedRequests: CONDITIONAL_PREFERENCE |
| core-conditional-011 | from Garden Gate 3 to Hilltop Clinic, but if my flight changes take me to IGI | BOOKING_REQUEST / COMPLEX | dropSpans: Hilltop Clinic [22,36) • complexity: COMPLEX • fallbackExpected: REQUIRED • unsupportedRequests: CONDITIONAL_PREFERENCE |
| core-conditional-013 | from Old Bus Stand to college, but if my flight changes take me to Delhi | BOOKING_REQUEST / COMPLEX | dropSpans: college [22,29) • complexity: COMPLEX • fallbackExpected: REQUIRED • unsupportedRequests: CONDITIONAL_PREFERENCE |
| core-conditional-015 | from Museum Road to hostel gate near the tea stall, but if my flight changes take me to Noida Sector 62 | BOOKING_REQUEST / COMPLEX | dropSpans: hostel gate near the tea stall [20,50) • complexity: COMPLEX • fallbackExpected: REQUIRED • unsupportedRequests: CONDITIONAL_PREFERENCE |

### conflicting-times (5 cases)

- **Decision:** Confirm conflicting stated times remain ambiguous, with no arbitrary last-clause winner. **Fields:** time, ambiguities, complexity, fallbackExpected. **Recommended:** Preserve alternatives and clarify. **Alternative:** Treat as a correction only after explicit owner-approved interpretation.

| Case ID | Query | Type / complexity (context) | Proposed labels requiring review |
|---|---|---|---|
| core-ambiguity-conflict-001 | from Pari Chowk to Sunrise Metro tomorrow at 6 PM and at 8 PM | BOOKING_REQUEST / COMPLEX | time: UNLABELLED (UNRESOLVED_POLICY_OR_JUDGMENT) • ambiguities: CONFLICTING_TIME • complexity: COMPLEX • fallbackExpected: REQUIRED |
| core-ambiguity-conflict-006 | from North Library to Old Bus Stand tomorrow at 6 PM and at 8 PM | BOOKING_REQUEST / COMPLEX | time: UNLABELLED (UNRESOLVED_POLICY_OR_JUDGMENT) • ambiguities: CONFLICTING_TIME • complexity: COMPLEX • fallbackExpected: REQUIRED |
| core-ambiguity-conflict-011 | from Garden Gate 3 to Hilltop Clinic tomorrow at 6 PM and at 8 PM | BOOKING_REQUEST / COMPLEX | time: UNLABELLED (UNRESOLVED_POLICY_OR_JUDGMENT) • ambiguities: CONFLICTING_TIME • complexity: COMPLEX • fallbackExpected: REQUIRED |
| core-ambiguity-conflict-016 | from Central Station to Jaypee main gate near Gate 3 tomorrow at 6 PM and at 8 PM | BOOKING_REQUEST / COMPLEX | time: UNLABELLED (UNRESOLVED_POLICY_OR_JUDGMENT) • ambiguities: CONFLICTING_TIME • complexity: COMPLEX • fallbackExpected: REQUIRED |
| core-ambiguity-conflict-021 | from airport to Noida Sector 62 tomorrow at 6 PM and at 8 PM | BOOKING_REQUEST / COMPLEX | time: UNLABELLED (UNRESOLVED_POLICY_OR_JUDGMENT) • ambiguities: CONFLICTING_TIME • complexity: COMPLEX • fallbackExpected: REQUIRED |

### non-ist (5 cases)

- **Decision:** Decide only the policy-specific fields listed below; other direct labels remain proposed. **Fields:** policy-specific fields. **Recommended:** Keep affected semantic resolution NOT_LABELLED. **Alternative:** Choose one of the explicit policy options.
- **Unresolved policy:** NON_IST_TIMEZONE. Define how an explicit non-IST local time is accepted. **Options:** Clarify and convert explicitly to IST / Support explicit IANA zone with date/clock confirmation / Do not support non-IST booking interpretation. **Effect:** Changes UTC scheduledAt and daylight-saving ambiguity handling; no resolved timestamp metric yet.

| Case ID | Query | Type / complexity (context) | Proposed labels requiring review |
|---|---|---|---|
| core-ambiguity-conflict-004 | from Botanical Garden to Garden Gate 3 tomorrow at 8 PM London time | BOOKING_REQUEST / SIMPLE | resolvedDate: UNLABELLED (UNRESOLVED_POLICY_OR_JUDGMENT) • resolvedTime: UNLABELLED (UNRESOLVED_POLICY_OR_JUDGMENT) |
| core-ambiguity-conflict-009 | from Pine Avenue to Central Station tomorrow at 6 PM London time | BOOKING_REQUEST / SIMPLE | resolvedDate: UNLABELLED (UNRESOLVED_POLICY_OR_JUDGMENT) • resolvedTime: UNLABELLED (UNRESOLVED_POLICY_OR_JUDGMENT) |
| core-ambiguity-conflict-014 | from Lotus Circle to airport tomorrow at 11 PM London time | BOOKING_REQUEST / SIMPLE | resolvedDate: UNLABELLED (UNRESOLVED_POLICY_OR_JUDGMENT) • resolvedTime: UNLABELLED (UNRESOLVED_POLICY_OR_JUDGMENT) |
| core-ambiguity-conflict-019 | from Civic Centre to Delhi tomorrow at 9 PM London time | BOOKING_REQUEST / SIMPLE | resolvedDate: UNLABELLED (UNRESOLVED_POLICY_OR_JUDGMENT) • resolvedTime: UNLABELLED (UNRESOLVED_POLICY_OR_JUDGMENT) |
| core-ambiguity-conflict-024 | from IGI to Pari Chowk tomorrow at 7 PM London time | BOOKING_REQUEST / SIMPLE | resolvedDate: UNLABELLED (UNRESOLVED_POLICY_OR_JUDGMENT) • resolvedTime: UNLABELLED (UNRESOLVED_POLICY_OR_JUDGMENT) |

### omitted-year (5 cases)

- **Decision:** Decide only the policy-specific fields listed below; other direct labels remain proposed. **Fields:** policy-specific fields. **Recommended:** Keep affected semantic resolution NOT_LABELLED. **Alternative:** Choose one of the explicit policy options.
- **Unresolved policy:** OMITTED_YEAR_SEMANTICS. Choose an omitted-year rule; the extracted month/day remains unchanged. **Options:** Always clarify the year / Current year if valid, otherwise next year / Next future occurrence. **Effect:** Changes timestamp resolution and scheduling eligibility; do not score resolvedDate until frozen.

| Case ID | Query | Type / complexity (context) | Proposed labels requiring review |
|---|---|---|---|
| core-ambiguity-conflict-003 | from Delta 2 to Delta 1 on 5 December at 7 PM | BOOKING_REQUEST / SIMPLE | resolvedDate: UNLABELLED (UNRESOLVED_POLICY_OR_JUDGMENT) |
| core-ambiguity-conflict-008 | from Sunrise Metro to Museum Road on 5 December at 5 PM | BOOKING_REQUEST / SIMPLE | resolvedDate: UNLABELLED (UNRESOLVED_POLICY_OR_JUDGMENT) |
| core-ambiguity-conflict-013 | from Old Bus Stand to college on 5 December at 10 PM | BOOKING_REQUEST / SIMPLE | resolvedDate: UNLABELLED (UNRESOLVED_POLICY_OR_JUDGMENT) |
| core-ambiguity-conflict-018 | from Hilltop Clinic to campus on 5 December at 8 PM | BOOKING_REQUEST / SIMPLE | resolvedDate: UNLABELLED (UNRESOLVED_POLICY_OR_JUDGMENT) |
| core-ambiguity-conflict-023 | from Jaypee main gate near Gate 3 to City Centre on 5 December at 6 PM | BOOKING_REQUEST / SIMPLE | resolvedDate: UNLABELLED (UNRESOLVED_POLICY_OR_JUDGMENT) |

### rental-duration (7 cases)

- **Decision:** Confirm rental duration is unsupported and cannot become an ordinary one-way ride silently. **Fields:** unsupportedRequests, complexity, fallbackExpected. **Recommended:** Preserve RENTAL; follow proposed unsupported route. **Alternative:** Ask about supported service; do not invent a rental mode.

| Case ID | Query | Type / complexity (context) | Proposed labels requiring review |
|---|---|---|---|
| core-assisted-services-002 | rent a hatchback for 8 hours from Jaypee main gate | BOOKING_REQUEST / SIMPLE | unsupportedRequests: RENTAL • complexity: SIMPLE • fallbackExpected: NOT_REQUIRED |
| core-assisted-services-005 | rent a sedan for 8 hours from Sector 18 Market | BOOKING_REQUEST / SIMPLE | unsupportedRequests: RENTAL • complexity: SIMPLE • fallbackExpected: NOT_REQUIRED |
| core-assisted-services-008 | rent a suv for 8 hours from Sunrise Metro | BOOKING_REQUEST / SIMPLE | unsupportedRequests: RENTAL • complexity: SIMPLE • fallbackExpected: NOT_REQUIRED |
| core-assisted-services-011 | rent a premium SUV for 8 hours from Garden Gate 3 | BOOKING_REQUEST / SIMPLE | unsupportedRequests: RENTAL • complexity: SIMPLE • fallbackExpected: NOT_REQUIRED |
| core-assisted-services-014 | rent a hatchback for 8 hours from Lotus Circle | BOOKING_REQUEST / SIMPLE | unsupportedRequests: RENTAL • complexity: SIMPLE • fallbackExpected: NOT_REQUIRED |
| core-assisted-services-017 | rent a sedan for 8 hours from Amber Tower | BOOKING_REQUEST / SIMPLE | unsupportedRequests: RENTAL • complexity: SIMPLE • fallbackExpected: NOT_REQUIRED |
| core-assisted-services-020 | rent a suv for 8 hours from college | BOOKING_REQUEST / SIMPLE | unsupportedRequests: RENTAL • complexity: SIMPLE • fallbackExpected: NOT_REQUIRED |

### return-complicated (7 cases)

- **Decision:** Confirm return intent is preserved without inventing a supported return booking mode. **Fields:** unsupportedRequests, complexity, fallbackExpected. **Recommended:** Preserve RETURN_JOURNEY and proposed fallback. **Alternative:** Clarify the return requirement, retaining unsupported intent.

| Case ID | Query | Type / complexity (context) | Proposed labels requiring review |
|---|---|---|---|
| core-assisted-services-001 | go from Pari Chowk to Sunrise Metro tomorrow and bring me back in the evening | BOOKING_REQUEST / COMPLEX | unsupportedRequests: RETURN_JOURNEY • complexity: COMPLEX • fallbackExpected: REQUIRED |
| core-assisted-services-004 | go from Botanical Garden to Garden Gate 3 tomorrow and bring me back in the evening | BOOKING_REQUEST / COMPLEX | unsupportedRequests: RETURN_JOURNEY • complexity: COMPLEX • fallbackExpected: REQUIRED |
| core-assisted-services-007 | go from Lakeview Hostel to Lotus Circle tomorrow and bring me back in the evening | BOOKING_REQUEST / COMPLEX | unsupportedRequests: RETURN_JOURNEY • complexity: COMPLEX • fallbackExpected: REQUIRED |
| core-assisted-services-010 | go from Delta 1 to Amber Tower tomorrow and bring me back in the evening | BOOKING_REQUEST / COMPLEX | unsupportedRequests: RETURN_JOURNEY • complexity: COMPLEX • fallbackExpected: REQUIRED |
| core-assisted-services-013 | go from Old Bus Stand to college tomorrow and bring me back in the evening | BOOKING_REQUEST / COMPLEX | unsupportedRequests: RETURN_JOURNEY • complexity: COMPLEX • fallbackExpected: REQUIRED |
| core-assisted-services-016 | go from Central Station to Jaypee main gate near Gate 3 tomorrow and bring me back in the evening | BOOKING_REQUEST / COMPLEX | unsupportedRequests: RETURN_JOURNEY • complexity: COMPLEX • fallbackExpected: REQUIRED |
| core-assisted-services-019 | go from Civic Centre to Delhi tomorrow and bring me back in the evening | BOOKING_REQUEST / COMPLEX | unsupportedRequests: RETURN_JOURNEY • complexity: COMPLEX • fallbackExpected: REQUIRED |

### role-at-drop (7 cases)

- **Decision:** Confirm the proposed pickup/drop direction and whether the simple route is faithful. **Fields:** pickupSpans, dropSpans, complexity, fallbackExpected. **Recommended:** Use the explicit origin/destination markers; never reverse endpoints. **Alternative:** Require clarification if either directional span is not trustworthy.

| Case ID | Query | Type / complexity (context) | Proposed labels requiring review |
|---|---|---|---|
| core-role-order-002 | pick me at Jaypee main gate, drop at Pine Avenue | BOOKING_REQUEST / SIMPLE | pickupSpans: Jaypee main gate [11,27) • dropSpans: Pine Avenue [37,48) • complexity: SIMPLE • fallbackExpected: NOT_REQUIRED |
| core-role-order-007 | pick me at Lakeview Hostel, drop at Lotus Circle | BOOKING_REQUEST / SIMPLE | pickupSpans: Lakeview Hostel [11,26) • dropSpans: Lotus Circle [36,48) • complexity: SIMPLE • fallbackExpected: NOT_REQUIRED |
| core-role-order-012 | pick me at West Campus, drop at Civic Centre | BOOKING_REQUEST / SIMPLE | pickupSpans: West Campus [11,22) • dropSpans: Civic Centre [32,44) • complexity: SIMPLE • fallbackExpected: NOT_REQUIRED |
| core-role-order-017 | pick me at Amber Tower, drop at IGI | BOOKING_REQUEST / SIMPLE | pickupSpans: Amber Tower [11,22) • dropSpans: IGI [32,35) • complexity: SIMPLE • fallbackExpected: NOT_REQUIRED |
| core-role-order-022 | pick me at hostel gate near the tea stall, drop at Knowledge Park II | BOOKING_REQUEST / SIMPLE | pickupSpans: hostel gate near the tea stall [11,41) • dropSpans: Knowledge Park II [51,68) • complexity: SIMPLE • fallbackExpected: NOT_REQUIRED |
| core-role-order-027 | pick me at Greater Noida, drop at Botanical Garden | BOOKING_REQUEST / SIMPLE | pickupSpans: Greater Noida [11,24) • dropSpans: Botanical Garden [34,50) • complexity: SIMPLE • fallbackExpected: NOT_REQUIRED |
| core-role-order-032 | Please: pick me at Jaypee main gate, drop at Pine Avenue | BOOKING_REQUEST / SIMPLE | pickupSpans: Jaypee main gate [19,35) • dropSpans: Pine Avenue [45,56) • complexity: SIMPLE • fallbackExpected: NOT_REQUIRED |

### role-drop-before-from (7 cases)

- **Decision:** Confirm the proposed pickup/drop direction and whether the simple route is faithful. **Fields:** pickupSpans, dropSpans, complexity, fallbackExpected. **Recommended:** Use the explicit origin/destination markers; never reverse endpoints. **Alternative:** Require clarification if either directional span is not trustworthy.

| Case ID | Query | Type / complexity (context) | Proposed labels requiring review |
|---|---|---|---|
| core-role-order-003 | drop me at Delta 1 from Delta 2 | BOOKING_REQUEST / SIMPLE | pickupSpans: Delta 2 [24,31) • dropSpans: Delta 1 [11,18) • complexity: SIMPLE • fallbackExpected: NOT_REQUIRED |
| core-role-order-008 | drop me at Museum Road from Sunrise Metro | BOOKING_REQUEST / SIMPLE | pickupSpans: Sunrise Metro [28,41) • dropSpans: Museum Road [11,22) • complexity: SIMPLE • fallbackExpected: NOT_REQUIRED |
| core-role-order-013 | drop me at college from Old Bus Stand | BOOKING_REQUEST / SIMPLE | pickupSpans: Old Bus Stand [24,37) • dropSpans: college [11,18) • complexity: SIMPLE • fallbackExpected: NOT_REQUIRED |
| core-role-order-018 | drop me at campus from Hilltop Clinic | BOOKING_REQUEST / SIMPLE | pickupSpans: Hilltop Clinic [23,37) • dropSpans: campus [11,17) • complexity: SIMPLE • fallbackExpected: NOT_REQUIRED |
| core-role-order-023 | drop me at City Centre from Jaypee main gate near Gate 3 | BOOKING_REQUEST / SIMPLE | pickupSpans: Jaypee main gate near Gate 3 [28,56) • dropSpans: City Centre [11,22) • complexity: SIMPLE • fallbackExpected: NOT_REQUIRED |
| core-role-order-028 | drop me at Sector 18 Market from Noida Sector 62 | BOOKING_REQUEST / SIMPLE | pickupSpans: Noida Sector 62 [33,48) • dropSpans: Sector 18 Market [11,27) • complexity: SIMPLE • fallbackExpected: NOT_REQUIRED |
| core-role-order-033 | Please: drop me at Delta 1 from Delta 2 | BOOKING_REQUEST / SIMPLE | pickupSpans: Delta 2 [32,39) • dropSpans: Delta 1 [19,26) • complexity: SIMPLE • fallbackExpected: NOT_REQUIRED |

### role-hinglish-order (7 cases)

- **Decision:** Confirm the proposed pickup/drop direction and whether the simple route is faithful. **Fields:** pickupSpans, dropSpans, complexity, fallbackExpected. **Recommended:** Use the explicit origin/destination markers; never reverse endpoints. **Alternative:** Require clarification if either directional span is not trustworthy.
- **Decision:** Confirm raw se/jaana hai markers express direction without translation. **Fields:** pickupSpans, dropSpans, fallbackExpected. **Recommended:** Preserve source spans; evaluate this marker-specific case separately. **Alternative:** Clarify direction if raw wording is ambiguous.

| Case ID | Query | Type / complexity (context) | Proposed labels requiring review |
|---|---|---|---|
| core-role-order-001 | Sunrise Metro jaana hai Pari Chowk se | BOOKING_REQUEST / SIMPLE | pickupSpans: Pari Chowk [24,34) • dropSpans: Sunrise Metro [0,13) • complexity: SIMPLE • fallbackExpected: NOT_REQUIRED |
| core-role-order-006 | Old Bus Stand jaana hai North Library se | BOOKING_REQUEST / SIMPLE | pickupSpans: North Library [24,37) • dropSpans: Old Bus Stand [0,13) • complexity: SIMPLE • fallbackExpected: NOT_REQUIRED |
| core-role-order-011 | Hilltop Clinic jaana hai Garden Gate 3 se | BOOKING_REQUEST / SIMPLE | pickupSpans: Garden Gate 3 [25,38) • dropSpans: Hilltop Clinic [0,14) • complexity: SIMPLE • fallbackExpected: NOT_REQUIRED |
| core-role-order-016 | Jaypee main gate near Gate 3 jaana hai Central Station se | BOOKING_REQUEST / SIMPLE | pickupSpans: Central Station [39,54) • dropSpans: Jaypee main gate near Gate 3 [0,28) • complexity: SIMPLE • fallbackExpected: NOT_REQUIRED |
| core-role-order-021 | Noida Sector 62 jaana hai airport se | BOOKING_REQUEST / SIMPLE | pickupSpans: airport [26,33) • dropSpans: Noida Sector 62 [0,15) • complexity: SIMPLE • fallbackExpected: NOT_REQUIRED |
| core-role-order-026 | Delta 2 jaana hai Delhi se | BOOKING_REQUEST / SIMPLE | pickupSpans: Delhi [18,23) • dropSpans: Delta 2 [0,7) • complexity: SIMPLE • fallbackExpected: NOT_REQUIRED |
| core-role-order-031 | Please: Sunrise Metro jaana hai Pari Chowk se | BOOKING_REQUEST / SIMPLE | pickupSpans: Pari Chowk [32,42) • dropSpans: Sunrise Metro [8,21) • complexity: SIMPLE • fallbackExpected: NOT_REQUIRED |

### role-repeated-place (7 cases)

- **Decision:** Confirm equivalent repeated source occurrences and distinct endpoint roles. **Fields:** pickupSpans, dropSpans, ambiguities. **Recommended:** Allow labelled equivalent pickup occurrences; preserve actual destination. **Alternative:** Require role clarification when occurrences disagree.

| Case ID | Query | Type / complexity (context) | Proposed labels requiring review |
|---|---|---|---|
| core-role-order-004 | from Botanical Garden to Garden Gate 3; pickup is Botanical Garden | BOOKING_REQUEST / SIMPLE | pickupSpans: Botanical Garden [5,21); Botanical Garden [50,66) • dropSpans: Garden Gate 3 [25,38) • ambiguities: none |
| core-role-order-009 | from Pine Avenue to Central Station; pickup is Pine Avenue | BOOKING_REQUEST / SIMPLE | pickupSpans: Pine Avenue [5,16); Pine Avenue [47,58) • dropSpans: Central Station [20,35) • ambiguities: none |
| core-role-order-014 | from Lotus Circle to airport; pickup is Lotus Circle | BOOKING_REQUEST / SIMPLE | pickupSpans: Lotus Circle [5,17); Lotus Circle [40,52) • dropSpans: airport [21,28) • ambiguities: none |
| core-role-order-019 | from Civic Centre to Delhi; pickup is Civic Centre | BOOKING_REQUEST / SIMPLE | pickupSpans: Civic Centre [5,17); Civic Centre [38,50) • dropSpans: Delhi [21,26) • ambiguities: none |
| core-role-order-024 | from IGI to Pari Chowk; pickup is IGI | BOOKING_REQUEST / SIMPLE | pickupSpans: IGI [5,8); IGI [34,37) • dropSpans: Pari Chowk [12,22) • ambiguities: none |
| core-role-order-029 | from Knowledge Park II to North Library; pickup is Knowledge Park II | BOOKING_REQUEST / SIMPLE | pickupSpans: Knowledge Park II [5,22); Knowledge Park II [51,68) • dropSpans: North Library [26,39) • ambiguities: none |
| core-role-order-034 | Please: from Botanical Garden to Garden Gate 3; pickup is Botanical Garden | BOOKING_REQUEST / SIMPLE | pickupSpans: Botanical Garden [13,29); Botanical Garden [58,74) • dropSpans: Garden Gate 3 [33,46) • ambiguities: none |

### role-reversed-clause (7 cases)

- **Decision:** Confirm the proposed pickup/drop direction and whether the simple route is faithful. **Fields:** pickupSpans, dropSpans, complexity, fallbackExpected. **Recommended:** Use the explicit origin/destination markers; never reverse endpoints. **Alternative:** Require clarification if either directional span is not trustworthy.

| Case ID | Query | Type / complexity (context) | Proposed labels requiring review |
|---|---|---|---|
| core-role-order-005 | destination: West Campus; pickup: Sector 18 Market | BOOKING_REQUEST / SIMPLE | pickupSpans: Sector 18 Market [34,50) • dropSpans: West Campus [13,24) • complexity: SIMPLE • fallbackExpected: NOT_REQUIRED |
| core-role-order-010 | destination: Amber Tower; pickup: Delta 1 | BOOKING_REQUEST / SIMPLE | pickupSpans: Delta 1 [34,41) • dropSpans: Amber Tower [13,24) • complexity: SIMPLE • fallbackExpected: NOT_REQUIRED |
| core-role-order-015 | destination: hostel gate near the tea stall; pickup: Museum Road | BOOKING_REQUEST / SIMPLE | pickupSpans: Museum Road [53,64) • dropSpans: hostel gate near the tea stall [13,43) • complexity: SIMPLE • fallbackExpected: NOT_REQUIRED |
| core-role-order-020 | destination: Greater Noida; pickup: college | BOOKING_REQUEST / SIMPLE | pickupSpans: college [36,43) • dropSpans: Greater Noida [13,26) • complexity: SIMPLE • fallbackExpected: NOT_REQUIRED |
| core-role-order-025 | destination: Jaypee main gate; pickup: campus | BOOKING_REQUEST / SIMPLE | pickupSpans: campus [39,45) • dropSpans: Jaypee main gate [13,29) • complexity: SIMPLE • fallbackExpected: NOT_REQUIRED |
| core-role-order-030 | destination: Lakeview Hostel; pickup: City Centre | BOOKING_REQUEST / SIMPLE | pickupSpans: City Centre [38,49) • dropSpans: Lakeview Hostel [13,28) • complexity: SIMPLE • fallbackExpected: NOT_REQUIRED |
| core-role-order-035 | Please: destination: West Campus; pickup: Sector 18 Market | BOOKING_REQUEST / SIMPLE | pickupSpans: Sector 18 Market [42,58) • dropSpans: West Campus [21,32) • complexity: SIMPLE • fallbackExpected: NOT_REQUIRED |

### stop-friend (7 cases)

- **Decision:** Confirm stops are retained and not flattened into a one-way supported booking. **Fields:** stopSpans, unsupportedRequests, complexity, fallbackExpected. **Recommended:** Preserve STOP and complex fallback where proposed. **Alternative:** Keep unsupported follow-up if meaning is simple; never discard the stop.

| Case ID | Query | Type / complexity (context) | Proposed labels requiring review |
|---|---|---|---|
| core-multi-stop-002 | pick me from Jaypee main gate, pick my friend at Museum Road, then go to Pine Avenue | BOOKING_REQUEST / COMPLEX | stopSpans: Museum Road [49,60) • unsupportedRequests: STOP • complexity: COMPLEX • fallbackExpected: REQUIRED |
| core-multi-stop-004 | pick me from Botanical Garden, pick my friend at Amber Tower, then go to Garden Gate 3 | BOOKING_REQUEST / COMPLEX | stopSpans: Amber Tower [49,60) • unsupportedRequests: STOP • complexity: COMPLEX • fallbackExpected: REQUIRED |
| core-multi-stop-006 | pick me from North Library, pick my friend at Civic Centre, then go to Old Bus Stand | BOOKING_REQUEST / COMPLEX | stopSpans: Civic Centre [46,58) • unsupportedRequests: STOP • complexity: COMPLEX • fallbackExpected: REQUIRED |
| core-multi-stop-008 | pick me from Sunrise Metro, pick my friend at airport, then go to Museum Road | BOOKING_REQUEST / COMPLEX | stopSpans: airport [46,53) • unsupportedRequests: STOP • complexity: COMPLEX • fallbackExpected: REQUIRED |
| core-multi-stop-010 | pick me from Delta 1, pick my friend at Jaypee main gate near Gate 3, then go to Amber Tower | BOOKING_REQUEST / COMPLEX | stopSpans: Jaypee main gate near Gate 3 [40,68) • unsupportedRequests: STOP • complexity: COMPLEX • fallbackExpected: REQUIRED |
| core-multi-stop-012 | pick me from West Campus, pick my friend at campus, then go to Civic Centre | BOOKING_REQUEST / COMPLEX | stopSpans: campus [44,50) • unsupportedRequests: STOP • complexity: COMPLEX • fallbackExpected: REQUIRED |
| core-multi-stop-014 | pick me from Lotus Circle, pick my friend at Greater Noida, then go to airport | BOOKING_REQUEST / COMPLEX | stopSpans: Greater Noida [45,58) • unsupportedRequests: STOP • complexity: COMPLEX • fallbackExpected: REQUIRED |

### stop-via (8 cases)

- **Decision:** Confirm stops are retained and not flattened into a one-way supported booking. **Fields:** stopSpans, unsupportedRequests, complexity, fallbackExpected. **Recommended:** Preserve STOP and complex fallback where proposed. **Alternative:** Keep unsupported follow-up if meaning is simple; never discard the stop.

| Case ID | Query | Type / complexity (context) | Proposed labels requiring review |
|---|---|---|---|
| core-multi-stop-001 | from Pari Chowk to Sunrise Metro via Lotus Circle | BOOKING_REQUEST / COMPLEX | stopSpans: Lotus Circle [37,49) • unsupportedRequests: STOP • complexity: COMPLEX • fallbackExpected: REQUIRED |
| core-multi-stop-003 | from Delta 2 to Delta 1 via Central Station | BOOKING_REQUEST / COMPLEX | stopSpans: Central Station [28,43) • unsupportedRequests: STOP • complexity: COMPLEX • fallbackExpected: REQUIRED |
| core-multi-stop-005 | from Sector 18 Market to West Campus via Hilltop Clinic | BOOKING_REQUEST / COMPLEX | stopSpans: Hilltop Clinic [41,55) • unsupportedRequests: STOP • complexity: COMPLEX • fallbackExpected: REQUIRED |
| core-multi-stop-007 | from Lakeview Hostel to Lotus Circle via college | BOOKING_REQUEST / COMPLEX | stopSpans: college [41,48) • unsupportedRequests: STOP • complexity: COMPLEX • fallbackExpected: REQUIRED |
| core-multi-stop-009 | from Pine Avenue to Central Station via hostel gate near the tea stall | BOOKING_REQUEST / COMPLEX | stopSpans: hostel gate near the tea stall [40,70) • unsupportedRequests: STOP • complexity: COMPLEX • fallbackExpected: REQUIRED |
| core-multi-stop-011 | from Garden Gate 3 to Hilltop Clinic via IGI | BOOKING_REQUEST / COMPLEX | stopSpans: IGI [41,44) • unsupportedRequests: STOP • complexity: COMPLEX • fallbackExpected: REQUIRED |
| core-multi-stop-013 | from Old Bus Stand to college via Delhi | BOOKING_REQUEST / COMPLEX | stopSpans: Delhi [34,39) • unsupportedRequests: STOP • complexity: COMPLEX • fallbackExpected: REQUIRED |
| core-multi-stop-015 | from Museum Road to hostel gate near the tea stall via Noida Sector 62 | BOOKING_REQUEST / COMPLEX | stopSpans: Noida Sector 62 [55,70) • unsupportedRequests: STOP • complexity: COMPLEX • fallbackExpected: REQUIRED |

### time-approximate (5 cases)

- **Decision:** Confirm approximate H12 clock without period requires AM/PM clarification. **Fields:** ambiguities, fallbackExpected. **Recommended:** Keep approximate hour; clarify period. **Alternative:** No default AM/PM.

| Case ID | Query | Type / complexity (context) | Proposed labels requiring review |
|---|---|---|---|
| core-time-only-003 | cab around 7 from Delta 2 | BOOKING_REQUEST / SIMPLE | ambiguities: TIME_PERIOD_REQUIRED • fallbackExpected: NOT_REQUIRED |
| core-time-only-006 | cab around 10 from North Library | BOOKING_REQUEST / SIMPLE | ambiguities: TIME_PERIOD_REQUIRED • fallbackExpected: NOT_REQUIRED |
| core-time-only-009 | cab around 6 from Pine Avenue | BOOKING_REQUEST / SIMPLE | ambiguities: TIME_PERIOD_REQUIRED • fallbackExpected: NOT_REQUIRED |
| core-time-only-012 | cab around 9 from West Campus | BOOKING_REQUEST / SIMPLE | ambiguities: TIME_PERIOD_REQUIRED • fallbackExpected: NOT_REQUIRED |
| core-time-only-015 | cab around 5 from Museum Road | BOOKING_REQUEST / SIMPLE | ambiguities: TIME_PERIOD_REQUIRED • fallbackExpected: NOT_REQUIRED |

### time-daypart (5 cases)

- **Decision:** Confirm a daypart requires a time follow-up rather than an invented exact time. **Fields:** ambiguities, fallbackExpected. **Recommended:** Keep DAYPART and clarify exact time. **Alternative:** No exact-time interpretation is frozen.

| Case ID | Query | Type / complexity (context) | Proposed labels requiring review |
|---|---|---|---|
| core-time-only-002 | cab in the evening from Jaypee main gate | BOOKING_REQUEST / SIMPLE | ambiguities: EXACT_TIME_REQUIRED • fallbackExpected: NOT_REQUIRED |
| core-time-only-005 | cab in the evening from Sector 18 Market | BOOKING_REQUEST / SIMPLE | ambiguities: EXACT_TIME_REQUIRED • fallbackExpected: NOT_REQUIRED |
| core-time-only-008 | cab in the evening from Sunrise Metro | BOOKING_REQUEST / SIMPLE | ambiguities: EXACT_TIME_REQUIRED • fallbackExpected: NOT_REQUIRED |
| core-time-only-011 | cab in the evening from Garden Gate 3 | BOOKING_REQUEST / SIMPLE | ambiguities: EXACT_TIME_REQUIRED • fallbackExpected: NOT_REQUIRED |
| core-time-only-014 | cab in the evening from Lotus Circle | BOOKING_REQUEST / SIMPLE | ambiguities: EXACT_TIME_REQUIRED • fallbackExpected: NOT_REQUIRED |

### vehicle-negated-suv (6 cases)

- **Decision:** Decide only the policy-specific fields listed below; other direct labels remain proposed. **Fields:** policy-specific fields. **Recommended:** Keep affected semantic resolution NOT_LABELLED. **Alternative:** Choose one of the explicit policy options.
- **Unresolved policy:** SUV_FAMILY_EXCLUSION_SCOPE. Define whether generic SUV exclusion also excludes suv_premium. **Options:** Exclude only suv / Exclude suv and suv_premium / Clarify the family scope with the user. **Effect:** Changes allowed vehicle classes; retain literal suv exclusion and keep family-scope metric unlabelled.

| Case ID | Query | Type / complexity (context) | Proposed labels requiring review |
|---|---|---|---|
| core-vehicle-preferences-005 | don't send an SUV from Sector 18 Market to West Campus | BOOKING_REQUEST / SIMPLE | vehicle: state: EXCLUDED, excluded: suv |
| core-vehicle-preferences-010 | don't send an SUV from Delta 1 to Amber Tower | BOOKING_REQUEST / SIMPLE | vehicle: state: EXCLUDED, excluded: suv |
| core-vehicle-preferences-015 | don't send an SUV from Museum Road to hostel gate near the tea stall | BOOKING_REQUEST / SIMPLE | vehicle: state: EXCLUDED, excluded: suv |
| core-vehicle-preferences-020 | don't send an SUV from college to Greater Noida | BOOKING_REQUEST / SIMPLE | vehicle: state: EXCLUDED, excluded: suv |
| core-vehicle-preferences-025 | don't send an SUV from campus to Jaypee main gate | BOOKING_REQUEST / SIMPLE | vehicle: state: EXCLUDED, excluded: suv |
| core-vehicle-preferences-030 | don't send an SUV from City Centre to Lakeview Hostel | BOOKING_REQUEST / SIMPLE | vehicle: state: EXCLUDED, excluded: suv |

### vehicle-self-conflict (5 cases)

- **Decision:** Confirm required and excluded SUV conflict remains ambiguous. **Fields:** vehicle, ambiguities, fallbackExpected. **Recommended:** AMBIGUOUS; retain both contradictory clauses. **Alternative:** Ask which clause the user intended; do not silently choose.

| Case ID | Query | Type / complexity (context) | Proposed labels requiring review |
|---|---|---|---|
| core-ambiguity-conflict-005 | SUV only but no SUV from Sector 18 Market to West Campus | BOOKING_REQUEST / COMPLEX | vehicle: state: AMBIGUOUS, alternatives: suv • ambiguities: VEHICLE_CONFLICT • fallbackExpected: REQUIRED |
| core-ambiguity-conflict-010 | SUV only but no SUV from Delta 1 to Amber Tower | BOOKING_REQUEST / COMPLEX | vehicle: state: AMBIGUOUS, alternatives: suv • ambiguities: VEHICLE_CONFLICT • fallbackExpected: REQUIRED |
| core-ambiguity-conflict-015 | SUV only but no SUV from Museum Road to hostel gate near the tea stall | BOOKING_REQUEST / COMPLEX | vehicle: state: AMBIGUOUS, alternatives: suv • ambiguities: VEHICLE_CONFLICT • fallbackExpected: REQUIRED |
| core-ambiguity-conflict-020 | SUV only but no SUV from college to Greater Noida | BOOKING_REQUEST / COMPLEX | vehicle: state: AMBIGUOUS, alternatives: suv • ambiguities: VEHICLE_CONFLICT • fallbackExpected: REQUIRED |
| core-ambiguity-conflict-025 | SUV only but no SUV from campus to Jaypee main gate | BOOKING_REQUEST / COMPLEX | vehicle: state: AMBIGUOUS, alternatives: suv • ambiguities: VEHICLE_CONFLICT • fallbackExpected: REQUIRED |

### weekday-next (5 cases)

- **Decision:** Decide only the policy-specific fields listed below; other direct labels remain proposed. **Fields:** policy-specific fields. **Recommended:** Keep affected semantic resolution NOT_LABELLED. **Alternative:** Choose one of the explicit policy options.
- **Unresolved policy:** WEEKDAY_SEMANTICS. Define BARE/THIS/NEXT weekdays, including same-day handling. **Options:** Clarify each qualifier / Specify occurrence rules separately for BARE/THIS/NEXT. **Effect:** Changes selected calendar date and scheduling bounds; extracted weekday/qualifier is still independently scoreable.

| Case ID | Query | Type / complexity (context) | Proposed labels requiring review |
|---|---|---|---|
| core-ambiguity-conflict-002 | from Jaypee main gate to Pine Avenue next Friday at 6 PM | BOOKING_REQUEST / SIMPLE | resolvedDate: UNLABELLED (UNRESOLVED_POLICY_OR_JUDGMENT) |
| core-ambiguity-conflict-007 | from Lakeview Hostel to Lotus Circle next Friday at 11 PM | BOOKING_REQUEST / SIMPLE | resolvedDate: UNLABELLED (UNRESOLVED_POLICY_OR_JUDGMENT) |
| core-ambiguity-conflict-012 | from West Campus to Civic Centre next Friday at 9 PM | BOOKING_REQUEST / SIMPLE | resolvedDate: UNLABELLED (UNRESOLVED_POLICY_OR_JUDGMENT) |
| core-ambiguity-conflict-017 | from Amber Tower to IGI next Friday at 7 PM | BOOKING_REQUEST / SIMPLE | resolvedDate: UNLABELLED (UNRESOLVED_POLICY_OR_JUDGMENT) |
| core-ambiguity-conflict-022 | from hostel gate near the tea stall to Knowledge Park II next Friday at 5 PM | BOOKING_REQUEST / SIMPLE | resolvedDate: UNLABELLED (UNRESOLVED_POLICY_OR_JUDGMENT) |

## Priority 2

### noisy-route (5 cases)

- **Decision:** Confirm intended phrases despite noisy directional spelling and expected candidate-failure fallback. **Fields:** pickupSpans, dropSpans, fallbackExpected. **Recommended:** Retain proposed spans if human-confirmed; fallback on actual candidate miss. **Alternative:** Clarify route if noisy text cannot establish direction.
- **Decision:** Confirm the intended query type and interpretation route. **Fields:** queryType, complexity, fallbackExpected. **Recommended:** No class approval for semantic judgment. **Alternative:** Mark unclear and ask a focused follow-up.

| Case ID | Query | Type / complexity (context) | Proposed labels requiring review |
|---|---|---|---|
| core-unclear-noisy-candidates-002 | cab plz frm Jaypee main gate 2 Pine Avenue | BOOKING_REQUEST / SIMPLE | pickupSpans: Jaypee main gate [12,28) • dropSpans: Pine Avenue [31,42) • fallbackExpected: UNLABELLED (UNRESOLVED_POLICY_OR_JUDGMENT) • queryType: BOOKING_REQUEST • complexity: SIMPLE |
| core-unclear-noisy-candidates-006 | cab plz frm North Library 2 Old Bus Stand | BOOKING_REQUEST / SIMPLE | pickupSpans: North Library [12,25) • dropSpans: Old Bus Stand [28,41) • fallbackExpected: UNLABELLED (UNRESOLVED_POLICY_OR_JUDGMENT) • queryType: BOOKING_REQUEST • complexity: SIMPLE |
| core-unclear-noisy-candidates-010 | cab plz frm Delta 1 2 Amber Tower | BOOKING_REQUEST / SIMPLE | pickupSpans: Delta 1 [12,19) • dropSpans: Amber Tower [22,33) • fallbackExpected: UNLABELLED (UNRESOLVED_POLICY_OR_JUDGMENT) • queryType: BOOKING_REQUEST • complexity: SIMPLE |
| core-unclear-noisy-candidates-014 | cab plz frm Lotus Circle 2 airport | BOOKING_REQUEST / SIMPLE | pickupSpans: Lotus Circle [12,24) • dropSpans: airport [27,34) • fallbackExpected: UNLABELLED (UNRESOLVED_POLICY_OR_JUDGMENT) • queryType: BOOKING_REQUEST • complexity: SIMPLE |
| core-unclear-noisy-candidates-018 | cab plz frm Hilltop Clinic 2 campus | BOOKING_REQUEST / SIMPLE | pickupSpans: Hilltop Clinic [12,26) • dropSpans: campus [29,35) • fallbackExpected: UNLABELLED (UNRESOLVED_POLICY_OR_JUDGMENT) • queryType: BOOKING_REQUEST • complexity: SIMPLE |

### overlap-location (5 cases)

- **Decision:** Confirm the full landmark phrase must be retained, including near/gate qualifiers. **Fields:** pickupSpans, fallbackExpected. **Recommended:** Preserve full source span and useful overlap alternatives. **Alternative:** Clarify landmark precision rather than dropping qualifiers.

| Case ID | Query | Type / complexity (context) | Proposed labels requiring review |
|---|---|---|---|
| core-unclear-noisy-candidates-003 | from hostel gate near the tea stall to Delta 1 | BOOKING_REQUEST / SIMPLE | pickupSpans: hostel gate near the tea stall [5,35) • fallbackExpected: NOT_REQUIRED |
| core-unclear-noisy-candidates-007 | from hostel gate near the tea stall to Lotus Circle | BOOKING_REQUEST / SIMPLE | pickupSpans: hostel gate near the tea stall [5,35) • fallbackExpected: NOT_REQUIRED |
| core-unclear-noisy-candidates-011 | from hostel gate near the tea stall to Hilltop Clinic | BOOKING_REQUEST / SIMPLE | pickupSpans: hostel gate near the tea stall [5,35) • fallbackExpected: NOT_REQUIRED |
| core-unclear-noisy-candidates-015 | from hostel gate near the tea stall to hostel gate near the tea stall | BOOKING_REQUEST / SIMPLE | pickupSpans: hostel gate near the tea stall [5,35); hostel gate near the tea stall [39,69) • fallbackExpected: NOT_REQUIRED |
| core-unclear-noisy-candidates-019 | from hostel gate near the tea stall to Delhi | BOOKING_REQUEST / SIMPLE | pickupSpans: hostel gate near the tea stall [5,35) • fallbackExpected: NOT_REQUIRED |

## Priority 3

### partial-passengers (7 cases)

- **Decision:** Confirm advisory passenger count is retained, with unsupported enforcement disclosed; missing fields alone do not trigger Luna. **Fields:** unsupportedRequests, fallbackExpected. **Recommended:** Preserve PASSENGER_COUNT; no fallback solely for passengers. **Alternative:** Request explicit clarification about enforceable capacity; do not invent enforcement.

| Case ID | Query | Type / complexity (context) | Proposed labels requiring review |
|---|---|---|---|
| core-partial-003 | 4 people tomorrow 7 PM | BOOKING_REQUEST / SIMPLE | unsupportedRequests: PASSENGER_COUNT • fallbackExpected: NOT_REQUIRED |
| core-partial-007 | 4 people tomorrow 11 PM | BOOKING_REQUEST / SIMPLE | unsupportedRequests: PASSENGER_COUNT • fallbackExpected: NOT_REQUIRED |
| core-partial-011 | 4 people tomorrow 8 PM | BOOKING_REQUEST / SIMPLE | unsupportedRequests: PASSENGER_COUNT • fallbackExpected: NOT_REQUIRED |
| core-partial-015 | 4 people tomorrow 5 PM | BOOKING_REQUEST / SIMPLE | unsupportedRequests: PASSENGER_COUNT • fallbackExpected: NOT_REQUIRED |
| core-partial-019 | Please: 4 people tomorrow 9 PM | BOOKING_REQUEST / SIMPLE | unsupportedRequests: PASSENGER_COUNT • fallbackExpected: NOT_REQUIRED |
| core-partial-023 | Please: 4 people tomorrow 6 PM | BOOKING_REQUEST / SIMPLE | unsupportedRequests: PASSENGER_COUNT • fallbackExpected: NOT_REQUIRED |
| core-partial-027 | Please: 4 people tomorrow 10 PM | BOOKING_REQUEST / SIMPLE | unsupportedRequests: PASSENGER_COUNT • fallbackExpected: NOT_REQUIRED |

