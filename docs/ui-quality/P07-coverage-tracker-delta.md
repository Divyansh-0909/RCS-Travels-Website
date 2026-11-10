# P07 — coverage tracker delta

29 October 2026 IST. **APPROVAL_REQUIRED. Audit complete within the stated fixture scope; product fixes NOT_CHANGED.**

Approved prompt: [handoff document](https://docs.google.com/document/d/1mfFSj9kbob7mAE5CuUW9aR1LBnoHjVS0vb6w91KvzJ8). [Drive evidence folder](https://drive.google.com/drive/folders/1qP4Ig18YTCtjqNGqbXWoSPbrEoTW30lz). Local raw evidence: `output/handoff/P07-2026-10-29/`. This is P07, separate from the earlier unnumbered consistency work.

Canonical file: tools/ui-quality/coverage/master-ui-coverage.csv. All **351 predecessor rows are identical**, including parent/sibling states, stable IDs, historical failures, reachability, P03 owner deferrals, native evidence and P06 accepted fixes. No broad route/component is marked complete from these selected checks.

| Counter | Before | After |
|---|---:|---:|
| Total rows / unique IDs |351|355|
| AUDITED |30|34|
| NOT_REVIEWED |321|321|
| OWNER_DEFERRED |5|5|
| OWNER_REVIEW_REQUIRED |7|11|

Four source-evidenced children were added under W.TRACKING; all are AUDITED / OWNER_REVIEW_REQUIRED / NOT_CHANGED / FAIL, with independent fixture_functional, accessibility/responsive and visual_consistency dimensions appropriate to that case. FAIL records the reproduced defect; it is not a failed attempt to implement it. No owner aesthetic acceptance field is fabricated.

- W.TRACKING.PARTIAL-REFUND-REFRESH → P07-B02-01; source frontend/src/lib/paymentUi.js:34; frontend/src/lib/trackingPoll.js:4; frontend/src/pages/TrackingPage.jsx:439
- W.TRACKING.SETTLEMENT-FAILURE → P07-B02-02; source frontend/src/pages/TrackingPage.jsx:828-868; frontend/src/components/RideSettlementPanel.jsx:7
- W.TRACKING.RECOVERED-NOTICE-FOCUS → P07-B02-03; source frontend/src/components/ui/RefreshNotice.jsx:50-98
- W.TRACKING.TERMINAL-LARGE-TEXT → P07-B02-04; source frontend/src/pages/TrackingPage.jsx:655-670,1344-1429

The four original P07 scope roots keep NOT_REVIEWED/NOT_RUN because broader route/component coverage remains partial. This conservative parent status does not discard the detailed P07 state report. New children link to their exact finding and uploaded P07 evidence folder; the upload manifest gives individual file IDs and hashes. No speculative states or synthetic fixture endpoints are mislabelled as new product screens.

registered-surfaces.json and issues.json receive the same four additive source-bound findings; all prior issue entries remain unchanged. component-consistency-inventory.json receives phaseAssessments.P07, keeping original catalog revision/families/occurrences. owner-approved-patterns.json and consistency-decisions.json / consistency-audit-decisions.json remain byte-identical: zero invented approvals. Item12 hold remains separately documented and is not a fifth P07 defect or a blocker to this audit.

Validation:355 real source traces; zero duplicate IDs, logical duplicates, orphan parents, orphan issues or missing discovered routes; CSV round trip passes.19 tooling tests pass.304 source input hashes, HEAD and staged index unchanged. No whole website audit percentage is inferred from355 rows.

Item 03 Account backdrop repair remains accepted and unchanged. Item 12 remains OWNER_VISUAL_REVIEW_PENDING / ON HOLD at the owner’s request; no choice or standard is inferred. P03 Home/Outstation KEEP CURRENT, P04 native results, P06 fixes and approved input/button/focus/spacing choices are preserved. No P08, Android, provider operation, commit, push, merge or deployment.
