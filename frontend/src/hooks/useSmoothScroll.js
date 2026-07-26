import { useLayoutEffect } from "react";
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
