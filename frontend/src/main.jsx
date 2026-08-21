import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { ClerkProvider } from '@clerk/clerk-react'
import LoginPage from './pages/LoginPage'
import './index.css'
import App from './App'
import {ThemeProvider} from './context/ThemeContext';
import ErrorBoundary, { RouteErrorBoundary } from './components/ErrorBoundary';
import OnBoarding from './pages/OnBoarding';
import VehicleSelect from './pages/VehicleSelect';
import SignUpPage from './pages/SignUpPage';
import ProtectedRoute from './components/ProtectedRoute';
import TrackingPage from './pages/TrackingPage';
import SharedTrip from './pages/SharedTrip';
import ManageAccount from './pages/ManageAccount';
import SettingsPage from './pages/SettingsPage';
import SafetyPage from './pages/SafetyPage';
import AdminDashboard from './pages/AdminDashboard';
import HelpPage from './pages/HelpPage';
import Outstation from './pages/Outstation';
import RideCancelledToast from './components/ui/RideCancelledToast';
import RefreshNotice from './components/ui/RefreshNotice';
import DevPreview from './pages/DevPreview';
import PageMeta from './components/PageMeta';
import NotFound from './pages/NotFound';
import OpenDriverApp from './pages/OpenDriverApp';
import LegalPage from './pages/LegalPage';
import { legalPaths } from './constants/legal';

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

if (!PUBLISHABLE_KEY) {
  throw new Error('Missing Clerk Publishable Key')
}

// Pathless layout route: PageMeta renders every page through an <Outlet/> and
// sets that route's title/description from constants/pageMeta.js.
const router = createBrowserRouter([{
  element: <PageMeta />,
  // A data router swallows throws from its own routes and renders React
  // Router's built-in "Unexpected Application Error!" page, which never reaches
  // the <ErrorBoundary> below. Since every page is inside the router, this is
  // the boundary that actually fires.
  errorElement: <RouteErrorBoundary />,
  children: [
  {
    path: "/",
    element: <App />,
  },
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    path: "/signup",
    element: <SignUpPage />,
  },
  {
    path: "/book",
    element: <ProtectedRoute><VehicleSelect /></ProtectedRoute>,
  },
  {
    // The id in the URL is what makes a ride reachable from a link, from ride
    // history, or after a reload — the store's bookingId is not persisted, so it
    // is gone by the time either of those lands. TrackingPage takes the param as
    // its source of truth and falls back to the store only where there is no
    // param (the /dev previews).
    path: "/booking/:id",
    element: <ProtectedRoute><TrackingPage /></ProtectedRoute>,
  },
  // Public, and the only page that is public WITHOUT being for everyone: the
  // token in the path is the whole of the authorisation, so there is no
  // ProtectedRoute here by design — the person following a shared ride has no
  // account. Short path because it is pasted into chat messages by hand.
  {
    path: "/t/:token",
    element: <SharedTrip />,
  },
  {
    // WhatsApp template buttons require an HTTPS URL. This public hand-off page
    // opens the installed Captains app through its custom scheme; it contains no
    // ride data, and the driver API still authenticates access to the booking.
    path: "/captains/rides/:id",
    element: <OpenDriverApp />,
  },
  {
    path: "/manage-account",
    element: <ProtectedRoute><ManageAccount /></ProtectedRoute>,
  },
  {
    path: "/settings",
    element: <ProtectedRoute><SettingsPage /></ProtectedRoute>,
  },
  {
    path: "/help",
    element: <HelpPage />,
  },
  // Public and indexable: it's the only page describing a product that isn't in
  // the booking form, so search is the main way anyone finds it.
  {
    path: "/outstation",
    element: <Outstation />,
  },
  {
    path: "/safety",
    element: <ProtectedRoute><SafetyPage /></ProtectedRoute>,
  },
  // Public, and deliberately one route per document rather than tabs behind a
  // single /legal: each has to be linkable on its own — from the signup consent
  // line, from a support reply, from a payment gateway's onboarding form. The
  // paths come from constants/legal.js so the footer links, the tab rail and the
  // routes can't drift apart.
  ...legalPaths.map(path => ({ path, element: <LegalPage /> })),
  {
    path: "/dashboard",
    element: <ProtectedRoute requireAdmin><AdminDashboard/></ProtectedRoute>
  },
  // Dev-only preview routes for auth-gated UI (see DevPreview.jsx); /dev lists them all.
  ...(import.meta.env.DEV
    ? [
        { path: "/dev", element: <DevPreview /> },
        { path: "/dev/:view", element: <DevPreview /> },
      ]
    : []),
  // Catch-all. Without it an unmatched URL hits the router's default error
  // screen, which sits outside PageMeta and so keeps index.html's home-page
  // metadata — telling Google that every typo is the home page.
  {
    path: "*",
    element: <NotFound />,
  },
  ],
}]);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
      <ThemeProvider>
        <ErrorBoundary>
          <RouterProvider router={router} />
          <RideCancelledToast />
          {/* Global, like the toast above: any page can raise a stale-data
              notice through the useRefreshNotice store without threading props */}
          <RefreshNotice />
        </ErrorBoundary>
      </ThemeProvider>
    </ClerkProvider>
  </StrictMode>,
)
