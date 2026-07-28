import { Component } from "react";
import { useRouteError } from "react-router-dom";
import FailureState from "./ui/FailureState";

// Last-resort screens for an unhandled render throw, so the app degrades to
// something actionable instead of the white screen it produced while this file
// was a stub.
//
// There are TWO of these on purpose, because one is not enough:
//
//   RouteErrorBoundary — a data router (createBrowserRouter) catches throws
//     inside its own routes and renders React Router's built-in error page
//     ("Unexpected Application Error!" over a stack trace) BEFORE they can
//     reach any class boundary wrapping <RouterProvider>. Wired as the router's
//     errorElement, this replaces that. It is the one that fires in practice,
//     since every page lives inside the router.
//
//   ErrorBoundary — the class component, for everything OUTSIDE the router:
//     ClerkProvider, ThemeProvider, and the global toasts. Nothing else can
//     catch those.
//
// Neither catches errors in event handlers, in async callbacks, or after a
// fetch resolves — React boundaries never do. Those are the pages' own job,
// which is what FailureState and RefreshNotice are for.

// Shared presentation, so the two paths can't drift apart.
const CrashScreen = ({ error }) => (
    <div className="w-[100vw] h-[100vh] flex flex-col justify-center items-center bg-[var(--background)] text-[var(--text)]">
        <FailureState
            tone="dark"
            title="This page stopped responding"
            // A rider can't act on a stack trace, so it stays in the console in
            // production and only surfaces while developing.
            detail={
                import.meta.env.DEV
                    ? (error?.message || String(error))
                    : "Reloading usually clears it. Your booking is safe and nothing was lost."
            }
            onRetry={() => window.location.reload()}
            retryLabel="Reload the page"
            secondaryAction={{
                label: "Go to the home page",
                // A hard assignment, not a router navigate: the router is part
                // of what just broke.
                onClick: () => { window.location.href = "/"; },
            }}
        />
    </div>
);

export function RouteErrorBoundary() {
    const error = useRouteError();
    console.error("Route render error:", error);
    return <CrashScreen error={error} />;
}

class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { error: null };
    }

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error, info) {
        // Console is the whole reporting story for now; swap in the real sink
        // when there is one.
        console.error("Unhandled render error:", error, info?.componentStack);
    }

    render() {
        if (!this.state.error) return this.props.children;
        return <CrashScreen error={this.state.error} />;
    }
}

export default ErrorBoundary;
