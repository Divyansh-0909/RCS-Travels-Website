> Current owner-policy development audit: [search-s6-development-audit.md](search-s6-development-audit.md). One interpretation pass produces form-resolution requirements; historical follow-up wording below never authorizes an AI conversation.

# Search S6 — tool audit preparation

Status: **PREPARATION ONLY**. S5 is incomplete; no S6 final evaluation, tool-contract freeze, held-out run or customer rollout is authorized. The roadmap is S1–S4 complete, S5 live evaluation, S6 required tool audit, S7 controlled rollout. Rollout requires both S5 and S6 signoff.

This audit applies [Anthropic's Writing effective tools for AI agents](https://www.anthropic.com/engineering/writing-tools-for-agents): expose few capabilities with clear purposes, supply useful concise responses and actionable failures, and improve definitions from development traces. A deterministic application operation need not become an agent tool. These principles guide the review; they do not require adding tools.

## Current inventory

| Capability | Classification | Source | Boundary / recommendation |
|---|---|---|---|
| Jev finite-choice routing/extraction | APPLICATION-ORCHESTRATED CAPABILITY | `backend/services/search/provider.ts`, `questions.ts`, `parser.ts` | Application supplies independent questions/candidates; Jev answers finite choices. This is inference, not model-selected function execution. |
| Luna structured interpretation | APPLICATION-ORCHESTRATED CAPABILITY | `backend/services/search/complex/luna.ts`, `service.ts` | Application decides fallback eligibility and calls Responses with a strict output format. No callable tools are registered. |
| Candidate generation, span/membership verification | DETERMINISTIC UTILITY | `locations/candidates.ts`, `provenance.ts` | Preserve UTF-16 ranges, query ID/revision and bounded candidate IDs; never delegate identity checks to a model. |
| Autocomplete | APPLICATION-ORCHESTRATED CAPABILITY | `locations/places.ts`, `service.ts`, `backend/routes/googleAPI.js` | Selected source phrase → suggestions; retain session token. No model may choose authoritative geography. |
| Place details / canonical-ID refresh | APPLICATION-ORCHESTRATED CAPABILITY | `locations/places.ts`, `grounding.ts` | Only after explicit selection. A changed canonical ID requires explicit reselection; no coordinates accepted from the refresh suggestion. |
| Date/time resolution | DETERMINISTIC UTILITY | `temporal.ts`, `backend/lib/scheduling.js` | Components → code arithmetic → existing >30-minute / ≤168-hour bounds. P2–P4 integration and calendar-week anchor need explicit verification. |
| Timezone conversion | DETERMINISTIC UTILITY | owner-policy evaluation overlay; future temporal integration | IANA/ICU source, not model arithmetic. Preserve original zone, converted IST and confirmation; detect DST gaps/folds and ambiguous abbreviations. |
| BookingDraft and cross-field validation | DETERMINISTIC UTILITY | `contracts.ts`, `validation.ts` | Shared provider-independent contract; no invented values/defaults. |
| Unsupported/service capability validation | DETERMINISTIC UTILITY | `validation.ts`, `complex/evidence.ts`, `locations/review.ts` | Preserve unsupported stop/return/rental/passenger-enforcement/preferences; never flatten into a supported ride. |
| Follow-up merge / trusted corrections | DETERMINISTIC UTILITY | `locations/session.ts`, `sessionRefs.ts`, `sessionTemporal.ts` | USER_FIELD provenance wins; invalidate derived state. |
| Booking submission, charge, driver assignment | NOT A TOOL in this workstream | Existing booking flow, outside parser | Explicit user confirmation and existing authenticated application flow only. |
| Custom functions / MCP tools for the search model | NOT A TOOL (none installed here) | No registrations in the current interpreter | No demonstrated need. Do not convert every helper into a model-callable tool. |

**Proposed model-callable tools: none.** The current search workflow does not require an autonomous agent to select tools. S6 can validly confirm this after its evaluations. If development evidence later justifies a tool, create a separately versioned contract with a measurable benefit and the same grounding/confirmation protections.

## Google Places control

**MODEL-CONTROLLED GOOGLE PLACES: NO.** Luna interprets semantics and returns validated spans. Application code checks query revision/candidate membership, calls Google and asks the user to select. Tool calling would not establish user intent or make the first suggestion authoritative. No development trace currently demonstrates a benefit sufficient to change that boundary.

## Boundary, naming and schema review

Business context must keep `query_id`, `query_revision`, `candidate_id`, `vehicle_class`, `place_id` and `draft_revision` conceptually distinct. Existing provider-independent contracts use corresponding camelCase names. Never expose an ambiguous `id`, `data` or `value` without its domain context. Query spans must match the original UTF-16 slice. Finite choices must include missing/unclear states; absence is not false, now or any vehicle.

Current issues to verify in development: overlapping source candidates; stale query revisions; a copied place ID mistaken for a validated Google selection; provider-failure fallback mistaken for semantic ambiguity; trusted fields needlessly duplicated in Luna payloads; optional fields becoming inference defaults. Bounded text/count limits already exist in shared schemas. Any future tool must describe when to use it, when not to, required/optional inputs, identifiers, output authority and safe recovery. Tool descriptions alone cannot enforce these properties.

## Response / error / efficiency review

Keep responses at the domain boundary: candidate ID + source span, compact draft fields/issues, or place ID + display text followed by confirmed details. Do not send raw Google payloads, database rows, credentials or extra personal location data to a model. Error responses should identify a recoverable category and safe action, such as reselecting a changed place or refreshing a stale query revision, without exposing provider bodies.

Current callable-tool definitions: **0**; definition payload: **0 bytes**; model-selected tool chains: **0 by construction**. This does not measure model input/output tokens or application request cost. Actual inference usage and autocomplete/details counters remain separate. Future audit measurements must include per-request provider-reported tokens, payload bytes, question count, application request count, repeated identical calls, fallback count and session-token reuse. Byte counts are not token counts. Monetary cost remains unavailable without versioned authoritative pricing.

Search development traces are not yet a complete live S5 cohort. Existing Luna/Google preflights demonstrate adapter/selection behavior, not real Jev search accuracy. Do not fabricate wrong-tool-selection rates or tune from held-out traces. When development transcripts exist, inspect invalid candidate IDs, redundant questions/fallbacks, duplicate Places calls, unwanted details lookup, failure recovery and excess partial-draft payload. Do not transfer responsibility results or thresholds into this audit.

## Explicit AI verifier design

The eventual S6 AI review receives a **search-only, development-only** packet:

- inventory and version/hash; actual callable definitions (currently an empty list), schemas and descriptions;
- redacted development application traces, input/output shapes and safe failures;
- latency, request counts, provider-reported usage and authoritative cost inputs, if available;
- frozen search invariants and engineering acceptance criteria, without held-out labels/results or responsibility data.

The verifier must return strict structured advisory findings:

```typescript
type ToolAuditFinding = {
  capability: string;
  category: 'BOUNDARY' | 'NAME' | 'DESCRIPTION' | 'SCHEMA' | 'OUTPUT'
    | 'RECOVERY' | 'REDUNDANCY' | 'MISSING_CAPABILITY' | 'UNNECESSARY_CAPABILITY' | 'TOKEN_WASTE';
  severity: 'BLOCKER' | 'IMPROVEMENT' | 'INFORMATION';
  developmentTraceIds: string[];
  observedProblem: string;
  proposedChange: string;
  deterministicChecksRequired: string[];
};
type ToolAuditReview = {
  inventoryVersion: string;
  inputPacketHash: string;
  modelCallableToolsRequired: boolean;
  findings: ToolAuditFinding[];
  limitations: string[];
};
```

No execution privileges are granted to the verifier. Engineering independently checks every finding against code and deterministic safety tests; unsupported recommendations are rejected with a reason. A recommendation is never a product decision, ground-truth label or authority to modify a tool. Keep review/model/config/input hashes and dispositions for reproducibility.

When implemented, the reviewer adapter must use a strict schema: capability IDs drawn from the inventory, trace IDs validated against the supplied development packet, a 64-character hexadecimal packet hash, at most 30 findings / 12 limitations / 16 trace references per finding, and bounded text (for example 1,200 characters per observation/recommendation). Unknown keys and foreign/held-out trace references fail closed. Use a separate `SEARCH_S6_*` reviewer configuration; no responsibility prompts, labels, thresholds or production tools are supplied. These are proposed audit-resource bounds, not calibrated search acceptance thresholds.

S6 sequence remains definitions V1 → development/static/AI review → justified improvements → repeat development evaluation → freeze version → separately authorized held-out evaluation. No final S6 evaluation has executed in this preparation pass.

## Readiness

Inventory and verifier design are ready for S6 preparation. Final S6 signoff is not ready: S5 family approvals, live development coverage, policy integration/temporal edge checks, measured efficiency and quality signoff are still required. Search rollout and both responsibility automation modes remain disabled.
