import '../global.css';

import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { NativeRouter, Route, Routes, Navigate } from 'react-router-native';
import App from './App';
import Account from './pages/Account';
import Available from './pages/Available';
import Home from './pages/Home';
import Notifications from './pages/Notifications';
import Post from './pages/Post';
import Rides from './pages/Rides';
import { fontAssets } from './theme/fonts';

const Main = () => {
    const [fontsLoaded, fontError] = useFonts(fontAssets);

    if (!fontsLoaded && !fontError) {
        return null;
    }

    return (
        <NativeRouter>
            <StatusBar style="auto" />
            <Routes>
                <Route path="/" element={<App />}>
                    <Route index element={<Home />} />
                    <Route path="available" element={<Available />} />
                    <Route path="post" element={<Post />} />
                    <Route path="rides" element={<Rides />} />
                    <Route path="account" element={<Account />} />
                    <Route path="notifications" element={<Notifications />} />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </NativeRouter>
    )
}

export default Main
