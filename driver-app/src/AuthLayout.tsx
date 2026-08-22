import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Outlet, useLocation } from 'react-router-native';
import SwipeBack from './components/SwipeBack';

const AuthLayout = () => {
    const { pathname } = useLocation();

    return (
        <View className='relative w-full h-full bg-[var(--background-primary)] flex flex-col justify-center items-center'>
            <StatusBar style="light" animated />
            <Animated.View
                key={pathname}
                entering={FadeIn.duration(220)}
                pointerEvents="box-none"
                style={{ flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' }}
            >
                <SwipeBack>
                    <Outlet />
                </SwipeBack>
            </Animated.View>
        </View>
    )
}

export default AuthLayout
