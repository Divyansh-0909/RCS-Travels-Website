---
name: you-should-know
description: Explain, configure, or troubleshoot the You Should Know Codex turn-review plugin and its lifecycle hooks.
---

# You Should Know

This plugin observes notable tool outcomes and reviews the final assistant message at `Stop`.

The default behavior is advisory: surface a concise `systemMessage` when an important caveat, failure, skipped check, assumption, workaround, or limitation is worth calling out separately.

The reviewer first tries an isolated ephemeral `codex exec` review using the user's existing Codex authentication. It uses `gpt-5.6-luna` by default and disables plugins and user config inside that nested review. If the model is unavailable or rate/usage limited, the plugin records a temporary backoff and uses deterministic local checks instead.

Environment controls:

- `YSK_AI_REVIEW=0`: disable the model reviewer and use deterministic checks only.
- `YSK_MODEL=<model>`: explicitly select a supported Codex model for the nested review. The default is `gpt-5.6-luna`.
- `YSK_REVIEW_TIMEOUT_MS=<ms>`: change the nested reviewer timeout (default 25000).
- `YSK_AUTOCONTINUE=1`: allow a model review marked `should_continue` to return a Stop `decision: block`, causing Codex to continue the turn. This is off by default.

Never store raw secrets in event logs. Tool observations are compacted and common credential forms are redacted before persistence.
