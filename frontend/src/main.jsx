import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { ClerkProvider } from '@clerk/clerk-react'
import LoginPage from './pages/LoginPage'
import './index.css'
import App from './App'
import {ThemeProvider} from './context/ThemeContext';
import ErrorBoundary from './components/ErrorBoundary';
import OnBoarding from './pages/OnBoarding';
import VehicleSelect from './pages/VehicleSelect';
import SignUpPage from './pages/SignUpPage';
import ProtectedRoute from './components/ProtectedRoute';
import TrackingPage from './pages/TrackingPage';
import ManageAccount from './pages/ManageAccount';
import SettingsPage from './pages/SettingsPage';
import SafetyPage from './pages/SafetyPage';
import AdminDashboard from './pages/AdminDashboard';
import HelpPage from './pages/HelpPage';
import RideCancelledToast from './components/ui/RideCancelledToast';
import DevPreview from './pages/DevPreview';

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

if (!PUBLISHABLE_KEY) {
  throw new Error('Missing Clerk Publishable Key')
}

const router = createBrowserRouter([
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
    // !! Pinned to a literal while TrackingPage reads its booking from the store
    // rather than the URL. VehicleSelect navigates here hard-coded too, so the real
    // `/booking/:id` can't be reached — restore both together, or a booking opened
    // from a link (or a reload) has no id to fetch.
    // path: "/booking/:id",
    path: "/booking/test",
    element: <ProtectedRoute><TrackingPage /></ProtectedRoute>,
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
  {
    path: "/safety",
    element: <ProtectedRoute><SafetyPage /></ProtectedRoute>,
  },
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
]);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
      <ThemeProvider>
        {/* <ErrorBoundary> */}
          <RouterProvider router={router} />
          <RideCancelledToast />
        {/* </ErrorBoundary> */}
      </ThemeProvider>
    </ClerkProvider>
  </StrictMode>,
)
