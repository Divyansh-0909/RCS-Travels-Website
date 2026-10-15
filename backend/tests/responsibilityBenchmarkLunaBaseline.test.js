import assert from 'node:assert/strict'
import test from 'node:test'
import { createLunaResponsibilityBaseline, RESPONSIBILITY_LUNA_CONFIG, RESPONSIBILITY_LUNA_SCHEMA } from '../benchmarks/responsibility/lunaBaseline.js'

const output = { responsibility: 'EXTERNAL_OR_UNCERTAIN', confidence: 0.7, evidenceSufficient: false,
  platformMateriallyContributed: false, externalCauseMaterial: true, needsHumanReview: true, severity: 'LOW' }
test('responsibility Luna baseline sends evidence only through bounded structured output', async () => {
  const calls = []
  const client = { responses: { parse: async (...args) => {
    calls.push(args)
    return { model: 'gpt-6-luna', output_parsed: output, usage: { input_tokens: 12, output_tokens: 8,
      input_tokens_details: { cached_tokens: 4 } } }
  } } }
  const evidence = { caseId: 'opaque', timeline: [] }
  const adapter = createLunaResponsibilityBaseline({ client })
  assert.equal(adapter.provider, 'openai')
  assert.equal(adapter.configVersion, 'responsibility-luna-bounded-v1')
  const result = await adapter.analyzeResponsibilityCase(evidence)
  assert.deepEqual(JSON.parse(calls[0][0].input), { evidence })
  assert.equal(calls[0][0].model, 'gpt-6-luna')
  assert.equal(calls[0][0].reasoning.effort, 'low')
  assert.equal(calls[0][0].text.format.strict, true)
  assert.equal(calls[0][0].text.format.name, 'responsibility_bounded_v1')
  assert.ok(calls[0][0].instructions.includes('Never invent evidence'))
  assert.ok(calls[0][0].instructions.includes('Confidence alone never permits automation'))
  assert.equal(calls[0][1].maxRetries, 0)
  assert.equal(result.normalized.classification, 'EXTERNAL_OR_UNCERTAIN')
  assert.equal(result.normalized.directPolicyGateCompatible, false)
  assert.equal(result.normalized.directAnalystContractCompatible, false)
  assert.deepEqual(result.raw.usage, { inputTokens: 12, outputTokens: 8, cachedInputTokens: 4, requestCount: 1 })
  assert.match(RESPONSIBILITY_LUNA_CONFIG.promptHash, /^[a-f0-9]{64}$/)
})
test('bounded responsibility schema validates every answer class and rejects invalid certainty, fields and prose', () => {
  for (const responsibility of ['DRIVER_CAUSED', 'PLATFORM_CAUSED', 'VALID_WAIVED', 'EXTERNAL_OR_UNCERTAIN']) {
    for (const severity of ['LOW', 'MODERATE', 'HIGH']) assert.equal(RESPONSIBILITY_LUNA_SCHEMA.parse({ ...output, responsibility, severity }).responsibility, responsibility)
  }
  for (const change of [{ confidence: -0.1 }, { confidence: 1.1 }, { confidence: NaN }, { responsibility: 'NEEDS_REVIEW' },
    { evidenceSufficient: 'yes' }, { externalCauseMaterial: 1 }, { platformMateriallyContributed: null }, { needsHumanReview: undefined },
    { severity: 'LEVEL_3' }, { explanation: 'extra text' }]) assert.equal(RESPONSIBILITY_LUNA_SCHEMA.safeParse({ ...output, ...change }).success, false)
  assert.equal(RESPONSIBILITY_LUNA_SCHEMA.parse({ ...output, confidence: 0 }).confidence, 0)
  assert.equal(RESPONSIBILITY_LUNA_SCHEMA.parse({ ...output, confidence: 1 }).confidence, 1)
})
test('responsibility Luna baseline rejects model mismatch and malformed decisions without invented defaults', async () => {
  await assert.rejects(createLunaResponsibilityBaseline({ client: { responses: { parse: async () => ({ model: 'other' }) } } }).analyzeResponsibilityCase({}), /RESPONSIBILITY_LUNA_MODEL_MISMATCH/)
  for (const response of [{ model: 'other', output_parsed: output }, { model: 'gpt-6-luna', output_parsed: null },
    { model: 'gpt-6-luna', output_parsed: { ...output, severity: 'LEVEL_3' } }]) {
    const client = { responses: { parse: async () => response } }
    await assert.rejects(createLunaResponsibilityBaseline({ client, timeout: 5 }).analyzeResponsibilityCase({}))
  }
  const client = { responses: { parse: async () => ({ model: 'gpt-6-luna', output_parsed: output }) } }
  const result = await createLunaResponsibilityBaseline({ client }).analyzeResponsibilityCase({})
  assert.deepEqual(result.raw.usage, { inputTokens: null, outputTokens: null, cachedInputTokens: null, requestCount: 1 })
  const tokensOnly = { responses: { parse: async () => ({ model: 'gpt-6-luna', output_parsed: output,
    usage: { input_tokens: 3, output_tokens: 2 } }) } }
  assert.equal((await createLunaResponsibilityBaseline({ client: tokensOnly }).analyzeResponsibilityCase({})).raw.usage.cachedInputTokens, null)
})
test('responsibility Luna baseline constructs a real configured SDK without invoking a live API in tests', () => {
  const previous = process.env.OPENAI_API_KEY
  process.env.OPENAI_API_KEY = 'test-only-noncredential'
  try { assert.equal(createLunaResponsibilityBaseline().model, 'gpt-6-luna') }
  finally { if (previous === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previous }
})
