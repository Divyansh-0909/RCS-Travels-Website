# Search S3 mutation signoff

Search-only signoff, 2026-10-03. S4 and responsibility/Phase 8 remain outside scope.
Exact source hashes, report namespaces, mutant IDs and grouped proofs are retained
in [the audit](search-s3-mutation-audit.json). Reconciliation checked that every
surviving mutant has exactly one disposition.

## Measured results

| Status | Count |
| --- | ---: |
| Total unique current-source mutants | 2,659 |
| Killed | 2,486 |
| Timed out | 4 |
| Uncovered / compile errors / runtime errors | 0 / 0 / 0 |
| Survived | 169 |
| Proved equivalent | 115 |
| Non-actionable internal/message/error-origin changes | 22 |
| Unchanged legacy Google proxy test debt | 32 |
| Meaningful surviving S3 mutants | **0** |

The 32 legacy survivors are **not claimed equivalent**. They mutate pre-existing
non-session proxy/cache/reverse-geocoding behavior outside S3 changes. S3 token,
ID-authority and sanitized-error behavior is covered. Each legacy ID is listed
in the audit; unchanged legacy debt does not block this phase under the requested gate.

## Same-source campaigns

| Report in backend/coverage | Files retained |
| --- | --- |
| search-s3-core-final-mutation.json | followup, service, sessionRefs, sessionTemporal, observations |
| search-s3-candidates-current-mutation.json | candidates |
| search-s3-places-final-mutation.json | places, Google proxy |
| search-s3-parser-current-mutation.json | parser |
| search-s3-session-current-mutation.json | session, grounding |
| search-s3-review-current-mutation.json | review |

Historical reports for replaced sources do not contribute. Survivors were replayed
by exact source location/replacement in isolated copies, after an unmutated passing
baseline and source-hash equality check. Successful replays update detection without
counting twice. Tests only grew; no killed witness was removed. Raw reports,
replay failures and the source-hashed manifest are ignored backend/coverage artifacts.

Six review timeouts under concurrent validation load were replayed without that
contention and killed by assertions. Four Places timeouts remove deadline/settlement
behavior and leave timeout tests unfinished; they remain separately reported timeouts.

## Regression witnesses

- Complete candidate alternatives remain available without deciding the journey.
- Multiline whole-route anchors prevent incorrectly rebased final-line spans.
- `from Delhi 7  pm` keeps the clock suffix out of the Places phrase.
- A 1,472-unit query creates 18 overlapping spans totalling 8,517 units and must
  fail the aggregate limit. A separate 8,000-unit aggregate succeeds. Empirical
  probe maxima were not used as a bound proof.
- Schema-valid unspecified timing retains current-query provenance.
- The first unsupported follow-up survives an initially empty request history.
- Duplicate-query rejection precedes incompatible timing-edit replay and retains
  STALE_QUERY classification.
- Unregistered selections, forged edits, ambiguous alternatives, endpoint/time
  invalidation and safe clearing errors have explicit witnesses.
- Explicit vehicle correction removes obsolete conflict prompts while preserving
  original snapshots and unsupported clauses.

Independent reviewers supplied concrete witnesses. Unverified acceptance claims
for an internal failure payload and a stale USER_SELECTION case were rejected
after actual replay. Dispositions rely on public behavior and strict contracts.

## Reproduction

Use the existing quality-tools installation and
`backend/tests/quality/stryker.search-s3.config.mjs`. From backend:

```powershell
Remove-Item Env:RCS_SEARCH_MUTATE, Env:RCS_SEARCH_MUTATION_TESTS -ErrorAction SilentlyContinue
stryker run tests/quality/stryker.search-s3.config.mjs
```

The default configuration mutates twelve source files using deterministic search
tests. RCS_SEARCH_MUTATE, RCS_SEARCH_MUTATION_TESTS,
RCS_SEARCH_MUTATION_CONCURRENCY and RCS_SEARCH_MUTATION_REPORT support scoped
campaigns. No live Jev/Google, booking writes or responsibility execution occur.

Generated TypeScript sandboxes were relocated to
`output/search-s3-validation-scratch`, outside backend's **/*.ts compile scope.
An intermediate typecheck of deliberately broken mutant copies was tooling
contamination, not an application defect. Final typecheck/lint pass with the
original tsconfig and application authentication/configuration.
