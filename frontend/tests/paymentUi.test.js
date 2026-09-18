import { test } from "node:test";
import assert from "node:assert/strict";
import {
    formatPaymentAmount,
    PAYMENT_PHASE,
    paymentIsBusy,
    paymentIsSatisfied,
    paymentNeedsRefresh,
    paymentPhaseForError,
    ridePaymentAmount,
} from "../src/lib/paymentUi.js";

const financials = {
    advance: 2900,
    advancePaid: 0,
    remaining: 16100,
    finalPaid: 0,
    advanceDisposition: "awaiting_payment",
};

test("payment success is derived only from backend paid amounts", () => {
    assert.equal(paymentIsSatisfied("advance", financials), false);
    assert.equal(paymentIsSatisfied("advance", { ...financials, advancePaid: 2900 }), true);
    assert.equal(paymentIsSatisfied("final", { ...financials, finalPaid: 16099 }), false);
    assert.equal(paymentIsSatisfied("final", { ...financials, finalPaid: 16100 }), true);
});

test("scheduled settlements keep refreshing until capture or refund finishes", () => {
    assert.equal(paymentNeedsRefresh({ status: "completed", scheduledAt: "2026-09-07", financials: null }), true);
    assert.equal(paymentNeedsRefresh({ status: "payment_pending", scheduledAt: "2026-09-07", financials }), true);
    assert.equal(paymentNeedsRefresh({ status: "completed", scheduledAt: "2026-09-07", financials }), true);
    assert.equal(paymentNeedsRefresh({
        status: "cancelled",
        scheduledAt: "2026-09-07",
        financials: { ...financials, advanceDisposition: "refund_pending" },
    }), true);
    assert.equal(paymentNeedsRefresh({
        status: "completed",
        scheduledAt: "2026-09-07",
        financials: { ...financials, finalPaid: 16100 },
    }), false);
});

test("payment refresh helpers cover settled and non-payment states", () => {
    assert.equal(paymentIsSatisfied("advance", null), false);
    assert.equal(paymentIsSatisfied("advance", { ...financials, advance: 0 }), false);
    assert.equal(paymentIsSatisfied("advance", { ...financials, advancePaid: Number.NaN }), false);
    assert.equal(paymentNeedsRefresh({ status: "confirmed", scheduledAt: null, financials }), false);
    assert.equal(paymentNeedsRefresh({ status: "confirmed", scheduledAt: "2026-09-07", financials: null }), false);
    assert.equal(paymentNeedsRefresh({
        status: "payment_pending",
        scheduledAt: "2026-09-07",
        financials: { ...financials, advancePaid: 2900 },
    }), false);
    assert.equal(paymentNeedsRefresh({ status: "confirmed", scheduledAt: "2026-09-07", financials }), false);
});

test("completed ride settlement polling follows the authoritative ride payment state", () => {
    assert.equal(paymentNeedsRefresh({ status: "completed", scheduledAt: null, ridePayment: { state: "pending" } }), true);
    assert.equal(paymentNeedsRefresh({ status: "completed", scheduledAt: "2026-09-07", ridePayment: { state: "paid" } }), false);
    assert.equal(ridePaymentAmount({ amount: 19000 }), 19000);
    assert.equal(ridePaymentAmount(null), null);
});

test("checkout cancellation is distinct from payment failure", () => {
    assert.equal(paymentPhaseForError(new Error("Payment cancelled")), PAYMENT_PHASE.CANCELLED);
    assert.equal(paymentPhaseForError(new Error("Card declined")), PAYMENT_PHASE.FAILED);
    assert.equal(paymentIsBusy(PAYMENT_PHASE.VERIFYING), true);
    assert.equal(paymentIsBusy(PAYMENT_PHASE.CANCELLED), false);
});

test("payment amounts are formatted from paise", () => {
    assert.equal(formatPaymentAmount(2850), "₹28.50");
    assert.equal(formatPaymentAmount(19000), "₹190");
    assert.equal(formatPaymentAmount(-1000), "-₹10");
    assert.equal(formatPaymentAmount(null), "₹—");
});
