import { useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";
import { useTheme } from "../context/ThemeContext";

const legacyPaths = new Set(["/", "/outstation"]);
const legacyBookingPaths = new Set(["/book"]);
const legacyBookingPrefixes = ["/booking/", "/t/"];

const usesLegacyTheme = (pathname) => legacyPaths.has(pathname)
  || legacyBookingPaths.has(pathname)
  || legacyBookingPrefixes.some((prefix) => pathname.startsWith(prefix));

// Marketing and the complete customer booking/tracking journey deliberately
// retain their established dark treatment. Account/application routes receive
// the resolved preference (light or dark).
export default function ThemeRouteSync() {
  const { pathname } = useLocation();
  const { resolvedTheme } = useTheme();

  useLayoutEffect(() => {
    const normalizedPath = pathname.replace(/\/+$/, "") || "/";
    const nextTheme = usesLegacyTheme(normalizedPath) ? "legacy" : resolvedTheme;
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
  }, [pathname, resolvedTheme]);

  return null;
}
