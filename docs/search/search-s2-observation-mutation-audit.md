# Search S2 observation and question mutation audit — final report review

Scope is limited to `backend/services/search/observations.ts` and `backend/services/search/questions.ts`, with source tests in `backend/tests/rideSearchObservationMutations.test.js`.

Final report: `backend/coverage/search-s2-mutation-final.json`, SHA-256 `95A67595EF8311A6BC00B2560657CDC29999E8F31FAA967D8237E243E4773B28`; 2,572 total mutants, 2,266 killed, 306 survived, and zero timeout, uncovered, or error mutants. Reviewed source hashes:

- `observations.ts`: `34A5216752E95E17C02FF3915638348EC3433B7FFF65433A61DF7666AF0AE081`
- `questions.ts`: `01D70510F0A7A3912CDC4956A82B92D9215E0AE6CFFF60BDD051028536D5B646`

The final report has 65 survivors in `observations.ts` and 11 in `questions.ts`. This review adds five behavioral tests, for 13 tests in this focused file. Mutation execution remains with the lead; IDs described as pending below are not claimed killed until that rerun.

## Actionable gaps closed — pending rerun

These 60 IDs have a product-facing test that did not exist in the final report's test set. They are expected to be killed by the focused tests or existing helper contracts on the next run.

| Source line | IDs | Behavioral contract now tested |
| --- | --- | --- |
| observations 31 | 1000, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1010 | Every supported abbreviated calendar month produces its correct month number. |
| observations 53 | 1053 | `next   Monday` remains a qualified weekday. |
| observations 63 | 1084, 1085 | Unqualified `12:30` is H24 with no period; an explicit PM clock remains PM. |
| observations 73, 76, 79 | 1117, 1135, 1140 | Approximate wording, padded bare clocks, and explicit-period clocks retain their distinct meanings. |
| observations 81–82 | 1150, 1152, 1153, 1154, 1155, 1156, 1157, 1160, 1163, 1164, 1166 | `6 in the evening` creates one clock, while standalone `evening` creates one daypart. |
| observations 87–90 | 1172, 1175, 1178, 1182, 1185 | Multi-space negative sharing, outstation, route, and carrier wording remains explicit false. |
| observations 94–95, 97 | 1192, 1194, 1197, 1198, 1199, 1205, 1206, 1207, 1217, 1218 | Multi-space stop, round-trip, return, and AC requests retain their unsupported kinds. |
| observations 102–103 | 1225, 1230 | `premium   SUV` remains the premium-SUV class. |
| observations 107–108 | 1241, 1243, 1245, 1246, 1249 | Decimal precision, multi-space, singular/plural passenger wording, and unsupported-kind conversion retain the full observed value. |
| observations 111 | 1255, 1257, 1258, 1259 | `anything` and `anything   except` are explicit any-vehicle observations. |
| questions 69–74 | 2149, 2153, 2156, 2159, 2163 | A request with no observations has only the fixed role/service/timing questions; vehicle, date, time, passenger, and flag questions remain absent. |
| questions 76–78 | 2166, 2167, 2169 | A stop observation creates the non-empty `unsupported_STOP` diagnostic question with `kind: 'noul'`. |

## Proven equivalent or nonactionable survivors

Each group below has been checked against the current source and report replacement. These are the only final survivors not awaiting a new behavioral test.

| Source line | IDs | Disposition and reason |
| --- | --- | --- |
| observations 22 | 977 | Equivalent. Replacing the default `locations` array with a string array cannot satisfy the numeric `start`/`end` containment comparison; callers that supply real candidates are unchanged. |
| observations 68 | 1110, 1111 | Equivalent. The value examined is capture group 1 from the clock pattern, which is exactly `around` or `about`; removing one anchor does not alter that result. |
| observations 75 | 1128 | Equivalent. A regex observation match cannot include leading or trailing whitespace here, so `candidate.text` and `candidate.text.trim()` are identical. |
| observations 76 | 1132 | Equivalent. Clock matches either begin with the cue or contain `:`, AM/PM, or `in the`; changing the cue alternative's anchor therefore does not admit a rejected clock candidate. |
| observations 92 | 1187, 1188 | Equivalent. Capture group 2 is always one complete negative flag token from the preceding pattern, so partial anchoring of `NEGATIVE_FLAGS` produces the same boolean. |
| observations 103 | 1228, 1229 | Equivalent. Vehicle observations are already full alternatives from the vehicle pattern; dropping one anchor in the premium-SUV normalization check cannot alter those complete strings. |
| observations 110–112 | 1252, 1253, 1260, 1261 | Equivalent. `now` and `anyVehicle` map an observed value and immediately discard it in favor of `candidate.ref`; changing that discarded callback result does not affect returned source references. |
| questions 70–72 | 2155, 2158, 2161 | Nonactionable wording-only mutations. They remove the role phrase passed to `candidateQuestion`, but keep a non-empty instruction, question key, observed-ID choices, `NONE`/`UNCLEAR` choices, and real-SDK helper validation. No deterministic extraction or safety contract changes, and provider-quality claims are outside this scope. |

No concrete production defect was found in this final survivor review. The earlier passenger decimal/negative clipping defect was already fixed by the lead and remains covered by source fixtures.

## Deliberate exclusions

These tests exercise deterministic observation and request construction only. They do not make claims about live Jev behavior, Google Places or location grounding, translation, responsibility/Phase 8, UI, or location generation.
