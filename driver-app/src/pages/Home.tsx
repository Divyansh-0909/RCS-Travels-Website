import { Pressable, View } from "react-native";
import { cssInterop } from "nativewind";
import { CaretRightIcon } from "phosphor-react-native";
import AppText from "../components/AppText";
import ScheduledRide from "../components/ui/ScheduledRide";
import MarketPromo from "../components/ui/MarketPromo";
import DriverCouponPromo from "../components/ui/DriverCouponPromo";
import { useNavigate } from "react-router-native";
import { useRides } from "../hooks/useRides";

const Caret = cssInterop(CaretRightIcon, {
    className: { target: false, nativeStyleToProp: { color: true } },
});

const MAX_ROWS = 2;
// AppBar is 68px tall and floats 24px from the bottom. The remaining 16px keeps
// the coupon panel visually separate while placing it directly above the bar.
const BAR_CLEARANCE = 108;

const Home = () => {
    const navigate = useNavigate()
    const { scheduled, error, refresh } = useRides()

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
            <View className="flex-1 items-center justify-center w-full rounded-2xl px-4 gap-0.5">
                <AppText className="text-2xl font-semibold text-[var(--background-primary)]">
                    You&apos;re offline
                </AppText>
                <AppText className="text-base text-gray-600">
                    Go online to start getting rides.
                </AppText>
            </View>

            <View className="w-full gap-4">
                {error && (
                    <View className="w-full flex-row items-center justify-between gap-4">
                        <AppText numberOfLines={2} className="flex-1 text-sm text-red-600">{error}</AppText>
                        <Pressable
                            role="button"
                            onPress={refresh}
                            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                        >
                            <AppText className="text-sm font-semibold text-primary">Try again</AppText>
                        </Pressable>
                    </View>
                )}
                <View className="w-full gap-2">
                    <View className="flex-row items-center justify-between gap-3 px-1">
                        <AppText className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                            Next rides
                        </AppText>
                        <Pressable
                            role="link"
                            onPress={() => navigate("/rides")}
                            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                        >
                            <View className="flex-row items-center gap-1">
                                <AppText className="text-sm font-semibold text-primary">Schedule</AppText>
                                <Caret size={14} weight="bold" className="text-primary" />
                            </View>
                        </Pressable>
                    </View>

                    {scheduled.length === 0 ? (
                        <View className="w-full rounded-2xl p-4 gap-0.5" style={{ backgroundColor: '#f3f3f3' }}>
                            <AppText className="font-semibold text-[var(--background-primary)]">No ride scheduled</AppText>
                            <AppText className="text-xs text-gray-600">Your next assigned ride shows up here.</AppText>
                        </View>
                    ) : (
                        scheduled.slice(0, MAX_ROWS).map((ride) => (
                            <ScheduledRide
                                key={ride.id}
                                booking={ride}
                                onPress={() => navigate(`/rides/${ride.id}`)}
                            />
                        ))
                    )}
                </View>

                <MarketPromo />
                <DriverCouponPromo />
            </View>
        </View>
    )
}

export default Home
