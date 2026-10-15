import { prisma } from '../db/prisma.js'
import { commissionOn } from './commission.js'
import { postWalletEntry } from './wallet.js'
import { walletEvent } from './walletKeys.js'
import { commissionWithReward, loyaltyRewardsEarned } from './loyalty.js'
import { createScheduledFinalIntent } from './scheduledPayments.js'
import { driverPayoutUpiAvailable } from './ridePayments.ts'
import { releaseDriverCapacity } from './driverCapacity.js'
import { consumeReservedResponsibilityCompensation } from './responsibilityCompensation.js'
import { recoverFinalizedLiabilitiesFromEarning } from './responsibilityLiabilityRecovery.js'
import { customerObligationPaise } from './responsibilityFinancialMath.js'
import { releaseScheduledDeposits } from './scheduledDepositLifecycle.js'

/** @type {Record<'en_route' | 'reached' | 'started' | 'completed', readonly import('@prisma/client').BookingStatus[]>} */
export const RIDE_TRANSITIONS = {
  en_route: ['assigned'], reached: ['assigned', 'en_route'], started: ['reached'], completed: ['started'],
}

async function postRecoverableEarning(tx, entry) {
  const result = await postWalletEntry(tx, entry)
  if (result.posted) await recoverFinalizedLiabilitiesFromEarning({
    driverId: entry.driverId, earningEventKey: entry.eventKey, db: tx,
  })
}

async function applyCompletedRideCompensation(tx, booking, driver, now) {
  const completed = await tx.booking.findUniqueOrThrow({ where: { id: booking.id } })
  const ordinaryDuePaise = customerObligationPaise({
    farePaise: Math.round(completed.fare * 100),
    couponPaise: Math.round(completed.couponAmount * 100),
  }).obligationPaise
  // An older advance collected before a compensation reservation cannot be
  // undone here. New advances already reflect the booking-time reservation.
  const payablePaise = Math.max(0, ordinaryDuePaise - (completed.scheduledAt ? completed.scheduledAdvancePaidAmount : 0))
  const consumed = await consumeReservedResponsibilityCompensation(tx, booking.id, {
    clock: { now: () => now }, maxPaise: payablePaise,
  })
  if (!consumed.count) return
  const allocations = await tx.responsibilityCompensationAllocation.findMany({
    where: { bookingId: booking.id, status: 'CONSUMED' },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })
  const totalPaise = allocations.reduce((sum, allocation) => sum + allocation.amountPaise, 0)
  const customerPayment = (ordinaryDuePaise - totalPaise) / 100
  if (completed.customerPayment !== customerPayment) await tx.booking.update({
    where: { id: booking.id }, data: { customerPayment },
  })
  for (const allocation of allocations) {
    await postRecoverableEarning(tx, {
      driverId: driver.id,
      amount: allocation.amountPaise / 100,
      type: 'responsibility_compensation_funding',
      eventKey: walletEvent.responsibilityCompensationFunding(allocation.id),
      bookingId: booking.id,
      note: 'RCS contribution for responsibility compensation used on this ride',
    })
  }
}

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
  await applyCompletedRideCompensation(tx, booking, driver, now)
  if (booking.scheduledAt) {
    await releaseScheduledDeposits(tx, booking.id)

    const completedBooking = await tx.booking.findUniqueOrThrow({ where: { id: booking.id } })
    if (completedBooking.scheduledAdvancePaidAmount > 0) {
      await postRecoverableEarning(tx, {
        driverId: driver.id,
        amount: completedBooking.scheduledAdvancePaidAmount / 100,
        type: 'ride_collection',
        method: 'upi',
        eventKey: walletEvent.rideCollection(booking.id, 'scheduled_ride_advance'),
        bookingId: booking.id,
        note: 'Scheduled ride advance earned after ride completion',
      })
    }
  }

  if (booking.couponAmount > 0) {
    await postRecoverableEarning(tx, {
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
  if (reward.commission > 0) {
    await postWalletEntry(tx, {
      driverId: driver.id,
      amount: -reward.commission,
      type: 'commission',
      eventKey: walletEvent.commission(booking.id),
      bookingId: booking.id,
      note: 'Platform commission settled on ride completion',
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
    if (remaining > 0 && await driverPayoutUpiAvailable(tx, completedBooking.driverId)) {
      await createScheduledFinalIntent(tx, completedBooking)
    }
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
  const allowed = RIDE_TRANSITIONS[to]
  if (allowed && !allowed.includes(from)) return false
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
    where: { id: booking.id, status: from, driverId: driver.id },
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
