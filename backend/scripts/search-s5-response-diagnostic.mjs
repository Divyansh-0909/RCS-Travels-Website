import 'dotenv/config'
import { TypeSafeClient } from '@typesafe-ai/sdk'
import { writeFile } from 'node:fs/promises'
import { createJevSearchProvider } from '../services/search/provider.ts'
import { createRideSearchParser } from '../services/search/parser.ts'
import { generateLocationCandidates } from '../services/search/locations/candidates.ts'
import { createTestClock } from '../tests/helpers/testClock.js'
if (process.argv.length > 2) throw new Error('DEVELOPMENT_ONLY_NO_ARGUMENTS')
console.log(JSON.stringify({ plannedJevCallsAtMost: 2, plannedLunaCalls: 0, plannedGoogleCalls: 0, heldOut: false }))
const sdk = new TypeSafeClient(); const batches = []
const client = { async systemOne(request, options) {
  const result = await sdk.systemOne(request, options)
  batches.push({ model: result.model, answers: result.answers, usage: result.usage })
  return result
} }
const parser = createRideSearchParser(createJevSearchProvider({ client }), createTestClock('2026-10-04T12:00:00+05:30'), generateLocationCandidates)
const result = await parser.parse({ query: { id: 'failed-exclusion-protocol-diagnostic', revision: 1,
  text: 'anything except SUV from Demo College to Demo Library tomorrow at 7' }, candidates: [], timeZone: 'Asia/Kolkata' })
await writeFile(new URL('../../output/search-s5-authorized-development/response-diagnostic.json', import.meta.url),
  JSON.stringify({ scope: 'SINGLE_FAILED_SYNTHETIC_DEVELOPMENT_QUERY', result, batches }, null, 2))
console.log(JSON.stringify({ batches: batches.length, route: result.route, issues: result.issues.map(i => i.code) }))
