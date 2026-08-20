import { Pressable, View } from 'react-native';
import { cssInterop } from 'nativewind';
import { XIcon } from 'phosphor-react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import AppText from './AppText';
import { INK_TEXT, MUTED, PAGE, SURFACE } from './ui/rideUi';
import { rupees, splitAddress } from '../constants/booking';
import type { UpcomingBooking } from '../types/enums';

const Cross = cssInterop(XIcon, {
    className: { target: false, nativeStyleToProp: { color: true } },
});

/**
 * The rider called it off, and the captain is told where he stands.
 *
 * AT THE BOTTOM, unlike the offer card and the call prompt. Those are things to
 * answer, and they go to the top where they cannot be missed. This is the
 * opposite: nothing is being asked of him, the ride is already gone from his
 * screen, and the only job left is to say what happened and whether there is
 * money in it. A dismissible notice over the board he has just been returned to
 * is the right weight for that.
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

    return (
        <Animated.View
            entering={FadeIn.duration(160)}
            style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 85 }}
        >
            <Animated.View
                entering={SlideInDown.duration(260)}
                className="rounded-t-3xl px-5 pt-4 pb-8 gap-3"
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
        </Animated.View>
    );
};
