# Search V1 S5 — live executor verification

Date: 2026-11-03, Asia/Kolkata. **Phase A and Phase B are READY_FOR_SEPARATE_LIVE_AUTHORIZATION.** The real development-only execution boundary is implemented and verified with fake HTTP responses through the actual provider transports, SDKs, adapters and application guards. **Neither phase was executed live.** Both authorization templates retain `liveAuthorized: false`; account access/quota verification and actual owner authorization remain outstanding. Production Search remains OFF.

This continues the accepted [S5 current-source readiness registration](search-v1-s5-current-source-continuation-readiness-2026-11-03.md), [post-v6 Hindi binding closure](search-v1-post-v6-hindi-binding-closure-2026-11-03.md), [completed v6 comparison](search-v1-v6-retry-checkpoint-2026-11-03.md) and S1–S5/owner contracts. This checkpoint closes the live-executor implementation blocker from the earlier readiness report. It does not authorize inference or alter settled rental/vehicle policy.

**Verified parent and additive amendment.** The original v2 registration, all 55 parent sources, installed dependency metadata, frozen dataset/split identities, original development/50-case order and fourteen reusable Jev observations are preserved and reverified. No historical manifest is updated to claim the new executor existed earlier.

```text
parent registration: search-s5-current-source-continuation-v2
parent registrationHash: 6bc21e82c8bd6046cbe88359306eb343fde5168be13f02e21dc1cebcc6bce1c3
parent sourceIdentity: 77a6b34321b35b42919096aaaec36aa41cfb137a2745dbc140bf0256fce9eddb
datasetHash: 2c2a0d7099c4b65be9495d08d5049e72fb44b6d49f84b82c65dbaf643ca61296
splitHash: aea66b52ac37ddea99d4bb1c2861d63c70c7e7a3e84f7946a9c0a1a5414ef5de
execution amendment: search-s5-live-executor-amendment-v1
amendmentHash: f1cc95b405d116c0878c0612ea859355e1f30d973d4a3d6134abf9a5f5b770c9
execution sourceIdentity: 489b30fa08c38ba19866d7bc3e9460294aa12d9cc1f0582f7d5180cc910b0d74
registered sources: 78
known requests: 16, comprising 1 Luna plus 15 hypothetical Jev branch shapes
liveAuthorized: false
```

The [execution amendment](../../output/search-v1-s5-live-executor-2026-11-03/execution-amendment-v1.json) binds the complete current source/import closure, dependency versions, phase envelopes, authorization schema and exact parent/global request identities. Its 78-source closure contains the unchanged 55 parent sources, ten new files and thirteen additional existing dependencies, including the reused v6 executor safeguards. Verification rebuilds the closure and request manifest; dropping a source or weakening a phase envelope does not bypass the fence.

**Implementation.** Only additive backend tooling and tests were created. Existing Search production source, routing questions, candidates, Hindi binding, form policy, provider selection and historical executor files were not edited.

| New file under `backend/` | Responsibility | SHA-256 |
| --- | --- | --- |
| `benchmarks/search/s5Executor/registration.js` | Exact parent/amendment verification; separate phase authorization | `44654ea8dae30455fcf8ef65327f023ec34649fee813a2eec82b67e1b8803a42` |
| `benchmarks/search/s5Executor/executor.js` | Actual parser/interpreter orchestration, request/usage fencing, phase separation | `0b344abb48fd69494109e6821a91c89dc6ba1844b822d2aefe31e07d351bb307` |
| `benchmarks/search/s5Executor/evidence.js` | Durable global execution/stage claims and committed receipts | `54bcbda24a8d7641945743a2d6dae45b578eb016cc35d9122d14e0c1f708965e` |
| `benchmarks/search/s5Executor/accounting.js` | Phase reservations, actual token/cache accounting and stop categories | `01ab1528fd4d2a36dfb27d1c84cdae257f171536aa5e1631f7284ce6853e3ad5` |
| `benchmarks/search/s5Executor/adoption.js` | Existing production adoption guards in composition order, deferred grounding | `b060f927c177945860f8ef9535d34fe3e5955f033abce2169c56862ede707ec8` |
| `benchmarks/search/s5Executor/transports.js` | Existing Jev HTTP transport and actual OpenAI Responses SDK; guarded final wire | `7fe6ab7006734f05c7d2de92da048e5780033da47f395a7ea0a058c428674e5b` |
| `scripts/search-s5-live-executor.mjs` | Offline prepare/verify and independently authorized live-phase entry point | `39325f4a7748e50d9b75dcd8a404361fa9162c029e9e2ac32c23e2dd10103c25` |
| `tests/helpers/searchS5ExecutorFake.js` | Fake HTTP over the same real transport/SDK path; explicitly synthetic receipts | `30d07aa6d4e8ee26d8faf6a27b515eb31ebdafc502818e0de3313f619ccfc62c` |
| `tests/rideSearchS5LiveExecutor.test.js` | Successful flows, branch selection, parity and phase isolation | `77abf352865dc930df8f7ebaeea1da7a97c712fc95a403eeaa3a51e3a9b6cc6e` |
| `tests/rideSearchS5LiveSafety.test.js` | Failure, budget, expiry, concurrency, persistence and double-send checks | `b633ac8acddc562540f4e3066f7ac1e089895d6904bc35ab9bad3fda70630d59` |

The executor reuses v6 `durableJson`, activation claims, exclusive evidence persistence and the corrected deadline scheduler. It adds the global stage/execution ledger required across S5 phases and later amendments. Credentials remain outside requests/evidence. The CLI reads existing `backend/.env` in memory only after source, amendment and actual phase authorization pass; only the selected phase's provider is constructed. No `.env` or production credential was read during offline preparation/verification.

**Exact execution envelopes.** Each phase has its own authorization, activation ID, budget and terminal receipt. There is no automatic transition between phases.

| Property | Phase A | Phase B |
| --- | --- | --- |
| Registered cases | `core-ambiguity-conflict-001` only | Five cases below, in original order |
| Provider | OpenAI Responses `gpt-6-luna` | Jev `jev-latest`; require returned `jev-1.14.0` |
| Integration | Existing Luna interpreter, SDK 7.10.0 | Existing Jev provider/normalizer, SDK contract 0.6.0 and proven v6 HTTP transport |
| Maximum requests | **1 Luna; 0 live Jev** | **5 routing + at most 5 eligible extractions = 10 Jev** |
| Input reservation | **65,536 tokens** | **24,576 tokens/request**, up to 245,760 total |
| Output allowance | **4,096 tokens**, including charged generative output | Output uncharged on Jev; reported counters retained |
| Planning tariff | **$0.01024** | **$0.010321920 maximum** |
| Operational ceiling, proposed not authorized | **$0.02** | **$0.02** |
| Maximum timeout | **15 seconds** | **10 seconds/request** |
| Concurrency / minimum start gap / automatic retries | **1 / 1,000 ms / 0** | **1 / 1,000 ms / 0** |
| Automatic downstream work | **No Places, Details, booking or Phase B** | **No Luna, Places, Details, booking or Phase A** |

The ceilings are thresholds for execution control, not owner spending authorization or guaranteed invoice caps. Pricing assumptions remain those checked in the parent registration; a new activation requires current provider-specific access/quota/pricing verification. Actual credits, free allocation, taxes, account invoice effects and future availability remain unknown.

**Phase A data flow and identity.** Before execution, the current parser is replayed only over the exactly reusable Jev 1.14 observation. Its API identity, query ID/revision/text, fixed clock/timezone, candidates, partial draft, trusted fields and current COMPLEX_QUERY fallback are regenerated and checked. The actual current Search composition service constructs the Luna input. Existing `createLunaInterpreter` builds the strict `ride-search-luna-v1` request with reasoning low and maximum output 4,096.

The exact request has **56,611 serialized bytes**; the planning reserve includes an additional 4,096-byte margin. The OpenAI SDK's final outgoing JSON is captured offline and checked again immediately before a future HTTP send. In this installed SDK it equals the registered adapter request; no unregistered request defaults were discovered.

```text
Phase A parent request identity:
3018454351776f57e390dde06557dc77b959bb6f2b5e59dd7e6d7af150b0c671
Phase A durable global network identity:
e581ddebb6f88f33b6cbb3c64ec844a4b9a70b03ef2b92f97edae7436733f2fc
```

After strict SDK/adapter normalization, application adoption executes the same public functions in production composition order: span normalization, safe partial preservation, source/unsupported/conflict evidence validation, direction/endpoints, temporal/missing-field requirements, review merge and form projection. **Grounding is explicitly deferred**, with source-owned roles recorded and zero provider calls. No empty Places result or simulated provider outage is inserted into live evaluation data.

An independent test runs the actual production composition service with fake Places and the same normalized Luna response. Its interpretation snapshot and effective review draft match the executor's deferred-adoption result after JSON canonicalization. Model selection of one conflicting schedule is not accepted as a settled time: the existing owner-conflict guard preserves both alternatives and requires form selection. Invalid source facts/aliases or model-created user selections stop the activation. Proper ambiguity and unresolved forms are valid evaluation outcomes, not fabricated complete bookings.

**Phase B data flow and identities.** The current parser executes the five inputs directly, using registered clocks and current routing/questions/candidates. Only the branch requested by its accepted routing can send extraction. Complex/unrelated routes make no extraction request, and eligible fallback is recorded without executing Luna. Invalid source membership/provenance or output schemas stop; ordinary guarded role ambiguity can remain a recorded fallback result. A generic parser error is accompanied by its specific transport/local attribution, rather than relabelled a network failure.

| Order | Case | Durable global routing identity |
| ---: | --- | --- |
| 1 | `core-standalone-003` | `1ee3277d11ff487fa8d50c35c518d646b2e8d2abcd6f7fb52409406c7c276ab8` |
| 2 | `core-standalone-020` | `786617c14442f5190e5705dab097ccd4b707a221184f5ce1848ea6540287beed` |
| 3 | `core-standalone-021` | `0d871619433e5eafd95793c6052a285c1967da1bc142f4cb274d62e8a64b65c0` |
| 4 | `core-complete-simple-029` | `83c7a4ef83958821b1771ecba0851095637d6b3956fcdea394033bea03cb7d03` |
| 5 | `core-date-only-004` | `939689fef866ad259ba41e537012f652ec3fd683d2afcec3625f7af9da94fe4b` |

The amendment contains all routing, booking-extraction and standalone-location branch identities for these cases: fifteen prospective Jev shapes, **not fifteen permitted calls**. Actual transmitted JSON must match the registered branch exactly. The final wire guard also pins endpoint/method, expected returned model, timeout and zero retries. Existing fourteen reusable Jev observations are not re-executed, and new results never overwrite historical Jev 1.13 rows or original pending manifests.

**Separate authorization schemas.** Unapproved templates are [Phase A](../../output/search-v1-s5-live-executor-2026-11-03/phase-a-authorization-template.json) and [Phase B](../../output/search-v1-s5-live-executor-2026-11-03/phase-b-authorization-template.json). The strict JSON schema is embedded in the amendment. Each eventual receipt must independently contain:

- `liveAuthorized: true`, the exact phase, a unique safe activation ID, parent registration hash, amendment hash and identical phase envelope.
- The actual owner instruction and conversation/evidence reference; no generic prior v4/v6 waiver is inherited.
- Explicitly zoned `issuedAt`/`expiresAt`, valid at send time, with at most 24 hours between issuance and expiry.
- Current provider access, quota and pricing verification, its reference and zoned check time, at most 24 hours old. Phase A requires Standard/non-regional/default-30-minute-cache terms; Phase B requires input-only Jev pricing without long context.

Templates leave approval false and owner/time/check references unfilled. Test-only authorizations also have approval false, an explicit synthetic marker and “not owner authorization” text; live mode rejects them. Account checks are assertions that must be supported before a real receipt is created; this task did not probe an account, buy credits, change billing or manufacture those assertions.

**Durability and double-send prevention.** Live evidence paths are fixed under the workspace; live mode rejects directory/hook overrides. Global network identities hash canonical final wire JSON, endpoint, expected returned model, timeout and retries. They intentionally exclude activation IDs and amendment hashes, so a fresh authorization or code amendment cannot resend an already claimed identical stage.

`output/search-v1-s5-global-stage-ledger/` holds append-only stage claims and a serialized execution chain. Required already-claimed stages are refused before a new activation is created; the send-time exclusive stage claim is a second guard. Global execution claims prevent overlapping activations across phases. Each request intent is exclusively written and fsynced before its HTTP attempt. Successful raw provider JSON, normalized outputs, usage, actual wire, latency, errors and case results have separate exclusive receipts.

A committed activation requires its terminal, global terminal and final hash-bound commit marker. A crash, missing marker, stopped predecessor or unresolved intent blocks automatic succession/restart. No claim is deleted, reused or reset. Failed writes stop further sends; a returned in-memory result cannot stand in for a missing durable commit. Recovery requires separate review/amendment, not a retry switch. Transport latency is recorded using the outer monotonic execution clock; frozen parser-context clocks are not used as performance evidence.

**Accounting and stopping.** A full conservative next-call reservation is checked before send. Actual input/output usage is recorded even when later validation rejects output. Luna cache reads and 30-minute/12-hour writes are priced as disjoint token buckets, with totals cross-checked; output is charged at the generative Responses rate. Twelve-hour writes or a changed/unknown processing tier stop because they differ from the registered terms. Missing totals/buckets, inconsistent counters, excess usage or model drift stop before any further request. Failed/unknown requests leave the total tariff unknown, while preserving known subtotals. Actual invoice charges remain unknown for every run.

The existing SDK and official cache-usage contract support these counters; writes are not added twice and Decisions' free-output tariff is not used. [OpenAI prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching).

Any 429, authentication/payment/resource or other HTTP/transport failure, timeout, refusal, malformed/schema output, model drift, unknown/excess usage, source/request mismatch, stale parent, invalid candidate/trusted binding, duplicate stage, budget breach, persistence failure or interruption stops that activation. Expiry and source hashes are checked around request construction and again at the final network boundary and after the response. HTTP error evidence retains only bounded status/category/Retry-After, never arbitrary provider error bodies. Correctly required form review and contained semantic ambiguity remain evaluation results. No stop advances another phase or triggers a provider switch.

**Offline verification.** The final focused Search/adapter/stage/language/executor suite passes **589/589**, zero failures, skips or cancellations. This includes **53 new executor tests** using the real Jev HTTP/OpenAI SDK transport paths with fake fetch responses. No fake output is counted as model accuracy.

| Verified behavior | Evidence |
| --- | --- |
| Phase A exact current parent/request, valid structured output and safe adoption | Complete synthetic phase; one fake HTTP request, no live Jev/Places/Details |
| Production-equivalent guard sequence | Independent interpretation-snapshot/effective-draft parity with actual composition service |
| Conflicting schedules | A model-selected single time becomes the preserved ambiguous source alternatives; submission stays false |
| Invalid spans, invented location/user selection and wrong query revision | Schema/source rejection with known usage retained where available |
| Phase B exact order and selected branch | Five cases, ten fake Jev calls in the full-branch witness; complex/unrelated controls make only five routing calls |
| Model/provider failure attribution | 429, 401/403, 402, 413 and 500 for both providers; malformed probabilities/schema, model and usage errors |
| Accounting | Reservations, request caps, unknown/excess usage, cache discrepancies, processing-tier drift and partial known charges |
| Authorization | Unapproved/incorrect-phase receipts, expiry, unzoned timestamps, incomplete account verification and expiry after a paid-attempt response |
| Durable execution | Fresh-authorization duplicate refusal, interruption/restart refusal, concurrent-phase exclusion and stage/intent/response/case/terminal/commit write failures |
| Real timeout boundary | A stalled fake HTTP request is stopped by the 15-second Phase A timeout, without retry |
| Source and authority | Source/request fences before HTTP; no automatic Luna, geographic confirmation, booking, payment or dispatch |

Scoped lint passes **10 new files**, zero errors/warnings, with cyclomatic complexity at most 21. Search-only strict TypeScript passes. Full backend typecheck still reports only the existing unrelated StudyAI TS2719 at `services/AI/StudyAI/services/index_langGraph.ts:127`. Full backend tests, coverage/exhaustive mutation closure, sealed held-out/challenge runs and independent S6 execution are not claimed. Earlier diagnostic logs are retained; the final suite is authoritative for this amendment.

Reviewable [offline witnesses](../../output/search-v1-s5-live-executor-2026-11-03/offline-witnesses.json) are additive under the executor directory. `synthetic-complete/` contains both fake phases, eleven fake HTTP exchanges, their append-only global ledger and committed receipts. A second Phase A authorization produces zero additional fake requests. `synthetic-interrupted/` retains an interrupted intent with zero HTTP dispatches; restart is refused with zero subsequent sends. These nested synthetic roots do not create or consume the real workspace global stage ledger.

**Preservation.** The [preservation receipt](../../output/search-v1-s5-live-executor-2026-11-03/preservation.json) checks **4,008 protected files unchanged**, including all original S5/v6/Hindi evidence, parent registrations and caches, original queue/split/labels, S6 material and unrelated work. All **78 execution sources** and the unchanged **55-source parent registration** verify. HEAD and staged identity are unchanged. No existing source/evidence file was intentionally edited. The real activation/global-stage ledger was not created, and both live authorization templates remain false.

**Exact proposed activation commands.** These commands are prepared, **not executed**. Run from `backend/` only after the corresponding new owner-authorized receipt has been supported and saved. The template file is not a live receipt.

Phase A:

```powershell
node --import tsx scripts/search-s5-live-executor.mjs --live --phase=A --expected-amendment=f1cc95b405d116c0878c0612ea859355e1f30d973d4a3d6134abf9a5f5b770c9 --authorization=../output/search-v1-s5-live-executor-2026-11-03/phase-a-owner-live-authorization.json
```

Phase B, separately authorized:

```powershell
node --import tsx scripts/search-s5-live-executor.mjs --live --phase=B --expected-amendment=f1cc95b405d116c0878c0612ea859355e1f30d973d4a3d6134abf9a5f5b770c9 --authorization=../output/search-v1-s5-live-executor-2026-11-03/phase-b-owner-live-authorization.json
```

The offline verification command already passed:

```powershell
node --import tsx scripts/search-s5-live-executor.mjs --verify
```

**Recommendation and remaining conditions.** Both phases are **READY_FOR_SEPARATE_LIVE_AUTHORIZATION**; no implementation blocker remains in the tested boundary. Actual provider/account availability, quotas, current tariffs/default terms and accepted maximum spending must still be established in each real receipt. The known historical 429s or their expired retry windows establish none of those facts. No inference is authorized by this implementation request.

Work stops here. There were **zero live Jev, Luna, Clef/Decisions, Google Places/Details, booking, payment or dispatch requests**, and zero live account checks. The original 50-case queue and other 214 fresh-Jev cases were not executed, held-out/challenge labels were not inspected, S6 did not run, customer Search remains OFF, and no provider/owner policy, billing, commit, push, merge, reset, clean or deployment action occurred.
