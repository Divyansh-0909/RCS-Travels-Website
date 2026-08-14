import { Pressable, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import AppText from './AppText';
import CheckMarkOutline from './illustrations/CheckMarkOutline';
import { INK_TEXT, MUTED, SURFACE } from './ui/rideUi';
import { fareBreakdown, rupees, splitAddress } from '../constants/booking';
import type { UpcomingBooking } from '../types/enums';

/**
 * The end of a ride, and the only screen in the flow with nothing to do on it.
 *
 * IT EXISTS FOR THE MONEY, not for the tick. A captain finishing a trip wants
 * one thing answered — what did I make on that — and until now the ride simply
 * vanished off his screen and he had to go find it in his history to know. The
 * tick is there because the rider gets one at the same moment and the two screens
 * should agree about what just happened.
 *
 * fareBreakdown is the captain's version: the rider's stops at the fare, his
 * carries on through the provider's cut to what actually reaches him, because
 * that is the only figure here he can act on.
 */

// Bottom clearance. The shell has already put the tab bar back by the time this
// renders — the ride is over, so activeRide is null and useShellHidden no longer
// hides anything.
const BAR_CLEARANCE = 132;

export const RideCompleted = ({
    ride,
    onDone,
}: {
    ride: UpcomingBooking;
    onDone: () => void;
}) => {
    const fare = fareBreakdown(ride);
    const drop = splitAddress(ride.dropAddress);

    return (
        <View className="flex-1 w-[92%]" style={{ paddingTop: 24, paddingBottom: BAR_CLEARANCE }}>
            <Animated.View entering={FadeIn.duration(220)} className="items-center gap-3">
                <View className="w-20 h-20 rounded-full items-center justify-center bg-primary">
                    {/* Delayed a beat so the circle lands before the stroke draws,
                        which is how the rider's screen sequences the same mark. */}
                    <CheckMarkOutline size={44} strokeWidth={5} delay={140} />
                </View>
                <AppText className={`text-2xl font-bold ${INK_TEXT}`} style={{ letterSpacing: -0.6 }}>
                    Ride completed
                </AppText>
                <AppText numberOfLines={1} className={`text-sm ${MUTED}`}>
                    Dropped at {drop.main}
                </AppText>
            </Animated.View>

            <Animated.View
                entering={FadeInDown.duration(280).delay(160)}
                className="w-full rounded-3xl p-5 mt-8 gap-3"
                style={{ backgroundColor: SURFACE }}
            >
                {fare.lines.map((line) => (
                    <View key={line.label} className="flex-row items-start justify-between gap-3">
                        <View className="flex-1">
                            <AppText className={`text-base ${INK_TEXT}`}>{line.label}</AppText>
                            {line.note ? (
                                <AppText className={`text-xs ${MUTED}`}>{line.note}</AppText>
                            ) : null}
                        </View>
                        {/* tabular-nums so the column of figures lines up on the
                            decimal rather than drifting with the glyph widths. */}
                        <AppText
                            className={`text-base font-semibold ${INK_TEXT}`}
                            style={{ fontVariant: ['tabular-nums'] }}
                        >
                            {rupees(line.amount)}
                        </AppText>
                    </View>
                ))}

                <View className="h-px w-full my-1" style={{ backgroundColor: 'rgba(18,18,32,0.1)' }} />

                <View className="flex-row items-center justify-between gap-3">
                    <AppText className={`text-base font-semibold ${INK_TEXT}`}>
                        {fare.totalLabel}
                    </AppText>
                    <AppText
                        className={`text-2xl font-bold ${INK_TEXT}`}
                        style={{ letterSpacing: -0.5, fontVariant: ['tabular-nums'] }}
                    >
                        {rupees(fare.total)}
                    </AppText>
                </View>
            </Animated.View>

            <Animated.View entering={FadeInDown.duration(280).delay(260)} className="mt-auto">
                {/* The style function stays off the Pressable's className — see the
                    note in rideUi: NativeWind folds `style` into its own
                    computation and drops a function, so the press feedback would
                    silently do nothing. */}
                <Pressable
                    role="button"
                    onPress={onDone}
                    style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
                >
                    <View className="w-full rounded-2xl py-4 items-center bg-[var(--background-primary)]">
                        <AppText className="text-base font-semibold text-[var(--foreground)]">
                            Done
                        </AppText>
                    </View>
                </Pressable>
                <AppText className={`text-xs text-center mt-3 ${MUTED}`}>
                    {ride.reference}
                </AppText>
            </Animated.View>
        </View>
    );
};
