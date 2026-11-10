# Search V1 — B1 Hindi/Hinglish candidates and negation checkpoint

Date: 2026-11-01. Development implementation and offline diagnostics complete; fresh model extraction accuracy remains unmeasured. No customer integration or rollout was performed.

The B1 generator covers **70/73 expected nonempty endpoint spans**, up from **27/73**, on the 51 expected-SIMPLE Hindi/Hinglish development cases. It recovers **47/50 historical missing endpoint observations**. Targeted deterministic vehicle exclusions improve **0/3 → 3/3** and negative sharing flags **0/2 → 2/2**. These are generator/source-assertion results, not new model accuracy.

The accompanying [decision comparison checkpoint](search-v1-decision-model-comparison-2026-11-01.md) records the isolated adapters and an unexecuted, registered 24-case pilot. All four providers are **NOT_RUN** for inference.

**Baseline and scope.** Work started from branch `codex/proofloop-evidence-migration-20261016`, HEAD `2ff51e7d9dade932cd21dfe5d836488d4b9a700a`, with an existing dirty tree. The [resumption audit](search-v1-hinglish-resumption-audit-2026-11-01.md), B1 normalization plan, owner decisions, S1–S4 contracts/checkpoints, S5 evidence and S6 package were used to recover scope. Product statements were checked against current Search code. No historical source identity is reassigned to these new sources.

Historical saved rows reproduce the following unchanged observations:

| Saved Hindi/Hinglish development result | Historical result |
| --- | ---: |
| Evaluated / schema-stage-valid | 80/80 / 67/80 |
| Raw query type / raw complexity | 74/80 / 56/80 |
| Guarded output complexity | 52/80 |
| Exact pickup / drop, all expected-SIMPLE cases | 28/51 / 24/51 |
| Exact missing-field set | 22/51 |
| Positive vehicle exclusions / targeted negation | 0/3 / 0/5 |

Raw routing complexity and guarded draft complexity use different values; 56/80 and 52/80 are not interchangeable. The existing pure diagnostic summarizer exactly reproduces the saved final report. Its score definitions and labels were not changed.

**Root causes and implementation.** The earlier candidate grammar recognized only narrow Hinglish constructions. It missed Devanagari separators, ordinary booking prefixes, temporal/journey suffixes and destination-before-origin forms. Its direction validation relied on English cues. Vehicle negation primarily recognized English prefixes, while sharing could observe a positive word without its following Hindi negative. Preferred-class source assertions did not recognize the bounded `mile toh theek hai` construction.

| Source | B1 change |
| --- | --- |
| `backend/services/search/locations/candidates.ts` | Integrates the bounded route recognizer; generator identity becomes `ride-search-location-candidates-v5-b1`. Existing candidate count, aggregate text and 500-character single-candidate limits remain enforced. |
| `backend/services/search/locations/hindiRoutes.ts` (new) | Recognizes forward `X se/से Y`, bounded reverse `Y jaana hai X se` / `Y drop chahiye X se`, destination-only and incomplete-origin forms. Returns original source spans and role assertions. |
| `backend/services/search/negation.ts` (new) | Shares quote protection, balanced route-quote checks, bounded negative suffixes and preferred-class suffix evidence. Apostrophes inside contractions/names are not treated as opening quotes. |
| `backend/services/search/validation.ts` | Rejects a candidate bound to the opposite source role when the bounded Hindi grammar establishes direction. Does not select a role for the model. |
| `backend/services/search/observations.ts` | Binds complete negative sharing phrases; recognizes closed Hindi vehicle spellings, bounded conditional wording, return wording and Non AC as unsupported AC preference. |
| `backend/services/search/vehiclePolicy.ts` | Adds bounded original-source negative suffix assertions while retaining English prefixes and generic SUV exclusion semantics. |
| `backend/services/search/extractor.ts`, `complex/evidence.ts` | Accept the same bounded preferred-class evidence; retain strict model-output and provenance validation. |

Recognized examples include `SNU se Botanical Garden jaana hai`, `Kal subah campus se Botanical ki cab chahiye`, `बोटैनिकल से SNU जाना है`, `Noida se Delhi ke liye cab`, `Mujhe kal shaam SNU se Delta 2 jaana hai`, `Campus se Botanical kal 9 baje`, and `Kal shaam Botanical se campus wapas jaana hai`. Return journey remains an unsupported request, even when the endpoint spans can be extracted.

The recognizer removes only closed request/temporal prefixes and suffixes. It protects names such as Kal Nagar, Subah Cafe, Tomorrow Cafe, Morning Park and quoted `Lake se Park`; preserves gate/sector numbers; and checks exact UTF-16 slices, including surrogate pairs. Multiple unquoted `se` markers, an unclosed route quote, arbitrary `ko` grammar, and uncertain multiline forward routing remain unresolved. Existing explicit reverse multiline and timezone-tail cases remain supported. No transliteration, translation, fuzzy place correction, coordinates or Place IDs are introduced.

`SUV nahi chahiye`, `SUV नहीं चाहिए`, `Sedan chahiye, SUV nahi`, and `SUV nahi, sedan chahiye` assert the appropriate exclusions. Generic SUV excludes both `suv` and `suv_premium`; subtype-specific wording remains specific. `Sharing nahi karni` and its supported equivalents produce negative sharing evidence. `SUV nahi toh sedan` remains conditional rather than an unconditional SUV exclusion. Quoted vehicle names do not assert preferences. Conflicting observations remain explicit. AC polarity is retained as unsupported material semantics, not a supported AC booking control; arbitrary changed-mind supersession still requires complex interpretation.

**Deterministic before/after measurement.** Both versions use the same saved development inputs and unchanged expected spans. The isolated generator diagnostic supplies the gold query type to bypass routing errors. Runtime routing receives no gold labels. Positive endpoint denominators include only nonempty expected spans; the historical 51-case field metrics also include absent endpoints and failed model stages, so the percentages must not be pooled.

| Diagnostic | Before | B1 | Interpretation |
| --- | ---: | ---: | --- |
| Exact pickup candidate present | 16/36 | 34/36 | Source candidate coverage only |
| Exact drop candidate present | 11/37 | 36/37 | Source candidate coverage only |
| Opposite-role synthetic assignments rejected | 21/73 | 71/73 | Guard probes, including diagnostic spans where candidates are absent |
| Positive exclusion cohort recognized deterministically | 0/3 | 3/3 | Exact exclusion sets |
| Expected negative flags recognized without positive conflict | 0/2 | 2/2 | Negative-sharing observations |
| Generated spans failing exact UTF-16 slice identity | 0 | 0 | All 51 expected-SIMPLE cases |

The two negation rows cover the five targeted deterministic source-recognition cases. They do not establish 5/5 final model extraction correctness. No previously covered expected endpoint span was lost.

Rechecking the original 50 missing endpoint observations separately recovers **21/23 pickup** and **26/27 drop** observations. The forced diagnostic's baseline had 46 missing spans; the historical runtime candidate sets had 50 because routing also affected candidate generation. This explains the differing baseline counts.

Three expected spans remain absent in two cases:

| Case | Missing spans | Reason retained as unresolved |
| --- | --- | --- |
| `hh-v1-added-018` | Pickup `एयरपोर्ट`, UTF-16 `[26,34)` | `सुबह 7 बजे लंदन के समय पर एयरपोर्ट से होटल जाना है`: the London-time prefix is outside the closed prefix grammar. Drop `होटल` is covered. |
| `hh-v1-added-038` | Pickup `campus` `[16,22)`; drop `clinc` `[26,31)` | `cab chahiye frm campus to clinc kal approx 5 pm`: misspelled `frm` and approximate-time suffix are outside this bounded route grammar. No spelling correction is fabricated. |

Other unresolved forms include arbitrary postpositions, competing routes, unbounded corrections and complex conditional alternatives. A source-role guard cannot replace candidate coverage or model selection. Missing fields, uncertainty and partial schedules still require editable, unconfirmed forms.

**What saved inference can establish.** An exact-request replay uses a fake SDK transport over historical Jev 1.13 responses. Every accepted replay matches the complete saved state, questions and options; changed input requests are refused rather than served a stale answer. This is offline evidence reuse, not new provider inference.

| Replay result | Count |
| --- | ---: |
| Cases fully compatible with current request inputs | 29/80 |
| Cases requiring fresh inference | 51/80 |
| Exact matching historical requests consumed locally | 98 |
| Schema-stage-valid within the compatible subset | 21/29 → 22/29 |
| Provenance violations in returned compatible drafts | 0 |
| Network calls | 0 |

Per-case compatibility and issues are retained in `b1-cache-compatibility-v2.json`. The 51 changed-input cases cannot be rescored as current-model extraction using old responses. No new all-80 schema-valid, pickup, drop or missing-field accuracy is claimed. Historical 67/80 validity remains historical. The generator version and source hashes distinguish B1 from the old evidence; compatibility of an individual request does not make the whole execution identity equivalent. Current `jev-latest` is documented as 1.14, which also prevents treating these 1.13 responses as a fresh alias comparison.

**Validation.** The final focused Search suite and adapter tests pass **459/459**, with zero failures, cancellations or skips. This includes nine B1 tests and fourteen comparison tests, existing English candidate/vehicle/provenance/trusted-field checks, and Hindi temporal/calendar/timezone regressions. S5/freeze tests and independent datasets were excluded. Two existing test expectations changed: the generator version and a stronger rejection of both reversed roles in `campus se airport`; benchmark labels did not change.

A final review caught apostrophes in `don't send SUV, don't send sedan` being treated as quotation delimiters. The quote regex was narrowed, and a regression now checks both exclusions, explicitly quoted vehicle names and `O'Hare`. The correction occurred before any new inference. Registration v1 and its outputs remain preserved; v2 records the corrected source snapshot.

| Check | Result / limit |
| --- | --- |
| Final Search and adapter tests | 459 passed; `search-regressions-v2.log` |
| New route helper coverage | 100% lines, 97.70% branches, 100% functions |
| New negation helper coverage | 100% lines, 88.24% branches, 100% functions |
| Combined measured new/helper/comparison coverage | 97.62% lines, 83.19% branches, 95.00% functions |
| Targeted source mutation witnesses | 10 killed, 0 survived; in-memory mutants, no source edits |
| Scoped lint | 21 files, 0 errors, 0 warnings; recommended JS rules, TS unused variables and maximum cyclomatic complexity 21 |
| Search-only TypeScript check | Passed over all Search TypeScript sources |
| Full `npm --prefix backend run typecheck` | Failed on existing unrelated `services/AI/StudyAI/services/index_langGraph.ts:127`, TS2719 (`Promise<string \| undefined>` incompatible with graph node return type) |

The ten mutation witnesses cover role reversal, quoted separator misuse, temporal suffix absorption, competing separators, prefix absorption, negative assertion removal, conditional polarity, quote protection, unclosed quotes and candidate-size limits. This is targeted mutation evidence, not exhaustive Stryker closure. Sonar/cognitive-complexity analysis was unavailable and was not run. No claim of full backend typecheck success, 100% branch coverage, S6 verification or rollout readiness follows from these results.

Temporal lexicon V2.1, calendar policies, date/time binding and timezone source files were not edited. Existing regressions pass for accepted relative-date/daypart behavior, omitted-minute uncertainty, conflicting schedules and trusted field consistency. Coverage of known tests does not establish all-language or production temporal accuracy.

**Preservation and reproducibility.** The additive artifact directory is `output/search-v1-b1-comparison-2026-11-01/` (locally ignored by Git). Key receipts are `baseline.json`, `b1-offline-results-v2.json`, `original-role-gap-recovery-v2.json`, `b1-cache-compatibility-v2.json`, `b1-mutation-witnesses-v2.json`, `scoped-lint-v2.json` and `preservation-v2.json`. JSON outputs use exclusive creation; existing receipts are not overwritten.

The final preservation check verifies **2,005 protected file hashes unchanged**, all **44 current pilot source hashes matching**, the registration hash valid, HEAD unchanged, and the staged raw-diff identity unchanged. Protected files include frozen Search/Hindi/challenge datasets, historical responses and caches, the original S6 packet/package, the resumption audit, and the Responsibility V5 manifest and its 22 source identities. Six existing Search source files changed deliberately and two source files were added. No historical manifest was updated to claim equivalence to B1. Unrelated work was preserved.

From `backend/`, the focused offline tools are:

```powershell
node --import tsx scripts/search-b1-offline.mjs --revision=v2
node --import tsx scripts/search-b1-cache-compatibility.mjs --revision=v2
node --import tsx scripts/search-b1-mutation-witnesses.mjs --revision=v2
node --import tsx scripts/search-b1-preservation.mjs --revision=v2
```

The v2 receipts already exist; rerunning refuses to overwrite them. A later experiment needs additive artifact names and a new registered source/configuration identity.

The 222-case Search development partition remains historical **172 stage-complete / 50 Luna pending**. The 50-case queue, 98 held-out cases, 18 language challenge cases and S6 independent verification were not executed or rewritten. No new Luna, Places, Details, booking, payment, dispatch or frontend calls occurred. No commit, push, merge, reset, clean or deployment occurred. The next bounded benchmark step and account/label prerequisites are recorded in the comparison checkpoint; further model results are needed before assessing B1's final extraction quality.
