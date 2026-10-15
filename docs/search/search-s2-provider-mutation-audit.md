# S2 provider mutation audit: final campaign

This audit covers only `backend/services/search/provider.ts` and its two focused test
files. The lead's completed final report is
`backend/coverage/search-s2-mutation-final.json` (StrykerJS 10.0.0, schema 1.0).
The provider has **305 mutants: 297 killed and eight survived**. Each of those eight
has a final-ID, exact source-location disposition below: six equivalent and two
nonactionable redundant constructor-default mutations. There are **zero actionable
remaining survivors and zero pending test additions** in this scope. The eight raw
`Survived` statuses remain unchanged; no adjusted mutation score is substituted.

For campaign context, the report contains 2572 total mutants, 2266 killed, 306
survived, and zero timeouts, uncovered mutants, or errors. Review and signoff here
are limited to the provider. The earlier report,
`backend/coverage/search-s2-mutation.json`, recorded 262 killed and 43 survived for
the same 305 provider mutations. Tables explicitly distinguish initial and final IDs.

Both reports' embedded provider source exactly matches the current provider source. Its SHA-256
is `2153929d447302e8295b508892bebffbe4b3d8d4badc30c13729ab1bdffb5a84`.
Provider source was not changed for this remediation. The lead's existing
`createTestClock` latency test in `rideSearchProvider.test.js` is preserved.
Additional tests are in `rideSearchProviderMutations.test.js` and are discovered by
the campaign's existing `tests/rideSearch*.test.js` glob.

The final campaign now measures all 35 actionable initial survivors as killed.
Matching uses the exact source location, mutator name, and replacement, not a
numeric ID offset; every initial survivor has exactly one final match. The eight
remaining mutations match the initial proofs individually. No mutation campaign
was run by this worker during either remediation or this final review. No production
defect or additional behavioral test gap was found in the final survivors; this
final review changes the audit only.

## Actionable initial survivor groups (now measured killed)

Every row names all IDs in that group and the independent observable requirement
that its tests enforce. The `safeError` helper verifies the exact error class, name,
code, generic message, public own keys, and absence of a copied `cause`.
Invalid descriptor tests also assert that the SDK was never called.

| Initial IDs | Missing assertion / mutation effect | Added behavioral test |
| --- | --- | --- |
| 1644 | Removing `SearchProviderError.name` changed the public error identity without failing tests. | All rejection helpers assert `name === 'SearchProviderError'`; SDK error tests also forbid provider fields or causes on public errors. |
| 1647, 1649 | Accepting arrays as records can accept an answer array whose index keys match question names, or a probability array whose index keys match enum labels. | `provider rejects arrays even when their index keys match requested questions` supplies both plausible JSON array shapes. |
| 1650, 1651, 1652 | Removing the object guard accepts a string as a criteria map. Its character indices look like valid enum keys. | `provider rejects mixed empty keys, empty instructions, unsupported kinds, and malformed criteria before dispatch` includes string criteria and asserts schema failure before dispatch. |
| 1667, 1668, 1669, 1672 | Weakening/removing probability range bounds can accept negative or greater-than-one confidence/noul values. Existing malformed distributions could still fail on their sum, masking this gap. | `provider rejects invalid confidence and noul without relying on distribution sum` isolates each bound while the other answer and distribution remain valid. |
| 1670, 1673 | Changing strict range comparisons rejects valid endpoints zero or one. | `provider preserves zero, one, and raw uncalibrated noul probabilities` accepts both endpoints and preserves 0.499999, 0.5, and 0.500001 without Boolean conversion. |
| 1688 | Changing the token lower bound rejects valid zero tokens. | `provider accepts inclusive state, batch, and enum limits together` and `provider rejects invalid output token usage independently of valid input usage` assert zero input/output usage. |
| 1694 | Removing the key-count check allows a probability map that omits an unchosen enum label but still sums to one. | `provider requires complete exact enum probabilities and rejects invalid mass hidden beside a certain answer` rejects `{ RIDE: 1 }` for an enum offering both RIDE and OTHER. |
| 1710, 1722, 1765 | Changing inclusive caps rejects valid state length 12000, 48 questions, or 255 enum labels. | `provider accepts inclusive state, batch, and enum limits together` submits all three exact caps successfully; prior tests reject 12001/49/256. |
| 1724, 1725, 1727 | Replacing/removing the empty-key predicate can accept an empty question name in a mixed valid/invalid batch. | The before-dispatch schema test includes one valid question plus one empty name. This distinguishes `some` from `every`. |
| 1742 | Omitting the instruction-length guard accepts empty instructions. | The before-dispatch schema test includes `instructions: ''`. |
| 1758 | Omitting the question-kind guard accepts a non-choice/non-noul kind when valid choices are present. | The before-dispatch schema test provides `kind: 'score'` with otherwise valid instructions and criteria. |
| 1762 | Omitting the nonempty-choice guard allows dispatch before a later response check fails. | The before-dispatch schema test supplies an empty criteria map and requires `JEV_SCHEMA_ERROR` with zero SDK calls. |
| 1772, 1779 | `every` instead of `some`, or removing the description type guard, accepts mixed valid/invalid criteria. | The before-dispatch schema test supplies a valid label beside an empty label, and a valid description beside a numeric description. |
| 1796 | Removing the selected-choice type guard accepts a numeric choice when coercion matches a string enum key. | `provider requires string choices even when a numeric value names an offered enum key` offers labels `1`/`2` and rejects the number `1`. |
| 1829 | Skipping a failed per-label probability validation can treat `null` as zero during summation and retain invalid mass. Existing Infinity-plus-zero fixtures could still fail the sum guard. | The exact-probability test uses valid mass one beside null/string/Boolean/NaN/Infinity, each of which must fail independently of summation. |
| 1847, 1850 | Weakening the noul type guard accepts another primitive type with a valid `noul` number. | The confidence/noul test rejects `type: 'choice'`, `type: 'score'`, and an omitted type while retaining a valid probability. |
| 1872 | Removing output-usage validation accepts invalid output tokens when input tokens are valid. | `provider rejects invalid output token usage independently of valid input usage` covers null, strings, Boolean, fractional, negative, NaN, and infinite output counts. |
| 1897, 1900 | Removing returned-model type/nonempty guards accepts malformed model metadata. | `provider requires a nonempty returned model and exact requested answer keys` rejects a number, an object with a length, null/missing, an empty string, and an array. |
| 1925, 1931, 1932 | Weakening configured-model type or positive-timeout guards accepts invalid options, especially zero timeout. | `provider validates model types and positive finite timeout before any SDK call` independently rejects numeric/object/null/empty models and zero/negative/nonnumeric/nonfinite timeouts. |

Additional tests verify exact returned question keys even when key counts match;
positive and negative deviations inside/outside the `1e-6` sum tolerance; unchanged
raw probabilities; default search model/options; returned model versus requested
alias; clock rollback clamped to zero; exact safe metadata; and preservation of
an already classified adapter error. No assertion depends on mutation IDs or
mutation instrumentation.

## Equivalent / nonactionable initial survivor groups

| Initial IDs | Classification | Specific justification |
| --- | --- | --- |
| 1655 | Equivalent | Removing `value !== null` from `recordOf` selects the truthy arm only for the newly admitted null value, but that arm returns the value itself: null. Both original and mutant therefore return null for this input. All other inputs follow the same arms. |
| 1662 | Equivalent | `Number.isFinite` rejects every non-number without coercion. Removing the preceding `typeof value !== 'number'` check still returns null for every non-number and every nonfinite number, with identical behavior for finite numbers. |
| 1677 | Equivalent | Removing the first token-count guard still leaves `!Number.isInteger(value)`. That strict check rejects all non-number values and all NaN/infinite values. The unchanged negative-integer guard rejects negatives; nonnegative integers are accepted exactly as before. |
| 1678 | Equivalent | Replacing the first token guard's OR with AND admits nonfinite numbers past that guard, but the following `Number.isInteger` check rejects all of them. Non-number values fail both strict checks; finite integer and fractional values are unchanged. |
| 1679 | Equivalent | Omitting the token `typeof` predicate retains strict `Number.isFinite`; it rejects non-numbers without coercion. The integer and lower-bound checks remain unchanged. |
| 1837 | Equivalent for this numeric domain | Replacing `abs(sum - 1) > 1e-6` with `>=` can differ only if the computed difference is exactly the binary64 value of `1e-6`. A finite accumulated sum near one is a multiple of `2^-53` (or a coarser grid above one), and subtracting one there is exact. But `1e-6 * 2^53` is `9007199254.740992`, not an integer, so equality is unreachable. Out-of-domain finite sums and nonfinite values cannot equal that tolerance either. Tests use representable deviations just inside/outside the tolerance in both directions rather than fabricating an impossible exact equality. |
| 1938, 1939 | Nonactionable redundant constructor defaults | Removing either constructor-level timeout/retry configuration changes private SDK defaults, but every exposed adapter `decide` call explicitly supplies the validated timeout and `retry.maxRetries: 0`. SDK 0.6.0 merges per-call overrides over client defaults before attempting transport. The client is never exposed and no other SDK method is invoked. Constructor defaults are retained as defense in depth; the observable no-retry contract is tested against a real SDK client configured with two retries and an injected fetch returning HTTP 503, which must be attempted only once. |

For 1837, the nearby representable differences demonstrate why a decimal-looking
fixture does not produce an exact boundary:
`(1 + 1e-6) - 1 === 9.999999999177334e-7`, whereas
`1 - (1 - 1e-6) === 0.0000010000000000287557`.
No mutation exclusions, coverage ignores, or removed validations were added.

## SDK and adapter boundary

The installed package and exported `VERSION` are `@typesafe-ai/sdk@0.6.0`.
Its installed `dist/index.d.mts` and `dist/index.mjs` were inspected directly.
`systemOne(request, options)` returns `APIPromise<SystemOneResult<Q>>` with
`model`, typed `answers`, and snake-case `usage.input_tokens/output_tokens`.
The runtime parses the body without validating this answer schema, so the adapter
must validate it independently. Choice and noul responses require matching `type`
discriminators; a noul number is a probability, not a Boolean or another confidence.

Per-call `timeout` is a timeout per attempt, including response-body delivery;
`retry: { maxRetries: 0 }` disables retries despite constructor defaults.
`APITimeoutError(timeoutMs, options?)` extends `APIConnectionError`; only that actual
class maps to `JEV_TIMEOUT`. `APIError.fromResponse(status, body, headers)` creates
the appropriate HTTP error subclass. HTTP errors, connection errors, user aborts,
base SDK errors, and arbitrary rejections map to `JEV_PROVIDER_ERROR` with no
provider message, headers, request ID, body, or cause copied into the public error.
Request/options failures use `JEV_SCHEMA_ERROR`; malformed returned answers use
`JEV_INVALID_RESPONSE`. Previously classified `SearchProviderError` instances retain
their code and identity.

Adapter metadata is allowlisted: provider `typesafe-ai`, returned SDK model,
`requestCount: 1`, elapsed injected-clock latency clamped at zero, exact requested
question count, optional validated nonnegative integer input/output token usage,
and SDK version `0.6.0`. The request model defaults to search-only `jev-latest`;
configuration is passed explicitly and production environment/model settings are
not changed. All SDK transport in the additional tests uses an injected fetch;
there are no live calls.

## Remediation validation (before the lead's final mutation campaign)

- Focused provider suites: **26/26 passing**, using the same no-isolation/sequential
  test-runner settings as the initial mutation campaign.
- Scoped c8 `--100`: **statements 217/217, branches 129/129, functions 16/16,
  lines 217/217**; all four metrics are **100%**. Reports are in
  `backend/coverage/search-s2-provider/coverage-final.json` and
  `coverage-summary.json`.
- `npm --prefix backend run typecheck`: passed.
- Provider ESLint configuration: passed, including strict bounded types and the
  no-explicit-any/no-unknown rules.
- Scoped quality measurement: 218 physical provider lines, maximum cyclomatic
  complexity 17, maximum cognitive complexity 12, maximum Halstead difficulty 27,
  maximum CRAP 17; no quality violations.

## Final survivor disposition: every remaining provider ID

Locations below are one-based line and column spans in
`backend/services/search/provider.ts`; end columns are exclusive. They are copied
from the final report and checked against both its embedded source and the current
file. These are separate semantic proofs, not a blanket classification based on
survival or test coverage.

| Final ID | Initial ID | Source location and exact change | Disposition and proof |
| --- | --- | --- | --- |
| 1728 | 1655 | `73:39-53`, `recordOf`: `value !== null` becomes `true`. | **Equivalent.** Only null newly reaches the return-value arm; that arm returns null itself. The original fallback also returns null. Every other input follows the same path and returns the same value. |
| 1735 | 1662 | `79:7-32`, `finiteProbability`: `typeof value !== 'number'` becomes `false`. | **Equivalent.** The retained `!Number.isFinite(value)` rejects all non-number values without coercion, as well as NaN/infinities. Both programs then apply identical bounds to finite numbers. The removed type predicate has no side effects. |
| 1750 | 1677 | `85:7-59`, `finiteTokenCount`: the entire type/finite condition becomes `false`. | **Equivalent.** Line 86 still rejects `!Number.isInteger(value)`, which strictly rejects non-number values, NaN/infinities, and fractional numbers. It also retains `value < 0`. Thus both implementations return null for every value except nonnegative integer numbers, which both return unchanged. |
| 1751 | 1678 | `85:7-59`, `finiteTokenCount`: the type/finite OR becomes AND. | **Equivalent.** Non-numbers are rejected by the mutated first condition because both predicates are true. Nonfinite numbers pass it but fail the strict integer check at line 86. Finite numbers see the same integer and lower-bound checks as before. No outcome changes. |
| 1752 | 1679 | `85:7-32`, `finiteTokenCount`: `typeof value !== 'number'` becomes `false`. | **Equivalent.** The retained strict finite check rejects non-numbers and nonfinite numbers. The integer and lower-bound checks at line 86 are unchanged. Removing the side-effect-free type predicate cannot change any result. |
| 1910 | 1837 | `141:7-52`, `normalizeChoice`: the sum-tolerance comparison changes from `>` to `>=`. | **Equivalent in the validated binary64 domain.** The predicates differ only if `abs(sum - 1)` exactly equals the stored binary64 tolerance `1e-6`. Such a sum would be near one, where all representable sums are multiples of `2^-53` or a coarser grid. Subtracting one is exact in this range. But `1e-6 * 2^53` is `9007199254.740992`, not an integer; the tolerance is off that grid and cannot equal the difference. A sum outside this range cannot satisfy equality either. All probabilities are validated finite numbers before accumulation. The existing tests exercise representable deviations on both sides of the tolerance. |
| 2011 | 1938 | `199:67-115`, `createJevSearchProvider`: constructor `{ timeout: timeoutMs, retry: { maxRetries: 0 } }` becomes `{}`. | **Nonactionable at the exposed adapter boundary.** Both constructor configurations are valid after the option checks at line 196. SDK 0.6.0 substitutes its default timeout/retry settings only at construction. Every adapter request supplies explicit validated `timeout: timeoutMs` and `retry.maxRetries: 0` at line 207; SDK request resolution overrides both constructor defaults before transport. The constructed client is not exposed, and no other SDK operation is called. Removing these defaults has no observable request, error, or metadata effect for this adapter. |
| 2012 | 1939 | `199:96-113`, `createJevSearchProvider`: constructor retry `{ maxRetries: 0 }` becomes `{}`. | **Nonactionable at the exposed adapter boundary.** Only the constructor's private retry policy inherits SDK defaults. Line 207 always overrides `maxRetries` to zero. SDK `resolveRetryPolicy` prefers that supplied field; inherited backoff/status settings never trigger retries with a zero budget. Constructor timeout remains unchanged. The existing real-SDK/fake-fetch test confirms one HTTP 503 attempt even for a client initially configured with two retries. |

The proofs for final IDs 1728, 1735, 1750, 1751, 1752, and 1910 rely on ordinary
JavaScript Number/object semantics and the unchanged validation paths identified
above. The constructor proofs additionally depend on the actually installed SDK
0.6.0 implementation: `dist/index.mjs:567` chooses explicit `options.timeout`
over `this.timeout`; line 568 resolves per-call retry overrides; and line 426
prefers an explicit override for `maxRetries`. These exact SDK ranges were inspected
again during final review. None of these dispositions proposes weakening guards,
changing production behavior, or adding tests of private construction details.

## Final measured outcomes of initial actionable survivors

Each row lists corresponding IDs in order. Every final ID in this table is measured
**Killed** in the lead's final report; behavioral coverage is explained in the
historical actionable table above. There are 35 unique mappings, with no ambiguous,
missing, or unmatched initial survivors.

| Initial IDs | Final IDs (all measured Killed) |
| --- | --- |
| 1644 | 1717 |
| 1647, 1649, 1650, 1651, 1652 | 1720, 1722, 1723, 1724, 1725 |
| 1667, 1668, 1669, 1670, 1672, 1673 | 1740, 1741, 1742, 1743, 1745, 1746 |
| 1688 | 1761 |
| 1694 | 1767 |
| 1710 | 1783 |
| 1722, 1724, 1725, 1727 | 1795, 1797, 1798, 1800 |
| 1742 | 1815 |
| 1758, 1762, 1765 | 1831, 1835, 1838 |
| 1772, 1779 | 1845, 1852 |
| 1796 | 1869 |
| 1829 | 1902 |
| 1847, 1850 | 1920, 1923 |
| 1872 | 1945 |
| 1897, 1900 | 1970, 1973 |
| 1925, 1931, 1932 | 1998, 2004, 2005 |

Final review validated the source hashes, exact locations/replacements, all eight
survivor dispositions, all 35 measured-killed mappings, and raw report counts by
reading the completed reports. The lead reports the current 116 focused tests green.
The earlier provider-only 26-test/c8/quality results are retained as historical
measurements above; they were not rerun or represented as new results during this
documentation-only review. Provider production code and both provider test files
were preserved. No live provider calls, mutation reruns, or edits outside this
owned audit document were made.
