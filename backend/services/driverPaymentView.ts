import type { BookingStatus, ScheduledAdvanceDisposition } from '@prisma/client'

export type DriverPaymentState = 'paid' | 'due' | 'void' | 'retained'
export type DriverCollectionMode = 'direct' | 'online'

type DriverPaymentBooking = {
    status: BookingStatus
    scheduledAt: Date | null
    scheduledAdvanceAmount: number
    scheduledAdvancePaidAmount: number
    scheduledRemainingAmount: number
    scheduledFinalPaidAmount: number
    scheduledAdvanceDisposition: ScheduledAdvanceDisposition
}

/**
 * The captain never decides whether the rider has paid. Scheduled payment amounts
 * and their effects are server-owned, so both the list and detail endpoints derive
 * the same small view from the persisted booking state.
 *
 * Amounts inside `scheduledPayment` are paise, matching the customer financials
 * contract. Existing fare/customerPayment fields remain rupees.
 */
export function driverPaymentView(booking: DriverPaymentBooking) {
    const scheduledPayment = booking.scheduledAt ? {
        advanceAmount: booking.scheduledAdvanceAmount,
        advancePaidAmount: booking.scheduledAdvancePaidAmount,
        remainingAmount: booking.scheduledRemainingAmount,
        finalPaidAmount: booking.scheduledFinalPaidAmount,
        advanceDisposition: booking.scheduledAdvanceDisposition,
    } : null

    let paymentState: DriverPaymentState
    if (booking.status === 'cancelled') {
        paymentState = booking.scheduledAdvanceDisposition === 'forfeited_to_driver' ? 'retained' : 'void'
    } else if (booking.scheduledAt) {
        paymentState = booking.status === 'completed'
            && booking.scheduledFinalPaidAmount >= booking.scheduledRemainingAmount
            ? 'paid'
            : 'due'
    } else {
        // Ride Now is still collected directly from the rider. Until a separate
        // cash/UPI confirmation exists, preserve the established completion rule.
        paymentState = booking.status === 'completed' ? 'paid' : 'due'
    }

    return {
        paymentState,
        collectionMode: booking.scheduledAt ? 'online' as const : 'direct' as const,
        scheduledPayment,
    }
}
