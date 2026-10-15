import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const read = relativePath => fs.readFileSync(path.resolve(here, '..', relativePath), 'utf8')

test('all new-work entry points remain wired through the reliability eligibility boundary', () => {
  const candidates = read('services/driverDispatchCandidates.js')
  const nearby = read('services/nearbyDrivers.js')
  const scheduled = read('services/scheduledOffers.js')
  const assignment = read('services/driverAssignment.js')
  const driverRoutes = read('routes/driver.ts')

  assert.match(candidates, /newWorkEligibility\(driver, \{ db, now: clock\.now\(\) \}\)/)
  assert.match(nearby, /newWorkEligibility\(driverById\.get\(row\.driverId\), \{ db \}\)/)
  assert.match(scheduled, /newWorkEligibility\(driver, \{ db, now \}\)/)
  assert.match(assignment, /recheckDriverNewWorkEligibility\(driver\.id, \{ db: tx, now \}\)/)
  assert.match(driverRoutes, /driverRouter\.patch\('\/offers\/:id\/accept'[^]*requireDriverForNewWork\(req, res\)/)
  assert.match(driverRoutes, /driverRouter\.patch\('\/rides\/:id\/accept'[^]*requireDriverForNewWork\(req, res\)/)
  assert.match(driverRoutes, /if \(isOnline\)[^]*recheckDriverNewWorkEligibility\(driver\.id, \{ db: tx \}\)/)
})
