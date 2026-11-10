# Search V1 v6 — executor verification

Date: 2026-11-02, Asia/Kolkata. **READY_FOR_SEPARATE_LIVE_AUTHORIZATION.** The v6-aware executor is implemented and verified offline. The technical executor blocker from the [readiness checkpoint](search-v1-v6-benchmark-readiness-checkpoint-2026-11-02.md) is closed. **Live execution remains unauthorized and was not attempted.** No provider inference, account-metadata, billing, Luna, Places, Details, booking or dispatch calls occurred.

The accepted [owner SIMPLE decisions](search-v1-owner-simple-routing-checkpoint-2026-11-02.md), [alignment checkpoint](search-v1-decision-contract-alignment-checkpoint-2026-11-02.md), v4 execution receipts and [v4 pilot](search-v1-decision-model-live-pilot-2026-11-02.md) were used as the baseline. R1/R2 were not reopened, and production Search code and model routing were not changed.

**Identity and additive amendment.** The original registration and all its inputs, labels, candidate lists and fixed clocks remain unchanged:

```text
common contract: search-decision-common-v6-owner-simple
production question contract: ride-search-questions-v3-owner-simple
parent planHash: a9f820d6121ad94f14534136868fd31c07c4ddadbd4fca9c2b5d44fd07fce22c
executor amendment: search-v6-executor-amendment-v1
amendmentHash: 2698ba11d6baa0ff274f820c3ce8f735f608bb6936ea62780cbc06d73047db71
providers: Jev, then Clef; no Clef-flash or Decisions
cases / common questions / eligible categorical labels: 24 / 20 / 463
Level 2 field-scoring cases: 17 expected-SIMPLE booking cases
registered sources: original 56 + 6 executor/test sources = 62
liveAuthorized: false
```

The [execution amendment](../../output/search-v1-v6-executor-2026-11-02/execution-amendment-v1.json) binds the original artifact hashes, exact execution envelope, all 62 source hashes and actual parser request identities. Every execution validates the original plan hash/content, all four original artifact hashes, fixed case order, denominators and the original request manifest before claiming the activation. Sources are rechecked before every request. Outgoing wire bodies must match the registered request identity and body hash exactly; duplicate case/stage sends are rejected.

**Concrete inconsistency found and resolved through registration.** End-to-end testing found that the previous hypothetical parser request manifest omitted schema defaults. The actual parser adds `trustedLocationSelections: []` and normalizes candidate object property order. The first test correctly stopped on REQUEST_IDENTITY_DRIFT before sending the parser request. The amendment therefore adds **144 actual parser-path identities**: routing, booking extraction and location extraction for 24 cases and two providers. Each entry retains its original preview identity for lineage. The original manifest is preserved and verified; it is not silently replaced. All common-batch request identities, original queries, candidate values, questions, labels and clocks are unchanged. These are alternate possible parser paths, not 144 additional allowed requests.

**Implementation and source hashes.** Paths below are under `backend/`.

| File | Purpose | SHA-256 |
| --- | --- | --- |
| `benchmarks/search/decisionComparison/executorRegistration.js` | Verify original artifacts, schemas, sources, amendment and separate authorization | `dcc168e0e94a30ebdc1ef6564754dc0409b84182df1e42f322aa9a12f6bc852a` |
| `benchmarks/search/decisionComparison/executorEvidence.js` | Exclusive durable claims, intents, responses and terminal evidence | `5a3a0699cf32edb9876057b0272b1959476011bb13019bb5bf7c405a7aa34432` |
| `benchmarks/search/decisionComparison/executorMetrics.js` | Separate categorical/parser scoring, usage, latency and tariff accounting | `3011374e5c9d064aafa51a6a34bd05c1f89b893beaca534f69e5116e10f59282` |
| `benchmarks/search/decisionComparison/executor.js` | Actual bounded runner, parser injection, serialization and stopping | `f3c96c6d6f5c061ef34cfad87d51b7de32dc567b804c4e781989c720105fcf12` |
| `scripts/search-v6-executor.mjs` | Separate v6 prepare/verify/live CLI; no use of the v4 CLI | `268b0a1bd0ee243162b8143a1c1995eed6ddc4d5063adc0859de2aa565aaea62` |
| `tests/rideSearchV6Executor.test.js` | Synthetic end-to-end, failure, interruption and restart tests | `56a59404ac86b3e91f371515b2be83a4707a012ca0492dd0c9ed6eff42fa456f` |

**Verified execution controls.** The runner visits the exact registered 24-case order, common batch then actual parser, completing Jev before starting Clef. The existing adapters retain their strict response normalization. Jev requests `jev-latest` and must report `jev-1.14.0`; even a reported unversioned alias stops the activation and earns no registered accuracy credit. Clef uses `@cf/cloudflare/clef` with selector `clef`; an immutable weights version remains unavailable. There is no provider substitution.

The runner enforces one request at a time, a minimum 1,000 ms between starts using a monotonic clock, a 10,000 ms adapter timeout and zero retries. Wall time is used separately for authorization expiry and UTC evidence timestamps. Limits are 24 common, 24 routing and at most 24 extraction requests per provider, at most 72/provider and 144 total. Duplicate request identities cannot be sent again. Every outgoing request must fit the registered byte/reservation guard, and enough remaining request allowance and tariff headroom must exist before an intent or send.

| Scope | Maximum requests | Reserved input tokens | Planning tariff | Operational ceiling, not authorized |
| --- | ---: | ---: | ---: | ---: |
| Jev | 72 | 1,769,472 | $0.074317824 | $0.10 |
| Clef | 72 | 1,769,472 | $0.424673280 | $0.50 |
| Combined | 144 | 3,538,944 | **$0.498991104** | **$0.60** |

Each request reserves 24,576 input tokens at the registered input tariff. A 429, 401/403, 402, resource error, other HTTP/transport failure, timeout, malformed output/usage, refusal, model drift, unknown usage, source/request drift or exceeded allowance halts the **whole activation**, including the later provider. Retry-After is recorded when valid; it never triggers a retry or automatic resume. Ordinary source-binding/semantic fallback remains a measured parser outcome, with no downstream execution. Local question failures are attributed as local contract failures. Failures in evidence persistence also stop execution.

**Evaluation and accounting.** Level 1 retains all 463 eligible decisions and all 24 cases per provider, with per-task/language counts and exact positive endpoints distinct from NONE/OTHER/AMBIGUOUS choice correctness. Level 2 runs the actual parser and existing guards. Its fixed 17-case field cohort includes the three owner-resolved SIMPLE cases; a model's escalation cannot remove a difficult case from the denominator. Exact positive endpoint denominators remain 13 pickup / 12 drop. Missing fields use the registered deterministic hierarchy, without new model missing-field questions.

Metrics retain vehicle classes, exact exclusions, negation/negative-sharing cohorts, unsupported-kind sets, correct endpoint roles, original-source provenance, eligible fallback reasons, required-COMPLEX fallback observations and guard-accepted booking partials. The historical COMPLEX-only fallback annotations do not override the approved SIMPLE routing. Necessary complex-routing fallback is reported separately from descriptive binding/capability eligibility. Neither a partial draft nor a source span is a grounded, user-confirmed or submitted booking.

Original successful HTTP responses, normalized results, usage, request identities, throttle waiting, provider latency and parser duration are persisted separately. Model-drift responses remain evidence but are excluded from registered scores; their complete tariff is unknown under the locked model tariff. Known input/output counters and known tariff subtotals are retained. Failed/unreported usage or an unresolved intent makes the complete applicable cost UNKNOWN. HTTP error bodies and arbitrary exception messages are excluded; status/category and bounded valid Retry-After remain. Credits, free allocation, actual account charges and invoice caps are unverified. Complete-workflow economics remain UNKNOWN.

**Durability and restart behavior.** A global exclusive `activation-claim.json` is created, flushed with `fsync` and closed before either provider can send. Per-provider claims are also exclusive. Every request first gets its own flushed intent file; response and case-result files are exclusively created as they become available. A terminal summary retains partial results even after a stop. A hard process exit may leave only a claim and unresolved intent: that outcome and its usage remain unknown, and the next invocation refuses the claim. There is no automatic resume path, claim deletion or overwrite. A new run ID or another provider cannot bypass the same fixed activation claim directory.

**Offline verification.** The final focused Search/comparison suite passes **514/514**, zero failures/skips/cancellations, including **28 executor tests**. Both full 24-case provider passes, all original case ordering, both adapters, actual parser paths, request-body identities and fixed scorer denominators were exercised using clearly synthetic responses, usage and clocks. The complete maximum-envelope fixture dispatched **144 synthetic requests**, with maximum in-flight count one and all start gaps at least 1,000 ms. This is executor evidence, not provider accuracy or latency evidence.

Failure tests cover missing/invalid registration, changed artifacts/source/configuration, model versions/alias drift, HTTP 429/401/403/402/413/500, transport failure, malformed/refused output, invalid/unknown usage, observed token excess, budget/resource exhaustion before sending, timeout, concurrent claims, interruption during throttle, response-evidence collisions, and refusal to execute a second time. A child process exits with code 73 immediately after the flushed intent; restart sends zero requests and refuses its claim. No test silently substitutes another provider. Synthetic perfect/incorrect predictions never become benchmark truth or v6 model measurements.

Scoped lint passes **six files, zero errors/warnings**, including the repository's maximum cyclomatic complexity 21. All six new JS/MJS files pass Node syntax checks. Search-only strict TypeScript passes. Full backend typechecking still fails only on the existing unrelated StudyAI TS2719 at `services/AI/StudyAI/services/index_langGraph.ts:127`; that source was not repaired or changed. No project-wide backend test campaign, held-out run, coverage or mutation-closure claim is made.

**Evidence layout.** New evidence is under `output/search-v1-v6-executor-2026-11-02/`:

```text
baseline.json                       # protected hashes captured before implementation
execution-amendment-v1.json          # immutable execution/source/request binding
owner-authorization-template.json    # liveAuthorized:false; not an activation receipt
proposed-live-command.txt            # command prepared, never executed
focused-tests-closure.log            # final 514-test run
lint-source-final.json
search-typecheck.log / backend-typecheck.log
executor-verification.json           # preservation and current identity verification
synthetic-full-run/                  # marked SYNTHETIC; copied durable full-run evidence
  activation-claim.json / jev-claim.json / clef-claim.json
  requests/0001-intent.json ... 0144-response.json
  cases/jev-00.json ... clef-23.json
  terminal.json
activation/                          # future live location; NOT created in this task
```

Earlier failed offline-test/lint logs are retained as development evidence. The [verification receipt](../../output/search-v1-v6-executor-2026-11-02/executor-verification.json) confirms **2,196 protected files unchanged**, all **62 source hashes current**, unchanged HEAD and staged identity. Original v1–v6 registrations/receipts, frozen datasets/splits, labels, B1 evidence, v4 predictions/costs, caches, S6 package, Responsibility V5 sources, pending Luna queue and unrelated changes remain intact. There was no commit, push, merge, reset, clean, frontend integration, production model switch, rollout or deployment.

**Exact proposed activation command.** From `D:\Downloads\Repos\RCS-Travels-Website\backend`, after a separate owner instruction authorizes this Jev/Clef activation and its spending envelope, and its actual receipt is saved as the new authorization file:

```powershell
node --import tsx scripts/search-v6-executor.mjs --live --expected-amendment=2698ba11d6baa0ff274f820c3ce8f735f608bb6936ea62780cbc06d73047db71 --authorization=../output/search-v1-v6-executor-2026-11-02/owner-live-authorization.json
```

This command was **not executed**. The actual owner receipt does not exist; the separate template remains false. The gate requires exact plan/amendment/envelope binding, the actual owner reply/reference and a valid authorization interval. It does not accept the earlier v4 quota waiver. Identities and authorization are checked before reading credentials; both provider configurations must be locally available before claiming/sending. No credit purchase or billing mutation is supported.

There are no remaining executor implementation blockers. Existing Hindi extraction-binding limits and Cloudflare weights/availability uncertainty remain interpretation limits. Actual account access/free allocations were not checked. The remaining activation condition is **separate owner authorization for the exact comparison and $0.10 Jev / $0.50 Clef / $0.60 combined operational envelope**. Status is **READY_FOR_SEPARATE_LIVE_AUTHORIZATION**; live execution is **NO-GO until that instruction and its bound receipt exist**. Work stopped after offline verification.
