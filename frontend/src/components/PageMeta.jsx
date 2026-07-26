import { Outlet } from "react-router-dom"
import usePageMeta from "../hooks/usePageMeta"

/* Pathless layout route wrapping every page, so the per-route title and
   description are set in exactly one place. Pages stay unaware of their own
   metadata — add a route, add its copy to constants/pageMeta.js, done. */
const PageMeta = () => {
    usePageMeta()
    return <Outlet />
}

export default PageMeta
