import { Pressable, View } from 'react-native';
import { cssInterop } from 'nativewind';
import { XIcon } from 'phosphor-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import AppText from './AppText';
import { useNoticeTop } from './AppBarVisibility';
import { INK_TEXT, MUTED, PAGE, SURFACE } from './ui/rideUi';
import { rupees, splitAddress } from '../constants/booking';
import type { UpcomingBooking } from '../types/enums';

const Cross = cssInterop(XIcon, {
    className: { target: false, nativeStyleToProp: { color: true } },
});

/**
 * The rider called it off, and the captain is told where he stands.
 *
 * It uses the same top notice rail and card shell as a new-ride offer. A ride
 * disappearing is just as important to notice quickly, and keeping unbidden
 * notices at the top leaves the captain's bottom controls unobstructed.
 *
 * THE FIGURE IS THE SERVER'S, never recomputed here. cancellationCharge is
 * written onto the booking at the moment it is cancelled
 * (routes/bookings.js), so it is the amount actually charged rather than this
 * screen's opinion of the rule — and the rule has moved before.
 */
export const RideCancelled = ({
    ride,
    onDismiss,
}: {
    ride: UpcomingBooking;
    onDismiss: () => void;
}) => {
    const charge = ride.cancellationCharge ?? 0;
    const pickup = splitAddress(ride.pickupAddress);
    const top = useNoticeTop();

    return (
        <View
            pointerEvents="box-none"
            style={{ position: 'absolute', left: 0, right: 0, top, zIndex: 85, alignItems: 'center' }}
        >
            <Animated.View
                entering={FadeInDown.duration(220)}
                className="w-[92%] rounded-2xl p-4 gap-3"
                style={{ backgroundColor: SURFACE }}
            >
                <View className="flex-row items-start justify-between gap-3">
                    <View className="flex-1 gap-0.5">
                        <AppText className={`text-lg font-bold ${INK_TEXT}`} style={{ letterSpacing: -0.4 }}>
                            {ride.cancelledBy === 'user' ? 'Rider cancelled' : 'Ride cancelled'}
                        </AppText>
                        <AppText numberOfLines={1} className={`text-sm ${MUTED}`}>
                            {pickup.main} · {ride.reference}
                        </AppText>
                    </View>
                    <Pressable
                        role="button"
                        accessibilityLabel="Dismiss"
                        onPress={onDismiss}
                        hitSlop={12}
                        style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
                    >
                        <View className="w-9 h-9 items-center justify-center rounded-full" style={{ backgroundColor: PAGE }}>
                            <Cross size={20} weight="bold" className={INK_TEXT} />
                        </View>
                    </Pressable>
                </View>

                {/* Only when there is one. A cancellation before he arrived carries
                    no charge at all, and printing "₹0" invites him to wonder what
                    he did wrong. */}
                {charge > 0 ? (
                    <View className="rounded-2xl px-4 py-3 gap-0.5" style={{ backgroundColor: PAGE }}>
                        <AppText className={`text-xs font-semibold uppercase tracking-wide ${MUTED}`}>
                            Your compensation
                        </AppText>
                        <AppText className={`text-2xl font-bold ${INK_TEXT}`} style={{ letterSpacing: -0.5 }}>
                            {rupees(charge)}
                        </AppText>
                        <AppText className={`text-xs ${MUTED}`}>
                            Credited from the rider&apos;s advance because this was a late cancellation.
                        </AppText>
                    </View>
                ) : (
                    <AppText className={`text-sm ${MUTED}`}>
                        Nothing is owed on this one. You&apos;re back online for new rides.
                    </AppText>
                )}
            </Animated.View>
        </View>
    );
};
