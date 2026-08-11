import { useEffect, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ScrollSmoother } from "gsap/ScrollSmoother";

gsap.registerPlugin(ScrollTrigger, ScrollSmoother);

// Smooth scrolling for the one window-scrolling route we have ("/"). Every other
// route is an app screen — h-dvh with its own overflow-y-auto panels — so there
// is no page scroll to smooth there, and ScrollSmoother's transform on the
// content would break their `fixed inset-0` overlays.
export function useSmoothScroll() {
    useLayoutEffect(() => {
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

        // gsap.context so StrictMode's double-mount reverts cleanly instead of
        // leaving two smoothers fighting over the same content.
        const ctx = gsap.context(() => {
            ScrollSmoother.create({
                wrapper: "#smooth-wrapper",
                content: "#smooth-content",
                smooth: 1.2,        // seconds the content takes to catch up to the real scroll position
                smoothTouch: false, // phones keep native scroll
                effects: true,      // opts in data-speed / data-lag parallax on children
                // No normalizeScroll: it hands touch/wheel to JS, which would stop
                // the nested scrollers (OnBoarding's suggestion panel, the nav
                // drawer) from scrolling under the pointer.
            });
        });
        return () => ctx.revert();
    }, []);
}

// Tone of the section currently passing under the fixed navbar, so the bar can
// invert itself against it. The landing page alternates dark and light bands
// four times on the way down, so this can't be one threshold: every section
// declares its own tone with data-bar-tone and the bar takes whichever section
// is crossing it.
//
// ScrollTrigger rather than IntersectionObserver or a scrollY calculation:
// ScrollSmoother transforms the content, so the real scroll position and what
// is visually under the bar disagree for the whole 1.2s catch-up, and the bar
// would flip early on every fast scroll. ScrollTrigger resolves against the
// smoother, and still works on the reduced-motion path where no smoother is
// created at all.
export function useSectionTone(railRef, initial = "dark") {
    const [tone, setTone] = useState(initial);
    // Mirrors `tone` for the scroll callback to compare against, so setTone only
    // ever runs on a real crossing. Reading the state itself would re-render the
    // page on every frame of every scroll.
    const toneRef = useRef(initial);

    useEffect(() => {
        const sections = gsap.utils.toArray("[data-bar-tone]");
        if (!sections.length) return;

        // Positions are read live rather than cached as ScrollTrigger start/end
        // values, which are measured once per refresh. OnBoarding is h-[100dvh]
        // and on phones dvh grows as the address bar collapses — during the
        // first scroll gesture, which is exactly when the first flip is due. A
        // cached boundary is stale by the height of the toolbar from then on,
        // and decoding illustrations shift the rest. Eight rect reads per scroll
        // frame cost little and cannot drift.
        const sync = () => {
            const rail = railRef.current;
            if (!rail) return;
            const bar = rail.getBoundingClientRect();
            // The bar's own centre line: the section edge bisects the bar as it
            // passes, so neither half sits over the wrong tone for long. Move
            // this to bar.bottom to flip only once the bar is fully clear.
            const line = bar.top + bar.height / 2;

            const under = sections.find(section => {
                const rect = section.getBoundingClientRect();
                return rect.top <= line && rect.bottom > line;
            });
            // No match means the line is in a gap or past the last section;
            // holding the current tone beats flashing back to the default.
            if (!under || under.dataset.barTone === toneRef.current) return;
            toneRef.current = under.dataset.barTone;
            setTone(toneRef.current);
        };

        // One ScrollTrigger spanning the page rather than one per section: its
        // onUpdate runs after the smoother has written the frame's transform, so
        // the reads see what the eye sees instead of lagging a frame behind.
        const driver = ScrollTrigger.create({ start: 0, end: "max", onUpdate: sync, onRefresh: sync });
        sync();
        return () => driver.kill();
    }, []);

    return tone;
}

// Both helpers live here so every caller resolves the same smoother instance.
// ScrollSmoother.get() is undefined on the routes that don't create one, so each
// falls back to the native smooth scroll rather than doing nothing.
export function scrollToSection(id) {
    const el = document.getElementById(id);
    if (!el) return false;

    const smoother = ScrollSmoother.get();
    // "center center" = the section's center aligned to the viewport's center.
    if (smoother) smoother.scrollTo(el, true, "center center");
    else el.scrollIntoView({ behavior: "smooth", block: "center" });
    return true;
}

export function scrollToTop() {
    const smoother = ScrollSmoother.get();
    if (smoother) smoother.scrollTo(0, true);
    else window.scrollTo({ top: 0, behavior: "smooth" });
}

// Same thing without the animation, for landing on a route rather than moving
// within one: the page you arrive at has nothing above its top to scroll past,
// so an animated trip up from the previous page's offset would only look like
// the new page had loaded scrolled and then corrected itself.
export function jumpToTop() {
    const smoother = ScrollSmoother.get();
    if (smoother) smoother.scrollTo(0, false);
    else window.scrollTo(0, 0);
}
