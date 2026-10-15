import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { testDatabaseUrl } from './database.js'
import { createTestClock } from './testClock.js'
import { assertPhase9Environment } from './phase9Isolation.js'
import { replaySourceHashes } from './phase9ReplayContract.js'
import { createPrismaResponsibilityShadowRepository } from '../../services/responsibilityShadowRepository.js'
import { RESPONSIBILITY_SHADOW_LEASE_MS } from '../../services/responsibilityShadowConfig.js'
import { sweepResponsibilityShadowAdjudication } from '../../services/responsibilityShadowAdjudication.js'
import { createJevV5ResponsibilityAnalyst } from '../../services/responsibilityJevV5.js'
import { evidenceCriteriaV5Questions } from '../../benchmarks/responsibility/evidenceCriteriaV5.js'

assertPhase9Environment(process.env)
await replaySourceHashes() // Includes the exact frozen configuration and all 22 bound sources.
const name = process.env.PHASE9_WORKER_DB_NAME
assert.match(name, /^rcs_verify_[a-f0-9]{32}$/)
const url = testDatabaseUrl()
url.pathname = `/${name}`
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString(), max: 2 }) })
const clock = createTestClock(process.env.PHASE9_WORKER_TIME)
const [identity] = await db.$queryRaw`SELECT current_database() AS name`
assert.equal(identity.name, name)
if (process.env.PHASE9_WORKER_MODE === 'claim_then_crash') {
  const now = clock.now()
  const claimed = await createPrismaResponsibilityShadowRepository(db).claimNext({
    now, leaseUntil: new Date(now.getTime() + RESPONSIBILITY_SHADOW_LEASE_MS), maxAttempts: 4,
  })
  assert.ok(claimed)
  console.log('PHASE9_LEASE_COMMITTED')
  setInterval(() => {}, 1000) // Parent forcibly terminates this actual worker after the committed lease.
} else {
  assert.equal(process.env.PHASE9_WORKER_MODE, 'resume')
  let calls = 0
  const analyst = createJevV5ResponsibilityAnalyst({ client: { async systemOne(request, options) {
    assert.deepEqual(request.questions, evidenceCriteriaV5Questions())
    assert.equal(request.model, 'jev-latest')
    assert.deepEqual(options, { timeout: 60_000, retry: { maxRetries: 0 } })
    calls++
    const choice = key => key === 'responsibility' ? 'DRIVER_CAUSED'
      : ['evidenceSufficient', 'ordinaryDriverFailure'].includes(key) ? 'YES' : 'NO'
    return { model: 'jev-1.13.0', answers: Object.fromEntries(Object.keys(request.questions)
      .map(key => [key, { choice: choice(key), confidence: 0.97 }])), usage: { input_tokens: 0, output_tokens: 0 } }
  } } })
  try {
    const result = await sweepResponsibilityShadowAdjudication({ db, clock, analyst,
      env: { RESPONSIBILITY_ADJUDICATION_MODE: 'shadow' } })
    console.log(`PHASE9_WORKER_RESULT ${JSON.stringify({ processed: result.processed, calls })}`)
  } finally { await db.$disconnect() }
}
