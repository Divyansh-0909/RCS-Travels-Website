import { cssInterop } from "nativewind";
import { BellIcon } from "phosphor-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import Animated, { useAnimatedStyle, withTiming } from "react-native-reanimated";
import { useLocation, useNavigate } from "react-router-native";
import AppText from "./AppText";
import { useApi } from "../hooks/useApi";
import { useDriver } from "../hooks/useDriver";


const Bell = cssInterop(BellIcon, {
    className: { target: false, nativeStyleToProp: { color: true } },
});

const KNOB_OFF = 20;   // web: left-5
const KNOB_ON = -8;    // web: -left-2

const TITLE_TRACKING = { letterSpacing: -0.72 };

const OnlineToggle = () => {
    const [online, setOnline] = useState(false);
    const [error, setError] = useState<string | null>(null)
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const onNotifications = pathname === "/notifications";

    // The whole header is Home's, not the shell's: going online is a decision a
    // captain makes from the ride list, and neither the wordmark nor the bell says
    // anything about Account or Post. Home is the index route, so it answers to "/".
    const onHome = pathname === "/";

    const api = useApi()
    const { profile } = useDriver();

    // "/" is the application status until he is approved, and none of this header
    // belongs on it: the switch would 403, and offering to go online is the one
    // thing that screen exists to explain he cannot do yet. The bell goes with it —
    // /notifications is behind the gate.
    const canDrive = profile?.onboarding?.canDrive ?? false;

    const knob = useAnimatedStyle(() => ({
        transform: [{
            translateX: withTiming(online && !error ? KNOB_ON : KNOB_OFF, { duration: 300 }),
        }],
    }));

    async function toggleOnline() {
        const newOnline = !online
        setOnline(newOnline)
        setError(null)
        try {
            await api.setOnline(newOnline)
        } catch (e: unknown) {
            if (e instanceof Error) {
                setError(e.message);
            } else {
                setError("Something went wrong");
            }
        }
    }

    if (!onHome || !canDrive) return null;

    return (
        <View className="absolute z-50 flex flex-col justify-center items-center top-10 w-[92%]">
            <AppText className="text-xl bg-[var(--foreground)] my-1 py-1 px-3 rounded-full text-[var(--text-foreground)] flex flex-row justify-center items-center font-semibold text-center" style={TITLE_TRACKING}>
                RCS{" "}
                <AppText className="text-[var(--text-foreground)]">
                    Travels
                </AppText>
            </AppText>
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

                <View className="flex-row items-center justify-between w-fit rounded-full bg-[var(--background-primary)] p-3 px-4 pr-6 border border-[var(--background-muted)]">
                    <AppText
                        numberOfLines={1}
                        className="w-[70px] text-lg text-[var(--foreground)] font-semibold"
                    >
                        {online && !error ? "Online" : "Offline"}
                    </AppText>

                    <Pressable
                        role="switch"
                        aria-checked={online}
                        onPress={() => toggleOnline()}
                        className="w-[50px] h-[22px] items-center justify-center"
                    >
                        <View className={`w-[50px] h-[14px] rounded-full ${online && !error ? "bg-green-500" : "bg-gray-500"}`} />
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
            </View>

        </View>
    );
};

export default OnlineToggle;
