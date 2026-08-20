import { postWalletEntry } from './wallet.js'
import { walletEvent } from './walletKeys.js'
export const COMPLAINT_FINE_THRESHOLD = 3
export const COMPLAINT_SUSPEND_THRESHOLD = 5
export const COMPLAINT_FINE_AMOUNT = 200
export async function applyComplaintConsequences(tx, driverId, { newComplaint = true } = {}) {
  const complaints = await tx.rideComplaint.count({ where: { driverId } })
  if (complaints >= COMPLAINT_FINE_THRESHOLD) await postWalletEntry(tx, {
    driverId, amount: -COMPLAINT_FINE_AMOUNT, type: 'fine', eventKey: walletEvent.fine(driverId, 3), note: 'Fine at 3 complaints',
  })
  // Only the transition onto five suspends. A retry must not undo an admin's
  // later removal of that suspension.
  if (newComplaint && complaints === COMPLAINT_SUSPEND_THRESHOLD) {
    await tx.driver.updateMany({ where: { id: driverId, suspendedAt: null }, data: {
      suspendedAt: new Date(), suspensionReason: `${complaints} customer complaints`, isOnline: false,
    } })
    await tx.rideOffer.updateMany({ where: { driverId, status: 'pending' }, data: { status: 'withdrawn', respondedAt: new Date() } })
  }
  const driver = await tx.driver.findUnique({ where: { id: driverId }, select: { suspendedAt: true } })
  return { complaints, fined: complaints >= 3, suspended: Boolean(driver?.suspendedAt) }
}
