import 'dotenv/config'
import { mkdir, writeFile } from 'node:fs/promises'
import { createJevSearchProvider } from '../services/search/provider.ts'
import { createRideSearchParser } from '../services/search/parser.ts'
import { generateLocationCandidates } from '../services/search/locations/candidates.ts'
import { resolutionRequirements } from '../services/search/locations/followup.ts'
import { createTestClock } from '../tests/helpers/testClock.js'
if (process.argv.length > 2) throw new Error('DEVELOPMENT_ONLY_NO_ARGUMENTS')
const queries = ['not SUV from Demo College to Demo Library tomorrow at 7',
  'anything except SUV from Demo College to Demo Library tomorrow at 7',
  'no sedan from Demo College to Demo Library tomorrow at 7']
console.log(JSON.stringify({ plannedJevCallsAtMost: 6, plannedLunaCalls: 0, plannedGoogleCalls: 0, heldOut: false }))
const parser = createRideSearchParser(createJevSearchProvider(), createTestClock('2026-10-04T12:00:00+05:30'), generateLocationCandidates)
const rows = []
for (const [index, text] of queries.entries()) {
  const result = await parser.parse({ query: { id: `exclusion-development-${index}`, revision: 1, text }, timeZone: 'Asia/Kolkata', candidates: [] })
  rows.push({ query: text, result, resolutionRequirements: result.draft ? resolutionRequirements(result.draft, result.issues) : [],
    exclusionPreserved: result.draft?.vehicleClass.state === 'EXCLUDED' })
}
const root = new URL('../../output/search-s5-authorized-development/', import.meta.url)
await mkdir(root, { recursive: true })
await writeFile(new URL('exclusion-preflight.json', root), JSON.stringify({ heldOutExecuted: false, rows }, null, 2))
console.log(JSON.stringify({ cases: rows.length, exclusionPreserved: rows.filter(r => r.exclusionPreserved).length,
  providerFailures: rows.filter(r => r.result.issues.some(i => i.field === 'provider')).length,
  vehicleResolutionRequired: rows.filter(r => r.resolutionRequirements.some(i => i.field === 'vehicleClass')).length }))
