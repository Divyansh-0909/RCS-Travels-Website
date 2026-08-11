    import { HouseIcon, PlusIcon, ReceiptIcon, StorefrontIcon, UserIcon } from "phosphor-react-native";
    import { cssInterop } from "nativewind";
    import { View, Pressable, FlatList, type LayoutChangeEvent } from "react-native"
    import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
    import { useLocation, useNavigate } from "react-router-native";
    import AppText from "./AppText"
    import { HIDE, isDrillDown, useAppBarVisibility } from "./AppBarVisibility"

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


    // Was bottom-6 in the className. It is a number now because the slide has to
    // clear the gap as well as the pill, and a worklet cannot read a class.
    const BOTTOM_GAP = 24;

    // Stands in for the pill's height until the first onLayout reports the real
    // one — a py-1 row around a 48px FAB with my-1.5 on it.
    const FALLBACK_HEIGHT = 68;

    const AppBar = () => {
        const navigate = useNavigate();
        const { pathname } = useLocation();
        const { hidden } = useAppBarVisibility();

        const height = useSharedValue(FALLBACK_HEIGHT);

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
                    { position: "absolute", zIndex: 50, bottom: BOTTOM_GAP, width: "87%" },
                    slide,
                ]}
            >
                <View
                    className="flex w-full py-1 justify-center items-center h-fit rounded-full bg-[var(--background-primary)] border border-[var(--background-primary)]"
                >
                    <FlatList
                        horizontal
                        data={Data}
                        keyExtractor={(item) => item.name}
                        extraData={pathname}
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
