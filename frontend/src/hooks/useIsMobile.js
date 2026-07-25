import { useState, useEffect } from "react";

// True below Tailwind's sm breakpoint (640px), tracked live across resizes.
// For behavior CSS can't express (row order, map mount points, scroll pinning).
export function useIsMobile() {
    const [isMobile, setIsMobile] = useState(() => window.matchMedia("(max-width: 639px)").matches);
    useEffect(() => {
        const mq = window.matchMedia("(max-width: 639px)");
        const onChange = (e) => setIsMobile(e.matches);
        mq.addEventListener("change", onChange);
        return () => mq.removeEventListener("change", onChange);
    }, []);
    return isMobile;
}
