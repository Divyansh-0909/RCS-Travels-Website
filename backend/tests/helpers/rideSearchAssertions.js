import assert from 'node:assert/strict';
import { bookingDraftSchema, sourceRefSchema } from '../../services/search/contracts.ts';
import { validateDraftProvenance } from '../../services/search/provenance.ts';

// A consumer must be able to render every diagnostic and trace stated evidence.
export function assertSearchResult(result, input) {
  const metadata = result.providerMetadata;
  assert.ok(metadata.attemptedRequests >= metadata.completedRequests);
  assert.ok(metadata.attemptedRequests <= 2);
  assert.equal(metadata.completedRequests, metadata.batches.length);
  assert.equal(metadata.completedRequests, metadata.decisions.length);
  assert.equal(result.fallbackRequired, result.fallbackReasons.length > 0);
  assert.equal(new Set(result.fallbackReasons).size, result.fallbackReasons.length);
  for (const batch of metadata.batches) {
    assert.ok(batch.provider.length > 0);
    assert.ok(batch.model.length > 0);
    assert.equal(batch.requestCount, 1);
    assert.ok(batch.latencyMs >= 0);
    assert.ok(batch.questionCount > 0 && batch.questionCount <= 48);
  }
  for (const value of result.issues) {
    assert.ok(value.code.length > 0, 'Diagnostics require a stable code');
    assert.ok(value.field.length > 0, 'Diagnostics identify the field needing attention');
    assert.ok(['MISSING', 'AMBIGUOUS', 'INVALID', 'UNSUPPORTED', 'POLICY', 'DEPENDENCY'].includes(value.category));
    assert.ok(Array.isArray(value.refs));
    for (const ref of value.refs) assert.ok(sourceRefSchema.safeParse(ref).success, 'Diagnostics must contain valid source references');
    if (value.category === 'MISSING') assert.deepEqual(value.refs, []);
  }
  if (result.draft !== undefined) {
    assert.ok(bookingDraftSchema.safeParse(result.draft).success, 'Every returned draft obeys the public contract');
    assert.deepEqual(validateDraftProvenance(result.draft, input.trustedLocationSelections, input.formDraft), []);
  }
}
