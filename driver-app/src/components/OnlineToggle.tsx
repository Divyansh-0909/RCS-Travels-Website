import { cssInterop } from "nativewind";
import { BellIcon } from "phosphor-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import Animated, { useAnimatedStyle, withTiming } from "react-native-reanimated";
import { useLocation, useNavigate } from "react-router-native";
import AppText from "./AppText";
import { useApi } from "../hooks/useApi";
import { useDriver } from "../hooks/useDriver";
import { ensureLocationPermission } from "../hooks/useDriverLocation";
import { useShellHidden } from "./AppBarVisibility";
import { RideMenuButton } from "./RideMenu";
import { useData } from "../hooks/useData";

const Bell = cssInterop(BellIcon, {
    className: { target: false, nativeStyleToProp: { color: true } },
});

const KNOB_OFF = 20;   // web: left-5
const KNOB_ON = -8;    // web: -left-2

const OnlineToggle = () => {
    const hidden = useData((state) => state.hidden);
    const [error, setError] = useState<string | null>(null)
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const onNotifications = pathname === "/notifications";
    // The whole header is Home's, not the shell's: going online is a decision a
    // captain makes from the ride list, and the bell does not belong to Account or
    // Post. Home is the index route, so it answers to "/".
    const onHome = pathname === "/";

    const api = useApi()
    const { profile, patchProfile } = useDriver();
    const { onActiveRide } = useShellHidden();

    // THE SERVER OWNS THIS, not a useState seeded false. The flag lives on the
    // driver row, so a captain who was online when he last closed the app is
    // still online now — a local default would have shown him "Offline" while
    // dispatch was busy offering him rides. It is also what useDriverLocation
    // reads to decide whether to transmit, and what HomeGate picks the screen
    // from; two copies of "am I online" is exactly how the switch, the screen
    // and the GPS end up disagreeing.
    //
    // Which is why the optimism now lives on the PROFILE rather than in a local
    // `pending` beside it. A second copy here moved the knob instantly and left
    // the screen behind it, waiting out the round trip — the switch looked
    // instant and the app looked stuck.
    const online = profile?.isOnline ?? false;
    const [busy, setBusy] = useState(false);

    // "/" is the application status until he is approved, and none of this header
    // belongs on it: the switch would 403, and offering to go online is the one
    // thing that screen exists to explain he cannot do yet. The bell goes with it —
    // /notifications is behind the gate.
    const canDrive = profile?.onboarding?.canDrive ?? false;

    const knob = useAnimatedStyle(() => ({
        transform: [{
            translateX: withTiming(online ? KNOB_ON : KNOB_OFF, { duration: 600 }),
        }],
    }));

    async function toggleOnline() {
        if (busy) return
        const next = !online
        setError(null)
        setBusy(true)

        try {
            await commitOnline(next)
        } finally {
            setBusy(false)
        }
    }

    async function commitOnline(next: boolean) {
        // BEFORE the server is told, because going online without it is worse
        // than not going online at all: the switch would read Online, dispatch
        // would never find him — the radius search reads driver_locations, which
        // would have no row — and he would sit through a shift wondering why the
        // rides stopped, with nothing on screen admitting why.
        //
        // The two denials get different words on purpose. "Allow all the time"
        // is a setting he has to change in Settings rather than in a prompt, and
        // telling a captain who has ALREADY allowed location to allow location
        // sends him round in a circle looking for a switch he has flipped.
        // FIRST, and before anything optimistic. A denial here means he is not
        // going online at all, and having already flipped the screen to Standby
        // we would have to flip it back — a bounce that reads as a bug rather
        // than as a refusal.
        if (next) {
            const permission = await ensureLocationPermission()
            if (permission !== "granted") {
                setError(permission === "deniedBackground"
                    ? "Set location to \"Allow all the time\" so rides reach you while you drive"
                    : "Allow location access to go online")
                return
            }
        }

        // NOW, on the strength of the tap. This is what moves the knob, swaps the
        // screen and starts or stops the GPS — all three read the same field, so
        // all three move together and none of them waits on the network.
        patchProfile({ isOnline: next })

        // The api layer RETURNS its failures rather than throwing them — a 409
        // "finish your active ride" arrives as { error }, not as an exception.
        // The try/catch that used to be here caught nothing and let every
        // refusal through as success, leaving the switch claiming a state the
        // server had declined.
        const res = await api.setOnline(next)

        if (res?.error) {
            // Put it back. The optimism above was a claim about what the server
            // would say, and it said otherwise.
            patchProfile({ isOnline: !next })
            setError(res.error)
        }

        // NO REFRESH ON SUCCESS. /driver/online answers with the one field this
        // changes, and it agrees with what was written above — so a whole /me
        // would spend a second round trip confirming something already known.
        // That request was the reason the screen lagged the switch.
    }

    if (hidden) return null;

    if (!onHome || !canDrive) return null;

    return (
        <View className="absolute z-50 flex flex-col justify-center items-center top-10 w-[92%]">
            {/* justify-between either way: the bell holds the left edge it always
                has, and the hamburger takes the exact spot the switch vacates. So
                nothing on this row moves when a ride starts — one control is
                swapped for another in place, which reads as the same header doing
                a different job rather than as a different header. */}
            <View className="flex flex-row w-full justify-between items-center">
                <View className="flex-row items-center gap-3 rounded-full bg-[var(--background-primary)] p-3 border border-[var(--background-muted)]">
                    <Pressable
                        role="button"
                        aria-label="Notifications"
                        onPress={() => navigate("/notifications")}
                        className="w-[22px] h-[22px] items-center justify-center"
                    >
                        <Bell size={20} weight="regular" className="text-[var(--foreground)]" />
                        <View className={`absolute transition-opacity duration-200 ${onNotifications ? "opacity-100" : "opacity-0"}`}>
                            <Bell size={20} weight="fill" className="text-[var(--foreground)]" />
                        </View>
                    </Pressable>
                </View>

                {onActiveRide ? <RideMenuButton /> : (
                <View className="flex-row items-center justify-between w-fit rounded-full bg-[var(--background-primary)] p-3 px-4 pr-6 border border-[var(--background-muted)]">
                    <AppText
                        numberOfLines={1}
                        className="w-[70px] text-lg text-[var(--foreground)] font-semibold"
                    >
                        {online ? "Online" : "Offline"}
                    </AppText>

                    <Pressable
                        role="switch"
                        aria-checked={online}
                        onPress={() => toggleOnline()}
                        className="w-[50px] h-[22px] items-center justify-center"
                    >
                        <View className={`w-[50px] h-[14px] rounded-full ${online ? "bg-green-500" : "bg-gray-500"}`} />
                        <Animated.View
                            style={[
                                {
                                    position: "absolute",
                                    left: 0,
                                    width: 40,
                                    height: 22,
                                    borderRadius: 999,
                                    backgroundColor: "#fff",
                                    borderBottomWidth: 2,
                                    borderBottomColor: "rgba(255,255,255,0.05)",
                                    boxShadow:
                                        "inset 0px 2px 2px 1px rgba(255,255,255,0.4), 0px 0px 10px rgba(0,0,0,0.6)",
                                },
                                knob,
                            ]}
                        />
                    </Pressable>
                </View>
                )}
            </View>

            {/* The refusal, in the captain's line of sight. Every failure here is
                one he can act on — grant the permission, finish the ride he is
                holding, find signal — and until now none of them were rendered at
                all, so the switch simply snapped back with no explanation. */}
            {error && (
                <View className="mt-2 self-end rounded-full bg-[var(--background-primary)] px-4 py-2 border border-[var(--background-muted)]">
                    <AppText className="text-sm font-medium text-red-400">
                        {error}
                    </AppText>
                </View>
            )}

        </View>
    );
};

export default OnlineToggle;
