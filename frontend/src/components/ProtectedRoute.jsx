import { useAuth, useUser } from "@clerk/clerk-react";
import { Navigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import LoadingScreen from "./LoadingScreen";
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
  const [status, setStatus] = useState("checking"); // "checking" | "ok" | "incomplete"

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    let cancelled = false;
    (async () => {
      const me = await getMe();
      if (cancelled) return;

      if (me?.error) {
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
  }, [isLoaded, isSignedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isLoaded || (isSignedIn && status === "checking")) return <LoadingScreen />;

  if (!isSignedIn || status === "incomplete")
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}`} replace />;

  if (requireAdmin) {
    if (!userLoaded) return <LoadingScreen />;
    if (user?.publicMetadata?.role !== "admin") return <Navigate to="/" replace />;
  }

  return children;
}
