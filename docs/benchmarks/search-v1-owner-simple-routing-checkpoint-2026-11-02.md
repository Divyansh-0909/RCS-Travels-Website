# Search V1 — owner-approved SIMPLE routing

Date: 2026-11-02, Asia/Kolkata. The owner replied **“keep it simple for both”**, resolving R1 and R2 from the [offline alignment checkpoint](search-v1-decision-contract-alignment-checkpoint-2026-11-02.md). The [owner decision record](../search/search-owner-routing-decisions-2026-11-02.md) is the current supplemental routing authority.

- **R1: rental-only intent is SIMPLE.** Rental remains unsupported material semantics requiring existing review and submission controls.
- **R2: one preferred vehicle “if available,” including exclusions of other classes, is SIMPLE** when there is no branching journey or material conflict. Preserve preferences and exclusions; availability is not confirmed.

Production routing already explicitly allowed rental to be SIMPLE. `backend/services/search/questions.ts` now states the single-vehicle availability rule explicitly and exports `ride-search-questions-v3-owner-simple`. Multi-stop journeys, branching destinations and material conflicts retain their COMPLEX instructions. Required fields, provenance checks, unsupported-feature handling and submission controls are unchanged. Existing Hindi extraction-binding limitations remain separate from routing.

The additive **v6 offline proposal** replaces the three masked complexity targets with SIMPLE: `hh-v1-added-007`, `hh-v1-added-004`, and `hh-v1-added-033`. All other labels and original v4 label hashes are preserved. Original query inputs and candidate lists are unchanged. V4 predictions/scores and the earlier masked v5 proposal remain historical evidence; they are not rescored as v6 accuracy.

```text
contract: search-decision-common-v6-owner-simple
proposalHash: e1b031296b4e6fd0480be0ca67cfe7d995f0b1e51bc116509b28e865f83cbaf0
supersedes v5: 047de18a45483b1783262046d1b043c3b049756150af2a3d5d62a1892c4695ef
cases / model questions per case: 24 / 20
eligible model labels: 463 (previously 460)
unresolved owner routing decisions: 0
liveAuthorized / readyForLive / executable: false / false / false
```

Evidence is under `output/search-v1-owner-simple-policy-2026-11-02/`: the pre-edit baseline archives all 50 v5 source files, `owner-decisions.json` binds the exact reply, and `proposal-v6*.json` records revised tasks, labels, source hashes and inherited unexecuted planning estimates. `backend/scripts/search-owner-simple-policy.mjs` supports only offline registration and preservation verification. New artifact writes use exclusive creation.

Validation: **472/472 focused Search/comparison tests pass**, including two owner-resolution regressions. The tests check that exactly three label targets change, original artifacts remain unmodified, the new common questions match production routing and all four adapters accept the request shape. They use fake/local data and do not measure model behavior. Scoped lint checks three files with zero errors or warnings. Search-only TypeScript passes. Full backend typechecking remains blocked solely by the existing unrelated StudyAI TS2719 error at `services/AI/StudyAI/services/index_langGraph.ts:127`.

The preservation receipt records 2,167 protected files, the archived v5 sources, current v6 source hashes, and HEAD/staged identity checks. The only changed pre-existing v5 source is `questions.ts`; the prior live pilot, alignment checkpoint and outputs are preserved. No provider, Places, held-out, challenge or pending-queue execution occurred; no deployment, billing mutation or commit occurred.

The routing decisions are closed. Fresh model accuracy under the revised questions still requires a separately authorized live comparison; no such execution was authorized by this reply.
