# Codex Luna development evaluation

Development only. Backend ID `luna-codex` is separate from Jev API and Luna API.
Nothing here selects a production provider, amends a freeze gate, runs held-out data,
or enables production consequences.

## Execution

The installed npm CLI resolves to its native `vendor/.../bin/codex.exe`, avoiding
shell wrappers and another installed binary. The evaluated CLI version is recorded.
`codex exec` ignores ordinary user config and rules, retains the normal authentication
location, forces the built-in OpenAI provider and ChatGPT sign-in, and uses a fresh
temporary directory, stdin, read-only sandbox, ephemeral sessions and JSON Schema.
The child environment excludes API keys, endpoint/proxy overrides and parent session
identifiers. Shell, code mode, apps, plugins, hooks, browser, image and agent features
are disabled. Unexpected events stop the process. Startup warnings are distinguished
from tool calls; other errors remain failures.

The subprocess receives instructions and normalized evidence, never labels or the
repository. The outer runner validates output, applies the existing factual, policy
and development severity guards, and computes metrics. Malformed output remains
`PROVIDER_SCHEMA_FAILURE`; there is no AI repair or fallback to another backend.

## Persistence and accounting

Immutable plans record development order, pilot IDs, consistency IDs, source and
guard hashes. Cache identity includes domain, dataset, input, backend, execution
surface, model, schema, configuration and observation. Successful pilot observations
are reused in development; development observation 1 is reused in consistency.
API observations cannot satisfy Codex identities.

Exclusive claims prevent concurrent duplicate inference. A successfully cached case
can resume without a call. A claimed case without a successful receipt stops for
reconciliation; never delete its claim to resample it. Raw failed events and receipts
are retained. Checkpoint writes follow every successful case, and failures stop the
queue. This runner deliberately cannot evaluate held-out splits.

Token counts are Codex-reported turn usage. `requestCount` counts CLI invocations,
explicitly identified by `requestCountScope`; it is not an observed HTTP request
count or an API billing estimate. Known usage survives schema/process failures.
Missing usage stays null. CLI startup is included in measured inference latency.

## Latest stop

See `output/codex-luna-2026-10-08/`: a local configuration rejection preceded one
native thread that the original monitor aborted on startup warnings. No model
response completed. The warning-monitor fix is tested, but the original stopped
preflight remains **NOT VERIFIED**, with zero observed tool calls. No development
case, pilot or consistency observation has been scored. There is no evidence here
that the account exhausted its allowance, that Luna is unavailable, or that nested
execution is unsupported.

Do not rerun the stopped preflight invocation or edit its receipts. A future allowed
preflight must use a fresh run directory. One completed native preflight must verify
the account/model/provider path and isolation before the pilot can run. Fixture tests
alone do not establish native model availability or production equivalence.

## Standalone terminal commands

These commands are prepared for the next permitted native verification, not executed
as part of this checkpoint. Run from `D:\Downloads\Repos\RCS-Travels-Website\backend`.
Each stage refuses to proceed when its prerequisite gate has not passed.

```powershell
node scripts/codex-luna-preflight.mjs --run-dir ../output/codex-luna-owner-verification-2026-10-08
node --import tsx scripts/responsibility-codex-development.mjs --prepare --run-dir ../output/codex-luna-owner-verification-2026-10-08
node --import tsx scripts/responsibility-codex-development.mjs --pilot --run-dir ../output/codex-luna-owner-verification-2026-10-08
node --import tsx scripts/responsibility-codex-development.mjs --development --run-dir ../output/codex-luna-owner-verification-2026-10-08
node --import tsx scripts/responsibility-codex-development.mjs --consistency --run-dir ../output/codex-luna-owner-verification-2026-10-08
```

The pilot is 10 fixed development cases. Full development is 113 cases. Consistency
uses the existing 20-case risk subset and five observations each, with at most 80
fresh repeats. Prompts and schema remain fixed under a plan. Safety, raw model
quality, per-class metrics, latency/usage, exact API overlap and field-level
instability are reported separately. The original API comparison gate remains
required. No held-out or production stage exists in this runner.

Installed flags were checked using CLI help. [Official CLI reference](https://learn.chatgpt.com/docs/cli/reference).
