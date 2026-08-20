import { useEffect, useState } from "react";
import Icon from "@mdi/react";
import { mdiCheck, mdiClose } from "@mdi/js";

// A cancel returns the rider to the landing page. Carry the server's settlement
// across that navigation so this panel can say whether money was retained or is
// being refunded. "1" keeps cancellations made by an older open tab compatible.
const readOutcome = () => {
    if (typeof sessionStorage === "undefined") return null;
    const stored = sessionStorage.getItem("rideCancelled");
    if (!stored) return null;
    sessionStorage.removeItem("rideCancelled");
    if (stored === "1") return { cancellationCharge: 0 };
    try {
        const parsed = JSON.parse(stored);
        return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
        return null;
    }
};

const OUTCOME = readOutcome();

const RideCancelledToast = () => {
    const [show, setShow] = useState(false);

    useEffect(() => {
        if (!OUTCOME) return;
        // Enter on the next frame so the slide-up transition plays.
        const enter = requestAnimationFrame(() => setShow(true));
        const hide = setTimeout(() => setShow(false), 8000);
        return () => {
            cancelAnimationFrame(enter);
            clearTimeout(hide);
        };
    }, []);

    if (!OUTCOME) return null;

    const charge = Number(OUTCOME.cancellationCharge) || 0;
    const refundPending = OUTCOME.advanceDisposition === "refund_pending";
    const refunded = OUTCOME.advanceDisposition === "refunded" || OUTCOME.refundStatus === "refunded";

    return (
        <div
            role="status"
            aria-live="polite"
            className={`${show ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5 pointer-events-none"} fixed z-100 left-1/2 -translate-x-1/2 bottom-5 sm:bottom-8 w-[min(92vw,420px)] rounded-3xl bg-[var(--foreground)] text-[var(--text)] shadow-[0_18px_60px_rgba(0,0,0,0.28)] border border-[var(--text)]/10 p-5 transition-[opacity,transform] duration-300`}
        >
            <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-[var(--foreground)]">
                    <Icon path={mdiCheck} size={0.8} />
                </span>
                <div className="min-w-0 flex-1">
                    <h3 className="text-lg font-bold">Ride cancelled</h3>
                    <p className="mt-0.5 text-sm text-[var(--text-muted)]">
                        {charge > 0
                            ? "Your scheduled advance has been settled."
                            : refundPending
                                ? "Your advance refund has been started."
                                : refunded
                                    ? "Your advance has been refunded."
                                    : "No cancellation fee was deducted."}
                    </p>

                    <div className="mt-4 rounded-2xl bg-[var(--background-muted)] px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                            {charge > 0 ? "Amount deducted" : "Cancellation charge"}
                        </p>
                        <p className="mt-0.5 text-2xl font-bold">₹{charge}</p>
                        {charge > 0 && (
                            <p className="mt-1 text-xs text-[var(--text-muted)]">
                                Retained from your paid advance as driver compensation—not charged again.
                            </p>
                        )}
                    </div>
                </div>
                <button
                    type="button"
                    aria-label="Dismiss cancellation summary"
                    onClick={() => setShow(false)}
                    className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[var(--background-muted)] transition-opacity hover:opacity-70"
                >
                    <Icon path={mdiClose} size={0.8} />
                </button>
            </div>
        </div>
    );
};

export default RideCancelledToast;
