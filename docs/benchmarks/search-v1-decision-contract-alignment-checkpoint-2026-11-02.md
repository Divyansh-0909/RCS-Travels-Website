# Search V1 — offline decision-contract and policy alignment

Date: 2026-11-02, Asia/Kolkata. The safe offline correction and analysis are complete. **No provider, Luna or Places calls were made.** The historical [v4 live pilot](search-v1-decision-model-live-pilot-2026-11-02.md), including its failed request, original predictions and scores, remains unchanged.

The four singleton failures now produce valid extraction requests without invented options or model answers. Source locations remain unresolved when no candidate exists. Two cases can produce ordinary incomplete drafts under the focused fake fixtures; two retain separate language-binding fallback conditions. This is deterministic contract evidence, not improved model accuracy.

The revised common-task proposal removes six direct model missing-field questions and delegates requirements to existing deterministic application policy. It has a new identity, twenty model questions and explicit unsupported tasks. Two owner policy decisions affecting three complexity labels remain open. The proposal is **not executable, not ready for live evaluation, and not authorized for inference**.

**Accepted evidence and preservation baseline.** This work used the [resumption audit](search-v1-hinglish-resumption-audit-2026-11-01.md), [B1 checkpoint](search-v1-b1-hinglish-candidates-negation-checkpoint-2026-11-01.md), [API comparison](search-v1-decision-model-comparison-2026-11-01.md), [v3 review](search-v1-comparison-prerequisites-review-2026-11-02.md), v4 artifacts and [owner decisions](../search/search-owner-decisions-2026-10-06.md). Current behavior was checked in source. `CONTEXT.md` and `ROADMAP.txt` still describe historical S5/S6 incompleteness; they were not treated as evidence of a newer completed evaluation.

Before editing, an additive baseline captured HEAD, dirty status, staged identity, **2,149 protected file hashes**, and full text/hash snapshots of **all 44 v4 registered source files**. This preserves the precise uncommitted v4 implementation as well as its immutable registrations and outputs. The task started on `codex/proofloop-evidence-migration-20261016`, HEAD `2ff51e7d9dade932cd21dfe5d836488d4b9a700a`. Unrelated changes, including the existing custody-closure document change, were retained.

**Root cause and correction.** All four affected queries genuinely lack locations:

| Case | Original source | Why BOOKING_REQUEST candidates are empty |
| --- | --- | --- |
| `hh-v1-seed-007` | suv chahiye par sedan nahi | Positive SUV request and sedan exclusion; no origin or destination |
| `hh-v1-seed-040` | shared cab nahi chahiye | Negative sharing preference; no endpoint |
| `hh-v1-added-004` | एसयूवी नहीं चाहिए, सेडान मिले तो ठीक है | Negative SUV and preferred sedan if available; no endpoint |
| `hh-v1-added-007` | चार घंटे के लिए गाड़ी किराये पर चाहिए | Four-hour rental intent; duration is not a location |

The B1 candidate generator was correct to return zero booking endpoint candidates. No additional candidate or grammar expansion was justified. The production question builder appended NONE_OR_UNCLEAR to an empty list and always built pickup/drop selections. The production SDK wrapper accepted nonempty choice maps, whereas the comparison layer required at least two choices. Its local INVALID_REQUEST escaped as an ordinary Error and the parser's generic catch classified it as JEV_PROVIDER_ERROR.

| Source | Change |
| --- | --- |
| `backend/services/search/questions.ts` | Omits pickup/drop candidate-choice questions when the candidate list is empty. Presence, diagnostic and consistency questions remain. The categorical constructor rejects singleton/duplicate-collapsed choices. Exports `ride-search-questions-v2-no-singletons` as the new question-contract identity. |
| `backend/services/search/extractor.ts` | A zero-candidate role becomes UNSPECIFIED without reading a model answer. An invented candidate ID still rejects. The historical NONE_OR_UNCLEAR helper behavior remains compatible; no answer is synthesized. |
| `backend/services/search/provider.ts` | Shares request validation and enforces two-choice minimum before SDK dispatch. A typed local `SearchQuestionContractError` retains the redacted JEV_SCHEMA_ERROR interface. |
| `backend/services/search/parser.ts` | Validates the local request before counting a provider attempt; local contract errors are attributed to field `questions`, rather than generic provider/network failure. |
| `backend/benchmarks/search/decisionComparison/adapters.js` | Applies shared validation and maps local request/context errors to the typed contract failure before HTTP dispatch. Remote errors retain their existing categories. |
| `backend/benchmarks/search/decisionComparison/alignedContract.js` (new) | Defines the separate v5 common contract, deterministic required-field projection and explicit capability limits. |

`validation.ts`, `complex/eligibility.ts`, form requirements, booking authority, source/provenance validation, candidate grammar, temporal/calendar/timezone behavior and model routing were not changed. A stated-but-unbound endpoint still produces LOCATION_CANDIDATE_MISSING and remains eligible under the existing fallback rules. A truly absent endpoint remains a required form field; absence alone does not initiate another interpretation turn. Standalone location search already had a zero-candidate guard and retains its behavior.

**Deterministic before/after.** The original question builder was loaded from the archived v4 source in memory, without modifying files or executing inference. The same cached development inputs reconstruct both versions. New parser outcomes below use explicit fake provider fixtures only.

| Case | Before | After request construction | Fake parser outcome / remaining limitation |
| --- | --- | --- | --- |
| seed-007 | Two singleton questions; INVALID_REQUEST | Both choices omitted; presence questions valid | SIMPLE_INCOMPLETE; endpoints UNSPECIFIED, SUV/exclusion interpretation retained, form completion required |
| seed-040 | Same local failure | Same valid omission | SIMPLE_INCOMPLETE; negative sharing retained, endpoints UNSPECIFIED |
| added-004 | Same local failure | Same valid omission | Existing strict binding rejects the fixture's Hindi PREFERRED assertion as JEV_INVALID_RESPONSE; remains fallback-only |
| added-007 | Same local failure | Same valid omission | Hindi rental wording is not bound by the existing unsupported lexicon; EXTRACTION_BINDING_UNRESOLVED remains fallback-eligible |

All four revised extraction requests pass both shared and experimental request validation. All four retain unresolved endpoints and zero provenance violations. No extra choice, Place ID, coordinate or provider answer was introduced. Ordinary incomplete forms deny submission; fallback-only results cannot open an authoritative draft session. The preferred-sedan and rental-language gaps are separate B1/source-binding work and were not concealed by weakening guards or supplying a false fixture answer.

All 24 reconstructed routing request identities are unchanged. Zero-candidate extraction request identities change because the two invalid questions are removed. V5 common-task request identities all change because its questions and policy context differ. Historical responses are not attached to those new requests. The v4 live runner correctly fails its source-hash guard against the changed current implementation; the archived v4 sources and receipts remain historical.

**Policy reconciliation.** The following matrix distinguishes actual conflicts from different measurement targets. Owner P7–P10 and frozen family decisions govern application behavior; the recent owner approval governs the reviewed pilot labels. No approved label was rewritten.

| Topic | Authoritative policy / production behavior | V4 common question and expected label | Classification and action |
| --- | --- | --- | --- |
| Local choice arity | Common contract requires 2–255 choices; production previously permitted one | Four no-endpoint cases still got a singleton role choice; labels correctly had no location | Coding defect fixed by omission, deterministic UNSPECIFIED state and local error attribution |
| Query type and booking intent | Production `routingRequest` distinguishes standalone places, courtesy text, unrelated questions and incomplete booking shorthand | V4 query-type/intent instructions were shorter and lacked some explicit production distinctions; original selected labels remain authoritative | Question-design limitation. V5 copies production query-type/routing instructions and clarifies incomplete intent without adding labels |
| Missing-field target | Owner P7–P10 and `search-provider-light-diagnostics.md:35`: mandatory requirements derive deterministically. `validation.missingFields` implements the hierarchy | “Is [field] missing and requiring form entry?” was scored against legacy absent-field lists | Question/scoring-target mismatch. V5 omits these six model questions and uses deterministic policy over source-bound drafts |
| Parent versus child timing | UNSPECIFIED timing requires the parent only; IMMEDIATE has no scheduled children; SCHEDULED checks date/time states | V4 asked date/time-child questions even for other modes; gold correctly said NO for those child requirements | Inapplicable-question exposure. V5 has no direct model child-requirement answers and supplies the explicit hierarchy |
| Incomplete/ambiguous time | Existing temporal policy preserves missing minutes, dayparts and alternatives through TIME_MINUTE_REQUIRED / EXACT_TIME_REQUIRED / ambiguity controls | Legacy source time may be present while the form still needs precision or alternative resolution | Different targets, not optional fields. Existing controls remain; no minutes are invented and no uncertainty is converted to absence |
| Ambiguity | Owner policy distinguishes source alternatives/conflicts from field/control resolution. Production keeps conflicting time alternatives | V4 asks source ambiguity but `commonLabels` maps any legacy ambiguity/control code to YES. Frozen development daypart labels can contain EXACT_TIME_REQUIRED | Question/annotation-target mismatch. V5 distinguishes explicit source-conflict states from precision-only controls. Unknown reason codes stay unlabelled; original labels/scores remain intact |
| Blanket conditions / soft AC | Owner decisions explicitly make straightforward “AC if available” advisory without another model turn. Frozen DEVELOPMENT `core-conditional-002/004/006/008` are SIMPLE. Production routing agrees | V4 says conditions are COMPLEX without the soft-AC exception | Confirmed question defect. V5 uses production wording and carries the advisory exception in policy context. Earlier pre-approval AC-COMPLEX proposals are superseded, not a current policy conflict |
| Rental-only complexity | Production explicitly says “Choose SIMPLE ... unsupported rental”; the approved rental-duration family preserves RENTAL without mandatory interpretation solely for unsupported duration | Recently approved `hh-v1-added-007` is COMPLEX | Approved-source conflict / scope ambiguity. Do not relabel or change production policy. V5 leaves this complexity target unscored pending decision R1 below |
| Single-vehicle availability preference | Production allows an interpretable incomplete journey/vehicle exclusion; owner policy explicitly exempts soft AC but does not settle all non-AC availability conditions | V4 blanket-condition rule and reviewed `hh-v1-added-004/033` use COMPLEX | Owner policy underspecified. V5 copies production instructions but masks these two complexity labels pending R2 |
| Unsupported presence versus bookability | Passenger allocation and soft AC are advisory; stops are planned, not bookable; other material unsupported semantics block submission | V4 presence questions are reasonable, but its compact policy described AC/rental/conditional semantics together as material | Policy wording limitation. V5 preserves feature presence separately from complexity, advisory status and submission support; no unsupported feature becomes bookable |
| Vehicle ANY/exclusion semantics | P5: generic negative SUV excludes both SUV classes. P7–P10/form controls still require concrete vehicle selection. Frozen README's “no user vehicle clarification” does not remove that selector | V4 NO descriptions were terse; legacy absent-value labels and form completion are distinct | No policy relaxation. V5 explicitly treats unmentioned classes as not excluded, retains negatives/ANY, and derives concrete selection requirements |
| NONE / OTHER / AMBIGUOUS | Production presence/consistency checks distinguish absent, stated-but-unbound and conflicted roles; no source membership or grounding may be invented | Common selection has finer alternatives than the legacy NONE_OR_UNCLEAR choice. Conditional destinations were already corrected to AMBIGUOUS in v3/v4 | Intentional capability distinction. V5 makes option semantics explicit; it does not count missing common options as successful extraction or fill singleton answers |

The two minimal owner decisions still required are:

1. **R1 — RENTAL_ROUTING:** for rental-only intent such as `चार घंटे के लिए गाड़ी किराये पर चाहिए`, retain **SIMPLE plus preserved unsupported material/form resolution**, or require **COMPLEX interpretation**? This decision concerns routing, not permission to book rentals.
2. **R2 — VEHICLE_AVAILABILITY_ROUTING:** for a single preferred sedan “if available,” with an SUV exclusion but no branching destination, use **SIMPLE while preserving the material preference for review**, or require **COMPLEX interpretation**? The explicit soft-AC advisory rule remains separate.

The proposal masks only these three complexity labels. No other retained selected field target changes, including the two negative-sharing labels. A later decision must create a new proposal/registration identity; v4 truth remains historical.

**Missing-field error decomposition.** Recomputing only the unchanged v4 outputs and labels exactly reproduces Jev 3/21, flash 7/21 and Clef 5/21 exact missing-field sets. There are six eligible field decisions per booking case: **126 per completed provider**. Six questions were also asked on each of three non-booking cases, but those eighteen outputs per provider were already excluded from scoring and are not errors.

| Observable error context | Jev | Clef-flash | Clef |
| --- | ---: | ---: | ---: |
| Timing child asked outside SCHEDULED | 24 | 10 | 13 |
| Source endpoint stated, versus potential grounding/form-entry conflation | 19 | 3 | 4 |
| Stated time versus precision-control requirement | 1 | 1 | 1 |
| Stated timing parent versus missing components | 1 | 1 | 1 |
| Vehicle constraint versus concrete selection | 0 | 2 | 0 |
| Conditional destination requirement versus absent field | 0 | 1 | 0 |
| Other required-source-field disagreements | 3 | 9 | 6 |
| **All wrong field decisions** | **48/126** | **27/126** | **25/126** |
| Correct field decisions / exact sets | 78/126; 3/21 | 99/126; 7/21 | 101/126; 5/21 |

These strata describe observable contexts, not hidden model reasoning or proof that wording caused each error. Stated endpoints could reflect genuine model errors as well as confusion between source presence and grounding. Direct failures remain: Jev said a date-only scheduled request did not lack a time; Clef said a scheduled request without a date did not lack a date; flash said the vehicle-only `suv chahiye par sedan nahi` did not lack pickup. Model accuracy is not excused or recalculated by the revised contract.

Some disagreements are measurement-scope problems. A stated hour with omitted minutes is not an absent source time, although a temporal form control remains mandatory. The approved conditional-destination case has no selected drop span and lists `drop` as missing, whereas an explicit AMBIGUOUS field follows alternative-resolution controls rather than the production absent-field code. A state-only annotation audit finds that one set difference, `hh-v1-added-028`; it does not rewrite its label or fabricate a parser/Luna result. Other selected absent-field sets agree with the deterministic hierarchy when the source states and applicability are represented correctly.

Decisions has only three observed booking cases and 18 observed missing-field answers: 10/18 individual matches and 0/3 exact sets. Its later cases are unattempted, not fabricated errors or incidental empty-field successes. No new model accuracy is measurable after the question changes.

**Revised common contract proposal.**

```text
contract: search-decision-common-v5-policy-aligned
proposalRevision: FINAL_OFFLINE_REVIEW
proposalHash: 047de18a45483b1783262046d1b043c3b049756150af2a3d5d62a1892c4695ef
parent v4 planHash: 6966f4ced88450323cf5c6226edcaa976a0b6eeb8da261d698f3e6d53282dced
model questions/case: 20
selected cases: same 24 DEVELOPMENT records
eligible proposed model labels: 460, after excluding unlabelled/conflict masks
liveAuthorized / readyForLive / executable: false / false / false
```

The proposal uses the same original texts, clocks/timezones and gold-independent B1 candidate union. It retains query type, complexity, booking intent, source pickup/drop selection, vehicle, timing mode, sharing, source ambiguity, four exclusions and seven feature-presence questions. Missing fields are a derived application task, not categorical model answers. Arbitrary complex JSON, Places grounding and booking confirmation are explicitly unsupported in the common batch and are not scored as failed model answers.

All providers receive identical semantic instructions and candidate options through their existing wire mappings. No correct answer, case rationale, label or review gloss is inserted into state. Only question wording, policy context and the declared derived/capability tasks change. `requiredFieldProjection` calls the existing production function; it always reports `submissionAllowed: false` because it is not the complete form workflow.

The final proposal is in `proposal-v5-final*.json`. A preliminary v5 draft remains preserved; a final label-parity check corrected raw Hindi boolean-flag normalization before finalization. The final proposal reproduces all retained selected v4 label vectors except the three explicitly masked complexity fields. In particular, negative sharing remains NO. The final hash supersedes the preliminary draft, which must not be promoted to a live registration.

Routing request reconstruction can be compared offline because those bytes are unchanged. Original v4 scores, cost accounting and local failure attribution can also be recomputed from the saved evidence. Changed empty-candidate extraction requests need fresh outputs to assess extraction quality. All revised twenty-question common batches require fresh inference; no v4 response is replayed as a v5 prediction. Full complex interpretation, Places and submitted-booking economics remain unmeasured.

**Validation and limits.** The final focused Search suite plus comparison tests passes **470/470**, with zero failures, skips or cancellations. It includes nine permanent alignment tests covering all four cases, source membership, one-real-candidate behavior, existing missing-candidate fallback, local versus remote attribution, no SDK/HTTP dispatch on invalid questions, required-field hierarchy, four-provider wire equivalence, conflict masks and submission denial. Existing English/Hindi, Unicode/provenance, negation, trusted-field, temporal, strict-schema and resource-bound regressions pass.

Three existing test fixtures were aligned to the new contract: the observation-gated key list omits zero-candidate choices; the auth-error test uses a valid two-option request; the invented-ID adversarial test supplies real candidates so that it continues to exercise membership rejection. Existing NONE_OR_UNCLEAR extractor witnesses remain compatible. No benchmark label was edited to satisfy a test.

Scoped lint passes **30 files, zero errors/warnings**, including recommended JS rules, TS unused variables and maximum cyclomatic complexity 21. Search-only TypeScript passes. Required full `npm --prefix backend run typecheck` still fails solely at existing unrelated `services/AI/StudyAI/services/index_langGraph.ts:127`, TS2719. No claim of full backend typecheck success, new coverage percentages or exhaustive mutation closure is made. S5/freeze tests, the held-out/challenge suites and project-wide campaigns were excluded.

**Preservation and artifacts.** New local evidence is under `output/search-v1-decision-contract-alignment-2026-11-02/`: `baseline.json` (including v4 source text), `analysis.json`, preliminary and final v5 proposal/input/label files, focused regression logs, lint/typecheck evidence and `preservation.json`. Outputs use exclusive creation. The offline script is `backend/scripts/search-decision-contract-alignment.mjs` with `--analyze`, `--propose-final` and `--verify` modes; existing receipts cannot be overwritten. It has no live mode and does not read credentials.

Final preservation verifies **2,149 protected files unchanged**, **50/50 final proposal source hashes matching**, HEAD unchanged and staged identity unchanged. All v1–v4 registrations/results/receipts, old failed requests, B1 evidence, saved provider caches, frozen datasets/split, S6 package and Responsibility V5 sources remain intact. The current source changes are deliberately distinguished from the archived v4 execution identity. No older result is rebound to them.

**Estimated next comparison, not executed or authorized.** At the prior verified published input tariffs and conservative 24,576 planning tokens/call, a 24-case comparison allows 24 Level 1 calls plus at most 48 parser calls/provider:

| Provider | Maximum requests | Published tariff planning amount |
| --- | ---: | ---: |
| Jev | 72 | $0.074317824 |
| Decisions | 72 | $0.176947200 |
| Clef-flash | 72 | $0.067239936 |
| Clef | 72 | $0.424673280 |
| All four | 288 | $0.743178240 |
| Jev + Clef only | 144 | $0.498991104 |

These are planning reservations, not tokenizer measurements, guaranteed invoice caps or a spend authorization. Fewer questions do not guarantee lower token cost: explicit policy context increases Level 1 serialized bytes. Jev/flash largest proposed payload is 15,500 bytes; Decisions 17,403; Clef 15,494. Provider tokenization and future responses remain unknown. Full-workflow costs also require actual fallback and grounding evidence, outside this proposal. **This task's additional provider requests and API expenditure: zero.**

Clef still merits a deeper comparison because v4 common-task accuracy was strongest, 553/589, while its drop-in parser advantage was not established. The next bounded task should obtain R1/R2 owner decisions, reconcile only new-version labels and capability expectations, complete offline closure for any separately authorized Hindi binding improvements, then register a fresh Jev/Clef comparison with explicit policy and form-requirement metrics. OpenAI resumption requires a separate controlled plan after its 429; none was attempted here. Existing S5/S6, the 50 pending Luna stages, independent evaluation and customer rollout remain separate unfinished work.

Work stopped after this offline checkpoint. No Jev, Decisions, Clef, Luna, Places or billing calls; no purchase, deployment, frontend integration, commit, push, merge, clean or reset occurred.
