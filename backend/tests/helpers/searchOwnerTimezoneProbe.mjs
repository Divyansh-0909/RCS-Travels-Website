import assert from 'node:assert/strict'
import { buildOwnerPolicyReview } from '../../benchmarks/search/ownerPolicyReview.js'
const london = buildOwnerPolicyReview().changes.filter(row => row.policy === 'P4')
for (const row of london) assert.equal(row.conversion.sourceDate, '2026-10-05')
const late = london.find(row => row.conversion.sourceTime === '23:00')
assert.equal(late.conversion.date, '2026-10-06')
assert.equal(late.conversion.time, '03:30')
console.log('HOST_TIMEZONE_INDEPENDENCE_VERIFIED')
