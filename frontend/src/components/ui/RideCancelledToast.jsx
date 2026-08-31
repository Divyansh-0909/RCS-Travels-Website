import { useEffect, useState } from "react";
import SuccessCheck from "../illustrations/SuccessCheck";
import { useIsMobile } from "../../hooks/useIsMobile";
import BackgroundPanel from "./BackgroundPanel";
import Button from "./Button";

// A cancel returns the rider to the landing page. Carry the server's settlement
// across that navigation so this sheet can say whether money was retained or is
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

// Read once at module load: development StrictMode deliberately renders twice,
// while consuming sessionStorage must happen exactly once.
const STORED_OUTCOME = readOutcome();
const DISMISS_MS = 8000;

const RideCancelledToast = ({ outcome: outcomeOverride, dismissAfterMs = DISMISS_MS }) => {
    const outcome = outcomeOverride ?? STORED_OUTCOME;
    const [show, setShow] = useState(false);
    const isMobile = useIsMobile();

    useEffect(() => {
        if (!outcome) return;
        // BackgroundPanel owns the sheet motion; changing show on the next
        // frame gives it a closed first paint to animate from.
        const enter = requestAnimationFrame(() => setShow(true));
        const hide = dismissAfterMs > 0
            ? setTimeout(() => setShow(false), dismissAfterMs)
            : null;
        return () => {
            cancelAnimationFrame(enter);
            if (hide) clearTimeout(hide);
        };
    }, [outcome, dismissAfterMs]);

    if (!outcome) return null;

    const charge = Number(outcome.cancellationCharge) || 0;
    const refundPending = outcome.advanceDisposition === "refund_pending";
    const refunded = outcome.advanceDisposition === "refunded" || outcome.refundStatus === "refunded";
    const dismiss = () => setShow(false);

    return (
        <div className={`fixed inset-0 z-[120] ${show ? "pointer-events-auto" : "pointer-events-none"}`}>
            <button
                type="button"
                aria-label="Dismiss cancellation summary"
                onClick={dismiss}
                className={`${show ? "opacity-100" : "opacity-0"} absolute inset-0 h-full w-full cursor-default bg-black/40 transition-opacity duration-300 motion-reduce:transition-none`}
            />

            <BackgroundPanel
                show={show}
                duration={420}
                sheet
                dismissible
                onDismiss={dismiss}
                contentKey={`${charge}-${outcome.advanceDisposition ?? "none"}-${outcome.refundStatus ?? "none"}`}
                className="z-1 gap-1.5 sm:gap-2 py-6 text-center text-[var(--text)] flex flex-col justify-center items-center"
            >
                <div
                    role="status"
                    aria-live="polite"
                    data-sheet-scroll
                    className="min-h-0 flex-1 flex w-full flex-col items-center overflow-y-auto"
                >
                    <SuccessCheck className="-mt-2" size={isMobile ? 120 : 140} />
                    <div className="flex w-[min(86vw,100%)] min-w-0 flex-col items-center sm:w-[377px]">
                        <h2 className="w-full min-w-0 [overflow-wrap:anywhere] font-bold text-3xl sm:text-5xl leading-tight">Ride cancelled</h2>
                        <p className="mt-1 w-full min-w-0 text-base sm:text-lg leading-snug text-[var(--text-muted)]">
                            {charge > 0
                                ? "Your scheduled advance has been settled."
                                : refundPending
                                    ? "Your advance refund has been started."
                                    : refunded
                                        ? "Your advance has been refunded."
                                        : "No cancellation fee was deducted."}
                        </p>
                    </div>

                    <div className="mt-4 w-[min(86vw,100%)] sm:w-[377px] rounded-2xl bg-[var(--background-muted)] px-4 py-3 text-left">
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

                    <div className="mt-3 w-[min(86vw,100%)] sm:w-[377px]">
                        <Button onClick={dismiss} prop={{ width: "100%" }}>
                            <span className="text-base sm:text-lg">Okay</span>
                        </Button>
                    </div>
                </div>
            </BackgroundPanel>
        </div>
    );
};

export default RideCancelledToast;
