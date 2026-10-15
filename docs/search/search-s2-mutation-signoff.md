# Search S2 mutation signoff

Normal tests use deterministic providers. Mutation tests use StrykerJS 10.0.0,
the native Node test runner and the installed tsx loader. No mutator exclusions,
coverage ignores, weakened schemas or surviving-mutant suppressions were added.

## Campaign identity

The complete campaign is `backend/coverage/search-s2-mutation-signoff.json`:
2,572 unique mutants, 2,384 killed and 188 survived. Targeted behavioral rechecks
are `search-s2-mutation-recheck.json` (237 mutants) and
`search-s2-mutation-boundaries.json` (29 mutants), in the same directory.

The aggregate retains the complete campaign's IDs. A recheck replaces a result
only when the file, embedded source, mutator, exact location and replacement
match the complete campaign. Repeated executions are not counted as new mutants.
The aggregate is `backend/coverage/search-s2-mutation-aggregate.json`.

Final unique outcomes: **2,437 killed, 135 survived, 0 timed out, 0 uncovered,
0 errors. Meaningful survivors: 0.** The raw mutation score is **94.75%**;
justified survivors remain survivors, rather than being relabeled as kills.

The machine-checked manifest is `backend/coverage/search-s2-mutation-manifest.json`.
It records report/source hashes, every survivor's canonical ID, location,
replacement and linked proof. This confirms that every survivor has a disposition
and that no source changed between the complete campaign and rechecks.

## Contract, provenance and provider survivors

- Contracts: 70; provenance: 11. All IDs and source-level proofs are in the final
  sections of [the contract audit](search-s2-contract-mutation-audit.md).
  Of these, 61 alter unused Zod diagnostic presentation while preserving rejection.
  The remaining 20 preserve acceptance through redundant predicates or are
  unreachable through the current typed callers.
- Provider: 8. All IDs and SDK-dependent proofs are in
  [the provider audit](search-s2-provider-mutation-audit.md#final-survivor-disposition-every-remaining-provider-id).
  Six are equivalent Number/object checks; two constructor defaults are overridden
  on every exposed request. The SDK is actually inspected version 0.6.0.

Those audits refer to the earlier complete `search-s2-mutation-final.json` where
IDs and source are identical. The manifest verifies that their 89 survivor
dispositions also match the final aggregate. Their historical test counts are
not the final suite counts.

## Remaining observation and question survivors

The earlier [observation audit](search-s2-observation-mutation-audit.md) records
the tests added during review. This table supersedes its pending dispositions.

| Canonical IDs | Source | Proof and limits |
| --- | --- | --- |
| 977 | observations:22 | The default string entry has no numeric start/end. It cannot contain a regex match; supplying real location candidates is unaffected. |
| 1110, 1111 | observations:68 | The examined capture is exactly `around` or `about`; removing either anchor cannot change precision for generated matches. |
| 1128 | observations:75 | Removing trim does not change the filter. Cued/colon/period clocks pass its first predicate regardless of trailing whitespace. A bare clock with trailing whitespace before another word cannot equal the whole trimmed query in either version; a wholly bare query matches without trailing whitespace because the regex ends at a word boundary. This does not claim every regex match has identical trimmed text. |
| 1132 | observations:76 | Generated clocks begin with the cue or a number. A colon, AM/PM or `in the` already qualifies the latter. Removing the cue anchor cannot qualify an otherwise rejected generated clock. |
| 1155, 1156, 1157, 1160 | observations:81 | Both refs are always QUERY_SPAN values created by observe. Removing/conjoining their kind checks leaves the actual start/end containment tests intact. No alternate ref kind reaches this callback. |
| 1164 | observations:82 | An embedded daypart starts after the clock's cue/number. It cannot share the clock's start. Changing >= to > therefore preserves containment for generated clock/daypart matches. Standalone dayparts before and after a clock are independently tested. |
| 1187, 1188 | observations:92 | The flag capture is one complete fixed token from its preceding pattern. Partial anchoring of the negative-token regex matches the same tokens. |
| 1228, 1229 | observations:103 | Vehicle matches are complete alternatives from the vehicle pattern. Dropping a normalization anchor cannot turn another class into premium SUV. |
| 1249 | observations:108 | The temporary observed value is discarded immediately; the returned unsupported record uses the outer kind and observed ref. Changing that unused callback value cannot change the clause or kind. |
| 1252, 1253, 1260, 1261 | observations:110-112 | Temporary boolean observation values are discarded by mapping to refs. These mutations do not change any returned now/any-vehicle reference. |
| 2155, 2158, 2161 | questions:70-72 | These remove redundant role wording from candidateQuestion, while retaining the question's role-specific key, original context, complete observed-ID choices, NONE/UNCLEAR criteria and safety instructions. They are nonactionable for the deterministic contract, not a claim that live model quality is wording-invariant. Live question quality remains an S5 evaluation. |

## Remaining extraction/orchestration/validation survivors

| Canonical IDs | Source | Proof and limits |
| --- | --- | --- |
| 455 | extractor:9 | Removing the explicit undefined check retains allowed.includes(value). Undefined cannot belong to the typed string choices; the same classified error is thrown. |
| 493 | extractor:21 | This find is reached only with exactly one observed candidate and its validated ID; multiple candidates return ambiguity before the find. Selecting the first candidate is therefore identical. |
| 524 | extractor:35 | Making send mandatory in the do-not alternative does not lose bare do-not negation: the shorter not alternative independently matches the same suffix. Requests containing send still match the unchanged mandatory-send branch. Multi-space do-not-send wording is tested. |
| 721 | extractor:81 | Prior guards ensure a positive match and at most one distinct positive class. All candidates reaching this find have the selected class; choosing the first is identical. |
| 799 | extractor:103 | Candidates are nonempty and have exactly one distinct boolean here. Empty candidates return unspecified, and contradictory booleans return ambiguous earlier. Thus some and every have identical results. |
| 879 | extractor:124 | This helper only receives query-backed unsupported observations. The ref-kind check is always true; trusted carried clauses use the separate carry/provenance boundary. Containment remains checked. |
| 928, 930, 931 | extractor:149 | Removing the UNCLEAR branch proceeds to the following unsupported-kind check. UNCLEAR is not a valid stored unsupported kind, so that check emits the same binding issue and returns without appending anything. |
| 1289, 1290 | parser:38 | Current request builders generate at most 28 questions (9 fixed, 7 vehicle, 3 expression, 4 flag, 5 distinct unsupported diagnostics), below the cap of 48. Changing this second cap predicate cannot affect a generated S2 batch. The public adapter's actual 48-question boundary is separately tested. |
| 1336 | parser:72 | Provider failure is invoked only from the try block after a draft is assigned. Invalid input returns before this block. The draft-exists predicate is always true for current calls. |
| 1355, 1356 | parser:92 | The private inputFailure handler only distinguishes too_big from other codes. Empty/custom sentinel arrays both produce the same INVALID_INPUT_PROVENANCE result; the authoritative provenance validation already ran. |
| 2333, 2334 | temporal:77 | The null scheduling-result branch is unreachable after validOutput. Validated calendar dates and exact clocks generate HH:MM with hour/minute bounds accepted by the shared helper. Its remaining outcomes are a scheduling error or a value. The null check remains defensive; tests do not forge invalid typed drafts merely to freeze unreachable diagnostic wording. |
| 2429 | validation:26 | Removing the QUERY_CANDIDATE check for a resolved USER_SELECTION yields an undefined candidateId. It cannot match a validated nonempty string ID, so the existing missing-candidate continue preserves the result. Other field states retain the preceding guard. |
| 2490, 2491, 2494 | validation:43 | Only RESOLVED location fields have a value object. A nonresolved value cannot JSON-equal a resolved value; the retained equality predicate prevents an issue whenever a weakened state predicate newly admits a partial endpoint. |
| 2517, 2520 | validation:46 | A USER_SELECTION has no candidateId. The retained lookup/undefined guards prevent overlap evaluation if either type predicate is removed. Validated candidate IDs cannot be undefined. |
| 2660, 2662 | validation:90 | Assigning an unspecified trusted field to an unspecified draft field preserves the exact strict unspecified value and introduces no refs. Object identity is not part of the draft contract. |

## Behavioral review coverage

The added regressions assert meaningful output: exact endpoint/source attribution,
individual reversal errors, unsupported clauses and candidate containment, explicit
vehicle intent and contradictory provider binding, missing-field metadata, safe
provider failure, calendar/year preservation, and temporal/flag ambiguity.
No tests inspect active mutant IDs or mutation instrumentation.

One interpretation must not mask another: directional tests require each conflicting
role's exact diagnostic, rather than accepting any one conflict. Absolute-date tests
independently omit day and month. Full bounded question fixtures and actual adapter
request tests verify that independent questions never read another answer.

Prompt accuracy, latency on the real provider, and later calibrated fallback
thresholds remain separate Search S5 measurements. These deterministic mutation
results do not prove live Jev accuracy or validate responsibility adjudication.
