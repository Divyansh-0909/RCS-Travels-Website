import test from 'node:test';
import assert from 'node:assert/strict';
import { responsibilityInspectionModel } from '../src/lib/responsibilityInspection.js';

test('shadow inspection retains its own envelope and validation', () => {
  const envelope = { analysisId: 'shadow-model' }, validation = { valid: true };
  assert.deepEqual(responsibilityInspectionModel({ shadowResult: { analysisEnvelope: envelope, factualValidation: validation },
    analysis: { envelope: { analysisId: 'different-production-model' }, validation: { valid: false } } }), { envelope, validation });
});
test('legacy shadow rows never borrow production analysis or validation', () => {
  for (const shadowResult of [{}, { analysisEnvelope: null, factualValidation: null }]) {
    assert.deepEqual(responsibilityInspectionModel({ shadowResult, analysis: { envelope: {}, validation: {} } }), { envelope: null, validation: null });
  }
});
test('production-only context shows its recorded analysis without a shadow pair', () => {
  assert.deepEqual(responsibilityInspectionModel({ shadowResult: null, analysis: { envelope: { analysisId: 'production' }, validation: { valid: true } } }),
    { envelope: { analysisId: 'production' }, validation: { valid: true } });
});
test('missing production records remain explicitly absent', () => {
  for (const context of [{}, { analysis: null }, { analysis: {} }, { analysis: { envelope: null, validation: null } }]) {
    assert.deepEqual(responsibilityInspectionModel(context), { envelope: null, validation: null });
  }
});
