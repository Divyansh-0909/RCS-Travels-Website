import { useEffect } from "react"
import { Outlet, useLocation, useNavigationType } from "react-router-dom"
import usePageMeta from "../hooks/usePageMeta"
import { jumpToTop } from "../hooks/useSmoothScroll"

/* Pathless layout route wrapping every page, so the per-route title and
   description are set in exactly one place. Pages stay unaware of their own
   metadata — add a route, add its copy to constants/pageMeta.js, done.

   It also owns the scroll position across routes. A browser only resets the
   scroll on a document load, and a client-side navigation isn't one: leaving
   "/" from the About section for Outstation kept the old offset, so the page
   opened halfway down with its hero already scrolled past. Both of those routes
   scroll the window, which is what makes it visible — the app screens are
   h-dvh and scroll inside their own panels. */
const PageMeta = () => {
    usePageMeta()
    const location = useLocation()
    const navigationType = useNavigationType()

    // Runs after the arriving page's layout effects, so a route that creates a
    // ScrollSmoother (App, Outstation) already has one for jumpToTop to drive.
    useEffect(() => {
        // Back/forward keeps its place — that's the point of going back.
        if (navigationType === "POP") return
        // App scrolls to that section itself once it has mounted; resetting
        // here would land at the top and undo it a frame later.
        if (location.state?.scrollTo) return
        jumpToTop()
    }, [location.pathname])

    return <Outlet />
}

export default PageMeta
