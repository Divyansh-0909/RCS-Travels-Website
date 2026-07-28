import { useEffect, useState } from "react";
import Icon from "@mdi/react";
import { mdiAlertCircleOutline, mdiRefresh, mdiClose } from "@mdi/js";
import { useRefreshNotice } from "../../hooks/useRefreshNotice";

// Ambient counterpart to FailureState: the content on screen is stale, not
// missing, so this says so without taking the page. Mounted once globally in
// main.jsx (same as RideCancelledToast) and driven by the useRefreshNotice
// store, so any page can raise it without threading props.
//
// Anchored bottom-centre, sitting one step above RideCancelledToast and the
// "Copied to clipboard" pills (both bottom-8 / sm:bottom-10) so the three stack
// instead of colliding.
//
// Top-centre was tried first and does not work globally. The landing page needs
// ~106px of clearance for its floating NavBar (measured at 24–72px on phones,
// 40–90px from sm up), but the account pages — which is where the profile
// refresh actually fails — put their heading and toolbar in exactly that band,
// so the pill landed on top of "Ride History". There is no free horizontal
// strip at the top of both layouts; there is one at the bottom of both.
//
// The trade-off this accepts: on the phone booking sheets the pill floats over
// the lower part of the sheet. That is the same treatment the Share and back
// pills on TrackingPage already use, and it clears after 8s.

const DISMISS_MS = 8000;

/**
 * @param {object} props
 * @param {{key?: number, message: string, onRetry?: (() => void) | null}} [props.notice]
 *   Presentational override. The app mounts this bare and it reads the store;
 *   passing a notice drives it directly, which is what the design-sync previews
 *   use (same shape as ErrorPanel taking its message as a prop).
 */
const RefreshNotice = ({ notice: noticeOverride }) => {
    const storeNotice = useRefreshNotice(state => state.notice);
    const clearFromStore = useRefreshNotice(state => state.clearRefreshNotice);
    const notice = noticeOverride ?? storeNotice;
    const [show, setShow] = useState(false);

    // Hides the pill either way: the store copy is cleared for the real mount,
    // and `show` covers the override case, where there is no store entry to clear.
    const dismiss = () => { setShow(false); clearFromStore(); };

    // Keep the last notice while the pill animates out, so its text doesn't
    // disappear mid-transition (same trick ErrorPanel uses for its message).
    const [lastNotice, setLastNotice] = useState(notice);
    useEffect(() => {
        if (notice) setLastNotice(notice);
    }, [notice]);

    useEffect(() => {
        if (!notice) {
            setShow(false);
            return;
        }
        // Enter on the next frame so the slide-down transition actually plays.
        const enter = requestAnimationFrame(() => setShow(true));
        const hide = setTimeout(() => setShow(false), DISMISS_MS);
        return () => {
            cancelAnimationFrame(enter);
            clearTimeout(hide);
        };
        // keyed on `key`, not the object: re-raising the same message restarts
        // the timer rather than leaving a half-expired pill on screen
    }, [notice?.key]);

    if (!lastNotice) return null;

    return (
        <div
            role="status"
            aria-live="polite"
            className={`${show ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3 pointer-events-none"}
                fixed z-[110] left-1/2 -translate-x-1/2 bottom-24 sm:bottom-28
                flex items-center gap-2
                w-[calc(100vw-32px)] max-w-[520px] sm:w-auto sm:max-w-[92vw]
                rounded-full border border-[var(--foreground)]/30 bg-[var(--background-muted)]
                pl-4 pr-2 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.35)]
                transition-[opacity,transform] duration-300`}
        >
            <Icon path={mdiAlertCircleOutline} size={0.75} className="shrink-0 text-[var(--text-muted)]" />
            {/* flex-1 + min-w-0: without them the row shrink-wraps the text to
                its longest word and the pill grows into a 150px-tall block on a
                390px screen. */}
            <p className="flex-1 min-w-0 text-xs sm:text-sm leading-snug text-[var(--text)]">{lastNotice.message}</p>

            {lastNotice.onRetry && (
                <button
                    type="button"
                    onClick={() => { lastNotice.onRetry(); dismiss(); }}
                    className="shrink-0 flex items-center gap-1 cursor-pointer rounded-full px-2.5 py-1 text-xs sm:text-sm font-semibold text-[var(--text)] bg-[var(--foreground)]/10 transition-colors duration-300 hover:bg-[var(--foreground)]/20 active:opacity-70 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--foreground)]/70"
                >
                    <Icon path={mdiRefresh} size={0.6} />
                    Retry
                </button>
            )}

            <button
                type="button"
                aria-label="Dismiss"
                onClick={dismiss}
                className="shrink-0 flex items-center justify-center cursor-pointer rounded-full p-1 text-[var(--text-muted)] transition-colors duration-300 hover:text-[var(--text)] active:opacity-70 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--foreground)]/70"
            >
                <Icon path={mdiClose} size={0.7} />
            </button>
        </div>
    );
};

export default RefreshNotice;
