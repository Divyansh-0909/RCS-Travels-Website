# Hindi/Hinglish normalization decision and development A/B plan — 9 October 2026

## Decision

**Normalization needed: UNDECIDED. No translation layer deployed.** The temporal extension is finalized as `hindi-temporal-lexicon-v2.1`; the broader language approach is not locked for independent challenge execution. V2.1 adds the case-folded Romanized-hour lookup and reproduces all existing development/control results with zero new provider calls.

The 80 development cases improved from 37 to 67 schema-stage-valid cases. Temporal source-binding failures fell from 29 to 1. The remaining temporal failure uses an English `tomorrow` clause and a conditional AC request; it is a candidate/routing source issue, not a missing Hindi temporal word.

In 20 pre-inference-frozen English semantic controls, original and English raw complexity accuracy were both 12/20, with identical correctness on every pair. Raw query-type accuracy was 19/20 versus 20/20. Schema-stage validity was 16/20 versus 15/20. These purposive single observations do not establish a causal language-quality difference.

Vehicle/exclusion extraction improved from 10/12 in the original arm to 12/12 in English. Hindi negative vehicle wording and the negative-sharing flag remain source-binding gaps. Across all 51 SIMPLE development cases, each of the 50 erroneous pickup/drop observations lacked the exact expected candidate span; these are candidate coverage observations, not evidence that a model chose the wrong available span. English also has temporal/candidate source failures. The current evidence supports bounded original-source recognition of role markers and negation before considering a paid translation model. It does not justify deploying translation.

## Frozen development experiment

Use the original 80 diagnostic cases and the existing 20 controls. Keep their meaning labels, original text, splits and current production schemas unchanged. The controls are frozen in `output/hindi-temporal-v2-2026-10-08/english-controls/plan.json`, hash `c27af4a9d8b57f691b6eb4d07cd26c6e7f57d1d86673a2fb3f509bd4533d9a48`.

| Arm | Development behavior | Purpose |
| --- | --- | --- |
| A | Original query → current Jev/source-validation pipeline | Preserve the finalized temporal baseline |
| B1 | Original query with bounded original-span recognition of Hindi/Romanized role markers, negative vehicle and sharing expressions | Test the observed deterministic source gaps without translating place names or rewriting query authority |
| B2, only if B1 leaves significant raw semantic failures | Constrained English rendering as auxiliary interpretation input → the same production schemas and guards | Measure whether semantic improvement justifies model cost/latency; never use translated text as source authority |

B1 must be a separate development version with its own source hashes, full regression/coverage and mutation closure. It is prepared work, not an implemented change in this continuation. B2 is also unimplemented and unexecuted. No original answer is reclassified as successful to accommodate an experimental arm.

For B2, freeze a span-alignment contract before inference. Preserve original place-name strings exactly, negation scope, conditional vehicle strength, uncertainty, alternatives, changed-mind clauses, dates, omitted components and approximate/daypart precision. New or reordered auxiliary phrases must map to exact original UTF-16 spans. Reject missing, conflicting, surrogate-splitting or ungrounded mappings; retain the failure in the denominator. Auxiliary text cannot create `USER_FIELD`, place IDs, coordinates, selections or booking authority.

Examples that must retain polarity: `SUV nahi chahiye` excludes both SUV classes; `sedan mile toh theek hai` is a conditional preference; `shaam` remains a daypart with no exact clock. A failed or uncertain normalization result remains unresolved rather than guessing.

## Measurements and lock conditions

Report all-case raw routing and probability/schema validity separately from source recognition, role spans, temporal components, vehicle strength/exclusions, negative flags, alternatives, missing fields and unsupported intent. Keep all relevant failures in denominators. Report model request counts, input/output tokens, p50/p95 latency, provider failures and observed source/provenance violations for every arm.

Reuse responses only when the complete serialized provider input, questions, schema, SDK options and model identity match. Use sequential cache-first execution with successful-case checkpoints. Honor provider retry timestamps and stop at the first 429. Responsibility comparator calls remain discontinued. Search production Luna cannot be replaced by native Codex for this experiment.

Require no increase in unsafe or invented authoritative fields, 100% original-source span validity, strict schema behavior, and preservation of negative/conditional/alternative meaning before choosing an arm. A development gain alone is insufficient for rollout. Lock the smallest passing approach, then execute the separately frozen 18-case unseen construction challenge once with production-equivalent dependencies. Do not tune against or silently rerun that challenge.

**Independent challenge: PREPARED, NOT RUN. Robustness rollout gate: INCOMPLETE.** Search rollout, production dual-shadow and auto-adjudication remain off.
