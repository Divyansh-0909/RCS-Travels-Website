import test from 'node:test'
import assert from 'node:assert/strict'

import { loadProductionResponsibilityAnalystClient } from '../services/responsibilityShadowAdjudication.js'

test('production analyst client loading fails closed when OpenAI credentials are absent', async () => {
  const previousApiKey = process.env.OPENAI_API_KEY
  const previousAdminKey = process.env.OPENAI_ADMIN_KEY
  delete process.env.OPENAI_API_KEY
  delete process.env.OPENAI_ADMIN_KEY
  try {
    await assert.rejects(loadProductionResponsibilityAnalystClient(), /Missing credentials/)
  } finally {
    if (previousApiKey === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = previousApiKey
    if (previousAdminKey === undefined) delete process.env.OPENAI_ADMIN_KEY
    else process.env.OPENAI_ADMIN_KEY = previousAdminKey
  }
})
