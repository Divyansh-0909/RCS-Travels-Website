    import { House, Plus, Receipt, Storefront, User } from "phosphor-react-native";
    import { cssInterop } from "nativewind";
    import { View, Pressable, FlatList } from "react-native"
    import { useLocation, useNavigate } from "react-router-native";
    import AppText from "./AppText"

    const asThemed = { className: { target: false, nativeStyleToProp: { color: true } } } as const;

    const HomeIcon = cssInterop(House, asThemed);
    const RidesIcon = cssInterop(Receipt, asThemed);
    const PostIcon = cssInterop(Plus, asThemed);
    const MarketIcon = cssInterop(Storefront, asThemed);
    const ProfileIcon = cssInterop(User, asThemed);

    type Tab = { name: string; path: string; Icon: typeof HomeIcon };

    const Data: Tab[] = [
        { name: "Home", path: "/", Icon: HomeIcon },
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
                className="absolute flex py-1 justify-center items-center bottom-10 h-fit rounded-2xl w-[92%] bg-[var(--background)] border border-[var(--background)]"
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
                                <item.Icon
                                    size={isPost ? 24 : 22}
                                    weight={isPost ? "bold" : isSelected ? "fill" : "regular"}
                                    className={isPost ? "text-[var(--background)]" : 'text-[var(--foreground)]'}
                                />
                                {!isPost && (
                                    <AppText className={`text-[var(--foreground)] text-sm font-semibold`}>
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
