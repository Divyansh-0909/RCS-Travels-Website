import { useAuth, useUser } from "@clerk/clerk-react";
import { Navigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import LoadingScreen from "./LoadingScreen";
import ErrorPanel from "./ui/ErrorPanel";
import { useApi } from "../hooks/useApi";
import { useData } from "../hooks/useData";

// A Clerk session exists from OTP verification, but the DB user isn't created until
// the username step — so entry also requires a completed profile (getMe), and an
// incomplete session is signed out rather than left logged in. `requireAdmin` gates
// on the Clerk role as UX only; the API still enforces 403 server-side.
export default function ProtectedRoute({ children, requireAdmin = false }) {
  const { isSignedIn, isLoaded } = useAuth();
  const { user, isLoaded: userLoaded } = useUser();
  const { getMe, logout } = useApi();
  const setUsername = useData(state => state.setUsername);
  const setPhone = useData(state => state.setPhone);
  const setBookingCode = useData(state => state.setBookingCode);
  const location = useLocation();
  const [status, setStatus] = useState("checking"); // "checking" | "ok" | "incomplete" | "retry"
  const [retryKey, setRetryKey] = useState(0);
  const [requestError, setRequestError] = useState(null);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    let cancelled = false;
    (async () => {
      let me;
      try {
        me = await getMe();
      } catch {
        if (!cancelled) {
          setRequestError("We couldn't refresh your account. Please try again.");
          setStatus("retry");
        }
        return;
      }
      if (cancelled) return;

      if (me?.error) {
        // A 429 or transient upstream failure says nothing about whether the
        // Clerk session is valid. Signing out here made a temporary rate limit
        // look like a failed login and sent existing users into signup.
        if (me.status !== 401 && me.status !== 404) {
          setRequestError(me.status === 429
            ? "We couldn't refresh your account right now. Your sign-in is still active. Please try again shortly."
            : "We couldn't refresh your account. Please try again.");
          setStatus("retry");
          return;
        }
        await logout();            // tear down the half-finished session
        if (!cancelled) setStatus("incomplete");
      } else {
        // Hydrate the shared store so protected pages don't re-fetch the profile.
        setUsername(me.name);
        setPhone(me.phone);
        setBookingCode(me.bookingCode);
        setStatus("ok");
      }
    })();

    return () => { cancelled = true; };
  }, [isLoaded, isSignedIn, retryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isLoaded || (isSignedIn && status === "checking")) return <LoadingScreen />;

  if (!isSignedIn || status === "incomplete")
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}`} replace />;

  if (status === "retry") {
    return <ErrorPanel prop={{
      error: requestError,
      setError: setRequestError,
      onOkay: () => {
        setStatus("checking");
        setRetryKey(key => key + 1);
      },
      actionLabel: "Retry",
    }} />;
  }

  if (requireAdmin) {
    if (!userLoaded) return <LoadingScreen />;
    if (user?.publicMetadata?.role !== "admin") return <Navigate to="/" replace />;
  }

  return children;
}
