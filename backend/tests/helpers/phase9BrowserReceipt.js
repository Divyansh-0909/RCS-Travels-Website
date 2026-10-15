import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import assert from 'node:assert/strict';

export const browserReceiptHash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export async function loadBrowserReplay(sources, root) {
  if (!process.env.PHASE9_UI_REPLAY) return null;
  const path = resolve(process.env.PHASE9_UI_REPLAY);
  if (!path.startsWith(resolve(root) + sep)) throw new Error('UI replay requires an owned evidence receipt');
  const receipt = JSON.parse((await readFile(path)).toString('utf8'));
  const { integrity, ...body } = receipt;
  if (receipt.schema !== 'rcs-phase9-ui-v1' || receipt.status !== 'PASS' || integrity !== browserReceiptHash(body)) throw new Error('UI replay receipt integrity mismatch');
  assert.deepEqual(sources, receipt.sources, 'UI replay source/configuration mismatch');
  return receipt;
}

export async function browserFinalInvariants(harness) {
  const booking = await harness.lifecycle.booking();
  const provider = harness.lifecycle.provider.snapshot();
  const db = harness.db;
  const parties = {};
  for (const role of ['captain', 'replacement']) {
    const driver = await db.driver.findUniqueOrThrow({ where: { id: harness.actors[role].id } });
    parties[role] = { balance: driver.walletBalance, capacity: driver.vehicleCapacity };
  }
  return { booking: { status: booking.status, advancePaid: booking.scheduledAdvancePaidAmount,
    advanceDisposition: booking.scheduledAdvanceDisposition, cancellationCharge: booking.cancellationCharge,
    driverAssigned: booking.driverId !== null }, parties,
    provider: { payments: provider.payments.map(row => ({ amount: row.amount, status: row.status })),
      refunds: provider.refunds.map(row => ({ amount: row.amount, status: row.status })) },
    finalDecisions: await db.responsibilityFinalDecision.count(), liabilities: await db.responsibilityLiability.count(),
    compensations: await db.responsibilityCompensation.count(), strikes: await db.reliabilityStrike.count(),
    blocks: await db.reliabilityBlock.count(), payouts: await db.driverPayout.count(),
  };
}
