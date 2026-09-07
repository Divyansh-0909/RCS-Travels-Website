# Token guard

Repository-local Codex hooks plus a dependency-free Node reader reduce source text entering the conversation. No API calls, worker models, source caches, or telemetry are used. Restart the Codex session to load the new hook configuration; repo hooks depend on the client's support and repository trust. Existing sessions may not reload hooks.

From the repository root:

```sh
node tools/token-guard/read.mjs outline frontend/src/pages/BookingFlow.jsx
node tools/token-guard/read.mjs find frontend/src/pages/BookingFlow.jsx payment
node tools/token-guard/read.mjs read frontend/src/pages/BookingFlow.jsx 100 80
node --test tools/token-guard/guard.test.mjs
```

The hook denies recognized literal bulk reads over 350 lines or 12 KB and returns a short redirect. It recognizes standalone `Get-Content`, `gc`, `cat`, `type`, `head`, `tail`, `less`, and `more` commands, including simple command lists, plus Read/read_file tool arguments. Explicit bounded shell reads up to 350 lines pass. The reader caps output at roughly 12,000 characters, clips individual lines at 300 characters with a marker, and supplies original line numbers. For clipped source needed for an edit, use a precise native read with an appropriate output budget.

This is a cost guard, not a shell parser or security control. Variables, globs, custom scripts, nested shells, indirect tool calls, unrecognized tools, and some compound commands are outside its coverage. Malformed hook input fails open. The reader rejects common secret/data paths, binary files, paths outside the repo (including symlink escapes), and files above 2 MB; this does not detect secrets embedded in ordinary source code.

The outline uses syntax patterns and can miss symbols or include local variables. `find` performs a literal case-insensitive search. Neither provides semantic analysis. Use exact source for implementation and review.

This implements bulk-read prevention and compact local extraction from the supplied architecture. Cheap-model summarization and direct-to-disk model generation are not implemented. No percentage token or billing savings is claimed: savings depend on actual session reads, cached input, and follow-up work.

Hook decisions and reader behavior are tested locally. A fresh Codex client session is needed to verify interception in that client. To disable, remove this repository's `.codex/hooks.json` (or only its token-guard entry if other hooks are added later). The reader remains usable independently.

Official references: [Codex hooks](https://learn.chatgpt.com/docs/hooks), [configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference).
