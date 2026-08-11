import { AppState, Pressable, View } from "react-native";
import { cssInterop } from "nativewind";
import { CaretRightIcon } from "phosphor-react-native";
import AppText from "../components/AppText";
import RideCard from "../components/ui/RideCard";
import ScheduledRide from "../components/ui/ScheduledRide";
import MarketPromo from "../components/ui/MarketPromo";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-native";
import { useApi } from "../hooks/useApi";
import { UpcomingBooking } from "../types/enums";
import { ACTIVE_RIDE_STATUSES } from "../constants/booking";

// Phosphor takes a colour prop, not a class. cssInterop is how AppBar and
// OnlineToggle colour theirs, so the caret reads its blue from the same token.
const Caret = cssInterop(CaretRightIcon, {
    className: { target: false, nativeStyleToProp: { color: true } },
});

type ApiError = {
    error: string;
    status: number;
    code?: string;
};

type GetRidesResponse =
    | {
        bookings: UpcomingBooking[];
    }
    | ApiError;

const MAX_ROWS = 2;

// The floating AppBar and the scrim behind it own the bottom of every screen, so the
// last card needs its own clearance to be readable at all. Same number the Rides and
// Account boards reserve. Without it the Market promo ends up under the bar and, now
// that the scrim is there, faded halfway to white before it gets there.
const BAR_CLEARANCE = 132;

const Home = () => {
    const api = useApi()
    const navigate = useNavigate()
    const [rides, setRides] = useState<UpcomingBooking[]>([])
    const [error, setError] = useState<string | null>(null)

    const latestRequest = useRef(0)
    const invalidateInFlight = useCallback(() => { latestRequest.current++ }, [])

    const refresh = useCallback(async () => {
        const requestId = ++latestRequest.current;
        setError(null)
        try {
            const data = await api.getRides() as GetRidesResponse;
            if (requestId !== latestRequest.current) return;

            if ("error" in data) {
                setError(data.error);
                return;
            }

            setRides(data.bookings);
        } catch (e: unknown) {
            if (requestId !== latestRequest.current) return;

            if (e instanceof Error) setError(e.message);
            else setError("Something went wrong")
        }
    }, [api]);

    useEffect(() => {
        refresh();
        return invalidateInFlight;
    }, [refresh, invalidateInFlight]);

    useEffect(() => {
        const subscription = AppState.addEventListener("change", (state) => {
            if (state === "active") refresh();
        });

        return () => subscription.remove();
    }, [refresh]);

    const active = rides.find((ride) => ACTIVE_RIDE_STATUSES.includes(ride.status)) ?? null;
    const scheduled = rides.filter((ride) => ride.status === "assigned");

    return (
        <View
            style={{ flex: 1, width: '92%', gap: 16, paddingTop: 8, paddingBottom: BAR_CLEARANCE }}
        >
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

            {active && (
                <>
                    <RideCard booking={active} onPress={() => navigate(`/rides/${active.id}`)} />
                </>
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
        </View>
    )
}

export default Home
