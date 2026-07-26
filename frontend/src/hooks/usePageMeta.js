import { useEffect } from "react"
import { useLocation } from "react-router-dom"
import { metaForPath, SITE_NAME } from "../constants/pageMeta"

/* Router-driven <head> tags. This is a single-page app, so the document only
   ever loads index.html — without this, every route would share the one title
   baked into that file, and the tab, the browser history, and anything Google
   renders would all read the same no matter where you are.

   Tags are created on first use and updated in place afterwards, so navigating
   never leaves a stale duplicate behind. Canonical and og:url come from
   window.location, so nothing here has to know the production domain.

   Called once, from the PageMeta layout route. Calling it from a page as well
   would race: child effects run before their parent's, so the layout's write
   would land last and win. */

const upsert = (selector, create) => {
    let el = document.head.querySelector(selector)
    if (!el) {
        el = create()
        document.head.appendChild(el)
    }
    return el
}

const setMeta = (key, attr, content) => {
    upsert(`meta[${attr}="${key}"]`, () => {
        const el = document.createElement("meta")
        el.setAttribute(attr, key)
        return el
    }).setAttribute("content", content)
}

const usePageMeta = () => {
    const { pathname } = useLocation()

    useEffect(() => {
        const { title, description, noindex } = metaForPath(pathname)
        const url = window.location.origin + pathname

        document.title = title
        setMeta("description", "name", description)

        /* Account and booking pages are per-person and useless as search
           results — and a crawler that indexed them would only ever see the
           logged-out shell anyway. */
        setMeta("robots", "name", noindex ? "noindex, nofollow" : "index, follow")

        /* Only indexable pages get a canonical. Leaving one behind on a 404
           would point search engines at the URL that doesn't exist. */
        const canonical = document.head.querySelector('link[rel="canonical"]')
        if (noindex) {
            canonical?.remove()
        } else {
            upsert('link[rel="canonical"]', () => {
                const el = document.createElement("link")
                el.setAttribute("rel", "canonical")
                return el
            }).setAttribute("href", url)
        }

        // Link previews — WhatsApp is how most of our customers share things.
        setMeta("og:title", "property", title)
        setMeta("og:description", "property", description)
        setMeta("og:url", "property", url)
        setMeta("og:type", "property", pathname === "/" ? "website" : "article")
        setMeta("og:site_name", "property", SITE_NAME)

        setMeta("twitter:card", "name", "summary_large_image")
        setMeta("twitter:title", "name", title)
        setMeta("twitter:description", "name", description)
    }, [pathname])
}

export default usePageMeta
