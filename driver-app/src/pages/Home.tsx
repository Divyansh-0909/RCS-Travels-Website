import { AppState, Pressable, View } from "react-native";
import { cssInterop } from "nativewind";
import { CaretRightIcon } from "phosphor-react-native";
import AppText from "../components/AppText";
import RideCard from "../components/ui/RideCard";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-native";
import { useApi } from "../hooks/useApi";
import { UpcomingBooking } from "../types/enums";
import { ACTIVE_RIDE_STATUSES } from "../constants/booking";

const Caret = cssInterop(CaretRightIcon, {
    className: { target: false, nativeStyleToProp: { color: true } },
});

type ApiError = {
    error: string;
    status: number;
    code?: string;
};

type GetUpcomingRideResponse =
    | {
        booking: UpcomingBooking | null;
    }
    | ApiError;

// /rides selects the same columns as /upcoming-ride and differs only in which
// statuses it returns, so both panels read the one booking shape.
type GetRidesResponse =
    | {
        bookings: UpcomingBooking[];
    }
    | ApiError;

const Home = () => {
    const api = useApi()
    const navigate = useNavigate()
    const [upcoming, setUpcoming] = useState<UpcomingBooking | null>(null)
    const [active, setActive] = useState<UpcomingBooking | null>(null)
    const [error, setError] = useState<string | null>(null)

    const latestRequest = useRef(0)
    const invalidateInFlight = useCallback(() => { latestRequest.current++ }, [])

    const refresh = useCallback(async () => {
        const requestId = ++latestRequest.current;
        setError(null)
        try {
            const [upcomingData, ridesData] = await Promise.all([
                api.getUpcomingRide() as Promise<GetUpcomingRideResponse>,
                api.getRides() as Promise<GetRidesResponse>,
            ]);
            if (requestId !== latestRequest.current) return;

            if ("error" in upcomingData) {
                setError(upcomingData.error);
                return;
            }

            if ("error" in ridesData) {
                setError(ridesData.error);
                return;
            }

            setUpcoming(upcomingData.booking);
            setActive(ridesData.bookings.find((ride) => ACTIVE_RIDE_STATUSES.includes(ride.status)) ?? null);
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


    return (
        <View className="w-[92%] relative flex flex-col justify-center items-center gap-4">
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

            {active && <RideCard booking={active} variant="active" />}

            <RideCard booking={upcoming} variant="upcoming" />

            <Pressable
                role="link"
                onPress={() => navigate("/rides")}
                className="flex-row items-center justify-center gap-1 py-1"
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
                <AppText className="text-sm font-semibold text-[var(--background-primary)]">
                    See full ride schedule
                </AppText>
                <Caret size={14} weight="bold" className="text-[var(--background-primary)]" />
            </Pressable>
        </View>
    )
}

export default Home