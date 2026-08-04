    import { HouseIcon, PlusIcon, ReceiptIcon, StorefrontIcon, UserIcon } from "phosphor-react-native";
    import { cssInterop } from "nativewind";
    import { View, Pressable, FlatList } from "react-native"
    import { useLocation, useNavigate } from "react-router-native";
    import AppText from "./AppText"

    const asThemed = { className: { target: false, nativeStyleToProp: { color: true } } } as const;

    const HomeIcon = cssInterop(HouseIcon, asThemed);
    const RidesIcon = cssInterop(ReceiptIcon, asThemed);
    const PostIcon = cssInterop(PlusIcon, asThemed);
    const MarketIcon = cssInterop(StorefrontIcon, asThemed);
    const ProfileIcon = cssInterop(UserIcon, asThemed);

    type Tab = { name: string; path: string; Icon: typeof HomeIcon };

    const Data: Tab[] = [
        { name: "Home", path: "/home", Icon: HomeIcon },
        { name: "Rides", path: "/rides", Icon: RidesIcon },
        { name: "Post", path: "/post", Icon: PostIcon },
        { name: "Market", path: "/available", Icon: MarketIcon },
        { name: "Account", path: "/account", Icon: ProfileIcon },
    ]


    const AppBar = () => {
        const navigate = useNavigate();
        const { pathname } = useLocation();

        return (
            <View
                className="absolute flex py-1 justify-center items-center bottom-10 h-fit rounded-2xl w-[92%] bg-[var(--background-primary)] border border-[var(--background-primary)]"
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
                                className={`flex gap-1 items-center justify-center ${isPost ? "bg-[var(--foreground)] w-14 h-14 my-2 rounded-full mx-1" : "w-[16vw]"}`}>
                                {isPost ? (
                                    <item.Icon size={24} weight="bold" className="text-[var(--background-primary)]" />
                                ) : (
                                    // Two glyphs stacked, outline under fill. weight is a prop on
                                    // the SVG, not a style, so it cannot tween — fading the fill
                                    // layer in over the outline is what turns the swap into a
                                    // transition instead of a pop.
                                    <View className="w-[22px] h-[22px] items-center justify-center">
                                        <item.Icon size={22} weight="regular" className="text-[var(--text-muted)]" />
                                        <View className={`absolute transition-opacity duration-200 ${isSelected ? "opacity-100" : "opacity-0"}`}>
                                            <item.Icon size={22} weight="fill" className="text-[var(--foreground)]" />
                                        </View>
                                    </View>
                                )}
                                {!isPost && (
                                    <AppText className={`${isSelected ? "text-[var(--foreground)]" : "text-[var(--text-muted)]" } transition-colors duration-200 text-sm font-semibold`}>
                                        {item.name}
                                    </AppText>
                                )}
                            </Pressable>
                        );
                    }}
                />

            </View>
        )
    }

    export default AppBar
