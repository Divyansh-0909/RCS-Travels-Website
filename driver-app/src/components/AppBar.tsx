import { House, Plus, Route, Store, User } from "lucide-react-native";
import { cssInterop } from "nativewind";
import { View, FlatList } from "react-native"
import AppText from "./AppText"

const asThemed = { className: { target: false, nativeStyleToProp: { color: true } } } as const;

const HomeIcon = cssInterop(House, asThemed);
const RidesIcon = cssInterop(Route, asThemed);
const PostIcon = cssInterop(Plus, asThemed);
const MarketIcon = cssInterop(Store, asThemed);
const ProfileIcon = cssInterop(User, asThemed);

const Data = [
    { name: "Home", Icon: HomeIcon },
    { name: "My Rides", Icon: RidesIcon },
    { name: "Post", Icon: PostIcon },
    { name: "Market Place", Icon: MarketIcon },
    { name: "Profile", Icon: ProfileIcon },
]


const AppBar = () => {

    return (
        <View className="absolute flex px-3 py-1 justify-center items-center bottom-10 h-fit rounded-full w-[90%] bg-[var(--foreground)] border-1 border-[var(--background))]">
            <FlatList
                horizontal
                data={Data}
                contentContainerClassName="gap-4"
                renderItem={({ item }) => {
                    const isPost = item.name === "Post";

                    return (
                        <View className={`flex items-center justify-center ${isPost ? "bg-[var(--background)] w-14 h-14 rounded-full" : "w-fit"}`}>
                            <item.Icon
                                size={isPost ? 24 : 20}
                                className={isPost ? "text-[var(--foreground)]" : "text-[var(--background)]"}
                            />
                            {!isPost && (
                                <AppText className="text-[var(--background)] text-xs">
                                    {item.name}
                                </AppText>
                            )}
                        </View>
                    );
                }}
            />

        </View>
    )
}

export default AppBar
