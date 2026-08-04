import { View } from "react-native";
import AppText from "../components/AppText";

const Notifications = () => {
    return (
        <View className="w-[92%] flex flex-col justify-center items-center">
            <AppText className="text-[var(--background-primary)] text-xl font-semibold">Notifications</AppText>
            <AppText className="text-[var(--background-primary)]">Nothing here yet.</AppText>
        </View>
    )
}

export default Notifications
