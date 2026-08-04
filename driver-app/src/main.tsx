import '../global.css';

import { ClerkProvider } from '@clerk/clerk-expo';
import { tokenCache } from '@clerk/clerk-expo/token-cache';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { NativeRouter, Route, Routes, Navigate } from 'react-router-native';
import App from './App';
import AuthLayout from './AuthLayout';
import Account from './pages/Account';
import Available from './pages/Available';
import Home from './pages/Home';
import Notifications from './pages/Notifications';
import Post from './pages/Post';
import Rides from './pages/Rides';
import OnBoarding from './pages/OnBoarding';
import Login from './pages/Login';
import Signup from './pages/Signup';
import { fontAssets } from './theme/fonts';

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

if (!publishableKey) {
    throw new Error('Missing Clerk Publishable Key');
}

const Main = () => {
    const [fontsLoaded, fontError] = useFonts(fontAssets);

    if (!fontsLoaded && !fontError) {
        return null;
    }

    return (
        <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
            <NativeRouter>
                <StatusBar style="auto" />
                <Routes>
                    <Route element={<AuthLayout />}>
                        <Route index element={<OnBoarding />} />
                        <Route path="login" element={<Login />} />
                        <Route path="signup" element={<Signup />} />
                    </Route>
                    <Route element={<App />}>
                        <Route path='home' element={<Home />} />
                        <Route path="available" element={<Available />} />
                        <Route path="post" element={<Post />} />
                        <Route path="rides" element={<Rides />} />
                        <Route path="account" element={<Account />} />
                        <Route path="notifications" element={<Notifications />} />
                    </Route>
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </NativeRouter>
        </ClerkProvider>
    )
}

export default Main
