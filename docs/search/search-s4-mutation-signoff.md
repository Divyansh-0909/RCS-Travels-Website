# Search S4 mutation signoff

Final source inventory: **1234 mutants; 1171 killed; 14 timed out; 49 survived; 0 uncovered; 0 meaningful survivors.**

The surviving mutants below are equivalent or non-actionable for the stated reasons. Timeouts remain reported separately, not described as assertion kills.

## Reproducibility

The original current-source campaign was replaced only for evidence.ts and luna.ts after two validated fixes. Their fresh Stryker campaigns cover every mutation in each final source. Other files retain their matching-source campaign. Exact survivor replacements were replayed in isolated copies with SHA-256 checks, a passing complete search baseline, and stronger deterministic tests. Previously killed witnesses were retained; no already killed test was weakened or removed. Superseded source campaigns and failed replay baselines are excluded. No inventory mutant is counted twice.

Reports and detailed per-mutant logs: backend/coverage/search-s4/mutation-{final,evidence,luna,signoff}.json and output/search-s4-validation-scratch/s4-replay-*/. All normal tests are offline.

B = unchanged-file campaign; E = final evidence campaign; L = final Luna campaign. Namespaced IDs prevent collisions between independent campaigns.

## Survivor review

| IDs | Classification | Proof |
|---|---|---|
| B:465, B:467 | EQUIVALENT | Removing the preliminary candidate check cannot accept invalid candidates: bookingDraftSchema and the final validateDraftProvenance independently validate the complete candidate array, including ownership, UTF-16 slices and limits. The service still returns LUNA_SCHEMA_ERROR. |
| B:491 | EQUIVALENT | A USER_SELECTION has no candidateId; bind(undefined) fails because all alias keys are nonempty strings. It is rejected even without the preceding kind guard. |
| B:510, B:536, B:538 | EQUIVALENT | Model USER_FIELD refs remain rejected by validateDraftProvenance without authoritative form context. Valid model refs are QUERY_SPAN; the weakened preliminary kind checks cannot authorize another source. |
| B:990, B:992 | NON_ACTIONABLE | S2 invalid/no-draft results have no eligible fallback reason after provenance/limit blockers. Removing the early no-draft return cannot call Luna or Places or produce a draft. A stale-context diagnostic on an already rejected request may differ, with no operative state change. |
| B:1097, B:1098, B:1099, B:1100, B:1114, B:1117, B:1120 | NON_ACTIONABLE | For supported scalar/timing fields, the remaining value-object/kind guards prevent reading them as a place. LocationRef objects are always non-null and have kind. USER_FIELD plus QUERY_CANDIDATE cannot be an authoritative S3 session edit: candidateOwnedBySources requires a matching QUERY_SPAN. Such invalid edits are rejected by the unchanged S3 session guard even when the earlier display-only-selection guard changes. Genuine USER_SELECTION still requires its registry; valid user selections and scalar/date edits are covered. |
| B:1246 | EQUIVALENT | The mutated initial locations array is overwritten by ground() from awaited locationContexts before the result is returned. It is never consumed as a grounding result. |
| E:33, E:127, E:310 | EQUIVALENT | normalizeLunaOutput permits only QUERY_SPAN in model facts before this validator is invoked. Replacing the repeated source-kind comparison cannot authorize USER_FIELD or another query revision. |
| E:320 | EQUIVALENT | All deterministic observed refs here are QUERY_SPAN, including explicitly generated friend-pickup refs; the type comparison is invariant. |
| E:49 | EQUIVALENT | The regex alternative not already matches the same suffix as do-not without send. Making send mandatory only in the do-not alternative changes no recognized exclusion. Both forms and varied whitespace are tested. |
| L:18, L:20, L:21, L:23, L:24 | EQUIVALENT | Surrogate-pair detection still requires a high code unit immediately before a low one. At offset zero the prior code unit is undefined; at length the current code unit is undefined. Removing/changing these bounds cannot make either undefined value a surrogate. Changes that falsely classified an unpaired low unit were killed by explicit UTF-16 counterexamples. |
| L:51 | EQUIVALENT | The strict location schema allows QUERY_CANDIDATE or USER_SELECTION only. hasUserField rejects USER_SELECTION. For remaining values the changed kind comparison is always false in both programs; candidate membership still runs. |
| L:56, L:62, L:63, L:64, L:67, L:126 | EQUIVALENT | The validated BookingDraft has no nullable semantic child values. Arrays and Object.values traverse the same dense JSON-schema values. Primitive array members have no QUERY_SPAN object and are skipped or terminate as primitive property values. The remaining recursive object traversal still validates every source ref; valid primitive arrays and nested temporal fields are tested. |
| L:99, L:102, L:105 | EQUIVALENT | sourceRefSchema already requires integer, nonnegative numeric offsets before validEvidence. These redundant primitive checks cannot admit strings, null, fractions or negative starts. |
| L:141, L:142 | EQUIVALENT | A declared location has nonempty exactText. An empty/inverted slice is empty and fails exactText equality even without the redundant end<=start guard. Out-of-range ends remain separately rejected. |
| L:235, L:236, L:251, L:252 | EQUIVALENT | Native AbortController aborts once; changing once listener options cannot cause a second event. The external listener is explicitly removed in finally; the internal controller is per-request and not retained. Success/cancellation listener cleanup is tested. |
| L:242, L:247, L:250 | EQUIVALENT | Internal timeout/cancellation Error.message is not exposed. errorCode prioritizes the timedOut flag then cancellation; an abort emitted by the timeout still produces LUNA_TIMEOUT even if its listener first rejects with a cancellation Error. |
| L:267 | EQUIVALENT | The Promise executor synchronously assigns the Node timeout handle before the try/finally path. The handle is always truthy when cleanup executes. |
| L:319, L:322 | EQUIVALENT | Omitting partialDraft from the second parseInputSchema check changes no validation: inputSchema already checked the complete draft shape and the new independent partial-query/source check already verified it. parseInputSchema has no extra formDraft provenance refinement. Input candidate validation remains in place. |
| L:339 | EQUIVALENT | Absent/null output_parsed is rejected by lunaOutputSchema.safeParse in validateOutput with the same LUNA_SCHEMA_ERROR even without the earlier empty-output check. |

## Final source hashes

| Backend file | SHA-256 |
|---|---|
| services/search/complex/contracts.ts | dc10c904bbd7858606107a2510e9f1f063f529ef1f74064df58cabb047262fd6 |
| services/search/complex/eligibility.ts | affe7966dee5dde6c3162b2cf6414c889ed392b386760c68e0732233544814cc |
| services/search/complex/locations.ts | ac5d5de082ce1965cebe1407815a9d12f39117105c62ef55d66bba968631b2d7 |
| services/search/complex/service.ts | da4b1a3f2814231f874440122b9529a57c49d2554abd5e574faf5864c7489671 |
| services/search/complex/trusted.ts | 1d49e333ca8caef88b35c882ea6b5b0d5f89b7bb87526c87f21e37f970bf63ec |
| services/search/locations/service.ts | 4135134c4fb030ea180e192abbbc7687fed97e61608e14d4881e3286b5d4f1a1 |
| services/search/provider.ts | 95488df13e0305bdf1751db533117eee997b949583b6f7ee0c71c7ed07505dc2 |
| services/search/complex/evidence.ts | 3d8263c957f14a96a889b10821baee3737671699a30b782e6281fd164375a63e |
| services/search/complex/luna.ts | ad01dc4eee30af8745121c2bf247c5751a9c865dfbb5e20036d40d9f556c3038 |
