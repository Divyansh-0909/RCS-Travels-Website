import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

// Draggable bottom sheet, the Uber / Google Maps kind: it follows your finger,
// then springs to whichever stop your throw was heading for.
//
// Nothing here goes through React state. A drag writes `transform` straight to
// the node and the spring runs on rAF, so a gesture costs zero re-renders — the
// component holding this hook can be as expensive as it likes.

// Snap points, as the fraction of the viewport the sheet SHOWS. These two scale
// with the screen because what they control — how much CONTENT you can see — is
// proportional to it.
export const SHEET_SNAPS = { collapsed: 0.28, half: 0.6 };

// Expanded is deliberately NOT a fraction. The panel floats its back button
// above its own top edge — `-top-12` (-48px) plus the pill's `my-1` (4px) puts
// its topmost pixel 44px above the sheet — and that button is the only way off
// the screen, so it has to survive full expansion with a little air above it.
//
// That requirement is a fixed number of pixels on every device. The old 6%
// drifted from 38px on a small phone to 56px on a large one: too tight to fit
// the button at one end, wasted map at the other. Keep these in step with the
// pill offsets in VehicleSelect, TrackingPage and RideDetails.
const FLOATING_CHROME_PX = 44; // how far the back pill reaches above the sheet
const CHROME_BREATHING_PX = 12; // air above the pill
export const EXPANDED_TOP_GAP_PX = FLOATING_CHROME_PX + CHROME_BREATHING_PX;

// The stops, in order. Expanded isn't a key of SHEET_SNAPS, so callers that need
// to enumerate them read this instead.
export const SNAP_NAMES = ["collapsed", "half", "expanded"];

// ζ ≈ 0.9 — just inside underdamped, which in practice means the overshoot is
// under a pixel and never actually shows. That is the intent: a sheet that
// visibly bounces reads as a toy, and the weight comes from the velocity
// handoff on release rather than from a wobble at the end. Measured ~400ms to
// rest from a half-screen throw, which is the iOS ballpark.
const STIFFNESS = 280;
const DAMPING = 30;

// Rest thresholds. Half a pixel is under the display's ability to show a
// difference, so continuing to integrate past it is just burning frames.
const REST_DISTANCE = 0.5;
const REST_VELOCITY = 20;

// How far ahead a release is projected before picking a snap. 120ms is roughly
// the point where "where the throw was going" stops matching intent and starts
// flinging the sheet past the stop the user meant.
const PROJECTION_MS = 120;

// Below this a gesture is a tap, not a drag — so a tap that lands on the sheet
// body doesn't jitter it by a pixel and swallow the click.
const DRAG_SLOP_PX = 4;

const prefersReducedMotion = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---- Physics ---------------------------------------------------------------
// Pure and exported so the feel can be reasoned about (and tested) without a
// DOM. Nothing below touches an element.

/**
 * Sheet height and the translateY of each stop, for a given viewport height.
 * The sheet is flush with the bottom at translateY 0, so hiding
 * `height - fraction*vh` of it leaves exactly `fraction` on screen.
 */
export function sheetStops(viewportHeight, bottomInset = 0) {
    // A panel can pin an action bar below the sheet (the vehicle screen keeps its
    // Book button on screen at every stop). The sheet then owns everything above
    // that bar, and the fractions are of THAT space — measured against the full
    // viewport instead, a tall bar would quietly eat most of the collapsed sheet.
    const available = viewportHeight - bottomInset;
    const height = available - EXPANDED_TOP_GAP_PX;
    const yFor = (fraction) => height - fraction * available;
    return {
        height,
        // Clear of the bar as well as its own box, so a closing sheet doesn't
        // slide across the bar on its way out.
        hiddenY: height + bottomInset,
        stops: {
            // The sheet's own height IS the expanded state, so it rests at 0.
            expanded: 0,
            half: yFor(SHEET_SNAPS.half),
            collapsed: yFor(SHEET_SNAPS.collapsed),
        },
    };
}

/**
 * One frame of the spring, sub-stepped at a fixed 1/240s. A spring this stiff
 * goes unstable if a long frame is integrated in a single step, and a dropped
 * frame is exactly when it must not explode.
 */
export function advanceSpring(y, velocity, target, elapsedSeconds) {
    // A backgrounded tab returning after seconds must not integrate one enormous
    // step and fling the sheet somewhere impossible.
    let remaining = Math.min(elapsedSeconds, 1 / 30);
    const STEP = 1 / 240;
    let v = velocity;
    let position = y;
    while (remaining > 0) {
        const dt = Math.min(STEP, remaining);
        remaining -= dt;
        v += (-STIFFNESS * (position - target) - DAMPING * v) * dt;
        position += v * dt;
    }
    return { y: position, velocity: v };
}

export const isAtRest = (y, velocity, target) =>
    Math.abs(y - target) < REST_DISTANCE && Math.abs(velocity) < REST_VELOCITY;

/**
 * The drag range. The sheet is a fixed-height surface between two fixed edges —
 * the pill clearance above, and the action bar below when a panel pins one — so
 * there is no overshoot that doesn't tear it away from one of them.
 */
export const clampToStops = (y, stops) => Math.min(Math.max(y, stops.expanded), stops.collapsed);

/**
 * Which stop a release was heading for: project the throw forward, then take the
 * nearest stop to where it would have landed. Distance alone ignores a fast
 * flick that hasn't travelled far yet; velocity alone overshoots on a slow,
 * deliberate drag. Together they behave the way a thumb expects.
 */
export function resolveSnap(y, velocity, stops) {
    const projected = y + velocity * (PROJECTION_MS / 1000);
    let best = null;
    let bestDistance = Infinity;
    for (const [name, stopY] of Object.entries(stops)) {
        const distance = Math.abs(projected - stopY);
        if (distance < bestDistance) {
            bestDistance = distance;
            best = name;
        }
    }
    return best;
}

/**
 * @param {object} options
 * @param {boolean} options.enabled          Off on desktop — the hook then does nothing at all.
 * @param {boolean} options.open             False plays the sheet back off-screen.
 * @param {typeof SNAP_NAMES[number]} options.initialSnap
 * @param {number} [options.bottomInset] Px of pinned chrome below the sheet (an action bar).
 * @param {(snap: typeof SNAP_NAMES[number]) => void} [options.onSnapChange] Fired on settle, not per frame.
 */
export function useBottomSheet({ enabled, open = true, initialSnap = "collapsed", bottomInset = 0, onSnapChange }) {
    const sheetRef = useRef(null);
    const grabberRef = useRef(null);

    // Everything the animation touches lives in refs. A ref write during a
    // pointermove is free; a setState would re-render the whole panel at 120Hz.
    const yRef = useRef(0);
    const targetRef = useRef(0);
    const velocityRef = useRef(0);
    const rafRef = useRef(0);
    const lastFrameRef = useRef(0);
    const snapRef = useRef(initialSnap);
    const geometryRef = useRef({ vh: 0, height: 0, hiddenY: 0, stops: {} });
    const dragRef = useRef(null);
    const onSnapChangeRef = useRef(onSnapChange);
    onSnapChangeRef.current = onSnapChange;

    // Viewport-dependent numbers, recomputed on resize rather than read per
    // frame — layout reads inside the rAF loop are what turn a smooth drag into
    // a janky one.
    // Read from a ref, not the prop, so `measure` keeps a stable identity: the
    // entrance effect depends on it, and an action bar reporting its height must
    // not count as "the sheet just opened".
    const bottomInsetRef = useRef(bottomInset);
    bottomInsetRef.current = bottomInset;

    const measure = useCallback(() => {
        const vh = window.innerHeight;
        const inset = bottomInsetRef.current;
        geometryRef.current = { vh, bottomInset: inset, ...sheetStops(vh, inset) };
        return geometryRef.current;
    }, []);

    const paint = useCallback((y) => {
        // Expanded rests at 0 and nothing sits above it, so a negative value can
        // only be the spring overshooting on a fast upward flick. Clamped here
        // rather than in the spring itself, so that no path — drag, snap, resize
        // or entrance — can paint a frame with the sheet lifted off the bar
        // beneath it. Downward is left alone: the exit deliberately parks the
        // sheet below every stop.
        const clamped = y < 0 ? 0 : y;
        yRef.current = clamped;
        const el = sheetRef.current;
        if (el) el.style.transform = `translate3d(0, ${clamped.toFixed(2)}px, 0)`;
    }, []);

    // The element that actually scrolls. A panel marks its content column with
    // `data-sheet-scroll`; without one the sheet scrolls itself.
    //
    // Worth marking it: `overflow` establishes a clip, and anything the panel
    // floats OUTSIDE its own box — the back button hanging above the top edge —
    // is clipped away the moment the sheet becomes the scroller. Putting the
    // overflow one level in keeps that chrome visible.
    const scrollerOf = useCallback(
        () => sheetRef.current?.querySelector("[data-sheet-scroll]") ?? sheetRef.current,
        [],
    );

    // Content scrolls only at full expansion. Anywhere else a drag anywhere on
    // the sheet should move the sheet — that is the whole gesture at that point,
    // and a scrollable body would eat it.
    const syncScrollability = useCallback((snap) => {
        const scroller = scrollerOf();
        if (!scroller) return;
        const scrollable = snap === "expanded";
        scroller.style.overflowY = scrollable ? "auto" : "hidden";
        scroller.style.touchAction = scrollable ? "pan-y" : "none";
        // Collapsing with the content halfway down would reopen mid-list.
        if (!scrollable) scroller.scrollTop = 0;
    }, [scrollerOf]);

    const stopSpring = useCallback(() => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
        lastFrameRef.current = 0;
        const el = sheetRef.current;
        // Dropping the hint at rest matters: a permanently promoted layer this
        // size costs memory and can push the map's own compositing off the GPU.
        if (el && !dragRef.current) el.style.willChange = "auto";
    }, []);

    const tick = useCallback((now) => {
        const previous = lastFrameRef.current || now;
        lastFrameRef.current = now;
        const target = targetRef.current;

        const { y, velocity } = advanceSpring(
            yRef.current,
            velocityRef.current,
            target,
            (now - previous) / 1000,
        );
        velocityRef.current = velocity;

        if (isAtRest(y, velocity, target)) {
            paint(target);
            velocityRef.current = 0;
            stopSpring();
            return;
        }

        paint(y);
        rafRef.current = requestAnimationFrame(tick);
    }, [paint, stopSpring]);

    const springTo = useCallback((y, initialVelocity = 0) => {
        targetRef.current = y;
        velocityRef.current = initialVelocity;

        if (prefersReducedMotion()) {
            paint(y);
            velocityRef.current = 0;
            stopSpring();
            return;
        }

        const el = sheetRef.current;
        if (el) el.style.willChange = "transform";
        if (!rafRef.current) {
            lastFrameRef.current = 0;
            rafRef.current = requestAnimationFrame(tick);
        }
    }, [paint, stopSpring, tick]);

    /** Animate to a named stop. Safe to call from anywhere, including mid-drag. */
    const snapTo = useCallback((snap, velocity = 0) => {
        const { stops } = geometryRef.current.vh ? geometryRef.current : measure();
        const y = stops[snap];
        if (y == null) return;
        const changed = snapRef.current !== snap;
        snapRef.current = snap;
        syncScrollability(snap);
        springTo(y, velocity);
        if (changed) onSnapChangeRef.current?.(snap);
    }, [measure, springTo, syncScrollability]);

    // ---- Gesture ----------------------------------------------------------
    useEffect(() => {
        if (!enabled) return;
        const el = sheetRef.current;
        if (!el) return;

        const grabber = grabberRef.current;

        const onPointerDown = (event) => {
            if (event.pointerType === "mouse" && event.button !== 0) return;

            // A spring already in flight gets caught rather than finished — an
            // interruptible animation is most of why this feels physical.
            stopSpring();

            const fromGrabber = grabber?.contains(event.target);
            dragRef.current = {
                pointerId: event.pointerId,
                startY: event.clientY,
                startSheetY: yRef.current,
                lastY: event.clientY,
                lastTime: event.timeStamp,
                velocity: 0,
                // The grabber is unambiguous. Elsewhere, at full expansion, we
                // don't yet know whether this is a scroll or a drag — that is
                // decided on the first real movement, below.
                mode: fromGrabber || snapRef.current !== "expanded" ? "sheet" : "undecided",
                startScrollTop: scrollerOf()?.scrollTop ?? 0,
                moved: false,
            };
            el.style.willChange = "transform";
        };

        const onPointerMove = (event) => {
            const drag = dragRef.current;
            if (!drag || event.pointerId !== drag.pointerId) return;

            const dy = event.clientY - drag.startY;

            if (!drag.moved) {
                if (Math.abs(dy) < DRAG_SLOP_PX) return;
                drag.moved = true;
                if (drag.mode === "undecided") {
                    // Expanded and already scrolled: the content owns the
                    // gesture. At the top, pulling down grabs the sheet — the
                    // handoff Google Maps does, and the reason you never have to
                    // aim for the handle.
                    drag.mode = dy > 0 && drag.startScrollTop <= 0 ? "sheet" : "scroll";
                }
                if (drag.mode === "sheet") el.setPointerCapture?.(drag.pointerId);
            }

            if (drag.mode !== "sheet") return;

            // Velocity from the last sample pair rather than the whole gesture:
            // what matters at release is the final flick, not the average.
            const dt = event.timeStamp - drag.lastTime;
            if (dt > 0) {
                const instant = ((event.clientY - drag.lastY) / dt) * 1000;
                // Light smoothing — raw pointer deltas are noisy enough that an
                // unsmoothed value regularly picks the wrong snap.
                drag.velocity = drag.velocity * 0.7 + instant * 0.3;
                drag.lastY = event.clientY;
                drag.lastTime = event.timeStamp;
            }

            // Hard limits at the two end stops — no overshoot, elastic or
            // otherwise. Dragging past expanded lifted the sheet off the action
            // bar pinned below it and showed a strip of map through the gap.
            paint(clampToStops(drag.startSheetY + dy, geometryRef.current.stops));
        };

        const endDrag = (event) => {
            const drag = dragRef.current;
            if (!drag || (event && event.pointerId !== drag.pointerId)) return;
            dragRef.current = null;

            if (drag.mode !== "sheet") return;
            el.releasePointerCapture?.(drag.pointerId);

            // A tap that never became a drag leaves the sheet exactly where it was.
            if (!drag.moved) {
                el.style.willChange = "auto";
                return;
            }

            const snap = resolveSnap(yRef.current, drag.velocity, geometryRef.current.stops);
            const changed = snapRef.current !== snap;
            snapRef.current = snap;
            syncScrollability(snap);
            // The release velocity carries into the spring, so the sheet keeps
            // the momentum of the throw instead of restarting from still.
            springTo(geometryRef.current.stops[snap], drag.velocity);
            if (changed) onSnapChangeRef.current?.(snap);
        };

        // Non-passive, because this is the only way to stop the browser scrolling
        // the page under us once we've decided the gesture belongs to the sheet.
        const onTouchMove = (event) => {
            if (dragRef.current?.mode === "sheet") event.preventDefault();
        };

        el.addEventListener("pointerdown", onPointerDown);
        el.addEventListener("pointermove", onPointerMove);
        el.addEventListener("pointerup", endDrag);
        el.addEventListener("pointercancel", endDrag);
        el.addEventListener("touchmove", onTouchMove, { passive: false });

        return () => {
            el.removeEventListener("pointerdown", onPointerDown);
            el.removeEventListener("pointermove", onPointerMove);
            el.removeEventListener("pointerup", endDrag);
            el.removeEventListener("pointercancel", endDrag);
            el.removeEventListener("touchmove", onTouchMove);
            dragRef.current = null;
        };
    }, [enabled, paint, scrollerOf, springTo, stopSpring, syncScrollability]);

    // ---- Geometry + entrance ----------------------------------------------
    useLayoutEffect(() => {
        if (!enabled) {
            // Leaving sheet mode (rotating to landscape, resizing past the sm
            // breakpoint) must hand both elements back exactly as they were
            // found — every style this hook sets is an inline one, so clearing
            // them returns the panel to its stylesheet.
            const el = sheetRef.current;
            if (el) {
                el.style.transform = "";
                el.style.height = "";
                el.style.bottom = "";
                el.style.willChange = "";
            }
            const scroller = scrollerOf();
            if (scroller) {
                scroller.style.overflowY = "";
                scroller.style.touchAction = "";
            }
            return;
        }

        const el = sheetRef.current;
        if (!el) return;

        const { height, hiddenY, stops } = measure();
        // Height in px, not dvh: the JS geometry and the CSS box have to agree
        // exactly, and dvh vs window.innerHeight disagree while the URL bar is
        // mid-collapse — which is precisely when someone is dragging.
        el.style.height = `${height}px`;
        // Lifts the sheet off the viewport bottom when the panel pins an action
        // bar there, so the two sit edge to edge instead of overlapping.
        el.style.bottom = `${bottomInsetRef.current}px`;

        // Rise from off-screen on first paint. Set before the browser paints, so
        // there is no frame of a full-height sheet at rest.
        paint(hiddenY);
        syncScrollability(initialSnap);
        snapRef.current = initialSnap;
        // rAF so the entrance is an animation from hidden, not a layout jump.
        const id = requestAnimationFrame(() => springTo(stops[initialSnap]));
        return () => cancelAnimationFrame(id);
    }, [enabled, initialSnap, measure, paint, scrollerOf, springTo, syncScrollability]);

    // The action bar below the sheet reports its height after it has rendered,
    // and can change it later (a notice appearing, text wrapping). Re-measure and
    // ease to the same stop's new position — springing rather than jumping,
    // because this is a visible change to where the sheet rests. Skipped on the
    // first run: the entrance above already applied the geometry.
    const insetSettled = useRef(false);
    useEffect(() => {
        if (!enabled) {
            insetSettled.current = false;
            return;
        }
        if (!insetSettled.current) {
            insetSettled.current = true;
            return;
        }
        const el = sheetRef.current;
        if (!el) return;
        const { height, stops } = measure();
        el.style.height = `${height}px`;
        el.style.bottom = `${bottomInset}px`;
        springTo(stops[snapRef.current] ?? stops.collapsed);
    }, [enabled, bottomInset, measure, springTo]);

    // Play back off-screen when the panel is closing, so the exit reads as the
    // sheet leaving rather than the horizontal wipe the other panels use.
    useEffect(() => {
        if (!enabled || open) return;
        springTo(geometryRef.current.hiddenY);
    }, [enabled, open, springTo]);

    useEffect(() => {
        if (!enabled) return;
        const onResize = () => {
            const el = sheetRef.current;
            if (!el) return;
            const { height, stops } = measure();
            el.style.height = `${height}px`;
            el.style.bottom = `${bottomInsetRef.current}px`;
            // Hold the current stop across the resize rather than re-running the
            // entrance — an on-screen keyboard opening must not collapse the sheet.
            // Painted, not sprung: a collapsing URL bar fires resize continuously
            // and animating each one would read as jitter.
            paint(stops[snapRef.current] ?? stops.collapsed);
        };
        window.addEventListener("resize", onResize);
        window.addEventListener("orientationchange", onResize);
        return () => {
            window.removeEventListener("resize", onResize);
            window.removeEventListener("orientationchange", onResize);
        };
    }, [enabled, measure, paint]);

    useEffect(() => stopSpring, [stopSpring]);

    return { sheetRef, grabberRef, snapTo, currentSnap: snapRef };
}
