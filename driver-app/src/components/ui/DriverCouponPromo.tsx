import { Image, Pressable, View } from 'react-native';
import { useNavigate } from 'react-router-native';
import AppText from '../AppText';

const CouponIllustration = require('../../../assets/market-illustration.webp');
const AMBER = '#940F22';
const AMBER_PANEL = '#F2B94F';
const INK = '#ffffff';
const SUBTLE = '#c9c6c6';
const TITLE = { letterSpacing: -0.4, lineHeight: 24 };
const PANEL_WIDTH = '34%';

const DriverCouponPromo = () => {
    const navigate = useNavigate();

    return (
        <View
            className="w-full flex-row rounded-2xl overflow-hidden"
            style={{ backgroundColor: AMBER }}
        >
            <View className="flex-1 px-5 py-5 gap-1">
                <View>
                    <AppText className="text-xl font-semibold" style={{ ...TITLE, color: INK }}>
                        Complete 20 rides.
                    </AppText>
                    <AppText className="text-xl font-semibold" style={{ ...TITLE, color: INK }}>
                        Get your next 3 free.
                    </AppText>
                </View>

                <AppText className="text-sm" style={{ color: SUBTLE }}>
                    No platform commission on your next 3 eligible rides.
                </AppText>

                <Pressable
                    role="button"
                    onPress={() => navigate('/rides')}
                    className="self-start mt-1 rounded-full px-5 py-2 bg-[var(--background-primary)] active:opacity-80"
                >
                    {/* on clicking this online should be toggeled */}
                    <AppText className="font-semibold text-[var(--foreground)]">
                        Go online 
                    </AppText>
                </Pressable>
            </View>

            <View style={{ width: PANEL_WIDTH, backgroundColor: AMBER_PANEL }}>
                <Image
                    source={CouponIllustration}
                    accessibilityIgnoresInvertColors
                    alt="Driver receiving a reward coupon"
                    resizeMode="contain"
                    style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
                />
            </View>
        </View>
    );
};

export default DriverCouponPromo;