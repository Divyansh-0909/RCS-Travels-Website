import { useState, useEffect } from "react"
import { useIsMobile } from "../../hooks/useIsMobile"
import { useBottomSheet } from "../../hooks/useBottomSheet"

// Enter animation when `show` turns true; on false, plays the exit and stays
// mounted until it finishes. `duration` must match the exit animation's length.
// The exit slides out to the right on phones and fades from sm up (see
// index.css) — both run 0.25s so one `duration` covers each.
//
// `sheet` opts a panel into the draggable bottom-sheet gesture, ON PHONES ONLY.
// Without it nothing about the panel changes; with it, nothing changes from sm
// up either — the hook is inert unless useIsMobile() is true, so the desktop
// side panel keeps its layout, animation and scrolling exactly as before.
const BackgroundPanel = ({ show = true, duration = 250, className, children, sheet = false, initialSnap = "collapsed", bottomInset = 0, contentKey, dismissible = false, onDismiss, onSnapChange }) => {
    const [mounted, setMounted] = useState(show)
    const [closing, setClosing] = useState(false)
    const isMobile = useIsMobile()
    const isSheet = sheet && isMobile

    const { sheetRef, grabberRef } = useBottomSheet({
        enabled: isSheet && mounted,
        open: show,
        initialSnap,
        // Px of pinned chrome below the sheet — the vehicle screen's Book bar.
        bottomInset,
        // Re-measure trigger for sheets whose height follows their content — the
        // tracking panels swap rows as the ride's status moves.
        contentKey,
        // Open or gone, with no stops in between: a throw downwards closes it
        // and the owner is told, rather than the sheet resting half-shown.
        dismissible,
        onDismiss,
        onSnapChange,
    })

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

    // In sheet mode the transform belongs to the drag, so the keyframe classes
    // are dropped — they animate `transform` too and would fight it every frame.
    // The entrance and exit become the spring's job, which is also the right
    // motion for a sheet: it rises from the bottom rather than wiping in from
    // the right.
    const animation = isSheet
        ? ""
        : `${closing ? "animate-panel-exit" : "animate-panel-enter"} motion-reduce:animate-none`

    return (
        <div
            ref={isSheet ? sheetRef : null}
            className={`${className} ${animation} absolute bottom-0 bg-transparent shadow-[inset_0px_2px_4px_rgba(255,255,255,0.25),0px_0px_90px_25px_rgba(0,0,0,0.25)] rounded-t-4xl sm:rounded-none sm:h-[100dvh] w-[100vw] bg-panel-gradient ${isSheet ? "overscroll-contain" : ""}`}
        >
            {isSheet && (
                // The affordance. Its hit area is still taller than the 4px it
                // draws — a 4px drag target is a miss on a real thumb — but only
                // just: the whole sheet is draggable at every stop except
                // expanded, so the handle is a hint more than a target, and the
                // padding it was carrying showed up as dead space under the
                // sheet's top edge. -mt-4 eats most of the panel's own py-6.
                <div
                    ref={grabberRef}
                    aria-hidden="true"
                    className="sticky top-0 z-20 -mt-4 flex w-full shrink-0 cursor-grab touch-none items-center justify-center py-2 active:cursor-grabbing"
                >
                    <div className="h-1 w-10 rounded-full bg-[var(--foreground)]/30" />
                </div>
            )}
            {children}
        </div>
    )
}

export default BackgroundPanel
