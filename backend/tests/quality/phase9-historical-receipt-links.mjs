import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

const root = new URL('../../../', import.meta.url)
const original = JSON.parse(await readFile(new URL('output/phase9-financial-lifecycle-2026-10-09/receipt-manifest.json', root)))
const recipeIds = ['partial-arrival-refund', 'authorized-arrival-waiver', 'below-floor-terminal-shadow',
  'cancel-before-delayed-capture', 'preexisting-compensation-cancellation', 'preexisting-compensation-completion',
  'confirmation-transaction-crash', 'duplicate-completion-race', 'signed-final-platform-capture',
  'occupied-replacement-retry', 'stale-original-ownership', 'refund-crash-before-ack', 'refund-lost-response',
  'refund-timeout', 'delayed-payment-failure', 'foreign-booking-reservation', 'refund-terminal-callback-order',
  'replacement-completion-cash', 'replacement-refund', 'replacement-cancellation-race',
  'completion-customer-cancellation-race', 'refund-provider-failure', 'competing-replacement-drivers']
assert.equal(original.receipts.length, recipeIds.length)
const links = await Promise.all(original.receipts.map(async (receipt, index) => {
  const bytes = await readFile(new URL(receipt.path, root))
  assert.equal(createHash('sha256').update(bytes).digest('hex'), receipt.sha256)
  return { historicalReceipt: receipt, recipeId: recipeIds[index], relationship: 'SAME_LOGICAL_SCENARIO_NEW_EXPLICIT_INPUTS',
    exactHistoricalWallClockReplay: false }
}))
await writeFile(new URL('output/phase9-final-integration-2026-10-09/historical-receipt-linkage.json', root),
  JSON.stringify({ schema: 'phase9-historical-receipt-linkage-v1', preserved: links.length, links }, null, 2))
console.log(`Preserved historical receipt identities: ${links.length}/${recipeIds.length}`)
