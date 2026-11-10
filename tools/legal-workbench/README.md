# RCS Legal Workbench

A local Codex plugin with eight deterministic tools and an India-specific
research/drafting skill. It has no runtime npm dependencies, API calls,
telemetry, external model, paid subscription or credential requirement.
Codex performs research and drafting using its available web tools. The server
itself works offline and only reads the evidence/documents bundled with it.

## What is implemented

| Tool | Actual function |
| --- | --- |
| `legal_profile` | Read dated owner-confirmed business facts and code observations. |
| `legal_sources` | Filter a curated primary-source register and retrieval limitations. |
| `legal_cite_check` | Check source registration and exact quotation matches in caller-supplied text. |
| `legal_jurisdiction_matrix` | Read researched requirements and unresolved territorial coverage. |
| `legal_policy_review` | Find placeholders, assurance phrases and specified text risks. |
| `legal_compare` | Compare paragraph/numeric-token additions and removals. |
| `legal_gap_report` | Read open implementation, source, operations and adoption findings. |
| `legal_document` | List/read the eight completed drafting candidates. |

Citation matching does not authenticate supplied text or establish semantic
support. A registered official URL is not proof that the source was retrieved,
is current or applies. A scan is lexical and can flag a phrase even when the
sentence rejects it. Read the surrounding text. No tool declares a document
approved, adopted, reviewed by an advocate or compliant.

The public Claude gallery, paid databases and Claude-specific connectors are
not bundled. The open-source Anthropic references and local adaptation are
identified in [NOTICE.md](NOTICE.md). The requested REA repository was used as
a local plugin/runtime reference; no binary inspection or REA install is needed.

## Use immediately from this repository

Run with Node 22 or newer from the repository root:

```powershell
node tools/legal-workbench/cli.mjs profile
node tools/legal-workbench/cli.mjs sources IN
node tools/legal-workbench/cli.mjs matrix
node tools/legal-workbench/cli.mjs gaps
node tools/legal-workbench/cli.mjs documents
node tools/legal-workbench/cli.mjs review
node --test tools/legal-workbench/tests/*.test.mjs
```

For a supplied policy/citation comparison, create a JSON arguments file matching
the tool's schema, then run `cli.mjs call <tool-name> <arguments-json-file>`.
Use `cli.mjs tools` for the actual schemas. The MCP tools do not expose arbitrary
paths, command execution, network access, account data or write operations.
The CLI intentionally reads the JSON file you explicitly name.

## Install in Codex

The versionable source lives at `tools/legal-workbench/` because this repository
ignores local `.agents/` configuration. The installer merges a local marketplace
entry without changing other plugins, then uses Codex's supported commands:

```powershell
powershell -ExecutionPolicy Bypass -File tools/legal-workbench/install.ps1
```

The resulting local marketplace lives at `.agents/plugins/marketplace.json`.
The equivalent registration/installation commands are:

```powershell
codex plugin marketplace add "D:/Downloads/Repos/RCS-Travels-Website"
codex plugin add rcs-legal-workbench@rcs-local
```

Reopen/restart the Codex task/client if its tool inventory has not refreshed.
Select **RCS Legal Workbench** and use its `india-legal` skill. Registration or
installation is not proof that the current conversation has loaded a server.
The stdio integration test separately exercises initialization, tool discovery
and real calls to all eight tools. The CLI fallback works in the current task.

Portable clients use root `plugin.json`/`mcp.json`; Codex compatibility files
are retained under `.codex-plugin/`. The local package starts `node server.mjs`.
No global dependency installation or downloaded executable is needed.

## Documents and evidence

Start with [DOCUMENTS.md](DOCUMENTS.md) for the eight candidates,
[RESEARCH.md](RESEARCH.md) for findings and citations, and
[ADOPTION.md](ADOPTION.md) for what still needs a business/product decision.
The full machine-readable records are under `data/`.
The performed checks and remaining verification limits are recorded in
[VALIDATION.md](VALIDATION.md). `package.ps1` produces a checked private ZIP,
including both manifests, compatibility dotfiles and upstream attribution.

Optional `render.mjs <export-directory>` generates a standalone HTML pack,
PDF and desktop/mobile previews using the repository's existing Playwright
installation. The server/tools do not require Playwright. Optional
`validate.mjs <repository-root> <export-directory>` runs the workbench against
the actual rendered English policies, scoped code assertions and candidates,
and writes a `review-report.json` without overwriting an earlier report.

`cli.mjs export <new-directory>` creates a separate copy without overwriting
existing files. Completed drafting is distinct from adoption/publication.
The workbench does not change the live website, app, locales, existing PDF,
RAG documents, production settings or existing compliance records.

## Maintain the package

Update source status/locators and dated facts after reading new primary sources;
do not mark a finding closed just because wording changed. Update all related
documents and metadata, rerun tests and regenerate reports/exports before
reinstalling an updated version. Preserve the upstream Apache licence and
provenance. Do not put customer records, credentials or production exports in
this package or its archives.

Official packaging references:
[OpenAI plugin format](https://developers.openai.com/plugins/build/plugins),
[local desktop plugins](https://developers.openai.com/plugins/deploy/desktop-only),
[MCP stdio transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports).
