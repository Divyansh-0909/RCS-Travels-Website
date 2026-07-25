import { useEffect, useState } from "react";
import Icon from "@mdi/react";
import { mdiCheck } from "@mdi/js";

// A cancel triggers a full page reload, so the handler sets a sessionStorage flag
// instead of toasting itself; this global toast (mounted in main.jsx) reads the
// flag once on load, shows the pill briefly, then clears it.
const CANCELLED =
    typeof sessionStorage !== "undefined" &&
    sessionStorage.getItem("rideCancelled") === "1";
if (CANCELLED) sessionStorage.removeItem("rideCancelled");

const RideCancelledToast = () => {
    const [show, setShow] = useState(false);

    useEffect(() => {
        if (!CANCELLED) return;
        // Enter on the next frame so the slide-up transition plays.
        const enter = requestAnimationFrame(() => setShow(true));
        const hide = setTimeout(() => setShow(false), 3200);
        return () => {
            cancelAnimationFrame(enter);
            clearTimeout(hide);
        };
    }, []);

    return (
        <div
            className={`${show ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"} whitespace-nowrap fixed z-100 left-1/2 -translate-x-1/2 bottom-8 sm:bottom-10 bg-primary text-[var(--foreground)] text-sm font-semibold px-5 py-3 rounded-full shadow-[0_8px_24px_rgba(0,0,0,0.25)] flex items-center justify-center gap-2 transition-[opacity,transform] duration-300`}
        >
            <Icon path={mdiCheck} size={0.8} />
            Ride cancelled successfully
        </div>
    );
};

export default RideCancelledToast;
