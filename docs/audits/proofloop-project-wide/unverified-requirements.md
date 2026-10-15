# Unverified requirements, policy contradictions and open findings

Machine registers: [unmapped.json](../../../output/proofloop-project-wide-audit-2026-10-11/unmapped.json) (2514 source-specific records), [unimplemented-policy.json](../../../output/proofloop-project-wide-audit-2026-10-11/unimplemented-policy.json), [undocumented-behavior.json](../../../output/proofloop-project-wide-audit-2026-10-11/undocumented-behavior.json), [original-scenarios.json](../../../output/proofloop-project-wide-audit-2026-10-11/original-scenarios.json), [ranked-findings.json](../../../output/proofloop-project-wide-audit-2026-10-11/ranked-findings.json). Counts represent distinct source assertions/operations at several granularities, not 2514 confirmed bugs. Do not sum unknown counts across overlapping registries.

## Confirmed current enforcement gaps

Generic acceptance DS-07 bypasses owned scheduled offer/deposit callback/requested class, at [backend/routes/driver.ts:2461](../../../backend/routes/driver.ts#L2461) and [backend/services/driverAssignment.js:52](../../../backend/services/driverAssignment.js#L52). Verified-payout new-work requirement DR-06 is absent from the shared gate, at [backend/services/driverNewWorkEligibility.js:17](../../../backend/services/driverNewWorkEligibility.js#L17); payout/final-payment checks elsewhere do not satisfy VM-014/042. Document expiry DR-04 is evaluated in document recomputation, while request readiness consumes cached approval ([backend/services/driverDocuments.js:135](../../../backend/services/driverDocuments.js#L135), [backend/routes/driver.ts:284](../../../backend/routes/driver.ts#L284)). Payout replacement FN-10 overwrites current account and clears verification immediately ([backend/services/driverFinance.js:69](../../../backend/services/driverFinance.js#L69)), contradicting recovered A-active/B-pending and accepted-ride continuity. These are static findings, not production exploits.

Maintenance OP-06 is separate: clean-bookings has report-only and remote flags, while clean-seed-data logs a nonlocal host without refusing --write. Both are operator CLIs, not registered public routes. Future guard verification must use owned disposable data; neither DB-reading dry run nor deletion was executed here.

## Authority and scope decisions still required

ETA/whole-calendar feasibility, traffic/unknown fallback, timing buffers, scheduled online/connectivity recovery and short-notice collapse remain unassessed or need current owner-approved replacement. Original VM numeric feasibility candidates must not become approved rules from their presence in a table. Current 15/45 owner hold code provenance remains distinct from V1 proportional candidate windows. Later-pickup/customer-choice enforcement is not fully recovered. Group-level sharing economics and the implementation's commission-free loyalty exception need explicit disposition.

Financial semantics for failed pickup, driver late/offline, rider cancellation and replacement failure are NOT_YET_SAFE; platform assignment failure is explicitly nonfinancial. These accepted limits are not permission to implement consequences. Only supported driver-cancellation financial scope is approved for the existing executor. Additional incident-family detector event authority and real GPS/connectivity/traffic history are not fabricated.

Marketplace economics are approved but current claim/post UI is local/not connected; no production marketplace post/claim/settlement endpoint was discovered. OverchargeFlag has no recovered production writer; DriverReview production submission/overcharge moderation integration remains unproven (seeded reviews are not customer submit evidence). Planned multi-stop product support is distinct from rejected/unsupported parser authority.

October 6 Search P2/P3/P4/P5/P6 already resolve omitted year, calendar weeks, explicit timezones, generic negative SUV/XL and bare H12 PM. Older S4 documents saying those are unresolved are superseded. Normalization choice and language unseen challenge/evaluation/rollout are still open. Customer NL UI/handoff and pending S5/S6/S7 evidence remain separate from Responsibility/Phase 9.

## Cross-cutting failure hypotheses

Different freshness bases: dispatch reads location updated_at/receipt horizon, while cancellation/geofence uses observedAt and accuracy. Compare all consumers without blaming a captain from an inferred location. Different idempotency grains: wallet unique event keys, provider IDs, booking/owner incident IDs, conversation messages and final lineage protect different duplicate domains. Test logical conflicting identity/amount, not only duplicate same bytes.

Provider work outside transactions creates lost-response/retry and stale-preflight gaps. Swallowed logging/provenance failures and claimed-before-send alerts can lose observability even when application state is correct. Process-local scheduler flags are not distributed leases. Hardcoded client copy and stale PDF/RAG translations can contradict server economics without changing the server; legal disclosure remains externally confirmable.

No comprehensive production telemetry, deployment grants, retention evidence, exact saved-input UI replay, native Maps/GPS verification, independent human evaluation or live provider certification was acquired. Source controls cannot prove issuing-authority document truth or device behavior. Requirements with incomplete provenance stay in the explicit unknown register.

## Historical findings: current disposition

RCS-01 ordinary 5% commission: superseded by owner-approved current 10% and ₹799/₹800 assertions; do not rebill history. RCS-28 foreign hold/release: corrected in scoped Phase 9 owner reservations, preserve original-owner hold-until-terminal amendment and actual financial/backend replay evidence. RCS-29 refund terminal regression: current row lock/reread/identity/terminal guards supersede old implementation, but broader provider correction/reconciliation scenarios remain candidates. RCS-02 generic acceptance and RCS-03 expiry remain source-confirmed. RCS-04 accepted-work recovery remains an unresolved contract boundary; do not infer safe device completion from status-only tests. RCS-05 feasibility and RCS-30 loyalty remain open scope/authority decisions. Other RCS findings are retained as historical candidates pending exact enforcement revalidation, not blindly called current bugs.

Original V1/VM rows describing tests as missing are historical. Current Responsibility/Phase 9 evidence supersedes those coverage descriptions only within its supported cases/source/config scope. Phase 8.2 retirement removes that earlier blocker. Search/Responsibility partial API/native comparator queues are preserved; no automatic resumption occurred.

## Concurrent changes and evidence discrepancies

- [backend/tests/e2e/phase9CaptainJourney.mjs](../../../backend/tests/e2e/phase9CaptainJourney.mjs)
- [backend/tests/e2e/phase9CrossApplication.mjs](../../../backend/tests/e2e/phase9CrossApplication.mjs)
- [backend/tests/e2e/phase9CrossClosure.mjs](../../../backend/tests/e2e/phase9CrossClosure.mjs)
- [backend/tests/e2e/phase9Native.mjs](../../../backend/tests/e2e/phase9Native.mjs)
- [backend/tests/helpers/phase9BrowserHarness.js](../../../backend/tests/helpers/phase9BrowserHarness.js)
- [backend/tests/integration/phase9CrossApplication.test.js](../../../backend/tests/integration/phase9CrossApplication.test.js)
- [backend/tests/run-phase9-native.js](../../../backend/tests/run-phase9-native.js)
- [frontend/src/components/ResponsibilityReviewForm.jsx](../../../frontend/src/components/ResponsibilityReviewForm.jsx)
- [frontend/src/lib/responsibilityReviewAction.js](../../../frontend/src/lib/responsibilityReviewAction.js)
- [frontend/tests/responsibilityReviewAction.test.js](../../../frontend/tests/responsibilityReviewAction.test.js)
- [tools/phase9-native/maps-test.mjs](../../../tools/phase9-native/maps-test.mjs)

These changes belong to independently continuing Phase 9C. Current reviewAction/payload code was re-read: it binds current evidence/version and validates human decision/classification/level; current form/navigation/cross-role recipe expansion is implemented source, not a newly audited execution PASS. The changed Maps helper was also re-read: it checks the owned test package/outside-repository paths and stages SDK-only TLS domains. No key file was read and no Maps/device execution was performed by this audit. Revalidation warnings accompany UI-01/02/03, BK-02, RS-03/04, EX-04 and GP-02. The source hashes, not a stale HEAD-only checkout, identify audited state.

The selected receipt hashes match. Mutable latest-build/phone-awake pointer mismatch is explicit. Native prose's 156 branch count conflicts with the manifest/raw nine-module total 157; no underlying report was edited or totals combined.
