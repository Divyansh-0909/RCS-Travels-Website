import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Outlet, useLocation } from 'react-router-native';
import AppBar from './components/AppBar';
import AppBarScrim from './components/AppBarScrim';
import { AppBarVisibilityProvider } from './components/AppBarVisibility';
import OnlineToggle from './components/OnlineToggle';
import { useDriver } from './hooks/useDriver';

const App = () => {
    const { pathname } = useLocation();
    const { profile } = useDriver();

    // pt-34 is clearance for OnlineToggle's header, not for Home. An unapproved
    // captain gets the status screen at "/" and no header above it, so the same
    // padding there would be an inch of white the screen never fills.
    const showsHomeHeader = pathname === '/' && (profile?.onboarding?.canDrive ?? false);

    return (
        <AppBarVisibilityProvider>
            <View className={`relative w-full h-full bg-[var(--foreground)] ${showsHomeHeader ? 'pt-34' : 'pt-10'} flex flex-col justify-center items-center`}>
                <OnlineToggle />
                <Animated.View
                    key={pathname}
                    entering={FadeIn.duration(220)}
                    pointerEvents="box-none"
                    style={{ flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' }}
                >
                    <Outlet/>
                </Animated.View>
                {/* Between the routes and the bar, in both senses: after the Outlet
                    so it paints over the content, before the AppBar so the bar
                    paints over it. */}
                <AppBarScrim/>
                <AppBar/>
            </View>
        </AppBarVisibilityProvider>
    )
}

export default App
