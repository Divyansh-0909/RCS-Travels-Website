# Responsibility benchmark (Phase 8)

This is evaluation infrastructure. It reads evidence and writes local append-only
JSONL artifacts. It does not write application decisions, send notices, start
appeal clocks, or invoke financial/reliability consequences.

Both candidates receive the identical evidence object. The existing analyst uses
the production Phase 5 gate. Jev uses a benchmark-only conservative simulation;
it does not fabricate FACT/INFERENCE fields to claim drop-in compatibility.

## Run

From `backend`, with approved provider credentials configured:

```powershell
node --env-file=.env benchmarks/responsibility/run.js --existing-model=gpt-5-mini-2025-08-07 --source=frozen --split=heldout --repeats=5 --consistency-count=8 --output=../output/phase8 --run-id=<unique-run-id>
```

`--source=real` reads Phase 7 cases with persisted shadow results. It never writes
to the database. `--source=all` adds those cases to the selected frozen cohort.
An output directory is mandatory. Preserve prior runs; use a new run ID for a
new inference experiment. Normal tests use deterministic fakes and no live API.
`--existing-model` changes only the evaluation factory and is explicitly recorded
as an override. Omitting it preserves the configured production model. Both
benchmark clients use a 60-second request timeout and zero client retries.

## Evidence and reference outcomes

The corpus contains 154 labeled records: 56 ordinary frozen scenarios and 98
adversarial records across seven case types. Its pinned hash is
`f011610a6083cec0006f434c330c6cc51fb0090e66999d435f43d95070b400e0`.

The seed is `rcs-responsibility-phase8-2026-09-30`. Splitting uses evidence-template
families, including aliases, rather than just scenario display names. Mandatory
provenance cases are reserved before inference. Current split: 98 development,
56 held-out. Model-visible case identities are opaque; labels and scenario names
are never sent as model input. Old inference/evidence records are not overwritten.

Reference priority is final human appeal, authoritative admin decision, frozen
synthetic label, then unlabeled. A bare operative state or automatic final
decision is not human ground truth. A human record without an explicit compatible
classification is unlabeled. Unrecorded severity, review necessity, sufficiency,
and automation eligibility stay unknown rather than being guessed.

The corpus has only about twenty evidence templates, reused across case types.
Counts are not independent real-world observations. No production readiness claim
can be inferred from synthetic scores alone.
The family split leaves no LEVEL_1/safe-auto-uphold positives in held-out data;
that coverage cannot be claimed. Driver-held-out records are LEVEL_2/review cases.

## Reproducibility and limitations

Artifacts include evidence hash/version, provider/model, contract/configuration,
policy version, structured judgment, simulated route, usage, latency, and failures.
Full evidence snapshots and arbitrary provider prose are not exported into result
artifacts. No hidden reasoning is collected. Offline metrics exclude unlabeled
cases from accuracy and F1. Failed calls are excluded from successful latency
percentiles and retained in failure counts.
All-labeled route rates and coverage among explicitly eligible reference cases
are separate metrics. An empty eligibility denominator produces `null`, not an
apparent zero-error/zero-coverage observation.

Jev SDK: `@typesafe-ai/sdk@0.6.0`; model alias: `jev-latest`; binary threshold:
0.5; severity boundaries: 0.5 and 1.5. Question hash:
`acd405820422d6eb4df25effbaa2a8f2da00ee6c7c01839b0e1242685c65409f`.
Provider-reported probabilities are kept for calibration; scores are not treated
as probabilities. Calibration excludes unlabeled records, unsupported classes,
and distributions that are non-finite, outside [0,1], or do not sum to one.
Repeat reports expose classification/review/severity stability and numeric
variance by case. Cost remains `NOT_AUTHORITATIVELY_AVAILABLE` without approved
pricing. Do not tune on held-out responses.

Existing-analyst diagnostics retain schema/reference/self-contradiction failures
and reported missing evidence separately from provider failures. Matching a cited
ID alone does not prove that the accompanying prose is factually supported;
arbitrary factual claims are not semantically verified by this harness. Separate
platform-contribution/external-cause calibration needs curated signal labels;
an uncertain responsibility label is not a positive external-cause label.

## Current unresolved validation

Two development API preflights accepted Jev. The configured existing model,
`gpt-5.6-mini`, returned HTTP 404 (unavailable or inaccessible). A pinned,
evaluation-only fallback, `gpt-5-mini-2025-08-07`, was then attempted with the same
analyst implementation/prompt/gate; it returned HTTP 429, "no credits remaining."
Production model selection has not changed. No live held-out comparison has run.
Provider funding/access must be restored before comparative quality claims.

The configured database read returned Prisma `P2021`: the relation
`public.responsibility_cases` does not exist. No real human-labeled cohort has
been established, and no migrations were applied to that database.

The first full mutation run found 1,010 killed, 321 surviving and 272 timed-out
mutations. A second snapshot run measured 1,630 total: 1,328 killed, 176 surviving,
126 timed out, zero uncovered. These are not final signoff: meaningful survivors
remain, and subsequent logic/tests require a fresh mutation run. Under concurrent
mutation load, two full runs reproduced HTTP authentication timeout/reset errors;
the unchanged isolated HTTP suite passed 12/12. After mutation load ended, the
complete backend passed 877/877. No authentication code or timeout was changed.

Latest focused tests: 43/43, with 100% statements/branches/functions/lines on the
six benchmark source files. Scoped lint, backend typecheck and diff whitespace
validation passed. Measured maxima: cyclomatic 19, cognitive 20, Halstead
difficulty 30.26 (tool advisory), CRAP 19, source file length 376 lines. The fresh
mutation run uses every benchmark test in one test process per worker, with four
workers and visible progress; no mutation targets or test assertions were removed.

JEV PRODUCTION INTEGRATION: NOT IMPLEMENTED

READY FOR PRODUCTION AUTO-ADJUDICATION: NO
