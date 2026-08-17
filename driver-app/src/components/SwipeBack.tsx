import { useEffect, useRef } from 'react';
import { BackHandler, PanResponder, Platform, View } from 'react-native';
import { useLocation, useNavigate } from 'react-router-native';

const EDGE_WIDTH = 30;
const SWIPE_DISTANCE = 100;
const SWIPE_VELOCITY = 0.5;

const SwipeBack = ({ children }: { children: React.ReactNode }) => {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    // PanResponder is intentionally created only once. Keep its route input in
    // a ref, otherwise it captures the initial `/` pathname and never enables
    // when the captain later navigates to a detail page.
    const pathnameRef = useRef(pathname);
    pathnameRef.current = pathname;

    useEffect(() => {
        if (Platform.OS !== 'android') return;

        // Android's system edge gesture is delivered as a hardware-back event,
        // before an edge View is guaranteed to receive touch ownership. Handle
        // it here so gesture-navigation phones use the same router history as
        // the in-app fallback below.
        const sub = BackHandler.addEventListener('hardwareBackPress', () => {
            if (pathnameRef.current === '/') return false;
            navigate(-1);
            return true;
        });

        return () => sub.remove();
    }, [navigate]);

    const pan = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: (_, gesture) => {
                return pathnameRef.current !== '/' && gesture.x0 <= EDGE_WIDTH;
            },

            onMoveShouldSetPanResponder: (_, gesture) => {
                return (
                    pathnameRef.current !== '/' &&
                    gesture.x0 <= EDGE_WIDTH &&
                    gesture.dx > 5 &&
                    Math.abs(gesture.dx) > Math.abs(gesture.dy)
                );
            },

            onPanResponderRelease: (_, gesture) => {
                const distance = Math.max(gesture.dx, 0);

                if (
                    distance >= SWIPE_DISTANCE ||
                    gesture.vx >= SWIPE_VELOCITY
                ) {
                    navigate(-1);
                }
            },
        }),
    ).current;

    return (
        // This wrapper replaces the Outlet as the Animated.View's direct child.
        // Mirror the shell's centre alignment so it is behaviorally transparent
        // to every existing page rather than stretching their intrinsic layouts.
        <View style={{ flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' }}>
            {children}

            <View
                {...pan.panHandlers}
                pointerEvents="box-only"
                style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: EDGE_WIDTH,
                }}
            />
        </View>
    );
};

export default SwipeBack;
