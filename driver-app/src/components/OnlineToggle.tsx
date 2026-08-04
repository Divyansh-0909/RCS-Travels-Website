import { cssInterop } from "nativewind";
import { BellIcon } from "phosphor-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import Animated, { useAnimatedStyle, withTiming } from "react-native-reanimated";
import { useLocation, useNavigate } from "react-router-native";
import AppText from "./AppText";
import { useApi } from "../hooks/useApi";


const Bell = cssInterop(BellIcon, {
    className: { target: false, nativeStyleToProp: { color: true } },
});

const KNOB_OFF = 20;   // web: left-5
const KNOB_ON = -8;    // web: -left-2

const OnlineToggle = () => {
    const [online, setOnline] = useState(false);
    const [error, setError] = useState<string | null>(null)
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const onNotifications = pathname === "/notifications";

    const api = useApi()

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

    return (
        <View className="absolute flex flex-col justify-center items-center top-10 w-[92%]">
            <View className="flex flex-row gap-1 justify-center my-3 items-center">
                <AppText className="text-[var(--background-primary)] font-semibold text-xl">RCS</AppText>
                <AppText className="text-[var(--background-primary)] text-xl">Captains</AppText>
            </View>
            <View className="flex flex-row w-full justify-between items-center">
                <View className="flex-row items-center gap-3 rounded-2xl bg-[var(--background-primary)] p-3 border border-[var(--background-muted)]">
                    <Pressable
                        role="button"
                        aria-label="Notifications"
                        onPress={() => navigate("/notifications")}
                        className="w-[22px] h-[22px] items-center justify-center"
                    >
                        <Bell size={22} weight="regular" className="text-[var(--foreground)]" />
                        <View className={`absolute transition-opacity duration-200 ${onNotifications ? "opacity-100" : "opacity-0"}`}>
                            <Bell size={22} weight="fill" className="text-[var(--foreground)]" />
                        </View>
                    </Pressable>
                </View>

                <View className="flex-row items-center justify-between w-fit rounded-2xl bg-[var(--background-primary)] p-3 px-4 pr-6 border border-[var(--background-muted)]">
                    <AppText
                        numberOfLines={1}
                        className="w-[74px] text-xl text-[var(--foreground)] font-semibold"
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
