import { useState, useEffect } from "react"

// Plays the panel enter animation when `show` becomes true, and the closing
// animation when it becomes false — staying mounted until the exit finishes,
// then unmounting. `duration` must match the exit animation length.
const BackgroundPanel = ({ show = true, duration = 450, className, children }) => {
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
        <div className={`${className} ${closing ? "animate-panel-transition-out" : "animate-panel-transition"} absolute bottom-0 bg-transparent shadow-[inset_0px_2px_4px_rgba(255,255,255,0.25),0px_0px_90px_25px_rgba(0,0,0,0.25)] rounded-t-4xl sm:rounded-none sm:h-[100vh] w-[100vw] bg-panel-gradient`}>
            {children}
        </div>
    )
}

export default BackgroundPanel
