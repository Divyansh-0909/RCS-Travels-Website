import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Outlet, useLocation } from 'react-router-native';
import AppBar from './components/AppBar';
import OnlineToggle from './components/OnlineToggle';

const App = () => {
    const { pathname } = useLocation();

    return (
        <View className='relative w-full h-full bg-[var(--foreground)] pt-16 pb-32 flex flex-col justify-center items-center'>
            <OnlineToggle />
            <Animated.View
                key={pathname}
                entering={FadeIn.duration(220)}
                pointerEvents="box-none"
                style={{ flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' }}
            >
                <Outlet />
            </Animated.View>
            <AppBar/>
        </View>
    )
}

export default App
