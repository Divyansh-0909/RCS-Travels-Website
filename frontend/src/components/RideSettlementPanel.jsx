import Button from "./ui/Button";
import { useWebsiteCopy } from "../hooks/useWebsiteCopy";
import { formatPaymentAmount, paymentIsBusy, ridePaymentAmount } from "../lib/paymentUi";

const paidLabel = (method, tr) => method === "cash" ? tr("Paid in cash") : tr("Paid by UPI");

const RideSettlementPanel = ({ ridePayment, phase, onPayUpi, onPayCash }) => {
    const tr = useWebsiteCopy();
    const amount = ridePaymentAmount(ridePayment);
    const busy = paymentIsBusy(phase);
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
        <div className="w-full rounded-2xl bg-[var(--background-muted)] p-4">
            <p className="text-base font-semibold sm:text-lg">{tr("Complete payment")}</p>
            <p className="mt-1 text-sm text-[var(--text-muted)] sm:text-base">
                {amount == null
                    ? (upiAvailable ? tr("Choose UPI or cash to settle this ride.") : tr("Pay the driver in cash to settle this ride."))
                    : `${tr("Amount due")}: ${formatPaymentAmount(amount)}`}
            </p>
            {!upiAvailable && (
                <p className="mt-2 text-sm text-[var(--text-muted)]">
                    {tr("UPI is unavailable because this driver does not have a verified payout account.")}
                </p>
            )}
            <div className={`mt-3 grid gap-2 ${upiAvailable ? "grid-cols-2" : "grid-cols-1"}`}>
                {upiAvailable && (
                    <Button disabled={busy} onClick={onPayUpi} className="w-full" prop={{ width: "100%" }}>
                        {busy ? tr("Processing…") : tr("Pay with UPI")}
                    </Button>
                )}
                <Button disabled={busy} onClick={onPayCash} className="w-full" prop={{ variant: "input", width: "100%" }}>
                    {tr("Pay cash")}
                </Button>
            </div>
        </div>
    );
};

export default RideSettlementPanel;
