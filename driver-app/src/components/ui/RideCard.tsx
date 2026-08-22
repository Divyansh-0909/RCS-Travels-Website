import { Linking, Pressable, View } from 'react-native';
import { cssInterop } from 'nativewind';
import { PhoneIcon } from 'phosphor-react-native';
import AppText from '../AppText';
import { UpcomingBooking } from '../../types/enums';
import { activeLeg, initials, splitAddress } from '../../constants/booking';
import { openDriverNavigation } from '../../lib/navigation';

const Phone = cssInterop(PhoneIcon, {
    className: { target: false, nativeStyleToProp: { color: true } },
});

const ON_PRIMARY = 'rgba(255,255,255,0.2)';
const MUTED = 'text-[rgba(255,255,255,0.8)]';
const EYEBROW = `text-base font-semibold uppercase tracking-wide ${MUTED}`;

type Props = {
    booking: UpcomingBooking;
    onPress?: () => void;
};

const RideCard = ({ booking, onPress }: Props) => {
    const leg = activeLeg(booking.status);
    const address = leg.endpoint === 'drop' ? booking.dropAddress : booking.pickupAddress;
    const { main, rest } = splitAddress(address);

    // Handing the maps app an address rather than a coordinate pair: it is what the
    // list endpoint already returns, and it is the string the captain would have
    // typed anyway. Coordinates would be a second reason for /rides to widen.
    const navigate = () => {
        openDriverNavigation(address).catch(() => {});
    };

    return (
        <Pressable
            role="button"
            onPress={onPress}
            disabled={!onPress}
            style={({ pressed }) => ({ width: '100%', opacity: pressed ? 0.92 : 1 })}
        >
            <View className="w-full rounded-3xl bg-primary p-5 gap-3">
                <View className="gap-0.5">
                    <View className="flex-row items-center justify-between gap-3">
                        <AppText className={EYEBROW}>{leg.label}</AppText>
                        <AppText className={`text-xl font-semibold ${MUTED}`}>
                            ₹{booking.fare}
                        </AppText>
                    </View>
                    <AppText numberOfLines={1} className="text-3xl font-semibold tracking-[-0.6px] text-white">
                        {main}
                    </AppText>
                    {rest ? (
                        <AppText numberOfLines={1} className={`text-sm ${MUTED}`}>{rest}</AppText>
                    ) : null}
                </View>
                <View className="flex-row items-center gap-2 border border-[rgba(255,255,255,0.2)] p-3 rounded-2xl">
                    <View
                        className="w-12 h-12 rounded-full items-center justify-center"
                        style={{ backgroundColor: ON_PRIMARY }}
                    >
                        <AppText className="text-xl font-semibold text-white">
                            {initials(booking.user?.name ?? null)}
                        </AppText>
                    </View>
                    <AppText numberOfLines={1} className="flex-1 text-xl font-semibold text-white">
                        {booking.user?.name ?? 'Rider'}
                    </AppText>
                    <Pressable
                        role="button"
                        aria-label={`Call ${booking.user?.name ?? 'the rider'}`}
                        onPress={() => Linking.openURL(`tel:${booking.customerPhone}`)}
                        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                    >
                        <View
                            className="w-12 h-12 rounded-xl items-center justify-center"
                            style={{ backgroundColor: ON_PRIMARY }}
                        >
                            <Phone size={22} weight="fill" className="text-[var(--foreground)]" />
                        </View>
                    </Pressable>
                </View>

                <Pressable
                    role="button"
                    onPress={navigate}
                    style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
                >
                    <View className="w-full rounded-2xl bg-[var(--background-primary)] py-3.5 items-center">
                        <AppText className="text-base font-semibold text-[var(--foreground)]">Navigate</AppText>
                    </View>
                </Pressable>
            </View>
        </Pressable>
    );
};

export default RideCard;
