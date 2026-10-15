# Product-owner review workflow

**Current review state (2026-10-05):** the owner has approved the exact 178 independently certified cases and frozen P2–P5. Use [the current family review pack](owner-policy-v2/FAMILY_REVIEW.md): **121 cases / 19 families** remain for judgment. The [approval ledger](owner-policy-v2/approval-ledger.json) binds the original label hashes; the [policy audit](owner-policy-v2/policy-change-audit.json) preserves 21 old/new policy-derived changes. The dataset is not frozen and no held-out inference has run. The sections below describe the historical, pre-approval proposal; their old unresolved-policy/approval statements are superseded by the owner receipt.

Start with [CORE_REVIEW_REQUIRED.md](CORE_REVIEW_REQUIRED.md): **142 core cases**, grouped by shared decision and ordered by risk. Only the fields requiring judgment are presented for approval. The [complete review](review.md) remains available for context; the earlier 182-case packet is historical and also included exploratory inputs.

The independent [class-approval certificate](class-approval.json) validates all **178 deterministic cases**, with **0 moved to review**. It checks original source spans, field absence, supported capability rules, unresolved-policy exclusions and independent code-derived expectations. It grants no approval: the product owner may approve this class separately. The proof grammar is intentionally narrow and contains no provider output or dataset template lookup.

The [policy decision list](product-policy-decisions.json) identifies all **21 affected core cases**, the fields requiring a decision, possible options and downstream effects. The 40 Hindi/Hinglish inputs are separately recorded as [EXPLORATORY_UNSCORED](exploratory-unscored.json). They cannot affect core accuracy, calibration, held-out signoff or rollout readiness.

You may approve a complete family by its heading, or give corrections by case ID. For example: `partial-vehicle-date: approve all variants`, or `core-role-order-003: pickup should be ..., drop should be ...`. No approval has been inferred from creating this packet.

All labels remain **PROPOSED**. The separate JSON files preserve source offsets and review metadata; you do not need to read the raw JSON. `LABELLED` marks an authored proposed expectation, not human approval. Exploratory language cases retain unlabelled expectations because their product semantics are not yet frozen.

Please prioritize nontrivial pickup/drop direction, repeated place phrases, unsupported journeys, conflicting instructions and temporal ambiguities. Omitted-year, weekday, non-IST and generic SUV-family policy are explicitly unresolved. Approving the query's extracted words does not resolve those policies or create an authoritative timestamp.

The proposed split is 222 core development / 98 core held-out, with 40 exploratory inputs outside both. No template family crosses splits. Dataset changes require a new hash and review receipt before final held-out evaluation. Labels will never be edited to agree with a provider.

The system has performed a few independent provider preflights; it has **not** performed the final Search held-out benchmark. Customer natural-language search remains disabled. Responsibility evaluation uses a different dataset, prompts, schema, thresholds and metric calculator.
