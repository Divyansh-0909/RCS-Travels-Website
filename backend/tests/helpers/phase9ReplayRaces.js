import assert from 'node:assert/strict'
import { raceTransactions } from './database.js'
import { settleRideTransitionInTransaction } from '../../services/rideSettlement.js'
import { cancelDriverRideInTransaction } from '../../services/driverRideCancellation.js'
import { cancelCustomerWithEvidenceInTransaction } from '../../services/customerLifecycleIncidents.js'

/** Replay a recorded row-lock order, while retaining two real committed database transactions. */
export async function executePhase9Race(s, event) {
  const booking = await s.booking()
  const completing = tx => settleRideTransitionInTransaction(tx, { booking, driver: s.actors.driversByGroup.rcs,
    from: booking.status, to: 'completed', distanceKm: 0, accuracy: 5, capturedAt: s.clock.now().toISOString(),
    customerConfirmedCompletion: false }, s.clock.now())
  const cancelling = tx => cancelCustomerWithEvidenceInTransaction(tx,
    { booking, cancellationCharge: 0, advanceDisposition: 'refund_pending' }, { clock: s.clock })
  const options = {
    duplicate_completion: [completing, completing],
    completion_cancel: [completing, cancelling],
    completion_driver_cancel: [completing, tx => cancelDriverRideInTransaction(tx, booking,
      s.actors.driversByGroup.rcs, {}, { clock: s.clock })],
    replacement_cancel: [tx => s.accept(s.actors.driversByGroup.partner,
      { rideOffer: tx.rideOffer, $transaction: work => work(tx) }), cancelling],
    replacement_drivers: ['admin', 'partner'].map(group => tx => s.accept(s.actors.driversByGroup[group],
      { rideOffer: tx.rideOffer, $transaction: work => work(tx) })),
  }
  const workers = options[event.mode]
  if (!workers) throw new Error('REPLAY_UNSUPPORTED_RACE')
  const results = await raceTransactions(s.database, workers.map((work, index) => async (tx, ready) => {
    // The first transaction owns the booking before the shared rendezvous. This
    // records a legal database interleaving instead of substituting an application decision.
    if (index === 0) await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${booking.id} FOR UPDATE`
    await ready()
    return work(tx)
  }))
  for (const result of results) assert.equal(result.status, 'fulfilled')
  return results.map(row => row.value)
}
