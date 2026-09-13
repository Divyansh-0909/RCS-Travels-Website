
import { driverCopy as dc } from "../lib/copy";
import { useAuth } from "@clerk/clerk-expo";
import { Image, Pressable, View } from "react-native";
import { useNavigate } from "react-router-native";
import AppText from "../components/AppText";
import { useLanguage } from '../i18n';

const backgroundIllustration = require("../../assets/app-mobile.webp");

const SCRIMBOTTOM = "linear-gradient(to top, #0B0B14 5%, #121220 15%, rgba(18,18,32,0) 40%)";

const TITLE_TRACKING = { letterSpacing: -0.72 };

const OnBoarding = () => {

    const navigate = useNavigate();
    const { t } = useLanguage();
    const { isSignedIn, signOut } = useAuth();

    const openLogin = async () => {
        if (isSignedIn) {
            await signOut();
        }
        navigate("/login", { replace: true });
    };

    return (
        <View className="relative flex-1 w-full h-full  overflow-hidden items-center justify-between bg-[var(--background-primary)]">
            <Image
                source={backgroundIllustration}
                accessibilityIgnoresInvertColors
                alt={dc("background-illustration")}
                resizeMode="cover"
                className="absolute left-0 right-0 -top-20 w-full h-full"
            />

            <View
                className="absolute left-0 right-0 top-0 bottom-0"
                style={{ experimental_backgroundImage: SCRIMBOTTOM }}
            />

            <View className="w-full max-w-[500px] h-full py-9 justify-between items-center gap-1">
                <View className="w-full items-center gap-3 mb-4">
                    <AppText className="text-xl bg-surface my-3 py-2 px-3 rounded-full text-ink flex flex-row justify-center items-center font-semibold text-center" style={TITLE_TRACKING}>
                        RCS{"  "}
                        <AppText className="text-[var(--text-foreground)]">
                            captains
                        </AppText>
                    </AppText>
                    <View className="flex justify-center items-left gap-2 w-[85%] h-fit">
                        <AppText className="text-4xl text-black font-semibold text-left" style={TITLE_TRACKING}>
                            {t('driver.onboarding.title')}
                        </AppText>
                        <AppText className="text-lg text-left text-black">
                            {t('driver.onboarding.body')}
                        </AppText>
                    </View>
                </View>

                <View className="w-full max-w-[500px] justify-end items-center gap-2">
                    <Pressable
                        role="button"
                        onPress={openLogin}
                        className="w-[82%] my-1 py-3 rounded-xl bg-primary items-center justify-center active:opacity-80"
                    >
                        <AppText className="text-base font-semibold">{t('driver.onboarding.access')}</AppText>
                    </Pressable>

                    <AppText className="text-sm text-[var(--text-muted)]">
                        {t('driver.onboarding.noAccount')}{" "}
                        <AppText
                            onPress={() => navigate("/signup")}
                            className="font-semibold text-[var(--text)]"
                        >
                            {t('driver.onboarding.signUp')}
                        </AppText>
                    </AppText>
                </View>
            </View>
        </View>
    );
};

export default OnBoarding;
