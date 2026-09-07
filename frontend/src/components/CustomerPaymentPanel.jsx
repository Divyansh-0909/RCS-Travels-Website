import Button from "./ui/Button";
import ErrorMark from "./illustrations/ErrorMark";
import SuccessCheck from "./illustrations/SuccessCheck";
import { useWebsiteCopy } from "../hooks/useWebsiteCopy";
import {
    formatPaymentAmount,
    PAYMENT_PHASE,
    paymentAmount,
    paymentIsBusy,
    paymentIsSatisfied,
} from "../lib/paymentUi";

const AmountRow = ({ label, value, strong = false }) => (
    <div className={`flex items-start justify-between gap-4 ${strong ? "font-semibold text-[var(--text)]" : "text-[var(--text-muted)]"}`}>
        <span>{label}</span>
        <span className="shrink-0 text-right text-[var(--text)]">{formatPaymentAmount(value)}</span>
    </div>
);

const busyLabel = (phase, tr) => {
    if (phase === PAYMENT_PHASE.CREATING) return tr("Preparing payment…");
    if (phase === PAYMENT_PHASE.OPENING) return tr("Opening Razorpay…");
    return tr("Confirming payment…");
};

const CustomerPaymentPanel = ({
    purpose,
    financials,
    phase = PAYMENT_PHASE.IDLE,
    bookingReference,
    bookingId,
    onPay,
    onViewBooking,
    compact = false,
}) => {
    const tr = useWebsiteCopy();
    const amount = paymentAmount(purpose, financials);
    const paid = paymentIsSatisfied(purpose, financials);
    const busy = paymentIsBusy(phase);
    const cancelled = phase === PAYMENT_PHASE.CANCELLED;
    const failed = phase === PAYMENT_PHASE.FAILED;
    const reference = bookingReference || bookingId;
    const canPay = Number.isFinite(amount) && amount > 0 && !busy && !paid;

    if (paid) {
        return (
            <div data-payment-state="success" role="status" aria-live="polite" className={`w-full flex flex-col ${compact ? "items-start gap-3" : "items-center sm:items-start gap-2"}`}>
                {!compact && <SuccessCheck className="-mt-2 -mb-2 self-center sm:self-start" size={112} />}
                <div className={`flex w-full min-w-0 flex-col ${compact ? "items-start" : "items-center text-center sm:items-start sm:text-left"}`}>
                    <h2 className={`${compact ? "text-xl" : "text-3xl sm:text-5xl"} w-full min-w-0 font-bold leading-tight [overflow-wrap:anywhere]`}>
                        {purpose === "advance" ? tr("Advance paid") : tr("Payment complete")}
                    </h2>
                    <p className="mt-1 text-sm leading-snug text-[var(--text-muted)] sm:text-lg">
                        {formatPaymentAmount(amount)} {tr("was verified and received.")}
                    </p>
                </div>

                {reference && (
                    <div className="w-full rounded-2xl bg-[var(--background-muted)] px-4 py-3 text-left">
                        <p className="text-xs sm:text-sm text-[var(--text-muted)]">{tr("Booking reference")}</p>
                        <p className="mt-0.5 break-all text-base font-semibold sm:text-lg">{reference}</p>
                    </div>
                )}

                <Button onClick={onViewBooking} className="my-0! w-full" prop={{ width: "100%", disabled: !onViewBooking }}>
                    <span className="text-base sm:text-lg">{tr("View booking")}</span>
                </Button>
            </div>
        );
    }

    if (failed) {
        return (
            <div data-payment-state="failed" role="alert" className={`w-full flex flex-col ${compact ? "items-start gap-3" : "items-center gap-2 sm:items-start"}`}>
                {!compact && <ErrorMark className="-mt-2 -mb-2 self-center sm:self-start" size={104} />}
                <div className={`${compact ? "text-left" : "text-center sm:text-left"} w-full`}>
                    <h2 className={`${compact ? "text-xl" : "text-3xl sm:text-5xl"} font-bold leading-tight`}>{tr("Payment wasn't completed")}</h2>
                    <p className="mt-1 text-sm leading-snug text-[var(--text-muted)] sm:text-lg">
                        {tr("We couldn't verify a payment. Your booking has not been marked paid.")}
                    </p>
                </div>
                <Button onClick={onPay} className="my-0! w-full" prop={{ width: "100%", disabled: !canPay }}>
                    <span className="text-base sm:text-lg">{tr("Retry payment")}</span>
                </Button>
            </div>
        );
    }

    if (cancelled) {
        return (
            <div data-payment-state="cancelled" role="status" aria-live="polite" className="w-full flex flex-col items-start gap-3">
                <div className="w-full">
                    <h2 className={`${compact ? "text-xl" : "text-3xl sm:text-5xl"} font-bold leading-tight`}>{tr("Payment paused")}</h2>
                    <p className="mt-1 text-sm leading-snug text-[var(--text-muted)] sm:text-lg">
                        {tr("Checkout was closed. Your booking is safe and still waiting for payment.")}
                    </p>
                </div>
                {Number.isFinite(amount) && (
                    <div className="w-full rounded-2xl bg-[var(--background-muted)] px-4 py-3 text-base sm:text-lg">
                        <AmountRow label={tr("Amount due")} value={amount} strong />
                    </div>
                )}
                <Button onClick={onPay} className="my-0! w-full" prop={{ width: "100%", disabled: !canPay }}>
                    <span className="text-base sm:text-lg">{tr("Resume payment")}</span>
                </Button>
            </div>
        );
    }

    return (
        <div data-payment-state={busy ? phase : "ready"} aria-busy={busy} className="w-full flex flex-col items-start gap-4">
            {!compact && (
                <div className="w-full">
                    <h2 className="text-3xl font-bold leading-tight sm:text-5xl">
                        {purpose === "advance" ? tr("Pay advance") : tr("Complete payment")}
                    </h2>
                    <p className="mt-1 text-base leading-snug text-[var(--text-muted)] sm:text-lg">
                        {purpose === "advance"
                            ? tr("The 15% advance is part of your fare, not an extra charge.")
                            : tr("Pay the balance securely to close your scheduled ride.")}
                    </p>
                </div>
            )}

            {financials ? (
                <div className="w-full rounded-2xl bg-[var(--background-muted)] p-4 text-sm sm:p-5 sm:text-base">
                    <div className="flex flex-col gap-2">
                        <AmountRow label={tr("Final fare")} value={financials.finalFare} />
                        {purpose === "advance" ? (
                            <>
                                {financials.coupon > 0 && <AmountRow label={tr("Coupon applied")} value={-financials.coupon} />}
                                <AmountRow label={tr("Pay now (15%)")} value={financials.advance} strong />
                                <AmountRow label={tr("Pay after ride")} value={financials.remaining} />
                            </>
                        ) : (
                            <>
                                <AmountRow label={tr("Advance paid")} value={financials.advancePaid} />
                                <div className="my-1 h-px w-full bg-[var(--foreground)]/10" />
                                <AmountRow label={tr("Amount due")} value={financials.remaining} strong />
                            </>
                        )}
                    </div>
                </div>
            ) : (
                <div role="status" className="w-full rounded-2xl bg-[var(--background-muted)] px-4 py-5 text-sm text-[var(--text-muted)] sm:text-base">
                    {tr("Loading payment details…")}
                </div>
            )}

            <Button onClick={onPay} className="my-0! w-full" prop={{ width: "100%", disabled: !canPay }}>
                <span className="text-base sm:text-lg">
                    {busy
                        ? busyLabel(phase, tr)
                        : Number.isFinite(amount)
                            ? `${purpose === "advance" ? tr("Pay") : tr("Pay remaining")} ${formatPaymentAmount(amount)}`
                            : tr("Loading payment status…")}
                </span>
            </Button>
            {busy && (
                <p role="status" aria-live="polite" className="w-full text-center text-xs leading-snug text-[var(--text-muted)] sm:text-left sm:text-sm">
                    {phase === PAYMENT_PHASE.VERIFYING
                        ? tr("Don't close this page while we confirm the payment.")
                        : tr("Razorpay will open in a secure window.")}
                </p>
            )}
        </div>
    );
};

export default CustomerPaymentPanel;
