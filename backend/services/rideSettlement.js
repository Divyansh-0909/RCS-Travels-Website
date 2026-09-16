import { prisma } from '../db/prisma.js'
import { commissionOn } from './commission.js'
import { postWalletEntry } from './wallet.js'
import { walletEvent } from './walletKeys.js'
import { commissionWithReward, loyaltyRewardsEarned } from './loyalty.js'
import { createScheduledFinalIntent } from './scheduledPayments.js'
import { releaseDriverCapacity } from './driverCapacity.js'

function transitionData({
  to,
  now,
  distanceKm,
  accuracy,
  capturedAt,
  completionOverrideReason,
  customerConfirmedCompletion,
}) {
  switch (to) {
    case 'en_route':
      return { status: to }
    case 'reached':
      return {
        status: to,
        reachedAt: now,
        reachedDistanceKm: distanceKm,
        reachedAccuracyM: accuracy,
        reachedLocationAt: new Date(capturedAt),
      }
    case 'started':
      return { status: to, startedAt: now }
    case 'completed':
      return {
        status: to,
        completedAt: now,
        completedDistanceKm: distanceKm,
        completedAccuracyM: accuracy,
        completedLocationAt: new Date(capturedAt),
        completionOverrideReason: completionOverrideReason ?? null,
        completionCustomerConfirmed: customerConfirmedCompletion,
      }
    default:
      throw new Error(`Unsupported ride transition: ${to}`)
  }
}

function applyUnmatchedShareFare(booking, data) {
  if (!booking.sharing || booking.shareGroupId || booking.soloFare == null || booking.rideFare == null) {
    return booking.commissionAmt
  }

  const extras = booking.fare - booking.rideFare
  const soloRideFare = Math.max(0, booking.soloFare - extras)
  const { pct, amt } = commissionOn({
    rideFare: soloRideFare,
    couponAmount: booking.couponAmount,
  })

  data.fare = booking.soloFare
  data.rideFare = soloRideFare
  data.customerPayment = Math.max(0, booking.soloFare - booking.couponAmount)
  data.commissionPct = pct
  data.commissionAmt = amt
  return amt
}

async function applyCompletionMoney(tx, booking, driver, now, settlementCommissionAmt) {
  if (booking.scheduledAt) {
    const hold = await tx.walletEntry.findUnique({
      where: { eventKey: walletEvent.depositHold(booking.id) },
    })
    if (hold) {
      await postWalletEntry(tx, {
        driverId: driver.id,
        amount: Math.abs(hold.amount),
        type: 'deposit_refund',
        eventKey: walletEvent.depositRefund(booking.id),
        bookingId: booking.id,
        note: 'Scheduled ride acceptance deposit released',
      })
    }
  }

  if (booking.couponAmount > 0) {
    await postWalletEntry(tx, {
      driverId: driver.id,
      amount: booking.couponAmount,
      type: 'coupon_reimbursement',
      eventKey: walletEvent.couponReimbursement(booking.id),
      bookingId: booking.id,
      note: 'Full coupon reimbursement',
    })
  }

  const liveDriver = await tx.driver.findUniqueOrThrow({
    where: { id: driver.id },
    select: {
      commissionFreeRidesRemaining: true,
      cancellationBenefitRestrictedUntil: true,
    },
  })
  const reward = commissionWithReward(
    settlementCommissionAmt,
    liveDriver.commissionFreeRidesRemaining,
  )
  if (reward.consumeReward) {
    await tx.driver.update({
      where: { id: driver.id },
      data: { commissionFreeRidesRemaining: { decrement: 1 } },
    })
    await tx.booking.update({
      where: { id: booking.id },
      data: { commissionAmt: 0, commissionPct: 0 },
    })
  }

  const completed = await tx.booking.count({
    where: { driverId: driver.id, status: 'completed' },
  })
  const benefitsRestricted = Boolean(
    liveDriver.cancellationBenefitRestrictedUntil &&
    liveDriver.cancellationBenefitRestrictedUntil > now,
  )
  const earned = benefitsRestricted ? 0 : loyaltyRewardsEarned(completed - 1, completed)
  if (earned) {
    await tx.driver.update({
      where: { id: driver.id },
      data: { commissionFreeRidesRemaining: { increment: earned } },
    })
  }

  if (booking.scheduledAt) {
    const completedBooking = await tx.booking.findUniqueOrThrow({ where: { id: booking.id } })
    const remaining = Math.max(
      0,
      Math.round(completedBooking.customerPayment * 100) - completedBooking.scheduledAdvancePaidAmount,
    )
    if (remaining !== completedBooking.scheduledRemainingAmount) {
      await tx.booking.update({
        where: { id: booking.id },
        data: { scheduledRemainingAmount: remaining },
      })
      completedBooking.scheduledRemainingAmount = remaining
    }
    await createScheduledFinalIntent(tx, completedBooking)
  }
}

/** Commit a guarded ride transition and all completion-side financial effects. */
export async function settleRideTransitionInTransaction(tx, {
  booking,
  driver,
  from,
  to,
  distanceKm,
  accuracy,
  capturedAt,
  completionOverrideReason,
  customerConfirmedCompletion,
}, now = new Date()) {
  const data = transitionData({
    to,
    now,
    distanceKm,
    accuracy,
    capturedAt,
    completionOverrideReason,
    customerConfirmedCompletion,
  })
  const settlementCommissionAmt = to === 'completed'
    ? applyUnmatchedShareFare(booking, data)
    : booking.commissionAmt

  const moved = await tx.booking.updateMany({
    where: { id: booking.id, status: from },
    data,
  })
  if (!moved.count) return false

  if (to === 'completed') {
    await releaseDriverCapacity(tx, {
      driverId: driver.id,
      vehicleClass: driver.vehicleClass,
      sharing: booking.sharing,
    })
    await applyCompletionMoney(tx, booking, driver, now, settlementCommissionAmt)
  }

  return true
}

export async function settleRideTransition(args) {
  const now = new Date()
  return prisma.$transaction((tx) => settleRideTransitionInTransaction(tx, args, now))
}
