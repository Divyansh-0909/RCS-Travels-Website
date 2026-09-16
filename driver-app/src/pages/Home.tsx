import { useLanguage as useCopyLanguage } from "../i18n";
import { driverCopy as dc } from "../lib/copy";
import { useEffect, useRef } from "react";
import { Pressable, View } from "react-native";
import Animated, {
    Easing,
    useAnimatedStyle,
    useReducedMotion,
    useSharedValue,
    withTiming,
} from "react-native-reanimated";
import { cssInterop } from "nativewind";
import { CaretRightIcon } from "phosphor-react-native";
import AppText from "../components/AppText";
import ScheduledRide from "../components/ui/ScheduledRide";
import MarketPromo from "../components/ui/MarketPromo";
import DriverCouponPromo from "../components/ui/DriverCouponPromo";
import { HomeRideListSkeleton } from "../components/ui/LoadingSkeletons";
import { useNavigate } from "react-router-native";
import { useDriver } from "../hooks/useDriver";
import type { UpcomingBooking } from "../types/enums";
import { useTheme } from '../theme/ThemeContext';

const Caret = cssInterop(CaretRightIcon, {
    className: { target: false, nativeStyleToProp: { color: true } },
});

const MAX_ROWS = 2;
const MOTION_DURATION = 180;
const RIDE_ENTER_SCALE = 0.97;
const RIDE_ENTER_Y = 8;
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
// AppBar is 68px tall and floats 24px from the bottom. The remaining 16px keeps
// the coupon panel visually separate while placing it directly above the bar.
const BAR_CLEARANCE = 108;

type Props = {
    scheduled: UpcomingBooking[];
    loading: boolean;
    error: string | null;
    onRefresh: () => Promise<void>;
};

const OverviewRide = ({ booking, onPress }: { booking: UpcomingBooking; onPress: () => void }) => {
    const reducedMotion = useReducedMotion();
    const progress = useSharedValue(0);

    useEffect(() => {
        progress.set(0);
        progress.set(withTiming(1, { duration: MOTION_DURATION, easing: EASE_OUT }));
    }, [progress]);

    const animatedStyle = useAnimatedStyle(() => {
        const value = progress.get();
        return {
            opacity: value,
            transform: reducedMotion
                ? [{ translateY: 0 }, { scale: 1 }]
                : [
                    { translateY: (1 - value) * RIDE_ENTER_Y },
                    { scale: RIDE_ENTER_SCALE + (1 - RIDE_ENTER_SCALE) * value },
                ],
        };
    });

    return (
        <Animated.View style={animatedStyle}>
            <ScheduledRide booking={booking} onPress={onPress} />
        </Animated.View>
    );
};

const Home = ({ scheduled, loading, error, onRefresh }: Props) => {
    useCopyLanguage();
    const navigate = useNavigate()
    const { profile } = useDriver()
    const { colors } = useTheme()
    const online = profile?.isOnline ?? false
    const statusProgress = useSharedValue(1)
    const rideStateProgress = useSharedValue(1)
    const previousOnline = useRef(online)
    const rideState = loading && scheduled.length === 0
        ? 'loading'
        : scheduled.length === 0
            ? 'empty'
            : 'rides'

    useEffect(() => {
        if (previousOnline.current === online) return
        previousOnline.current = online
        statusProgress.set(0)
        statusProgress.set(withTiming(1, { duration: MOTION_DURATION, easing: EASE_OUT }))
    }, [online, statusProgress])

    useEffect(() => {
        rideStateProgress.set(0)
        rideStateProgress.set(withTiming(1, { duration: MOTION_DURATION, easing: EASE_OUT }))
    }, [rideState, rideStateProgress])

    const statusAnimatedStyle = useAnimatedStyle(() => ({ opacity: statusProgress.get() }))
    const rideStateAnimatedStyle = useAnimatedStyle(() => ({ opacity: rideStateProgress.get() }))

    return (
        <View
            style={{
                flex: 1,
                width: '92%',
                gap: 16,
                justifyContent: 'space-between',
                paddingTop: 8,
                paddingBottom: BAR_CLEARANCE,
            }}
        >
            <Animated.View
                className="flex-1 items-center justify-center w-full rounded-2xl px-4 gap-0.5"
                style={statusAnimatedStyle}
            >
                <AppText className="text-2xl font-semibold text-ink">{dc("You're") + " "}{online ? dc("online") : dc("offline")}
                </AppText>
                <AppText className="text-base text-ink-muted">
                    {online ? dc("Waiting for a new ride.") : dc("Go online to start getting rides.")}
                </AppText>
            </Animated.View>

            <View className="w-full gap-4">
                {error && (
                    <View className="w-full flex-row items-center justify-between gap-4">
                        <AppText numberOfLines={2} className="flex-1 text-sm text-red-600">{error}</AppText>
                        <Pressable
                            role="button"
                            onPress={onRefresh}
                            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                        >
                            <AppText className="text-sm font-semibold text-primary">{dc("Try again")}</AppText>
                        </Pressable>
                    </View>
                )}
                <View className="w-full gap-2">
                    <View className="flex-row items-center justify-between gap-3 px-1">
                        <AppText className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{dc("Next rides")}</AppText>
                        <Pressable
                            role="link"
                            onPress={() => navigate("/rides")}
                            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                        >
                            <View className="flex-row items-center gap-1">
                                <AppText className="text-sm font-semibold text-primary">{dc("Schedule")}</AppText>
                                <Caret size={14} weight="bold" className="text-primary" />
                            </View>
                        </Pressable>
                    </View>

                    <Animated.View className="w-full gap-2" style={rideStateAnimatedStyle}>
                        {loading && scheduled.length === 0 ? (
                            <HomeRideListSkeleton />
                        ) : scheduled.length === 0 ? (
                            <View className="w-full rounded-2xl px-4 py-5 gap-0.5" style={{ backgroundColor: colors.surfaceMuted }}>
                                <AppText className="text-lg font-semibold text-ink">{dc("No ride scheduled")}</AppText>
                                <AppText className="text-sm text-ink-muted">{dc("Your next assigned ride shows up here.")}</AppText>
                            </View>
                        ) : (
                            scheduled.slice(0, MAX_ROWS).map((ride) => (
                                <OverviewRide
                                    key={ride.id}
                                    booking={ride}
                                    onPress={() => navigate(`/rides/${ride.id}`)}
                                />
                            ))
                        )}
                    </Animated.View>
                </View>

                <MarketPromo />
                <DriverCouponPromo />
            </View>
        </View>
    )
}

export default Home
