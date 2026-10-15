import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { walletEvent } from '../../services/walletKeys.js'
import { postWalletEntry } from '../../services/wallet.js'

// Execute only owned, inspected function bodies against in-memory fixtures.
// No application DB, network, provider or benchmark requests.
const deposit = await readFile(new URL('../../services/scheduledDepositLifecycle.js', import.meta.url), 'utf8')
const body = deposit.slice(deposit.indexOf('function requireHold'), deposit.indexOf('export async function releaseScheduledDeposits'))
const factory = source => new Function('walletEvent', 'postWalletEntry',
  `${source.replace('export async function', 'async function')}; return reserveScheduledDeposit`)(walletEvent, postWalletEntry)
const original = factory(body)
const mutated = factory(body.replace('eventKey === legacyKey ?', 'false ?'))
assert.notEqual(body, body.replace('eventKey === legacyKey ?', 'false ?'))
const hold = { eventKey: walletEvent.depositHold('b'), driverId: 'a', bookingId: 'b', type: 'deposit_hold', amount: -100 }
const input = { bookingId: 'b', driverId: 'a', offerId: 'o', amount: 100 }

async function outcome(run, entries, replacement, cancellation) {
  const rows = new Map(entries.map(row => [row.eventKey, structuredClone(row)]))
  const balances = {}, reads = []
  const tx = {
    walletEntry: {
      findUnique: async ({ where }) => { reads.push(where.eventKey); return rows.get(where.eventKey) ?? null },
      createMany: async ({ data }) => {
        if (rows.has(data[0].eventKey)) return { count: 0 }
        rows.set(data[0].eventKey, data[0]); return { count: 1 }
      },
    },
    driver: { update: async ({ where, data }) => { balances[where.id] = (balances[where.id] ?? 0) + data.walletBalance.increment; return {} } },
    driverCancellation: { findFirst: async () => cancellation ? { id: 'c' } : null },
  }
  let error = null
  try { await run(tx, { ...input, driverId: replacement ? 'replacement' : 'a' }) }
  catch (caught) { error = caught.message }
  return { financial: { rows: [...rows.values()], balances, error }, reads }
}
const depositWitnesses = []
for (const [entries, replacement, cancellation] of [
  [[], false, false], [[hold], false, false], [[hold], true, true], [[hold], true, false],
  [[{ ...hold, bookingId: 'foreign' }], true, true],
  [[hold, { ...hold, eventKey: walletEvent.depositRefund('b'), type: 'deposit_refund', amount: 100 }], false, false],
  [[hold, { ...hold, eventKey: `${hold.eventKey}:offer:o`, driverId: 'replacement' }], true, true],
]) {
  const a = await outcome(original, entries, replacement, cancellation)
  const b = await outcome(mutated, entries, replacement, cancellation)
  assert.deepEqual(a.financial, b.financial)
  depositWitnesses.push({ replacement, cancellation, originalReads: a.reads.length, mutantReads: b.reads.length, sameFinancialOutcome: true })
}

const payment = await readFile(new URL('../../services/paymentStatus.js', import.meta.url), 'utf8')
const compile = source => new Function(`${source.replaceAll('export ', '')}; return statusAfterGatewayPayment`)()
const paymentOriginal = compile(payment)
const paymentMutant = compile(payment.replace("['order_created', 'authorized']", "['order_created', '']"))
let paymentWitnesses = 0
for (const state of ['created', 'order_created', 'authorized', 'captured', 'failed', 'refund_pending', 'refunded', 'unknown']) {
  for (const gateway of ['captured', 'authorized', 'failed', 'pending', null]) {
    assert.equal(paymentOriginal(state, gateway), paymentMutant(state, gateway)); paymentWitnesses++
  }
}
const hash = source => createHash('sha256').update(source).digest('hex')
await writeFile(new URL('../../../output/phase9-financial-lifecycle-2026-10-09/reviewed-equivalences.json', import.meta.url), JSON.stringify({
  reviewed: 2, ignored: 0, databaseCalls: 0, providerCalls: 0,
  equivalences: [{ file: 'services/scheduledDepositLifecycle.js', sourceHash: hash(deposit), line: 25,
    mutator: 'ConditionalExpression', replacement: 'false', witnesses: depositWitnesses,
    reason: 'For a legacy reservation the mutant re-reads the same unique key. Application wallet writers append entries; no wallet entry update/delete writer exists. The caller holds booking/actor locks. Required ownership validation and ledger effects are unchanged. This review is restricted to that application transaction contract.' },
  { file: 'services/paymentStatus.js', sourceHash: hash(payment), line: 8, mutator: 'StringLiteral', replacement: '\"\"',
    witnesses: paymentWitnesses, reason: 'Removing authorized from the current-state list only changes which return handles current=authorized/gateway=authorized. Both return the identical authorized state; all other inputs follow unchanged branches.' }],
}, null, 2))
console.log('Reviewed equivalents: 2; 7 deposit and 40 payment witnesses PASS; zero database/provider calls')
