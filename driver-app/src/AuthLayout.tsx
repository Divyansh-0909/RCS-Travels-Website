import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Animated, {
    Easing,
    FadeInDown,
    FadeOut,
    ReduceMotion,
} from 'react-native-reanimated';
import { Outlet, useLocation } from 'react-router-native';
import SwipeBack from './components/SwipeBack';

const PAGE_ENTER = FadeInDown
    .duration(180)
    .easing(Easing.out(Easing.cubic))
    .reduceMotion(ReduceMotion.System)
    .withInitialValues({ opacity: 0, transform: [{ translateY: 8 }] });
const PAGE_EXIT = FadeOut
    .duration(90)
    .easing(Easing.in(Easing.quad))
    .reduceMotion(ReduceMotion.System);

const AuthLayout = () => {
    const { pathname } = useLocation();

    return (
        <View className='relative w-full h-full bg-[var(--background-primary)] flex flex-col justify-center items-center'>
            <StatusBar style="light" animated />
            <Animated.View
                key={pathname}
                entering={PAGE_ENTER}
                exiting={PAGE_EXIT}
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
