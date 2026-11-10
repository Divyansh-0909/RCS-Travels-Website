# Project-wide legal audit runner

This orchestrates the installed RCS Legal Workbench and preserves the reviewed
policy text and fresh-source provenance. It does not publish or adopt policies.

From the repository root:

```powershell
node tools/legal-audit/run.mjs "C:/Users/singh/.codex/plugins/cache/rcs-local/rcs-legal-workbench/0.1.1"
node tools/legal-audit/render-report.mjs
node --import ./tools/legal-audit/register-resolution.mjs --test shared/i18n/legal.test.mjs
```

`run.mjs` reviews the canonical documents, three locale catalogs, candidates,
support corpus and previously extracted PDF packs. It calls all eight installed
workbench tool implementations and writes `tool-results.json`, source provenance
and snapshots under `legal-review/2026-11-01-audit/`. Re-running updates those
audit outputs, rather than the legal source or production settings.

`fetch-public.mjs` retrieves explicitly named public HTTPS sources and records
their hashes. `extract-pdfs.py` extracts text and reports pages that appear
scanned; it does not pretend extraction is OCR. `html-context.py` and
`inspect-links.mjs` provide bounded navigation for official source pages.

The audit-only Node resolution hook handles one extensionless pure-constants
import as Vite would. It leaves every test assertion intact. In this checkpoint
the substantive locale test fails because the English catalog is stale.

`update-workbench.mjs` records the verified territories and newly inspected
source metadata. It does not change the candidate policy wording. The installed
package remains the owner of tool schemas/behaviour; the audit runner adds no
legal approval mechanism or third-party model.
