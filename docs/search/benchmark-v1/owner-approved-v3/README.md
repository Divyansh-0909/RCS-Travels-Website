# Owner-approved Search label overlay ? not frozen

All 320 core labels are now approved. Original 178 certified interpretations are unchanged; 21 policy-only cases and 121 cases across 19 families follow explicit owner decisions. There are no remaining core review cases or case-specific exceptions. Forty multilingual records remain EXPLORATORY_UNSCORED and do not enter acceptance metrics.

The existing family-grouped split is preserved: 222 development / 98 held-out core records; template-family leakage is zero. No held-out inference executed. [Freeze preparation](freeze-preparation.json) records the proposed hash only; this is not a freeze receipt or permission to evaluate held-out.

[Changes](change-audit.json) retain old and new values for 68 newly affected records. Earlier P1?P5 and London-midnight audit history remains in ../owner-policy-v2/. All 19 family variants were revalidated against finite approved fixture patterns and exact source spans, independently of provider outputs. The constructor rejects changed original approval hashes. No benchmark truth is sent to model providers.

| Family | Approved cases | Status |
|---|---:|---|
| partial-passengers | 7 | APPROVED |
| time-daypart | 5 | APPROVED |
| time-approximate | 5 | APPROVED |
| role-hinglish-order | 7 | APPROVED |
| role-at-drop | 7 | APPROVED |
| role-drop-before-from | 7 | APPROVED |
| role-repeated-place | 7 | APPROVED |
| role-reversed-clause | 7 | APPROVED |
| stop-via | 8 | APPROVED |
| stop-friend | 7 | APPROVED |
| return-complicated | 7 | APPROVED |
| rental-duration | 7 | APPROVED |
| conditional-alternative | 8 | APPROVED |
| conditional-ac | 7 | APPROVED |
| conflicting-times | 5 | APPROVED |
| vehicle-self-conflict | 5 | APPROVED |
| noisy-route | 5 | APPROVED |
| overlap-location | 5 | APPROVED |
| changed-mind | 5 | APPROVED |

Label review is complete. The scored core labels/split have now been [frozen separately](../frozen-v1/README.md) under the subsequent owner authorization. This overlay and its earlier audit remain historical and unchanged. Search live development calibration, latest Luna prompt validation, scoped mutation signoff and S6 advisory AI review remain distinct engineering gates; customer rollout stays off.
