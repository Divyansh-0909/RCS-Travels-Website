import 'dotenv/config'
import { mkdir, writeFile } from 'node:fs/promises'
import { createJevSearchProvider } from '../services/search/provider.ts'
import { createRideSearchParser } from '../services/search/parser.ts'
import { generateLocationCandidates } from '../services/search/locations/candidates.ts'
import { createTestClock } from '../tests/helpers/testClock.js'

if (process.argv.length > 2) throw new Error('PREFLIGHT_ONLY_NO_ARGUMENTS')
const queries = ['prefer sedan tomorrow from Demo Library to Demo Garden', 'Demo Library']
const receipt = { domain: 'search', scope: 'TWO_NEW_SYNTHETIC_QUERIES_ADAPTER_PREFLIGHT',
  plannedJevRequestsAtMost: 4, plannedLunaCalls: 0, plannedGoogleCalls: 0, heldOutExecuted: false,
  accuracyMeasured: false, thresholdsCalibrated: false, labelsSentToProvider: false }
console.log(JSON.stringify(receipt))
const parser = createRideSearchParser(createJevSearchProvider(), createTestClock('2026-10-05T12:00:00+05:30'), generateLocationCandidates)
const rows = []
for (const [index, text] of queries.entries()) {
  const result = await parser.parse({ query: { id: `search-preflight-new-${index}`, revision: 1, text }, candidates: [], timeZone: 'Asia/Kolkata' })
  rows.push({ query: text, result })
  console.log(JSON.stringify({ query: text, route: result.route, issues: result.issues.map(issue => issue.code),
    queryType: result.draft?.queryType, complexity: result.draft?.complexity }))
}
const root = new URL('../../output/search-s5-development/', import.meta.url)
await mkdir(root, { recursive: true })
await writeFile(new URL('jev-preflight.json', root), `${JSON.stringify({ receipt, rows }, null, 2)}\n`)
