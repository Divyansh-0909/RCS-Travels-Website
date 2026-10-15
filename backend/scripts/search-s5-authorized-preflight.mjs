import 'dotenv/config'
import OpenAI from 'openai'
import { mkdir, writeFile } from 'node:fs/promises'
import { createLunaInterpreter } from '../services/search/complex/luna.ts'
import { emptyDraft } from '../services/search/contracts.ts'
import { safeRateLimitDetail } from '../benchmarks/responsibility/pacedDevelopment.js'
if (process.argv.length > 2) throw new Error('PREFLIGHT_NO_ARGUMENTS')
const root = new URL('../../output/search-s5-authorized-development/', import.meta.url)
await mkdir(root, { recursive: true })
console.log(JSON.stringify({ plannedLunaCalls: 1, plannedAccountDiscoveryCalls: 1, plannedJevCalls: 0,
  plannedGoogleCalls: 0, heldOut: false, maximumOutputTokens: 4096 }))
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 60000, maxRetries: 0 })
const query = { id: 'authorized-development-preflight', revision: 1,
  text: 'Take a cab from Demo College to Demo Airport tomorrow at 7 PM, stopping at Demo Library.' }
let providerFailure
const interpreter = createLunaInterpreter({ transport: { parse: async (request, options) => {
  try { return await client.responses.parse(request, options) }
  catch (error) { providerFailure = safeRateLimitDetail(error); throw error }
} } })
let result
try { result = { status: 'PASS', output: await interpreter.interpret({ query, candidates: [], partialDraft: emptyDraft(query),
  fallbackReasons: ['COMPLEX_QUERY'], now: '2026-10-04T06:30:00.000Z', timeZone: 'Asia/Kolkata', trustedFields: [] }) } }
catch (error) { result = { status: 'FAIL', code: error.code ?? 'PROVIDER', providerFailure } }
await writeFile(new URL('luna-preflight.json', root), JSON.stringify({ ...result, recordedAt: new Date().toISOString() }, null, 2))
console.log(JSON.stringify({ luna: result.status, code: result.code, providerFailure }))
let discovery
try { const models = await client.models.list(); discovery = { sdkResource: 'decisions' in client,
  decisionNamedModels: models.data.filter(m => /decision/i.test(m.id)).map(m => m.id), modelsList: 'PASS' } }
catch { discovery = { modelsList: 'FAIL' } }
await writeFile(new URL('decisions-discovery.json', root), JSON.stringify({ ...discovery,
  sdkVersion: '7.10.0', status: 'NO_USABLE_DOCUMENTED_API_CONTRACT_FOUND', accountEntitlement: 'UNKNOWN',
  officialSearch: 'Exact Decisions API searches on developers.openai.com/platform.openai.com returned no usable contract.',
  benchmarkExecuted: false, recordedAt: new Date().toISOString() }, null, 2))
