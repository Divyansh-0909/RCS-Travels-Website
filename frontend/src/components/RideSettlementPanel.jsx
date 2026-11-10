import Button from "./ui/Button";
import { useWebsiteCopy } from "../hooks/useWebsiteCopy";
import { PAYMENT_PHASE, formatPaymentAmount, paymentIsBusy, ridePaymentAmount } from "../lib/paymentUi";

const paidLabel = (method, tr) => method === "cash" ? tr("Paid in cash") : tr("Paid by UPI");

const RideSettlementPanel = ({ ridePayment, phase, onPayUpi, onPayCash, onRefresh, refreshing = false }) => {
    const tr = useWebsiteCopy();
    const amount = ridePaymentAmount(ridePayment);
    const busy = paymentIsBusy(phase);
    const failed = phase === PAYMENT_PHASE.FAILED;
    const actionsDisabled = busy || refreshing;
    const paid = ridePayment?.state === "paid";
    // Fail closed if an older/stale response lacks the capability flag. The
    // server also enforces this before creating an order.
    const upiAvailable = ridePayment?.upiAvailable === true;

    if (paid) {
        return (
            <div className="w-full rounded-2xl bg-[var(--background-muted)] p-4" role="status" aria-live="polite">
                <p className="text-base font-semibold sm:text-lg">{paidLabel(ridePayment.method, tr)}</p>
                <p className="mt-1 text-sm text-[var(--text-muted)] sm:text-base">
                    {amount == null ? tr("Your ride payment is complete.") : `${formatPaymentAmount(amount)} ${tr("was received.")}`}
                </p>
            </div>
        );
    }

    return (
        <div className="w-full">
            {failed && (
                <div role="alert" className="mb-3 flex min-w-0 flex-col gap-2 rounded-2xl bg-[var(--background-muted)] p-4">
                    <p className="text-base font-semibold text-[var(--text)]">{tr("Payment not confirmed")}</p>
                    <p className="text-sm leading-snug text-[var(--text-muted)]">
                        {tr("We couldn't confirm payment. Refresh the status before trying again.")}
                    </p>
                    {onRefresh && (
                        <Button onClick={onRefresh} className="my-0! w-full" prop={{ size: "action", variant: "input", width: "100%", disabled: actionsDisabled }}>
                            {refreshing ? tr("Refreshing…") : tr("Refresh payment status")}
                        </Button>
                    )}
                </div>
            )}
            {amount == null && (
                <p className="mb-2 text-sm text-[var(--text-muted)] sm:text-base">
                    {upiAvailable ? tr("Choose UPI or cash to settle this ride.") : tr("Pay the driver in cash to settle this ride.")}
                </p>
            )}
            {!upiAvailable && (
                <p className="mb-2 text-sm text-[var(--text-muted)]">
                    {tr("UPI unavailable for this ride.")}
                </p>
            )}
            <div className={`grid gap-2 ${upiAvailable ? "grid-cols-2" : "grid-cols-1"}`}>
                {upiAvailable && (
                    <Button onClick={onPayUpi} className="w-full" prop={{ size: "action", width: "100%", disabled: actionsDisabled }}>
                        {busy ? tr("Processing…") : tr("Pay with UPI")}
                    </Button>
                )}
                <Button onClick={onPayCash} className="w-full" prop={{ size: "action", variant: upiAvailable ? "input" : "", width: "100%", disabled: actionsDisabled }}>
                    {tr("Pay with cash")}
                </Button>
            </div>
        </div>
    );
};

export default RideSettlementPanel;
