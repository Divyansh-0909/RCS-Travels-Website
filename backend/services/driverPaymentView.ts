import type {
    BookingStatus,
    PaymentMethod,
    ScheduledAdvanceDisposition,
} from '@prisma/client'

export type DriverPaymentState = 'paid' | 'due' | 'void' | 'retained'
export type DriverRidePaymentMethod = 'cash' | 'upi'

type DriverPaymentBooking = {
    status: BookingStatus
    scheduledAt: Date | null
    customerPayment: number
    scheduledAdvanceAmount: number
    scheduledAdvancePaidAmount: number
    scheduledRemainingAmount: number
    scheduledFinalPaidAmount: number
    scheduledFinalPaymentMethod: PaymentMethod | null
    scheduledFinalPaidAt: Date | null
    scheduledAdvanceDisposition: ScheduledAdvanceDisposition
    rideNowPaidAmount: number
    rideNowPaymentMethod: PaymentMethod | null
    rideNowPaidAt: Date | null
}

const settlementMethod = (method: PaymentMethod | null): DriverRidePaymentMethod | null =>
    method === 'cash' || method === 'upi' ? method : null

const paymentView = (booking: DriverPaymentBooking) => {
    const scheduled = booking.scheduledAt !== null
    const amount = scheduled ? booking.scheduledRemainingAmount : Math.max(0, Math.round(booking.customerPayment * 100))
    const paidAmount = scheduled ? booking.scheduledFinalPaidAmount : booking.rideNowPaidAmount
    const method = settlementMethod(scheduled ? booking.scheduledFinalPaymentMethod : booking.rideNowPaymentMethod)
    const paidAt = scheduled ? booking.scheduledFinalPaidAt : booking.rideNowPaidAt
    return {
        state: method && paidAmount >= amount ? 'paid' as const : 'pending' as const,
        method,
        amount,
        paidAmount,
        paidAt,
    }
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
    const ridePayment = paymentView(booking)
    const scheduledPayment = booking.scheduledAt ? {
        advanceAmount: booking.scheduledAdvanceAmount,
        advancePaidAmount: booking.scheduledAdvancePaidAmount,
        remainingAmount: booking.scheduledRemainingAmount,
        finalPaidAmount: booking.scheduledFinalPaidAmount,
        finalPaymentMethod: settlementMethod(booking.scheduledFinalPaymentMethod),
        finalPaidAt: booking.scheduledFinalPaidAt,
        advanceDisposition: booking.scheduledAdvanceDisposition,
    } : null

    let paymentState: DriverPaymentState
    if (booking.status === 'cancelled') {
        paymentState = booking.scheduledAdvanceDisposition === 'forfeited_to_driver' ? 'retained' : 'void'
    } else if (booking.scheduledAt) {
        paymentState = booking.status === 'completed' && ridePayment.state === 'paid' ? 'paid' : 'due'
    } else {
        paymentState = booking.status === 'completed' && ridePayment.state === 'paid' ? 'paid' : 'due'
    }

    return {
        paymentState,
        scheduledPayment,
        ridePayment,
    }
}
