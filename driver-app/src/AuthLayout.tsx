import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Outlet, useLocation } from 'react-router-native';

const AuthLayout = () => {
    const { pathname } = useLocation();

    return (
        <View className='relative w-full h-full bg-[var(--background-primary)] flex flex-col justify-center items-center'>
            <Animated.View
                key={pathname}
                entering={FadeIn.duration(220)}
                pointerEvents="box-none"
                style={{ flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' }}
            >
                <Outlet />
            </Animated.View>
        </View>
    )
}

export default AuthLayout
