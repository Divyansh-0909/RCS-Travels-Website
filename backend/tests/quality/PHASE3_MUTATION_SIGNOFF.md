# Phase 3 evidence-helper mutation sign-off

The four Phase 3 test-only helpers have 181 generated mutants and zero survivors.
The focused test runner is `node --import tsx --test tests/phase3Evidence.test.js`.

| Helper | Generated | Killed | Survived |
| --- | ---: | ---: | ---: |
| `connectivityEvidence.js` | 25 | 25 | 0 |
| `locationEvidence.js` | 27 | 27 | 0 |
| `notificationSink.js` | 87 | 87 | 0 |
| `routingEvidence.js` | 42 | 42 | 0 |

The first all-helper run found two surviving location mutants. The location
tests were tightened and that helper was rerun: 27/27 killed. The navigation
service-shaped methods were then added to the routing fake and that helper was
rerun: 42/42 killed. The other two helpers were unchanged after the all-helper
run. These are the final per-file results, not one full run against the final
tree. `stryker.phase3.config.mjs` can rerun all four together.

Mutation applies to the Phase 3 helpers only. It does not claim current
production routing, location upload, or notification behavior is verified.
