# RCS Travels policy knowledge base

## Purpose

`documents/` contains policy references for website and captain-app FAQ retrieval. `src/` contains heading-based chunking, embedding generation, Prisma ingestion, similarity search, and policy-grounded answer selection. A user-facing API and website/captain-app integration are not implemented here.

## Database and ingestion

The Prisma model is `PolicyChunk`. Its reviewed migration creates the required `extensions.vector(1536)` column, a unique source/chunk identity, and backend-only access with RLS. Required vector fields use parameterized raw Prisma writes. The database extension bootstrap SQL is also available in `sql/enable-pgvector.sql`.

Run these commands from the repository root:

```sh
npm --prefix backend run rag:check
npm --prefix backend run rag:load
```

`rag:check` validates and chunks every Markdown file in `documents/` without provider calls or database writes. `rag:load` uses the configured backend database and `OPENAI_API_KEY` from `backend/.env` or the environment. It generates `text-embedding-3-small` embeddings with 1536 dimensions, reuses unchanged embeddings, and replaces obsolete sections atomically per document. Deleted documents are not automatically purged. Draft and pending metadata remains attached to all chunks; ingestion does not approve those policies.

If the embedding provider reports `credit_balance_exhausted` or insufficient quota, fund the configured account or configure a funded key locally, then rerun `rag:load`. Provider failures leave the current document's stored chunks intact; previously completed documents can be reused on the next run. No placeholder embeddings are written. A successful schema deployment does not mean the corpus has been ingested.

Never run a general migration deployment just to ingest documents. On a database with unrelated pending migrations, deploy only the reviewed RAG migration through an isolated Prisma configuration. The standard migration remains in `backend/prisma/migrations/` for other environments.

## Retrieval and answers

`createDatabasePolicyAssistant(prisma)` in `src/services/ask-policy.ts` accepts a question and optional search settings. It checks corpus readiness, embeds the question, and searches compatible vectors with schema-qualified cosine distance. Retrieval filters by `rider` or `captain` audience plus shared policies, applies a minimum similarity threshold, and returns bounded, deterministic results. The default threshold is 0.3 and limit is 6; these are initial settings, not validated measures of answer confidence.

The answer model selects complete retrieved chunk bodies through structured output. The server renders their original source text with `[S1]` citations and structured document/section metadata. It does not publish model-authored policy claims. Complete chunks retain parent restrictions, exceptions, lists, and tables. Draft, pending, and unverified references receive mandatory server labels. A verified-on date is never promoted to an effective date. Citation validation establishes provenance, not semantic relevance; live retrieval and model selection still need evaluation.

The default answer model is `gpt-4.1-mini`, configurable through `RAG_ANSWER_MODEL`. An empty corpus, no relevant matches, provider failures, refusal, or invalid selections produce an explicit unsupported/unavailable response without invented citations. Questions about live booking, refund, or wallet status require authenticated application data outside this service. No tools, booking actions, or financial writes exist in the answer path. Response storage is disabled on the answer API call.

```ts
import { createDatabasePolicyAssistant } from './src/services/ask-policy.ts';

const askPolicy = createDatabasePolicyAssistant(prisma);
const answer = await askPolicy({
  question: 'When is scheduled cancellation free?',
  options: { audience: 'rider', limit: 6, minSimilarity: 0.3 },
});
```

Run these from the repository root:

```sh
# Offline checks: provider calls are replaced with test doubles.
npm --prefix backend run rag:test

# Live command: makes embedding and answer API requests if the corpus is loaded.
npm --prefix backend run rag:ask -- rider "When is scheduled cancellation free?"
```

Offline checks verify validation, citation provenance, policy caveats, and controlled retrieval behavior. They do not certify production semantic ranking or model answer selection. Real embeddings must be loaded through `rag:load`; local test vectors are never substituted into the production corpus.

## Document status and source precedence

The corpus was checked against the working tree on 10 October 2026. It is an operational reference, not a replacement for approved legal terms. Existing legal pages are drafts. The documents distinguish executable behavior, draft service expectations, and pending product rules. Marketplace terms are product-defined but not verified as a live feature.

Use current services and routes for executable behavior. Use `CONTEXT.md`, `ROADMAP.txt`, and dated checkpoints for product intent, after checking code. Older FAQ and compliance-audit text may describe behavior superseded by the latest implementation. Source paths appear in each document's front matter and are relative to the repository root.

## Heading-based chunking

### Preserve context in every chunk

Split on `##` and `###`. Store the document title, parent heading, section heading, audience, status, `verified_on`, source paths, and filename with every chunk. A subsection must retain its parent context. Keep tables and their introductory sentences together.

### Handle draft and pending sections

Sections marked **Draft** describe expectations awaiting approval. Sections marked **Pending** describe unavailable or unresolved behavior; never turn them into current guarantees. Prefer verified sections for operational answers. `marketplace-policy.md` has a pending status for the entire document: preserve that status on every chunk.

### Keep maintenance material outside retrieval

Ingest Markdown from `documents/` only. This README and `src/` are not FAQ evidence. The FAQ is a convenience layer; detailed policy documents govern if its summaries drift. Do not ingest customer records, captain records, credentials, logs, payment identifiers, or benchmark fixtures.

## Maintenance

Update the affected documents when policy or code changes, including their verification date. Reconcile unresolved legal terms with the owner and legal review before presenting them as approved terms. A retrieved document cannot establish a user's live booking, payment, refund, eligibility, or account status; those require authenticated application data.
