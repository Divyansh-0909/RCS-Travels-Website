import test from 'node:test';
import assert from 'node:assert/strict';
import { createEvidenceCriteriaV2Adapter, EVIDENCE_CRITERIA_V2_CONFIG } from '../benchmarks/responsibility/evidenceCriteriaV2.js';

test('v2 criteria adapter uses eight bounded independent questions and preserves the original factual guard boundary', async () => {
  let request;
  const adapter = createEvidenceCriteriaV2Adapter({ client: { async systemOne(input, options) {
    request = input; assert.deepEqual(options, { timeout: 60000, retry: { maxRetries: 0 } });
    return { model: 'jev-test', answers: Object.fromEntries(Object.keys(input.questions).map(key => [key, { choice: key === 'responsibility' ? 'DRIVER_CAUSED' : ['evidenceSufficient', 'ordinaryDriverFailure'].includes(key) ? 'YES' : 'NO', confidence: 0.9 }])) };
  } } });
  const evidence = { contradictions: [] };
  const result = await adapter.analyzeResponsibilityCase(evidence);
  assert.equal(request.state, evidence); assert.equal(Object.keys(request.questions).length, 8);
  assert.equal(result.normalized.severity, 'MODERATE');
  assert.equal(EVIDENCE_CRITERIA_V2_CONFIG.guardChanged, false); assert.equal(EVIDENCE_CRITERIA_V2_CONFIG.productionChanged, false);
  assert.equal(EVIDENCE_CRITERIA_V2_CONFIG.status, 'DEVELOPMENT_ONLY_NOT_FROZEN');
  // The live development receipt identifies this exact independent question set; changing wording requires a new versioned experiment.
  assert.equal(EVIDENCE_CRITERIA_V2_CONFIG.questionsHash, '84fb2accb75bfcd5cbc96ece8d3c6231997d98232e75c5db315f48179473c69e');
  assert.equal(adapter.provider, 'typesafe-ai'); assert.equal(adapter.model, 'jev-latest');
  assert.equal(adapter.configVersion, 'responsibility-evidence-criteria-development-v2');
});

test('v2 development adapter requires actual SDK credentials even though normal tests never call the network', () => {
  const previous = process.env.TYPESAFE_API_KEY;
  try {
    process.env.TYPESAFE_API_KEY = 'unit-test-not-a-real-key';
    const adapter = createEvidenceCriteriaV2Adapter();
    assert.equal(adapter.provider, 'typesafe-ai'); assert.equal(adapter.model, 'jev-latest');
    delete process.env.TYPESAFE_API_KEY;
    assert.throws(() => createEvidenceCriteriaV2Adapter(), /No API key was provided/);
  } finally {
    if (previous === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = previous;
  }
});
