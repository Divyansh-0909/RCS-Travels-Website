import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Outlet, useLocation } from 'react-router-native';
import AppBar from './components/AppBar';
import AppBarScrim from './components/AppBarScrim';
import { AppBarVisibilityProvider } from './components/AppBarVisibility';
import OfferPanel from './components/OfferPanel';
import OnlineToggle from './components/OnlineToggle';
import RideAcceptedSheet from './components/RideAcceptedSheet';
import { RideMenuDrawer, RideMenuProvider } from './components/RideMenu';
import { useDriver } from './hooks/useDriver';
import { useDriverLocation } from './hooks/useDriverLocation';

const App = () => {
    const { pathname } = useLocation();
    const { profile } = useDriver();

    // Mounted on the shell rather than on Home, because reporting his position
    // is not something the captain is doing on a screen — it has to survive him
    // walking to Rides, Account or the ride detail while a rider watches the
    // marker. This component is the only thing every signed-in route sits
    // inside, so it is the shortest-lived thing that outlives all of them.
    //
    // `assignedRides` is the cadence switch: non-zero means a ride is live and
    // somebody is looking at the map, which is the only time the fast rate is
    // worth its battery. It is already on the profile for routing, so this costs
    // no extra request.
    useDriverLocation(
        profile?.isOnline ?? false,
        (profile?.onboarding?.assignedRides ?? 0) > 0,
    );

    // pt-34 is clearance for OnlineToggle's header, not for Home. An unapproved
    // captain gets the status screen at "/" and no header above it, so the same
    // padding there would be an inch of white the screen never fills.
    const showsHomeHeader = pathname === '/' && (profile?.onboarding?.canDrive ?? false);

    return (
        <AppBarVisibilityProvider>
            {/* Wraps the shell because its two halves sit at opposite ends of it:
                the button is inside the header, the drawer has to cover the whole
                screen and so cannot be the header's child. */}
            <RideMenuProvider>
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
                {/* Last, so it paints over the bar as well as the page. An offer
                    is an interruption — it is the one thing on screen that should
                    not be half-hidden behind the tabs. */}
                <OfferPanel/>
                {/* Above the offer panel, and last of everything: it is the answer
                    to the tap that just dismissed that panel, so it has to cover
                    the space the card was occupying. */}
                <RideAcceptedSheet/>
                {/* Over the page and the panels, under nothing: while it is open it
                    is the only thing being operated. */}
                <RideMenuDrawer/>
            </View>
            </RideMenuProvider>
        </AppBarVisibilityProvider>
    )
}

export default App
