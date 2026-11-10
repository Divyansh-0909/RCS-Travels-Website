import PillControl from "./PillControl";
import IconButton from "./IconButton";
import { useTranslation as useCopyLanguage } from "react-i18next";
import { websiteCopy as dc } from "../../i18nCopy";
import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "@mdi/react";
import { mdiAlertCircleOutline, mdiRefresh, mdiClose } from "@mdi/js";
import { useRefreshNotice } from "../../hooks/useRefreshNotice";

// Ambient counterpart to FailureState: the content on screen is stale, not
// missing, so this says so without taking the page. Mounted once globally in
// main.jsx (same as RideCancelledToast) and driven by the useRefreshNotice
// store, so any page can raise it without threading props.
//
// Anchored bottom-centre, sitting above the "Copied to clipboard" pills so the
// two stack instead of colliding. The cancellation result now owns a modal
// bottom-sheet layer above this notice while it is open.
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
const EXIT_MS = 300;

/**
 * @param {object} props
 * @param {{key?: number, message: string, onRetry?: (() => void) | null}} [props.notice]
 *   Presentational override. The app mounts this bare and it reads the store;
 *   passing a notice drives it directly, which is what the design-sync previews
 *   use (same shape as ErrorPanel taking its message as a prop).
 */
const RefreshNotice = ({ notice: noticeOverride }) => {
    useCopyLanguage();
    const storeNotice = useRefreshNotice(state => state.notice);
    const clearFromStore = useRefreshNotice(state => state.clearRefreshNotice);
    const notice = noticeOverride ?? storeNotice;
    const [show, setShow] = useState(false);
    const rootRef = useRef(null);
    const returnFocusRef = useRef(null);
    const timers = useRef({ enter: null, hide: null, exit: null });

    const clearTimers = useCallback(() => {
        cancelAnimationFrame(timers.current.enter);
        clearTimeout(timers.current.hide);
        clearTimeout(timers.current.exit);
    }, []);

    // Hides the pill either way: the store copy is cleared for the real mount,
    // and `show` covers the override case, where there is no store entry to clear.
    // Keep the last notice while the pill animates out, so its text doesn't
    // disappear mid-transition (same trick ErrorPanel uses for its message).
    const [lastNotice, setLastNotice] = useState(notice);

    const hide = useCallback(() => {
        clearTimers();
        // Only move focus if this notice owns it. Recovery must never steal
        // focus from someone using the page beneath it.
        const root = rootRef.current;
        if (root?.contains(document.activeElement)) {
            const previous = returnFocusRef.current;
            if (previous?.isConnected && !root.contains(previous)) previous.focus({ preventScroll: true });
            if (root.contains(document.activeElement)) {
                const fallback = document.querySelector("main") ?? document.getElementById("root");
                if (fallback) {
                    const hadTabIndex = fallback.hasAttribute("tabindex");
                    if (!hadTabIndex) fallback.setAttribute("tabindex", "-1");
                    fallback.focus({ preventScroll: true });
                    // Removing tabindex while this node still owns focus can
                    // send Chromium's focus back to body. Restore it on blur;
                    // -1 never adds a new stop to the Tab order.
                    if (!hadTabIndex) {
                        if (document.activeElement === fallback) {
                            fallback.addEventListener("blur", () => fallback.removeAttribute("tabindex"), { once: true });
                        } else fallback.removeAttribute("tabindex");
                    }
                }
            }
        }
        setShow(false);
        const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : EXIT_MS;
        timers.current.exit = setTimeout(() => setLastNotice(null), duration);
    }, [clearTimers]);

    const dismiss = () => { hide(); clearFromStore(); };

    useEffect(() => {
        clearTimers();
        if (!notice) {
            if (rootRef.current) hide();
            return clearTimers;
        }
        setLastNotice(notice);
        // Enter on the next frame so the slide-down transition actually plays.
        timers.current.enter = requestAnimationFrame(() => setShow(true));
        timers.current.hide = setTimeout(hide, DISMISS_MS);
        // A new notice cancels the old exit; its callback cannot remove the
        // replacement. Re-raising the same message also restarts its lifetime.
        return clearTimers;
    }, [notice, hide, clearTimers]);

    if (!lastNotice) return null;

    return (
        <div
            ref={rootRef}
            role="status"
            aria-live="polite"
            aria-hidden={!show || undefined}
            inert={show ? undefined : ""}
            onFocusCapture={event => {
                if (event.relatedTarget instanceof HTMLElement && !event.currentTarget.contains(event.relatedTarget)) {
                    returnFocusRef.current = event.relatedTarget;
                }
            }}
            className={`${show ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3 pointer-events-none"}
                fixed z-[110] left-1/2 -translate-x-1/2 bottom-24 sm:bottom-28
                flex items-center gap-2
                w-[calc(100vw-32px)] max-w-[520px] sm:w-auto sm:max-w-[92vw]
                rounded-full border border-[var(--foreground)]/30 bg-[var(--background-muted)]
                pl-4 pr-2 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.35)]
                transition-[opacity,transform] duration-300 motion-reduce:transition-none motion-reduce:translate-y-0`}
        >
            <Icon path={mdiAlertCircleOutline} size={0.75} className="shrink-0 text-[var(--text-muted)]" />
            {/* flex-1 + min-w-0: without them the row shrink-wraps the text to
                its longest word and the pill grows into a 150px-tall block on a
                390px screen. */}
            <p className="flex-1 min-w-0 text-xs sm:text-sm leading-snug text-[var(--text)]">{lastNotice.message}</p>

            {lastNotice.onRetry && (
                <PillControl type="button" onClick={() => { lastNotice.onRetry(); dismiss(); }} faceClassName="shrink-0 flex items-center gap-1 cursor-pointer text-xs sm:text-[var(--text)] bg-[var(--foreground)]/10 hover:bg-[var(--foreground)]/20 active:opacity-70 outline-none ">
                    <Icon path={mdiRefresh} size={2 / 3} />{dc("Retry")}</PillControl>
            )}

            <IconButton type="button" aria-label={dc("Dismiss")} onClick={dismiss} className="shrink-0 flex"><Icon path={mdiClose} size={0.7} /></IconButton>
        </div>
    );
};

export default RefreshNotice;
