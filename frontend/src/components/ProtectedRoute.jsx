import { useAuth } from "@clerk/clerk-react";
import { Navigate, useLocation } from "react-router-dom";
import LoadingScreen from "./LoadingScreen";

export default function ProtectedRoute({ children }) {
  const { isSignedIn, isLoaded } = useAuth();
  const location = useLocation();

  if (!isLoaded) return <LoadingScreen />;

  if (!isSignedIn)
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}`} replace />;

  return children;
}
