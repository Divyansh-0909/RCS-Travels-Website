import { Image, Pressable, View } from "react-native";
import { useNavigate } from "react-router-native";
import AppText from "../components/AppText";

const backgroundIllustration = require("../../assets/app-mobile.webp");

const SCRIMBOTTOM = "linear-gradient(to top, #0B0B14 5%, #121220 15%, rgba(18,18,32,0) 40%)";

const TITLE_TRACKING = { letterSpacing: -0.72 };

const text = "Don't have an account yet?"

const heading = "Ready To Take The Captain's Seat?"

const OnBoarding = () => {
    const navigate = useNavigate();

    return (
        <View className="relative flex-1 w-full h-full  overflow-hidden items-center justify-between bg-[var(--background-primary)]">
            <Image
                source={backgroundIllustration}
                accessibilityIgnoresInvertColors
                alt="background-illustration"
                resizeMode="cover"
                className="absolute left-0 right-0 -top-20 w-full h-full"
            />

            <View
                className="absolute left-0 right-0 top-0 bottom-0"
                style={{ experimental_backgroundImage: SCRIMBOTTOM }}
            />

            <View className="w-full max-w-[500px] h-full py-12 justify-between items-center gap-1">
                <View className="w-full items-center gap-3 mb-4">
                    <AppText className="text-xl bg-[var(--foreground)] my-3 py-2 px-3 rounded-full text-[var(--text-foreground)] flex flex-row justify-center items-center font-semibold text-center" style={TITLE_TRACKING}>
                        RCS{" "}
                        <AppText className="text-[var(--text-foreground)]">
                            Travels
                        </AppText>
                    </AppText>
                    <View className="flex justify-center items-left gap-2 w-[85%] h-fit">
                        <AppText className="text-4xl text-black font-semibold text-left" style={TITLE_TRACKING}>
                            {heading}
                        </AppText>
                        <AppText className="text-lg text-left text-black">
                            Every ride and handoff tracked. No diary, no phone chains, no chasing your pay.
                        </AppText>
                    </View>
                </View>

                <View className="w-full max-w-[500px] justify-end items-center gap-2">
                    <Pressable
                        role="button"
                        onPress={() => navigate("/login")}
                        className="w-[82%] my-1 py-3 rounded-xl bg-primary items-center justify-center active:opacity-80"
                    >
                        <AppText className="text-base font-semibold">Access your account</AppText>
                    </Pressable>

                    <AppText className="text-base text-[var(--text-muted)]">
                        {text}{" "}
                        <AppText
                            onPress={() => navigate("/signup")}
                            className="font-semibold text-[var(--text)]"
                        >
                            Sign Up
                        </AppText>
                    </AppText>
                </View>
            </View>
        </View>
    );
};

export default OnBoarding;
