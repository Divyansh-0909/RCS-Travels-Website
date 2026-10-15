import test from 'node:test';
import assert from 'node:assert/strict';
import { chunkPolicy } from '../rcs-rag/src/services/chunker.ts';
import { validateEmbedding, EMBEDDING_DIMENSIONS } from '../rcs-rag/src/services/embedder.ts';
import { loadPolicies, prepareDocuments } from '../rcs-rag/src/scripts/loader.js';
import { storeDocument } from '../rcs-rag/src/services/repository.ts';

test('H3 chunks retain parent restrictions, document status, and parsed metadata', () => {
  const chunks = chunkPolicy(`---
status: pending-product-model-not-live-verified
audience: captain
verified_on: 2026-10-10
sources:
  - source.md
---
# Draft terms
Introduction.
## Cancellation
Pending: these amounts are not live.
### Customer
Customer explanation.
### Captain
Captain explanation.
`, { source: 'terms.md' });
  assert.equal(chunks.length, 3);
  const child = chunks.find(chunk => chunk.section === 'Captain');
  assert.equal(child.parentSection, 'Cancellation');
  assert.match(child.content, /## Cancellation\nPending: these amounts are not live\./);
  assert.match(child.content, /Policy status: pending-product-model-not-live-verified/);
  assert.match(child.content, /Audience: captain/);
  assert.doesNotMatch(child.content, /Customer explanation/);
  assert.equal(child.metadata.verified_on, '2026-10-10');
  assert.deepEqual(child.metadata.sources, ['source.md']);
  assert.equal(child.effectiveFrom, null);
  assert.equal(child.version, 'unversioned');
});

test('heading-only parents supply context and fenced headings do not split chunks', () => {
  const markdown = '# Terms\n## Parent\n### Actual\nExplanation.\n```md\n## Example\n### Example child\n```\n### Next\nMore.';
  const chunks = chunkPolicy(markdown, { source: 'terms.md' });
  assert.deepEqual(chunks.map(chunk => chunk.section), ['Actual', 'Next']);
  assert.match(chunks[0].content, /## Parent/);
  assert.match(chunks[0].content, /## Example/);
  assert.deepEqual(chunkPolicy(markdown.replaceAll('\n', '\r\n'), { source: 'terms.md' }), chunks);
});

test('documents without section headings are not duplicated and blank input produces no chunks', () => {
  const [chunk] = chunkPolicy('# Terms\nA single rule.', { source: 'terms.md' });
  assert.equal(chunk.content, '# Terms\n\nA single rule.');
  assert.deepEqual(chunkPolicy('   ', { source: 'empty.md' }), []);
});

test('chunk identity survives content edits and handles repeated heading names', () => {
  const before = chunkPolicy('# Terms\n## Repeated\nFirst.\n## Repeated\nSecond.', { source: 'terms.md' });
  const after = chunkPolicy('# Terms\n## Repeated\nChanged.\n## Repeated\nSecond.', { source: 'terms.md' });
  assert.equal(before[0].chunkKey, after[0].chunkKey);
  assert.notEqual(before[0].chunkKey, before[1].chunkKey);
});

test('invalid dates and oversized sections fail instead of inventing validity or truncating policy', () => {
  assert.throws(() => chunkPolicy('---\neffective_from: 2026-02-30\n---\n# Terms\nRule.', { source: 'terms.md' }), /Invalid effective date/);
  assert.throws(() => chunkPolicy('---\nstatus: draft\n# Terms', { source: 'terms.md' }), /Invalid front matter/);
  assert.throws(() => chunkPolicy('# Terms\n## Long\n' + 'word '.repeat(501), { source: 'terms.md' }), /exceeds 500 words/);
});

test('all current policy documents produce bounded chunks with source and status metadata', () => {
  const documents = prepareDocuments();
  assert.ok(documents.length >= 18);
  for (const document of documents) {
    assert.match(document.sourcePath, /^backend\/rcs-rag\/documents\/.+\.md$/);
    assert.equal(new Set(document.chunks.map(chunk => chunk.chunkKey)).size, document.chunks.length);
    for (const chunk of document.chunks) {
      assert.ok(chunk.content.split(/\s+/).length <= 500);
      assert.ok(chunk.metadata.status);
      assert.ok(chunk.metadata.audience);
      assert.ok(Array.isArray(chunk.metadata.sources));
      assert.equal(chunk.effectiveFrom, null);
    }
  }
});

test('embedding validation rejects wrong dimensions and nonfinite/provider-invalid values', () => {
  assert.doesNotThrow(() => validateEmbedding(Array(EMBEDDING_DIMENSIONS).fill(0.1)));
  assert.throws(() => validateEmbedding(Array(3).fill(0.1)), /finite numbers/);
  assert.throws(() => validateEmbedding(Array(EMBEDDING_DIMENSIONS).fill(NaN)), /finite numbers/);
  assert.throws(() => validateEmbedding(undefined), /finite numbers/);
});

test('repository rejects empty or mixed-document replacement before touching the database', async () => {
  const db = { $transaction: () => { throw new Error('Unexpected database operation'); } };
  await assert.rejects(storeDocument(db, 'terms.md', []), /nonempty/);
  await assert.rejects(storeDocument(db, 'terms.md', [{ sourcePath: 'other.md' }]), /single-document/);
});

test('provider failure leaves existing document rows untouched and stops further requests', async () => {
  let transactions = 0;
  let requests = 0;
  const db = {
    $queryRaw: async () => [],
    $transaction: async () => { transactions++; throw new Error('Unexpected write'); },
  };
  const providerError = Object.assign(new Error('No embedding credits'), { code: 'credit_balance_exhausted' });
  await assert.rejects(loadPolicies(db, async () => { requests++; throw providerError; }, () => {}),
    error => error === providerError);
  assert.equal(transactions, 0);
  assert.equal(requests, 1);
});
