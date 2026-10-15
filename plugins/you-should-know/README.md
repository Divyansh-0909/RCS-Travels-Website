# You Should Know for Codex

`you-should-know` is a local Codex plugin that watches notable tool results and reviews each completed turn for information that is easy to miss.

It uses `PostToolUse` to keep a small redacted event log and `Stop` to surface a concise warning. The Stop review uses an isolated `gpt-5.6-luna` Codex call with the current Codex login. If that call is unavailable, a deterministic reviewer still catches failed/skipped validation, limitations, workarounds, assumptions, and similar signals.

The plugin is advisory by default. Set `YSK_AUTOCONTINUE=1` if you want a reviewer that finds clearly unfinished required work to send Codex back for another pass.

On Codex builds where bundled plugin hooks are unavailable, the same hook scripts can be registered as normal user hooks. They automatically fall back to `~/.codex/you-should-know-data` when `PLUGIN_DATA` is not supplied.

Run the local tests with:

```powershell
node --test plugins/you-should-know/tests/reviewer.test.mjs
```
