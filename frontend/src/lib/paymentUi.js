export const PAYMENT_PHASE = Object.freeze({
    IDLE: "idle",
    CREATING: "creating",
    OPENING: "opening",
    VERIFYING: "verifying",
    CANCELLED: "cancelled",
    FAILED: "failed",
});

export const paymentIsBusy = (phase) => [
    PAYMENT_PHASE.CREATING,
    PAYMENT_PHASE.OPENING,
    PAYMENT_PHASE.VERIFYING,
].includes(phase);

export const paymentPhaseForError = (error) => (
    error?.message === "Payment cancelled" ? PAYMENT_PHASE.CANCELLED : PAYMENT_PHASE.FAILED
);

export const paymentAmount = (purpose, financials) => {
    if (!financials) return null;
    return purpose === "advance" ? financials.advance : financials.remaining;
};

export const paymentIsSatisfied = (purpose, financials) => {
    const due = paymentAmount(purpose, financials);
    if (!Number.isFinite(due) || due <= 0) return false;
    const paid = purpose === "advance" ? financials.advancePaid : financials.finalPaid;
    return Number.isFinite(paid) && paid >= due;
};

export const paymentNeedsRefresh = ({ status, scheduledAt, financials, ridePayment }) => {
    if (status === "completed" && ridePayment?.state === "pending") return true;
    if (status === "completed" && ridePayment?.state === "paid") return false;
    if (!scheduledAt) return false;
    // A deployment boundary or a transient status response can omit the
    // derived financials. Keep polling in the payment-bearing states so the UI
    // cannot get stuck on an honest loading panel after a refresh.
    if (!financials) return ["payment_pending", "completed", "cancelled"].includes(status);
    if (financials.advanceDisposition === "refund_pending") return true;
    if (status === "payment_pending") return !paymentIsSatisfied("advance", financials);
    if (status === "completed") return !paymentIsSatisfied("final", financials);
    return false;
};

export const ridePaymentAmount = (ridePayment) => (
    Number.isFinite(ridePayment?.amount) ? ridePayment.amount : null
);

// The booked fare is in rupees; payment summaries are in paise. Keep receipt
// arithmetic in paise and reconcile to the server's settlement amount.
export const rideReceiptBreakdown = ({ fare, coupon, financials, ridePayment }) => {
    const subunits = value => Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
    const rupees = value => Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : null;
    const grossFare = rupees(fare) ?? subunits(financials?.fare);
    const discount = subunits(financials?.coupon) ?? rupees(coupon) ?? 0;
    const advance = subunits(financials?.advancePaid) ?? 0;
    const settlement = subunits(ridePayment?.amount) ?? subunits(financials?.remaining)
        ?? (grossFare == null ? null : Math.max(0, grossFare - discount - advance));
    const adjustments = [];
    if (grossFare != null && settlement != null) {
        let difference = grossFare - settlement;
        for (const [label, amount] of [["Discount", discount], ["Advance paid", advance]]) {
            if (amount > 0 && amount <= difference) {
                adjustments.push({ label, amount: -amount });
                difference -= amount;
            }
        }
        if (difference !== 0) adjustments.push({ label: difference > 0 ? "Deductions" : "Fare adjustment", amount: -difference });
    }
    if (ridePayment?.state === "paid" && settlement > 0) {
        adjustments.push({ label: ridePayment.method === "cash" ? "Paid in cash" : ridePayment.method === "upi" ? "Paid by UPI" : "Paid", amount: -settlement });
    }
    return { grossFare, adjustments, totalDue: ridePayment?.state === "paid" ? 0 : settlement };
};

export const formatPaymentAmount = (paise) => {
    if (!Number.isFinite(paise)) return "₹—";
    const rupees = paise / 100;
    const absolute = Math.abs(rupees);
    return `${rupees < 0 ? "-" : ""}₹${absolute.toLocaleString("en-IN", {
        minimumFractionDigits: Number.isInteger(absolute) ? 0 : 2,
        maximumFractionDigits: 2,
    })}`;
};
