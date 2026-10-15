import test from 'node:test'
import assert from 'node:assert/strict'

import { loadProductionResponsibilityAnalystClient } from '../services/responsibilityShadowAdjudication.js'

test('production analyst client loader returns the existing backend OpenAI client without making a request', async () => {
  const previousApiKey = process.env.OPENAI_API_KEY
  process.env.OPENAI_API_KEY = 'sk-phase7-loader-test'
  try {
    const clientModule = await loadProductionResponsibilityAnalystClient()
    assert.ok(clientModule.openai)
    assert.ok(clientModule.openai.responses)
  } finally {
    if (previousApiKey === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = previousApiKey
  }
})
