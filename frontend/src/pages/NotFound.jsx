import { useViewNavigate } from "../hooks/useViewNavigate"
import Button from "../components/ui/Button"

/* Rendered by the catch-all route. Vercel rewrites every path to index.html, so
   without this a mistyped or stale URL would fall through to the router's
   default error screen — which never mounts PageMeta, leaving the home page's
   title, description, and "index, follow" attached to a URL that doesn't exist.
   The metadata comes from defaultMeta, which PageMeta applies to any path with
   no entry of its own. */
const NotFound = () => {
    const navigate = useViewNavigate()

    return (
        <div className="bg-gradient min-h-[100dvh] flex flex-col items-center justify-center gap-3 px-6 text-center">
            <h1>This page doesn't exist</h1>
            <p className="max-w-md">
                The link may be old, or the address slightly off. Everything still works from the home page.
            </p>
            <Button prop={{}} className="mt-4" onClick={() => navigate("/")}>
                Back to home
            </Button>
        </div>
    )
}

export default NotFound
