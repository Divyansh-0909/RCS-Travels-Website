import test from 'node:test';
import assert from 'node:assert/strict';
import { responsibilityShadowDiagnostics } from '../services/responsibilityShadowDiagnostics.js';

test('shadow inspection retains the exact envelope and validation independently of route authority', () => {
  const envelope = Object.freeze({ analysisId: 'synthetic-diagnostic', output: Object.freeze({
    suggestedClassification: 'DRIVER_CAUSED', confidence: .97,
    factsSupporting: Object.freeze([{ statement: 'Recorded fact', evidenceIds: ['ev_001'] }]),
  }) });
  const validation = Object.freeze({ valid: true, errors: [] });
  assert.deepEqual(responsibilityShadowDiagnostics(envelope, validation), { analysisEnvelope: envelope, factualValidation: validation });
  assert.equal(responsibilityShadowDiagnostics(envelope, validation).analysisEnvelope, envelope);
  assert.equal(responsibilityShadowDiagnostics(envelope, validation).factualValidation, validation);
  assert.deepEqual(responsibilityShadowDiagnostics(null, null), { analysisEnvelope: null, factualValidation: null });
});
