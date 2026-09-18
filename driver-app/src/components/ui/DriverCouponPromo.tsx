import { useLanguage as useCopyLanguage } from "../../i18n";
import { driverCopy as dc } from "../../lib/copy";
import { Image, View } from 'react-native';
import { memo } from 'react';
import AppText from '../AppText';
import { useDriver } from '../../hooks/useDriver';

const CouponIllustration = require('../../../assets/market-illustration.webp');
const AMBER = '#940F22';
const AMBER_PANEL = '#F2B94F';
const INK = '#ffffff';
const SUBTLE = '#c9c6c6';
const TITLE = { letterSpacing: -0.4, lineHeight: 24 };
const PANEL_WIDTH = '34%';

const DriverCouponPromo = memo(function DriverCouponPromo() {
    useCopyLanguage();
    const { profile } = useDriver();
    const completedRides = profile?.completedRides ?? 0;
    const rewards = profile?.commissionFreeRidesRemaining ?? 0;
    const progress = completedRides % 20;

    return (
        <View
            className="w-full flex-row rounded-2xl overflow-hidden"
            style={{ backgroundColor: AMBER }}
        >
            <View className="flex-1 px-5 py-5 gap-1">
                <View>
                    <AppText className="text-xl font-semibold" style={{ ...TITLE, color: INK }}>{rewards > 0 ? `${rewards} fee free rides available.` : `${progress}/20 rides completed.`}</AppText>
                    <AppText className="text-xl font-semibold" style={{ ...TITLE, color: INK }}>{rewards > 0 ? 'Drive more to unlock the next reward.' : 'No service fee on next 3 rides.'}</AppText>
                </View>

                <AppText className="text-sm" style={{ color: SUBTLE }}>{dc("Keep driving to unlock your reward.")}</AppText>
            </View>

            <View style={{ width: PANEL_WIDTH, backgroundColor: AMBER_PANEL }}>
                <Image
                    source={CouponIllustration}
                    accessibilityIgnoresInvertColors
                    alt={dc("Driver receiving a reward coupon")}
                    resizeMode="contain"
                    style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
                />
            </View>
        </View>
    );
});

export default DriverCouponPromo;
