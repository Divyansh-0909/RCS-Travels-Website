import { Pressable, View } from "react-native";
import { cssInterop } from "nativewind";
import { CaretRightIcon } from "phosphor-react-native";
import AppText from "../components/AppText";
import ScheduledRide from "../components/ui/ScheduledRide";
import MarketPromo from "../components/ui/MarketPromo";
import { useNavigate } from "react-router-native";
import { useRides } from "../hooks/useRides";

// Phosphor takes a colour prop, not a class. cssInterop is how AppBar and
// OnlineToggle colour theirs, so the caret reads its blue from the same token.
const Caret = cssInterop(CaretRightIcon, {
    className: { target: false, nativeStyleToProp: { color: true } },
});

const MAX_ROWS = 2;

// The floating AppBar and the scrim behind it own the bottom of every screen, so the
// last card needs its own clearance to be readable at all. Same number the Rides and
// Account boards reserve. Without it the Market promo ends up under the bar and, now
// that the scrim is there, faded halfway to white before it gets there.
const BAR_CLEARANCE = 132;

/**
 * The board a captain sees while he is OFFLINE.
 *
 * It used to be home in every state, and carried the active-ride card as well.
 * Both of those moved: an active ride has its own screen and an online captain
 * gets the map, so what is left here is the one case where neither applies —
 * signed in, approved, and not taking work. HomeGate decides which of the three
 * he is looking at.
 *
 * The scheduled list stays, because it is exactly what he came to check. A
 * captain going offline for the evening still wants to know when tomorrow's
 * first pickup is.
 */
const Home = () => {
    const navigate = useNavigate()
    const { scheduled, error, refresh } = useRides()

    return (
        <View
            style={{ flex: 1, width: '92%', gap: 16, paddingTop: 8, paddingBottom: BAR_CLEARANCE }}
        >
            {/* Said plainly, at the top, because it is the reason the rest of this
                screen is quiet. Without it a captain who does not remember
                flipping the switch reads an empty board as the fleet having no
                work, and waits on nothing. */}
            <View className="w-full rounded-2xl px-4 py-3 gap-0.5" style={{ backgroundColor: '#f3f3f3' }}>
                <AppText className="text-base font-semibold text-[var(--background-primary)]">
                    You&apos;re offline
                </AppText>
                <AppText className="text-xs text-gray-600">
                    Go online to start getting rides.
                </AppText>
            </View>

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

            {/* No active-ride card here any more. A ride in progress takes over
                the whole screen (ActiveRide) rather than sitting at the top of a
                list, and a captain cannot be offline with one anyway — the server
                refuses to take him offline until it is finished. */}

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
        </View>
    )
}

export default Home
