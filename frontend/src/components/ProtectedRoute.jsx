import { useAuth } from "@clerk/clerk-react";
import { Navigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import LoadingScreen from "./LoadingScreen";
import { useApi } from "../hooks/useApi";
import { useData } from "../hooks/useData";

// A Clerk session exists the moment OTP is verified (ticket sign-in), but the DB
// user isn't created until the username step. So "signed in" alone is not enough
// to enter a protected route — we also require a completed profile (getMe). An
// incomplete session (signed in, no DB user) is signed out so backing out of
// signup before choosing a username does NOT leave the person logged in.
export default function ProtectedRoute({ children }) {
  const { isSignedIn, isLoaded } = useAuth();
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
        // The gate already has the profile in hand — hydrate the shared store so
        // protected pages read user details from useData without re-fetching.
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

  return children;
}
