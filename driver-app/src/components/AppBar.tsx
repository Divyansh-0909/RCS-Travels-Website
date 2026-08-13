    import { HouseIcon, PlusIcon, ReceiptIcon, StorefrontIcon, UserIcon } from "phosphor-react-native";
    import { cssInterop } from "nativewind";
    import { View, Pressable, FlatList, type LayoutChangeEvent } from "react-native"
    import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
    import { useLocation, useNavigate } from "react-router-native";
    import AppText from "./AppText"
    import { HIDE, isDrillDown, useAppBarVisibility } from "./AppBarVisibility"
    import { useDriver } from "../hooks/useDriver"

    const asThemed = { className: { target: false, nativeStyleToProp: { color: true } } } as const;

    const HomeIcon = cssInterop(HouseIcon, asThemed);
    const RidesIcon = cssInterop(ReceiptIcon, asThemed);
    const PostIcon = cssInterop(PlusIcon, asThemed);
    const MarketIcon = cssInterop(StorefrontIcon, asThemed);
    const ProfileIcon = cssInterop(UserIcon, asThemed);

    type Tab = { name: string; path: string; Icon: typeof HomeIcon };

    const Data: Tab[] = [
        { name: "Home", path: "/", Icon: HomeIcon },
        { name: "Market", path: "/available", Icon: MarketIcon },
        { name: "Post", path: "/post", Icon: PostIcon },
        { name: "Rides", path: "/rides", Icon: RidesIcon },
        { name: "Account", path: "/account", Icon: ProfileIcon },
    ]


    // The bar an unapproved captain gets. Market, Post and Rides all 403 at the
    // server until his documents are approved, so a tab that opens a screen with
    // nothing in it — or bounces him straight back — is worse than no tab. What is
    // left is the two screens that can move him forward: Home, which is his
    // application status while he waits, and Account, which is where the documents
    // themselves live.
    //
    // Names rather than a second array, so a tab added to Data above cannot quietly
    // appear here as well.
    const ONBOARDING_TABS = ["Home", "Account"];

    // Was bottom-6 in the className. It is a number now because the slide has to
    // clear the gap as well as the pill, and a worklet cannot read a class.
    const BOTTOM_GAP = 24;

    // A py-1 row around a 48px FAB with my-1.5 on it. Two jobs:
    //
    // It stands in for the pill's height until the first onLayout reports the real
    // one, and it is the floor the pill is held to. The FAB is the tallest thing in
    // the bar by a distance — every other tab is a 22px icon over a label — so with
    // Post filtered out the pill would close up to about 50 and the bar would change
    // shape, not just width, the moment a captain was approved. A floor rather than a
    // fixed height, so the five-tab bar is still measured rather than asserted.
    const BAR_HEIGHT = 68;

    const AppBar = () => {
        const navigate = useNavigate();
        const { pathname } = useLocation();
        const { hidden } = useAppBarVisibility();
        const { profile } = useDriver();

        const height = useSharedValue(BAR_HEIGHT);

        // Absent a profile the bar assumes not-approved. It is the safer of the two
        // guesses: a captain who is approved sees three tabs appear a moment later,
        // where the other way round he taps Post on the strength of a bar drawn
        // before the answer arrived.
        const canDrive = profile?.onboarding?.canDrive ?? false;
        const tabs = canDrive ? Data : Data.filter((tab) => ONBOARDING_TABS.includes(tab.name));

        // The pill shrinks to its contents; the tabs inside it do not grow to fill it.
        // Two 14vw tabs and a gap come to 28vw, and 38% leaves them the same ~5vw of
        // shoulder either side that the five-tab bar has — so the short bar reads as
        // the same object with fewer things in it, rather than as a different one.
        const barWidth = canDrive ? "87%" : "38%";

        // Off the bottom edge rather than under a fade alone: the bar is opaque
        // and sits over the list, so anything short of leaving the screen would
        // still be a hole in the content it is meant to hand back.
        const slide = useAnimatedStyle(() => ({
            transform: [{ translateY: withTiming(hidden.value * (height.value + BOTTOM_GAP), HIDE) }],
            opacity: withTiming(1 - hidden.value, HIDE),
        }));

        // Below every hook on purpose, the way OnlineToggle does it: the shared value
        // and the animated style have to be created on every render this component has,
        // or the hook order changes the first time a captain opens a ride.
        if (isDrillDown(pathname)) return null;

        return (
            <Animated.View
                pointerEvents="box-none"
                onLayout={(event: LayoutChangeEvent) => {
                    height.value = event.nativeEvent.layout.height;
                }}
                style={[
                    { position: "absolute", zIndex: 50, bottom: BOTTOM_GAP, width: barWidth },
                    slide,
                ]}
            >
                <View
                    className="flex w-full py-1 justify-center items-center h-fit rounded-full bg-[var(--background-primary)] border border-[var(--background-primary)]"
                    style={{ minHeight: BAR_HEIGHT }}
                >
                    <FlatList
                        horizontal
                        data={tabs}
                        keyExtractor={(item) => item.name}
                        extraData={`${pathname}:${canDrive}`}
                        contentContainerClassName="gap-1.5"
                        renderItem={({ item }) => {
                            const isPost = item.name === "Post";
                            const isSelected = !isPost && pathname === item.path;

                            return (
                                <Pressable
                                    onPress={() => navigate(item.path, { replace: true })}
                                    className={`flex gap-1 items-center justify-center ${isPost ? "bg-[var(--foreground)] w-12 h-12 my-1.5 rounded-full mx-1" : "w-[14vw]"}`}>
                                    {isPost ? (
                                        <item.Icon size={24} weight="bold" className="text-[var(--background-primary)]" />
                                    ) : (
                                        <View className="w-[22px] h-[22px] items-center justify-center">
                                            <item.Icon size={20} weight="regular" className="text-[var(--text-muted)]" />
                                            <View className={`absolute transition-opacity duration-200 ${isSelected ? "opacity-100" : "opacity-0"}`}>
                                                <item.Icon size={20} weight="fill" className="text-[var(--foreground)]" />
                                            </View>
                                        </View>
                                    )}
                                    {!isPost && (
                                        <AppText className={`${isSelected ? "text-[var(--foreground)]" : "text-[var(--text-muted)]" } transition-colors duration-200 text-xs font-semibold`}>
                                            {item.name}
                                        </AppText>
                                    )}
                                </Pressable>
                            );
                        }}
                    />
                </View>
            </Animated.View>
        )
    }

    export default AppBar
