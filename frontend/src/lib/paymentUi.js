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

export const paymentNeedsRefresh = ({ status, scheduledAt, financials }) => {
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

export const formatPaymentAmount = (paise) => {
    if (!Number.isFinite(paise)) return "₹—";
    const rupees = paise / 100;
    const absolute = Math.abs(rupees);
    return `${rupees < 0 ? "-" : ""}₹${absolute.toLocaleString("en-IN", {
        minimumFractionDigits: Number.isInteger(absolute) ? 0 : 2,
        maximumFractionDigits: 2,
    })}`;
};
