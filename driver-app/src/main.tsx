import '../global.css';

import { ClerkProvider , useAuth } from '@clerk/clerk-expo';
import { tokenCache } from '@clerk/clerk-expo/token-cache';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { NativeRouter, Route, Routes, Navigate } from 'react-router-native';
import App from './App';
import AuthLayout from './AuthLayout';
import ErrorBoundary from './components/ErrorBoundary';
import VerifiedRoute from './components/VerifiedRoute';
import { DriverProvider } from './hooks/useDriver';
import Account from './pages/Account';
import Documents from './pages/Documents';
import Vehicles from './pages/Vehicles';
import OnboardingStatus from './pages/OnboardingStatus';
import Available from './pages/Available';
import Home from './pages/Home';
import Notifications from './pages/Notifications';
import Post from './pages/Post';
import Rides from './pages/Rides';
import RideDetail from './pages/RideDetail';
import OnBoarding from './pages/OnBoarding';
import Login from './pages/Login';
import Signup from './pages/Signup';
import { fontAssets } from './theme/fonts';

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

if (!publishableKey) {
    throw new Error('Missing Clerk Publishable Key');
}

const AppRoutes = () => {
    const { isLoaded, isSignedIn } = useAuth();

    if (!isLoaded) {
        return null;
    }

    return (
        <NativeRouter>
            <StatusBar style="auto" />
            <DriverProvider>
            <Routes>
                {isSignedIn ? (
                    <>
                    <Route element={<AuthLayout />}>
                        <Route path="signup" element={<Signup />} />
                    </Route>

                    <Route element={<App />}>
                        <Route element={<VerifiedRoute />}>
                            <Route index element={<Home />} />
                            <Route path="available" element={<Available />} />
                            <Route path="post" element={<Post />} />
                            <Route path="rides" element={<Rides />} />
                            <Route path="rides/:id" element={<RideDetail />} />
                            <Route path="notifications" element={<Notifications />} />
                        </Route>
                        <Route path="onboarding/status" element={<OnboardingStatus />} />
                        <Route path="account" element={<Account />} />
                        <Route path="account/documents" element={<Documents />} />
                        <Route path="account/vehicles" element={<Vehicles />} />
                    </Route>
                    </>
                ) : (
                    <Route element={<AuthLayout />}>
                        <Route index element={<OnBoarding />} />
                        <Route path="login" element={<Login />} />
                        <Route path="signup" element={<Signup />} />
                        <Route path="document" element={<Documents />} />
                    </Route>
                )}
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            </DriverProvider>
        </NativeRouter>
    )
}

const Main = () => {
    const [fontsLoaded, fontError] = useFonts(fontAssets);

    if (!fontsLoaded && !fontError) {
        return null;
    }

    return (
        // Outside ClerkProvider, not inside it. A provider that throws while
        // initialising is exactly the crash worth catching, and a boundary mounted
        // underneath it would go down with it.
        //
        // Below the font gate above, though, so the error screen has the faces it sets
        // type in — a fallback rendering in the system font would be the second thing
        // visibly wrong on a screen already reporting the first.
        <ErrorBoundary>
            <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
                <AppRoutes />
            </ClerkProvider>
        </ErrorBoundary>
    )
}

export default Main
