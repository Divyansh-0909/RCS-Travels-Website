import { registerHooks } from 'node:module'
import assert from 'node:assert/strict'
import { TypeSafeClient } from '@typesafe-ai/sdk'

TypeSafeClient.prototype.systemOne = async (_request, options) => {
  assert.deepEqual(options, { timeout: 60000, retry: { maxRetries: 0 } })
  return { model: 'jev-cli-test', usage: { input_tokens: 3, output_tokens: 2 },
  answers: { responsibility: { choice: 'EXTERNAL_OR_UNCERTAIN', confidence: 0.9, probabilities: { EXTERNAL_OR_UNCERTAIN: 1 } },
    evidenceSufficient: { noul: 0.1 }, platformMateriallyContributed: { noul: 0.1 }, externalCauseMaterial: { noul: 0.9 },
    needsHumanReview: { noul: 0.9 }, severity: { score: 0, confidence: 1 } } }
}

// Exercise the real CLI without connecting to an application database or an AI API.
registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith('/db/prisma.js')) {
      return { format: 'module', shortCircuit: true,
        source: 'export const prisma = { responsibilityCase: { findMany: async () => [] }, $disconnect: async () => {} }' }
    }
    if (url.endsWith('/lib/openai.js')) {
      return { format: 'module', shortCircuit: true, source: `export const openai = { responses: { parse: async (request, options) => {
        if (options.timeout !== 60000 || options.maxRetries !== 0) throw new Error('BENCHMARK_CLIENT_OPTIONS_INVALID')
        const bundle = JSON.parse(request.input)
        return { id: 'cli-analysis-' + bundle.caseId, output_parsed: { caseId: bundle.caseId,
          suggestedClassification: 'EXTERNAL_OR_UNCERTAIN', confidence: 0.9, factsSupporting: [], factsAgainst: [],
          contradictions: [], missingEvidence: [], inferences: [], severityAssessment: 'LOW',
          suggestedActionCategory: 'ADMIN_REVIEW', explanationSummary: 'Deterministic CLI test.' } }
      } } }` }
    }
    const result = nextLoad(url, context)
    if (process.env.PHASE8_TEST_BAD_HASH === '1' && url.endsWith('/benchmarks/responsibility/dataset.js')) {
      return { ...result, source: String(result.source).replace(
        /['"]f011610a6083cec0006f434c330c6cc51fb0090e66999d435f43d95070b400e0['"]/g,
        `'${'0'.repeat(64)}'`,
      ) }
    }
    return result
  },
})
