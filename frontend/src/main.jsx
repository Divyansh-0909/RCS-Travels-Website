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
import RideHistory from './pages/RideHistory';
import ManageAccount from './pages/ManageAccount';
import RideCancelledToast from './components/ui/RideCancelledToast';

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
    // path: "/booking/:id", 
    path: "/booking/test",
    element: <ProtectedRoute><TrackingPage /></ProtectedRoute>,
  },
  {
    path: "/ride-history",
    element: <ProtectedRoute><RideHistory /></ProtectedRoute>,
  },
  {
    path: "/profile",
    element: <ProtectedRoute><ManageAccount /></ProtectedRoute>,
  },
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
