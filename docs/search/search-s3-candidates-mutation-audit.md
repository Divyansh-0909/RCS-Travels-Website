# Search S3 candidate mutation audit

Scope: `backend/services/search/locations/candidates.ts`, frozen report
`backend/coverage/search-s3-candidates-final-mutation.json`, and the targeted
candidate tests. The source was read-only in this audit.

The frozen report recorded 472 mutants: 315 killed and 157 survived. It was
generated before the current `bookingPrefix` declaration and the two guard
lines in `addSimpleToCandidates`; frozen report lines at and below its former
line 20 are therefore three lines earlier than the current source. The report
does not measure mutations in that guard. Current tests already cover the
guard, normalization, exact UTF-16 spans, resource bounds, and source metadata.
No mutation run was started.

## Behavioral additions

`rideSearchS3Candidates.test.js` now asserts:

- tabs between every word in supported directional, Hinglish, simple-route, and
  labelled-field grammar still produce the intended spans;
- each incomplete supported marker yields the redacted dependency issue and a
  full-query reference;
- delimiter-led passenger/vehicle/time suffixes stay out of candidate text;
- `LOCATION_SEARCH` retains the complete phrase rather than applying booking
  grammar.

These are product contracts, not mutation-only fixtures. They exercise the
meaningful whitespace and branch survivors listed below.

## Survivor disposition

IDs are enumerated in bounded groups. “Covered” means the added or pre-existing
behavioral assertions should distinguish an observable change; it does not
claim that all regex rewrites are equivalent. “No separate contract” identifies
instrumentation rewrites or malformed-language variations that do not describe
a supported input contract.

| Frozen line / IDs | Disposition and rationale |
| --- | --- |
| 18: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14 | Covered. The incomplete-marker matrix distinguishes the marker alternatives and horizontal whitespace accepted by the public booking grammar. |
| 19: 15 | No separate contract. Removing the leading word boundary only changes embedded-token treatment; current word-boundary rejection covers the supported lexical contract. |
| 22–23: 26, 27, 30, 31, 33, 34 | Covered by malformed-query and revision-zero tests. These change validation of absent IDs or revision zero. |
| 30–31: 42, 43, 50, 51 | Covered by empty/punctuation-only standalone-location test. These change trim termination at equal bounds. |
| 38: 67, 69, 70, 72, 73, 75, 77, 78, 79, 80, 81, 82, 84, 85, 87, 89, 92, 93, 94, 96, 97, 99, 101, 104, 105, 106, 108, 109, 110, 111, 112, 113, 114, 115, 117 | Covered in representative semantic classes: delimiter-led `now`, vehicle, child, and `tomorrow at 12:34 pm` suffixes. The remaining IDs are token-width or whitespace mutations of the same suffix recognizer; they need a newly supported input before a behavior contract can be stated. |
| 51–53: 134, 136, 138, 140, 147 | Covered by existing `near` alternative tests, including resource-cap behavior. |
| 65: 158, 163, 165, 167 | Covered by existing `from` routes and the horizontal-whitespace matrix. |
| 66: 174, 177, 180, 183, 185 | Covered by labelled-field whitespace test and existing labelled-route boundary tests. |
| 68: 189, 190, 192, 194, 198, 199, 202 | Covered by horizontal-whitespace pickup route and its endpoint assertion. |
| 69: 206, 208, 210, 215, 218, 219 | Covered by horizontal-whitespace drop route and its endpoint assertion. |
| 70: 221, 222, 223, 224, 225, 227, 228, 229 | Covered for standalone `go to` whitespace and candidate text. See the separately reported `go to … via …` defect below. |
| 71: 231, 235, 236 | Covered by horizontal-whitespace `via … to …` route. |
| 78, 80: 242, 247, 252, 253 | Covered by standalone `to`, simple-route, and booking-command tests. |
| 87, 90: 259, 261, 263, 265, 268, 271 | Covered by horizontal-whitespace Hinglish route and existing exact-span assertions. |
| 98: 278, 283, 285 | Covered by horizontal-whitespace forward-Hinglish route. |
| 109–110: 298, 303, 305, 322, 323, 324 | Covered by horizontal-whitespace simple route and existing command-infinitive test. |
| 114: 328 | Covered by simple-route candidate-span tests. |
| 118: 331, 339, 340, 343, 344 | Covered by horizontal-whitespace labelled pickup test. |
| 119: 349, 351, 356, 358, 359, 363, 364 | Covered by horizontal-whitespace labelled drop test. |
| 126: 370 | No separate contract. It only changes the empty-map presence branch after the existing duplicate-span tests. |
| 133: 384, 386 | Covered by stable ID shape and delimiter-collision tests. |
| 138: 388, 389, 390 | Covered by aggregate-bound and candidate-text-total tests. |
| 139–140: 399, 400, 406, 408, 411 | Covered by exact valid single-candidate length and over-limit tests; array declaration is an instrumentation replacement. |
| 145: 417, 418, 419, 420 | Covered by normalization and exact-spacing test. |
| 150–152: 427, 430, 431, 433, 434, 437, 440, 443, 445 | Covered by source metadata, query-length, unclear-query, and no-invented-candidate tests; array/string substitutions are instrumentation replacements. |
| 156: 459 | Covered by valid-query and malformed-query tests. |
| 161, 163: 473, 479 | Covered by the whole-phrase location-search test, which separates `LOCATION_SEARCH` from booking-route parsing. |

## Actual defect for the lead

`BOOKING_REQUEST` input `go to Airport via Sector 18` currently returns
`["go to Airport", "Airport", "Sector 18"]`. The first candidate is a parser
artifact: the start-anchored pre-`via` expression accepts the command words as
part of a location, while the `go to` and `via` expressions also extract the
two real places. This is observable bad candidate text, not a mutation-only
metric issue. No source change was made because this audit owns tests and docs
only; the lead should decide the grammar fix and add the corresponding passing
regression test when changing the source.
