---
name: india-legal
description: Research, draft and review RCS Travels rider and captain legal documents using current Indian primary law, jurisdiction mapping and verified product behaviour. Use for legal policies, privacy, refunds, grievances, terms and compliance questions.
---

# RCS Indian legal work

Use the `rcs-legal` MCP tools where available. If the host has not loaded them,
use `node <plugin-root>/cli.mjs <command>` with the same implementation. Read
`../../README.md` for commands and actual limitations. No Anthropic account,
API key, paid research subscription or external model is needed by this package.

## Establish facts and authority

1. Call `legal_profile` and `legal_sources`. Treat profile facts as dated facts,
   not proof of deployed configuration or legal status.
2. Read the applicable repository AGENTS.md, relevant CONTEXT.md/ROADMAP.txt
   sections and exact code for any product statement. Preserve unrelated edits.
3. Identify the entity, service model, every pickup jurisdiction, passengers'
   ages, payments, sharing, data flows and the decision being asked about.
   Do not assume UP rules govern Delhi/Haryana pickups or interstate permits.
4. Research current primary sources using available web tools. Prefer official
   Gazettes, India Code, state transport departments, MeitY, CERT-In, CBIC and
   consumer authorities. A registered URL is not a source that has been read.
5. Record notification/date, section or rule, draft/final/guideline status,
   commencement, territorial scope, retrieval date and uncertainties. A proposed
   rule or central guideline is not automatically an operative state rule.
6. Never apply US tests by default. If Indian authority is missing, identify
   the gap. Do not invent authorities, data residency, insurance, tax treatment,
   response coverage, source access or regulator approval.

## Run the review

- `legal_jurisdiction_matrix`: inspect verified and unresolved requirements.
- `legal_cite_check`: check source registration and exact quotations against
  supplied source text. This is a mechanical check, never semantic proof.
- `legal_policy_review`: inspect draft text for unresolved markers, stale legal
  dates and unsupported assurances. Read every material clause yourself.
- `legal_compare`: compare old and proposed text; reconcile money, ages,
  cancellation triggers, timing and privacy statements with exact code.
- `legal_gap_report`: inspect open findings. A clause saying "subject to law"
  cannot repair absent operational controls or unresolved territorial scope.
- `legal_document`: read the completed candidate documents, one at a time.

Use `../../references/anthropic/` only as attributed source material. Those
files describe Claude-specific paths and commands; do not execute them, apply
their US defaults, or pretend their connectors are available in Codex.

## Produce usable documents

Write complete, plain-language rider terms, rider privacy, refund/cancellation,
rider grievance, captain terms, captain privacy, captain payments and captain
grievance documents. Keep internal research and implementation findings separate
from public-facing language. Preserve mandatory consumer rights and access to
competent courts/commissions; do not impose an unsupported exclusive forum,
blanket waiver, unlimited indemnity or compulsory arbitration.

Distinguish existing features, proposed business commitments and legal duties.
Do not claim proposed controls already exist. Do not mark a document reviewed
by an advocate, certified compliant or legally cleared. Lack of a paid reviewer
does not prevent useful drafting; it does not establish enforceability either.
Do not suppress material adverse findings or rewrite source records to create
an appearance of approval. Ask the owner only for genuinely missing facts or
decisions, and continue all independent work.

## Validate and hand over

Run package tests and the actual evidence checks. Every dated assertion must
have a verified primary source or be labelled unresolved. Record what was
checked, what remains unknown and the difference between completed drafting
and publication/adoption. Do not deploy or flip existing draft indicators
merely because a document scan passed. Publishing requires implementation,
accurate disclosures, owner adoption and any applicable legal prerequisites.
