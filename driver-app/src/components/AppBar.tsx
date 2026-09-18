import { useLanguage as useCopyLanguage } from "../i18n";
import { themeColors } from "../theme/colors";
    import { useEffect } from "react";
    import { View, Pressable, type LayoutChangeEvent } from "react-native"
    import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
    import { useLocation, useNavigate } from "react-router-native";
    import AppText from "./AppText"
    import { HIDE, useAppBarVisibility, useShellHidden } from "./AppBarVisibility"
    import { tabsFor } from "./ui/tabs"
    import { useDriver } from "../hooks/useDriver"

    // The list and the permission rule both live in ui/tabs now, because the side
    // menu that replaces this bar during a ride draws the same destinations from
    // the same gate. See the note there.

    // Was bottom-6 in the className. It is a number now because the slide has to
    // clear the gap as well as the pill, and a worklet cannot read a class.
    const BOTTOM_GAP = 24;

    // Stands in for the pill's height until the first onLayout reports the real one,
    // keeping the hide animation stable on the first frame. The measured height still
    // wins after layout, so this remains a floor rather than a fixed height.
    const BAR_HEIGHT = 60;
    const TAB_MOTION_DURATION = 180;
    const TAB_EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);

    const AppBar = () => {
    useCopyLanguage();
        const navigate = useNavigate();
        const { pathname } = useLocation();
        const { hidden } = useAppBarVisibility();
        const { hidden: shellHidden } = useShellHidden();
        const { profile } = useDriver();
        const reducedMotion = useReducedMotion();

        const height = useSharedValue(BAR_HEIGHT);
        const tabTrackWidth = useSharedValue(0);

        // Absent a profile the bar assumes not-approved. It is the safer of the two
        // guesses: an approved captain can gain the gated destinations after profile
        // data arrives, without briefly exposing routes he may not be allowed to use.
        const canDrive = profile?.onboarding?.canDrive ?? false;
        // Same safer guess as canDrive: absent a profile, assume he owes nothing.
        const owesRides = (profile?.onboarding?.assignedRides ?? 0) > 0;

        const tabs = tabsFor(canDrive, owesRides);
        const tabCount = tabs.length;
        const selectedIndex = Math.max(tabs.findIndex((tab) => tab.path === pathname), 0);
        const tabProgress = useSharedValue(selectedIndex);

        // Each destination is 20vw wide. With Post removed, the approved bar has four
        // destinations (80vw total), so 85% leaves compact side padding instead of the
        // empty space that the old five-item width reserved.
        const barWidth = canDrive ? "85%" : owesRides ? "64%" : "46%";

        useEffect(() => {
            if (reducedMotion) {
                tabProgress.set(selectedIndex);
                return;
            }

            tabProgress.set(withTiming(selectedIndex, {
                duration: TAB_MOTION_DURATION,
                easing: TAB_EASE_IN_OUT,
            }));
        }, [reducedMotion, selectedIndex, tabProgress]);

        const tabIndicatorStyle = useAnimatedStyle(() => {
            const tabWidth = tabCount > 0 ? tabTrackWidth.get() / tabCount : 0;
            return {
                width: tabWidth,
                opacity: tabWidth > 0 ? 1 : 0,
                transform: [{ translateX: tabProgress.get() * tabWidth }],
            };
        });

        // Off the bottom edge rather than under a fade alone: the bar is opaque
        // and sits over the list, so anything short of leaving the screen would
        // still be a hole in the content it is meant to hand back.
        const slide = useAnimatedStyle(() => ({
            transform: [{ translateY: withTiming(hidden.get() * (height.get() + BOTTOM_GAP), HIDE) }],
            opacity: withTiming(1 - hidden.get(), HIDE),
        }));

        // Below every hook on purpose, the way OnlineToggle does it: the shared value
        // and the animated style have to be created on every render this component has,
        // or the hook order changes the first time a captain opens a ride.
        //
        // Gone entirely on an active ride, not just slid down: the slide is the
        // scroll behaviour and it comes back on the next upward drag. This is the
        // shell standing aside for the duration.
        if (shellHidden) return null;

        return (
            <Animated.View
                pointerEvents="box-none"
                onLayout={(event: LayoutChangeEvent) => {
                    height.set(event.nativeEvent.layout.height);
                }}
                style={[
                    { position: "absolute", zIndex: 50, bottom: BOTTOM_GAP, width: barWidth },
                    slide,
                ]}
            >
                <View
                    className="flex w-full py-1.5 px-1.5 justify-center items-center h-fit rounded-full bg-strong"
                    style={{
                        minHeight: BAR_HEIGHT,
                        borderWidth: 1,
                        borderColor: themeColors.dark.surfaceMuted,
                    }}
                >
                    <View
                        className="relative w-full flex-row items-center"
                        onLayout={(event) => tabTrackWidth.set(event.nativeEvent.layout.width)}
                    >
                        <Animated.View
                            pointerEvents="none"
                            className="absolute left-0 top-0 bottom-0 rounded-full"
                            style={[
                                { backgroundColor: themeColors.dark.surface },
                                tabIndicatorStyle,
                            ]}
                        />
                        {tabs.map((item) => {
                            const isSelected = pathname === item.path;

                            return (
                                <Pressable
                                    key={item.name}
                                    role="button"
                                    aria-label={item.name}
                                    onPress={() => navigate(item.path, { replace: true })}
                                    className="relative z-10 flex-1 gap-0 items-center justify-center h-13 rounded-full"
                                >
                                    <View className="w-[20px] h-[22px] items-center justify-center">
                                        <item.Icon size={22} weight="regular" className="text-ink-muted" />
                                        <View className={`absolute ${isSelected ? "opacity-100" : "opacity-0"}`}>
                                            <item.Icon size={22} weight="fill" className="text-on-strong" />
                                        </View>
                                    </View>
                                    <AppText className={`${isSelected ? "text-on-strong" : "text-ink-muted" } text-xs font-semibold`}>
                                        {item.name}
                                    </AppText>
                                </Pressable>
                            );
                        })}
                    </View>
                </View>
            </Animated.View>
        )
    }

    export default AppBar

