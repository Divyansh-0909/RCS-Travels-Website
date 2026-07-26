import { useState, useEffect } from "react"

// Enter animation when `show` turns true; on false, plays the exit and stays
// mounted until it finishes. `duration` must match the exit animation's length.
// The exit slides out to the right on phones and fades from sm up (see
// index.css) — both run 0.25s so one `duration` covers each.
const BackgroundPanel = ({ show = true, duration = 250, className, children }) => {
    const [mounted, setMounted] = useState(show)
    const [closing, setClosing] = useState(false)

    useEffect(() => {
        if (show) {
            setMounted(true)
            setClosing(false)
            return
        }
        if (!mounted) return
        setClosing(true)
        const t = setTimeout(() => {
            setMounted(false)
            setClosing(false)
        }, duration)
        return () => clearTimeout(t)
    }, [show, mounted, duration])

    if (!mounted) return null

    return (
        <div className={`${className} ${closing ? "animate-panel-exit" : "animate-panel-enter"} motion-reduce:animate-none absolute bottom-0 bg-transparent shadow-[inset_0px_2px_4px_rgba(255,255,255,0.25),0px_0px_90px_25px_rgba(0,0,0,0.25)] rounded-t-4xl sm:rounded-none sm:h-[100vh] w-[100vw] bg-panel-gradient`}>
            {children}
        </div>
    )
}

export default BackgroundPanel
