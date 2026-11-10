# Validation record — 1 November 2026

- Eleven package tests passed, including actual MCP initialization,
  discovery and calls to all eight tools; invalid arguments/path traversal,
  missing and draft citations, quotation mismatch and safe HTML rendering.
- The installed cache's real stdio smoke test also passed.
- Codex reports `rcs-legal-workbench@rcs-local` installed and enabled, and
  `codex mcp list` reports `rcs-legal` enabled. This conversation's supplied
  tool inventory has not refreshed; the work was executed through the same
  local implementation's CLI. Reopen Codex to load it into a new task.
- The workbench was applied to all eight candidates and the existing rendered
  English policies. Four scoped code assertions matched. One lexical finding
  was reviewed in context: the captain terms reject an unlimited indemnity.
- The PDF contains 21 pages and all eight document headings; no short/blank
  page or Unicode replacement character was detected. Representative rider
  terms, privacy table and research appendix PDF pages were visually inspected.
- Desktop/mobile HTML previews were captured. This is document-layout
  verification, not verification of the website or captain app.
- Eleven substantive source, product and operational findings remain open in
  `data/gaps.json` and the document pack's `ADOPTION.md`. No legal clearance or
  adoption is inferred from tests, a PDF export or a citation match.
- Live website constants, three locale catalogs, the earlier PDF, RAG content,
  backend/app behaviour and existing compliance findings were not changed.
  Website/backend/captain-app suites were not run because those surfaces were
  not edited. No production records, credentials, migrations or provider
  transactions were accessed.

The public upstream source files are pinned and SHA-256 recorded in
`references/anthropic/provenance.json`; their Apache licence is retained.
Use `package.ps1` to create an archive including compatibility dotfiles.
