import { Image, Pressable, View } from 'react-native';
import { useNavigate } from 'react-router-native';
import AppText from '../AppText';

const MarketIllustration = require('../../../assets/market-illustration.webp');
const AMBER = '#F7C25B';
const AMBER_PANEL = '#F2B94F';
const INK = '#1C1B18';
const SUBTLE = '#544A3D';
const TITLE = { letterSpacing: -0.4, lineHeight: 24 };
const PANEL_WIDTH = '34%';

const MarketPromo = () => {
    const navigate = useNavigate();

    return (
        <View
            className="w-full flex-row rounded-2xl overflow-hidden"
            style={{ backgroundColor: AMBER }}
        >
            <View className="flex-1 px-5 py-4 gap-1">
                <View>
                    <AppText className="text-xl font-semibold" style={{ ...TITLE, color: INK }}>
                        Take a ride.
                    </AppText>
                    <AppText className="text-xl font-semibold" style={{ ...TITLE, color: INK }}>
                        Or pass one on.
                    </AppText>
                </View>

                <AppText className="text-sm" style={{ color: SUBTLE }}>
                    Rides captains can&apos;t make
                </AppText>

                <Pressable
                    role="button"
                    onPress={() => navigate('/available')}
                    className="self-start mt-1 rounded-full px-5 py-2 bg-[var(--background-primary)] active:opacity-80"
                >
                    <AppText className="font-semibold text-[var(--foreground)]">Open Market</AppText>
                </Pressable>
            </View>

            <View style={{ width: PANEL_WIDTH, backgroundColor: AMBER_PANEL }}>
                <Image
                    source={MarketIllustration}
                    accessibilityIgnoresInvertColors
                    alt="One captain handing car keys to another"
                    resizeMode="contain"
                    style={{ position: 'absolute', top: -5, right: 0, bottom: 0, left: 0 }}
                />
            </View>
        </View>
    );
};

export default MarketPromo;
