import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { balancesFrom } from '../services/walletKeys.js'

// Offline verification of source-bound synthetic receipts. This audits saved
// financial observations; it does not replay the application lifecycle.
const backend = fileURLToPath(new URL('../', import.meta.url))
const root = path.resolve(backend, '..')
const manifestPath = process.argv[2]
if (!manifestPath) throw new Error('Pass the Phase 9 final receipt manifest')
const manifest = JSON.parse(await readFile(path.resolve(root, manifestPath), 'utf8'))
const results = []
for (const item of manifest.receipts) {
  const bytes = await readFile(path.resolve(root, item.path))
  assert.equal(createHash('sha256').update(bytes).digest('hex'), item.sha256)
  const receipt = JSON.parse(bytes)
  assert.equal(receipt.schema, 'phase9-lifecycle-receipt-v1')
  assert.equal(receipt.syntheticOnly, true)
  assert.equal(receipt.frozenV5, 'e484afc4c7fa724ea29af6edd962c48b814dc73a10e4f4a5e33833ad26afbe75')
  for (const [source, hash] of Object.entries(receipt.sourceHashes)) {
    assert.equal(createHash('sha256').update(await readFile(path.resolve(backend, source))).digest('hex'), hash, source)
  }
  assert.deepEqual(receipt.events.map(row => row.sequence), receipt.events.map((_, index) => index + 1))
  const { financial, booking, allocations } = receipt.final
  assert.equal(new Set(financial.wallets.map(row => row.eventKey)).size, financial.wallets.length)
  for (const driver of financial.drivers) {
    const rows = financial.wallets.filter(row => row.driverId === driver.id)
    assert.equal(Math.round(balancesFrom(rows).available * 100), Math.round(driver.walletBalance * 100))
  }
  if (booking.status === 'completed') {
    const rows = financial.wallets.filter(row => row.bookingId === booking.id)
    const funding = rows.filter(row => ['ride_collection', 'coupon_reimbursement', 'responsibility_compensation_funding'].includes(row.type))
      .reduce((sum, row) => sum + Math.round(row.amount * 100), 0)
    const cash = booking.scheduledFinalPaymentMethod === 'cash' ? booking.scheduledFinalPaidAmount : 0
    const outstanding = Math.max(0, booking.scheduledRemainingAmount - booking.scheduledFinalPaidAmount)
    assert.equal(funding + cash + outstanding, Math.round(booking.fare * 100))
    const consumed = allocations.filter(row => row.bookingId === booking.id && row.status === 'CONSUMED')
      .reduce((sum, row) => sum + row.amountPaise, 0)
    assert.equal(Math.round(booking.customerPayment * 100) + consumed + Math.round(booking.couponAmount * 100), Math.round(booking.fare * 100))
    assert.equal(rows.filter(row => row.type === 'commission').reduce((sum, row) => sum - row.amount, 0), booking.commissionAmt)
  }
  if (booking.status === 'cancelled') {
    const compensation = financial.wallets.filter(row => row.bookingId === booking.id && row.type === 'cancellation_compensation')
      .reduce((sum, row) => sum + row.amount, 0)
    assert.equal(compensation, booking.cancellationCharge ?? 0)
  }
  results.push({ scenario: receipt.scenario, path: item.path, status: 'PASS' })
}
const report = { schema: 'phase9-offline-receipt-audit-v1', applicationLifecycleReplay: false,
  providerCalls: 0, databaseCalls: 0, audited: results.length, results }
await writeFile(path.resolve(root, 'output/phase9-financial-lifecycle-2026-10-09/receipt-audit.json'), JSON.stringify(report, null, 2))
console.log(`Offline receipt audit: ${results.length}/${results.length} PASS; zero database/provider calls`)
