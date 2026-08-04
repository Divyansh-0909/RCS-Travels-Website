import { View } from 'react-native';
import AppText from '../AppText';
import { UpcomingBooking } from '../../types/enums';
import { formatDateTime, rideStatusLabel, splitAddress, vehicleLabel } from '../../constants/booking';

// The website writes these as /10 and /25 suffixes on a token. There is no
// color-mix on native, so the steps are resolved by hand — same as Button.tsx.
const CARD = '#f3f3f3';                      // --foreground-muted
const INK = '#121220';                       // --background-primary
const PRIMARY = '#243AFB';
const PRIMARY_TINT = 'rgba(36,58,251,0.1)';
const PRIMARY_EDGE = 'rgba(36,58,251,0.25)';
const HAIRLINE = 'rgba(18,18,32,0.1)';

// Solid dot for pickup, ring for drop — the website's ride history marks the two
// ends the same way.
const Stop = ({ address, isDrop }: { address: string; isDrop?: boolean }) => {
    const { main, rest } = splitAddress(address);

    return (
        <View className="flex-row items-start gap-3">
            <View
                className="w-3 h-3 mt-1.5 rounded-full items-center justify-center"
                style={{ backgroundColor: isDrop ? PRIMARY : INK }}
            >
                {isDrop && <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: CARD }} />}
            </View>
            <View className="flex-1">
                <AppText numberOfLines={1} className="font-semibold text-[var(--background-primary)]">
                    {main}
                </AppText>
                {rest ? (
                    <AppText numberOfLines={1} className="text-sm text-gray-500">
                        {rest}
                    </AppText>
                ) : null}
            </View>
        </View>
    );
};

type Props = {
    booking: UpcomingBooking | null;
    variant: 'active' | 'upcoming';
};

// The active ride is the only thing on Home allowed brand blue — a tinted chip and
// a hairline edge — so which of the two panels is live reads before either is.
const RideCard = ({ booking, variant }: Props) => {
    const isActive = variant === 'active';

    if (!booking) {
        return (
            <View className="w-full rounded-2xl p-5 gap-1" style={{ backgroundColor: CARD }}>
                <AppText className="font-semibold text-[var(--background-primary)]">No ride scheduled</AppText>
                <AppText className="text-sm text-gray-500">Your next assigned ride shows up here.</AppText>
            </View>
        );
    }

    const meta = [
        booking.scheduledAt ? formatDateTime(booking.scheduledAt) : 'Immediate pickup',
        vehicleLabel(booking.vehicleClass),
        booking.sharing ? 'Sharing' : null,
        booking.isOutstation ? 'Outstation' : null,
    ].filter(Boolean).join('  •  ');

    return (
        <View
            className="w-full rounded-2xl p-5 gap-4"
            style={{
                backgroundColor: CARD,
                borderWidth: 1,
                borderColor: isActive ? PRIMARY_EDGE : 'transparent',
            }}
        >
            <View className="flex-row justify-between items-center gap-4">
                {isActive ? (
                    <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: PRIMARY_TINT }}>
                        <AppText className="text-xs font-semibold text-primary">
                            {rideStatusLabel(booking.status)}
                        </AppText>
                    </View>
                ) : (
                    <AppText className="text-sm text-gray-500">Next ride</AppText>
                )}
                <AppText className="font-semibold text-[var(--background-primary)]">₹{booking.fare}</AppText>
            </View>

            <View className="gap-3">
                <Stop address={booking.pickupAddress} />
                <Stop address={booking.dropAddress} isDrop />
            </View>

            <View className="w-full h-px" style={{ backgroundColor: HAIRLINE }} />

            <AppText numberOfLines={1} className="text-sm text-gray-500">{meta}</AppText>
        </View>
    );
};

export default RideCard;
