import { useState, useEffect } from "react";

// Keeps a panel mounted through its closing animation, then unmounts it.
// `duration` must match the exit animation's length in ms.
export function useExitAnim(open, duration) {
    const [mounted, setMounted] = useState(open);
    const [closing, setClosing] = useState(false);

    useEffect(() => {
        if (open) {
            setMounted(true);
            setClosing(false);
            return;
        }
        if (!mounted) return;
        setClosing(true);
        const t = setTimeout(() => {
            setMounted(false);
            setClosing(false);
        }, duration);
        return () => clearTimeout(t);
    }, [open, mounted, duration]);

    return { mounted, closing };
}
