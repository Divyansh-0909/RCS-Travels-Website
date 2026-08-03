import '../global.css';

import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { NativeRouter, Route, Routes, Navigate } from 'react-router-native';
import App from './App';
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
                <Route path="/" element={<App />} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </NativeRouter>
    )
}

export default Main
