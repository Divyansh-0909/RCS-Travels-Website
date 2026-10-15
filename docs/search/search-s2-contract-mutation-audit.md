# Search S2 contract and provenance mutation audit

## Final campaign: IDs, source identity, and remaining survivors

`backend/coverage/search-s2-mutation-final.json` records the lead's completed 2,572-mutant
campaign: 2,266 killed, 306 survived, with zero timeouts, uncovered mutants, or errors.
The owned portion is:

| Final source | Killed | Survived | Total |
| --- | ---: | ---: | ---: |
| `services/search/contracts.ts` | 322 | 70 | 392 |
| `services/search/provenance.ts` | 245 | 11 | 256 |
| Owned scope | 567 | 81 | 648 |

The final report's embedded source equals the current source byte for byte. SHA-256 values
for both the embedded and current content:

- Contracts: `8b7594d377435116e9b546d122d879ec6400f7e83cc9ab3a5e1723961b206b6f`
- Provenance: `703679abafd2bacbd05f9c901922a279df826fee06dfffa476893bd4945defa4`

**Every final survivor is listed below.** There are 61 diagnostic-only contract changes and
20 proven acceptance-equivalent/redundant changes (nine contracts, eleven provenance).
No remaining actionable acceptance, span, membership, or trusted-value gap was identified.
No additional production changes, mutation exclusions, or metric-only tests were made during
this final review. The final mutation score for this scope remains the measured **87.5%**;
the dispositions do not turn survivors into kills. Final IDs must not be conflated with the
initial IDs retained later in this document.

### Final contracts: diagnostic-only changes (61 IDs)

For these rows the actual predicates and the decision to add an error remain unchanged.
These are not claimed to preserve the entire Zod error object. Parser input handling uses
`safeParse.success` and whether any issue has code `too_big`; draft/provenance validation
uses schema success. It does not consume Zod custom prose, paths, origin, or inclusive
metadata. Machine provenance issue codes and owning fields are separately asserted.

| Final IDs | Embedded source line | Exact change and behavioral disposition |
| --- | ---: | --- |
| 81, 124 | 46, 75 | Empty generic/vehicle duplicate-alternative messages. Distinctness still rejects the same alternatives. These strings are not product copy. |
| 86 | 54 | Empty reserved-ID message. The reserved-set predicate and all three sentinel rejections remain unchanged. |
| 105 | 68 | Empty duplicate-exclusion message. Exclusion uniqueness still rejects duplicates. |
| 134, 135, 136, 137, 138 | 78 | Respectively replace self-exclusion issue with `{}`, blank custom code, remove path, blank path component, or blank message. `addIssue` still records a rejection; vehicle self-exclusion is still invalid. No consumer interprets this custom diagnostic's path or prose. |
| 200, 201, 202, 203, 204 | 92 | H12 invalid-hour issue object/custom code/path/path component/message mutations. An invalid H12 hour still causes failure; valid 1/12 boundaries remain allowed. |
| 220, 221, 222, 223, 224 | 93 | Same diagnostic-only mutations for H24 hour errors. The -1/0/23/24 acceptance boundary does not change. |
| 235, 236, 237, 238, 239 | 94 | Same diagnostic-only mutations for non-unspecified H24 periods. Resolved and ambiguous H24 periods still fail. |
| 263, 264, 265, 266, 267 | 105 | Same diagnostic-only mutations for missing stated timing-mode refs. Modes still require evidence; unspecified timing retains its state. |
| 310, 311, 312, 313, 314 | 136 | Same diagnostic-only mutations for inconsistent query/complexity pairs. The pairing predicate and rejection stay intact. |
| 338, 339, 340, 341, 342 | 148 | Same diagnostic-only mutations for duplicate candidate IDs. Duplicate IDs still fail, independent of message/path. |
| 352, 353, 354 | 150 | Replace query-identity issue with `{}`, blank custom code, or blank message. Stale query IDs/revisions still fail. |
| 369, 370, 371 | 151 | Replace invalid-range issue with `{}`, blank custom code, or blank message. Slice bounds and surrogate-split checks still reject invalid spans. |
| 377, 378, 379, 380, 381 | 152 | Same diagnostic-only mutations for exact-text mismatch. A candidate whose exactText differs from its slice still fails. |
| 393 | 158 | Blank `origin: 'string'` in the aggregate-size diagnostic. Error code remains `too_big`, the `> 8000` predicate is untouched, and the parser still classifies the rejection as LIMIT_EXCEEDED. Origin is not used in parser decisions. |
| 394 | 159 | Set the emitted issue's inclusive metadata to false. This changes diagnostic metadata, not the actual `> 8000` predicate. Tests still accept 8,000 and reject 8,001; parser limit classification depends on `too_big`, not this metadata. |
| 395, 396, 397 | 159 | Remove aggregate issue path, blank its `candidates` component, or blank its message. `too_big` and the aggregate rejection remain unchanged. |
| 411, 412, 413, 414, 415, 416 | 174 | Replace duplicate-selection issue with `{}`, blank custom code, remove path, blank either path component, or blank message. Duplicate trusted selection IDs still fail before membership use. |

### Final contracts: acceptance-equivalent/redundant changes (9 IDs)

| Final IDs | Embedded source line | Proof and limits of equivalence |
| --- | ---: | --- |
| 208 | 93 | Remove the H24-notation guard. A valid H12 clock has hour 1..12, a subset of H24's 0..23 range, so it gets no extra error. H12 values outside that range already fail the preceding H12 check. The mutant can add a duplicate hour diagnostic for invalid H12 values below 0 or above 23; it cannot change acceptance or draft values. This is a redundant rejection, not equality of error arrays. |
| 321, 322 | 141 | Replace the interior-bound conjunction with true or OR. Actual split detection still requires an adjacent high and low unit. At offset 0 the preceding unit is undefined; at text.length the next unit is undefined. Regex coercion of undefined contains neither surrogate class. |
| 323, 324 | 141 | Remove the lower guard or change `> 0` to `>= 0`. No pair can exist at 0 because text[-1] is undefined. Interior pairs remain checked by both surrogate regexes. |
| 326, 327 | 141 | Remove the upper guard or change `< length` to `<= length`. No pair can exist at length because text[length] is undefined. Interior pairs remain unchanged. |
| 362, 363 | 151 | Remove `end <= start` or narrow it to `end < start`. Empty/reversed spans still cannot have nonempty exactText equal to their empty slice. The schema's nonempty text requirement and subsequent exact-slice equality independently reject them. A different diagnostic does not admit a candidate. |

### Final provenance: acceptance-equivalent/unreachable changes (11 IDs)

| Final IDs | Embedded source line | Proof over current public call paths |
| --- | ---: | --- |
| 1429, 1430 | 19 | Replace interior bounds with true or OR. Split detection still requires both existing high and low code units; undefined edge units match neither class. Bound checks on the source span remain separate. |
| 1431, 1432 | 19 | Remove/include-zero lower guard. text[-1] is undefined at 0, so the high-unit predicate still prevents a false split. |
| 1434, 1435 | 19 | Remove/include-end upper guard. text[length] is undefined at the end, so the low-unit predicate still prevents a false split. |
| 1506 | 43 | Change `field === 'unsupportedRequests' && sourceValue !== undefined` to OR. All scalar/timing/location addRefs calls omit sourceValue, and the sole unsupported-request call at line 121 supplies a request object and field unsupportedRequests together. Thus both operands are always equal on reachable calls; AND and OR select the same branch. |
| 1507 | 43 | Replace only the field comparison with true. Its remaining sourceValue predicate is true exactly at the sole unsupported-request call. No scalar call supplies sourceValue, so its semantic comparison branch stays unchanged. |
| 1510 | 43 | Replace only the sourceValue predicate with true. Its remaining field predicate is true only where a request object is always supplied at line 121. No reachable call can compare an undefined request. |
| 1616 | 90 | Put `['Stryker was here']` in the local UNSPECIFIED alternative branch. The string has neither recognized ref.kind, so both checks do nothing. The local array never changes the draft, escapes the function, or produces an issue. The schema still forbids stated alternatives on UNSPECIFIED fields. |
| 1639 | 100 | Change the private validateProvenance default selection array. That default is unreachable through current exports: validateDraftProvenance always passes its own default/provided array at line 134, and validateParseInputProvenance always passes the parsed input's selection array at line 141. Those public defaults are not mutated by this ID. |

### Final follow-up status

No new behavioral tests are pending for the 81 final survivors: each is accounted for above.
The existing focused tests already cover the boundary, reference, owner/revision, nested-state,
and carry semantics that killed actionable initial mutants. No full mutation campaign was run
by this worker. The remaining score is recorded without suppressions; a future decision to
freeze Zod diagnostic presentation would require a separate public error contract and tests.

Validation after this final review:

- `node --import tsx --test tests/rideSearch*.test.js`: 120 passed, zero failures.
- Owned contract/provenance test files: 34 passed, zero failures.
- c8 over contracts/provenance with explicit 100% thresholds: statements, branches, functions,
  and lines all 100%. Reports are in `backend/coverage/search-s2-contracts`.
- `npm --prefix backend run typecheck`: passed.
- Table IDs checked against both JSON reports: 81/81 final and 152/152 initial survivor IDs,
  no missing, extra, or repeated IDs.
- Scope diff whitespace check: passed.

## Initial campaign history

This audits the **initial 2,398-mutant campaign** in `backend/coverage/search-s2-mutation.json`.
IDs below belong to that report, not to a future campaign. Its scoped results were:

| Initial source | Killed | Survived | Total |
| --- | ---: | ---: | ---: |
| `services/search/contracts.ts` | 277 | 110 | 387 |
| `services/search/provenance.ts` | 180 | 42 | 222 |
| Owned scope | 457 | 152 | 609 |

All 152 initial survivors are accounted for below: 75 behavioral cases with focused regression
coverage, 61 diagnostic-only changes, and 16 equivalent/redundant changes. These dispositions
are a review, **not a measured final kill count**. No mutants are suppressed, ignored, or
removed from the runner. The lead owns the final mutation rerun.

The report's embedded source is the comparison baseline. Initial SHA-256 values:

- Contracts: `0038e9681f64ff8aa39df09ea82b9fd30ce9fd8b013766749e1897c17f53d88d`
- Provenance: `f28ea8c011d8371e82ca2a0690e9529a3e8b0351851cd6978e9cbbd589b27772`

The initial provenance source predates authoritative-snapshot policy and per-entry unsupported
request carry validation. Its IDs describe that older source. Tests exercise current exports
and public results; they do not load mutated implementation fragments or assert internal calls.

## Behavioral survivors: initial contracts (40 IDs)

| Initial IDs | Risk and current regression coverage |
| --- | --- |
| 47, 49 | Removing `NONE_OR_UNCLEAR` or `UNCLEAR` from the reserved set permits provider choice sentinels as caller candidate IDs. All three reserved IDs are rejected explicitly. |
| 91, 92 | Removing overlapping/Luna methods rejects valid candidates. All five S1 primary methods are accepted with exact source text. |
| 93, 94, 95, 96, 97, 98 | Emptying or narrowing `alsoDetectedBy` loses merged method provenance. A valid candidate retains all five additional methods, and an empty method name is rejected. |
| 114 | Replacing exclusion `min(1)` with `max(1)` accepts an empty exclusion or rejects two valid exclusions. Tests require empty exclusion failure and one/two exclusion success, while explicit-any may have no exclusions. |
| 140, 141, 142, 143, 145, 146 | Removing weekday enum values rejects legitimate partial dates. All seven weekdays are accepted with BARE/THIS/NEXT qualifiers. |
| 194 | Changing H12 lower bound to `<= 1` rejects valid 1 AM/PM wording. H12 1 and 12 are accepted; 0 and 13 are rejected. |
| 213 | Dropping the H24 negative-hour check accepts -1. H24 -1 fails and 0 succeeds. |
| 253, 255 | Removing stated timing-mode evidence was masked by the previous test's independently invalid clock. New tests use a valid clock and require mode refs for IMMEDIATE/SCHEDULED/AMBIGUOUS; unspecified mode with no mode refs remains valid. |
| 275 | Removing CONDITIONAL_PREFERENCE loses unsupported conditional source evidence. Every S1 unsupported kind is retained through schema parsing. |
| 314, 316 | Removing surrogate-split detection accepts source slices containing half an emoji. Split starts and split ends are rejected separately. |
| 317, 318, 319 | Testing a low surrogate without its preceding high surrogate rejects valid boundaries near a lone low code unit. Lone high/low units and whole paired units are accepted, while paired splits fail. |
| 324, 327 | Reversing lower/upper offset guards prevents detection of interior pair splits. Tests reject each interior split of `A😀B`. |
| 328, 329, 330 | Inverting surrogate classes or examining `offset + 1` accepts real splits or rejects intact/lone units. The paired/lone-unit matrix checks both directions and accepted boundaries. |
| 355, 356, 357, 358 | Removing or conjoining split/bounds predicates permits a split start with a valid end, or a split end with a valid start. Each is a separate candidate with exact text equal to its slice. |
| 359, 360, 364 | Slice clamping can conceal an end beyond query length. A candidate with end 5 over a four-unit query must fail even when its exact text is the clamped whole query. |
| 390 | Changing aggregate `> 8000` to `>= 8000` rejects the allowed cap. Tests require 7,999 and 8,000 units to succeed and 8,001 to fail for input, draft schema, and provenance. |

## Diagnostic-only survivors: contracts (61 IDs)

These mutations change Zod custom diagnostic prose, code, or issue paths while still rejecting
the same values. They are **not called semantically equivalent diagnostics**. Current parser
orchestration consumes rejection plus `too_big` for resource limits; it does not interpret the
wording, custom-code spelling, or paths in these initial custom issues. The tests deliberately
assert acceptance/rejection and structured provenance issues, rather than freeze Zod prose.

| Initial IDs | Specific diagnostic changed; why no additional behavior test is warranted |
| --- | --- |
| 81, 124 | Duplicate-alternative message for generic/vehicle ambiguous fields. Distinctness and rejection are already asserted. |
| 86 | Reserved candidate-ID message. Reserved-ID rejection is explicitly tested. |
| 105 | Duplicate-exclusion message. Rejection remains active; no product wording contract is defined for this Zod message. |
| 134, 135, 136, 137, 138 | Self-exclusion issue object/code/path/message. `addIssue` still records an error and resolved self-exclusion is rejected; path/prose is not used to decide booking behavior. |
| 200, 201, 202, 203, 204 | H12 hour diagnostic object/code/path/message. Boundary tests verify the clock acceptance contract independently. |
| 220, 221, 222, 223, 224 | H24 hour diagnostic object/code/path/message. The same invalid hour still fails; explicit -1/0/23/24 cases verify behavior. |
| 235, 236, 237, 238, 239 | H24 period diagnostic object/code/path/message. Resolved and ambiguous H24 periods are still rejected. |
| 263, 264, 265, 266, 267 | Missing timing-mode-ref diagnostic object/code/path/message. Isolated valid-clock tests verify mode-ref enforcement. |
| 309, 310, 311, 312, 313 | Query/complexity diagnostic object/code/path/message. Inconsistent classifications still fail and consistent classifications are covered. |
| 337, 338, 339, 340, 341 | Duplicate candidate-ID diagnostic object/code/path/message. Duplicate-ID failure is asserted without relying on prose. |
| 351, 352, 353 | Candidate query-identity diagnostic object/code/message. Stale query IDs/revisions still fail. |
| 368, 369, 370 | Candidate UTF-16-range diagnostic object/code/message. Span violations are rejected independently of their diagnostic wording. |
| 376, 377, 378, 379, 380 | Candidate exact-text diagnostic object/code/path/message. A mismatched slice still fails. |
| 396, 397, 398, 399, 400 | Initial aggregate-limit custom diagnostic object/code/path/message. The initial parser classified every such rejection as invalid provenance. Current code emits `too_big` so the lead's existing input handler can return LIMIT_EXCEEDED; that machine code is now asserted. These old IDs must be reevaluated against the final source rather than excluded wholesale. |
| 406, 407, 408, 409, 410, 411 | Duplicate trusted-selection-ID diagnostic object/code/path/message. Ambiguous trust namespaces are still rejected; these initial diagnostics do not affect selection membership. |

## Equivalent/redundant survivors: initial contracts (9 IDs)

| Initial IDs | Specific proof of unchanged acceptance behavior |
| --- | --- |
| 208 | Removing the H24 notation guard adds only a redundant rejection for already-invalid H12 hours outside 0..23. Valid H12 1..12 hours remain within the H24 range. Final review corrected the original actionable classification for this ID. |
| 320, 321 | Removing/conjoining the explicit interior-bound checks differently leaves the high-plus-low predicate unchanged for any real pair. At offset 0, `text[-1]` is undefined; at offset length, `text[length]` is undefined. Regex coercion of undefined contains no surrogate, so neither edge can falsely become a split. |
| 322, 323 | Removing the lower-offset guard or changing `> 0` to `>= 0` cannot create a pair at offset 0 because the preceding code unit does not exist. Out-of-range inputs are also rejected by input bounds/schema validation. |
| 325, 326 | Removing the upper-offset guard or changing `< length` to `<= length` cannot create a pair at the end because the next code unit does not exist. |
| 361, 362 | Removing `end <= start`, or narrowing it to `end < start`, cannot admit an empty/reversed candidate. Its slice is empty, but exactText is required to be nonempty and equal to that slice. The diagnostic may differ, but the candidate is still rejected. Empty/reversed spans are explicitly tested. |

## Behavioral survivors: provenance (35 IDs)

| Initial IDs | Risk and current regression coverage |
| --- | --- |
| 1387, 1388, 1389 | Requiring only a low code unit rejects valid spans adjacent to lone surrogates. Source-ref tests accept lone units and full pairs and reject paired split boundaries. |
| 1433, 1434 | Removing or weakening nonempty source-span bounds accepts zero-length evidence. Zero-length refs are rejected independently of candidate exact-text checks. |
| 1436 | Dropping the source-span end bound accepts offsets beyond query length. A span ending at 5 over `A😀B` fails. |
| 1447, 1449, 1450, 1452 | Weakening owner/revision conjunction accepts an identically valued different form flag or a wrong revision. Two trusted false flags expose this independently of semantic-value comparison; both exact owner and exact revision remain necessary for strict output. |
| 1454, 1455 | Removing optional chaining throws when USER_FIELD has no supplied form draft. The public validator must return UNTRUSTED_USER_FIELD without throwing in that case. |
| 1459, 1460, 1462 | Removing or conjoining trusted-field rejection allows forged/wrong-owner values. Flag-owner/revision cases and changed vehicle/timing/unsupported payloads must produce structured rejection. Current snapshot mode has a separate application-trusted policy; it does not relax strict output. |
| 1483 | Blank clock-period owner loses attribution or rejects legitimate timing carry. Every nested clock component is tested with independently invalid evidence and must report field timing. |
| 1507, 1509 | Blank nested absolute-date owners lose attribution or bypass trusted timing semantics. Day/month/year refs are each validated in resolved and ambiguous date expressions. |
| 1531, 1535 | Blank locationSearch/drop membership-field names misattribute location issues. All three location roles independently reject missing candidate/selection membership with the correct field. |
| 1544, 1546 | Removing AMBIGUOUS traversal hides untrusted alternatives. Each location role has a valid candidate plus an independently forged selection alternative that must fail. |
| 1592 | Blank locationSearch source owner loses structured source-error attribution. A stale ref on a known candidate must report INVALID_QUERY_SPAN/locationSearch. |
| 1598, 1602 | Skipping vehicle refs or blanking their owner loses trust checking. Valid carried vehicles and semantically changed strength/value/exclusions exercise strict matching. |
| 1605, 1609, 1611, 1613 | Blank passenger/outstation/safe-route/carrier owners misattribute or bypass source errors. Every field independently rejects a stale ref and preserves resolved false where applicable. |
| 1617 | Blank unsupportedRequests owner previously attributed errors incorrectly and cannot match a carried request. Current validation checks each carried request against a trusted entry, independently of new query-backed entries. Forged kind, reason, and candidateIds all fail. |
| 1621, 1624, 1625, 1626, 1627 | Weakening/inverting candidate membership or returning undefined from the predicate accepts missing IDs or rejects existing ones. Tests include a known target among two candidates plus a truly missing ID, so membership cannot pass merely because another candidate is different. |

## Equivalent/redundant survivors: provenance (7 IDs)

| Initial IDs | Specific proof of unchanged public result |
| --- | --- |
| 1390, 1391 | Removing or changing the interior-bound conjunction still requires both an existing high code unit and an existing low code unit. Missing units at the string edges cannot match these regexes. |
| 1392, 1393 | Removing the lower guard or including offset 0 leaves the paired-surrogate predicate false at 0 because `text[-1]` is undefined. |
| 1395, 1396 | Removing the upper guard or including offset length leaves the paired-surrogate predicate false at the end because `text[length]` is undefined. |
| 1547 | Replacing the local empty alternative list for an UNSPECIFIED location with `['Stryker was here']` adds an inert local string. Neither ref.kind comparison matches, no issue is produced, and the draft is neither changed nor returned from this loop. This is not an allowed draft alternative and does not weaken the schema. |

## Current-source fixes and follow-up

Two new tests failed before the source fixes: bookingDraftSchema did not enforce the aggregate
candidate-text cap, and JSON-string equality treated object key order as semantic provenance.
The aggregate check is now shared by input and draft schemas and produces `too_big`, so the
existing parser limit classification can consume it. Trusted-value comparison removes refs
recursively and then uses Node's deep strict equality on the JSON payload. No production vehicle
constants import or new dependency was added; the enum parity check is test-only.

Current-source coverage additionally checks historical/current authoritative USER_FIELD refs,
future/wrong-owner rejection, exact strict-output revisions, semantic flags/vehicle/timing values,
nested refs, and carried unsupported subsets mixed with new query requests. Application-trusted
form snapshots remain distinct from parser output. Query-span identity/revision/boundaries are
strict in both policies. No parser, extractor, provider, responsibility, or live API file was edited.

The completed final campaign is audited at the beginning of this document. Initial diagnostic-only
and equivalent IDs remain visible in their campaign; they are not evidence of a 100% mutation score.
