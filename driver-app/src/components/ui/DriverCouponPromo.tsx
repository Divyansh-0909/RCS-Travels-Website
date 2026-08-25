import { Image, Pressable, View } from 'react-native';
import { useState } from 'react';
import AppText from '../AppText';
import { useApi } from '../../hooks/useApi';
import { useDriver } from '../../hooks/useDriver';
import { ensureLocationPermission } from '../../hooks/useDriverLocation';

const CouponIllustration = require('../../../assets/market-illustration.webp');
const AMBER = '#940F22';
const AMBER_PANEL = '#F2B94F';
const INK = '#ffffff';
const SUBTLE = '#c9c6c6';
const TITLE = { letterSpacing: -0.4, lineHeight: 24 };
const PANEL_WIDTH = '34%';

const DriverCouponPromo = () => {
    const api = useApi();
    const { patchProfile } = useDriver();
    const [goingOnline, setGoingOnline] = useState(false);

    const goOnline = async () => {
        if (goingOnline) return;
        setGoingOnline(true);

        try {
            // Match the header toggle's guard: the driver must be locatable before
            // dispatch can mark them available for rides.
            if (await ensureLocationPermission() !== 'granted') return;

            const result = await api.setOnline(true);

            if (!result?.error) patchProfile({ isOnline: true, dispatchReady: false });
        } catch {
            patchProfile({ isOnline: false, dispatchReady: false });
        } finally {
            setGoingOnline(false);
        }
    };

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
                        No service fee on next 3 rides.
                    </AppText>
                </View>

                <AppText className="text-sm" style={{ color: SUBTLE }}>
                    Keep driving to unlock your reward.
                </AppText>
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
