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
    rideReceiptBreakdown,
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

test("receipt reconciles a 300 rupee fare to 200 due using the server deduction", () => {
    const receipt = rideReceiptBreakdown({ fare: 300, ridePayment: { state: "pending", amount: 20000 } });
    assert.deepEqual(receipt, { grossFare: 30000, adjustments: [{ label: "Deductions", amount: -10000 }], totalDue: 20000 });
});

test("receipt distinguishes a coupon from a scheduled advance without deducting twice", () => {
    const discounted = rideReceiptBreakdown({ fare: 300, coupon: 100, ridePayment: { amount: 20000 } });
    assert.deepEqual(discounted.adjustments, [{ label: "Discount", amount: -10000 }]);
    const scheduled = rideReceiptBreakdown({ fare: 300, financials: { coupon: 1000, advancePaid: 2900, remaining: 26100 }, ridePayment: { amount: 26100 } });
    assert.deepEqual(scheduled.adjustments, [{ label: "Discount", amount: -1000 }, { label: "Advance paid", amount: -2900 }]);
    assert.equal(scheduled.grossFare + scheduled.adjustments.reduce((sum, row) => sum + row.amount, 0), scheduled.totalDue);
    assert.equal(scheduled.totalDue, 26100);
});

test("paid receipt leaves zero due and preserves both discount and final payment", () => {
    const receipt = rideReceiptBreakdown({ fare: 300, coupon: 100, ridePayment: { state: "paid", method: "cash", amount: 20000, paidAmount: 20000 } });
    assert.equal(receipt.totalDue, 0);
    assert.deepEqual(receipt.adjustments, [{ label: "Discount", amount: -10000 }, { label: "Paid in cash", amount: -20000 }]);
    assert.equal(receipt.grossFare + receipt.adjustments.reduce((sum, row) => sum + row.amount, 0), 0);
});

test("receipt keeps paise precision and rejects missing or negative amounts", () => {
    assert.deepEqual(rideReceiptBreakdown({ fare: 300.55, coupon: 0.55, ridePayment: { amount: 30000 } }), {
        grossFare: 30055, adjustments: [{ label: "Discount", amount: -55 }], totalDue: 30000,
    });
    assert.deepEqual(rideReceiptBreakdown({ fare: null, ridePayment: { amount: -1 } }), { grossFare: null, adjustments: [], totalDue: null });
    assert.equal(rideReceiptBreakdown({ financials: { fare: 30000, coupon: 10000, remaining: 20000 } }).totalDue, 20000);
});

test("receipt does not invent a coupon when the server's reduction is smaller", () => {
    const receipt = rideReceiptBreakdown({ fare: 300, coupon: 100, ridePayment: { amount: 25000 } });
    assert.deepEqual(receipt.adjustments, [{ label: "Deductions", amount: -5000 }]);
    assert.equal(receipt.totalDue, 25000);
    const increased = rideReceiptBreakdown({ fare: 300, ridePayment: { amount: 35000 } });
    assert.deepEqual(increased.adjustments, [{ label: "Fare adjustment", amount: 5000 }]);
});
