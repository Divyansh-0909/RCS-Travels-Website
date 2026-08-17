import { Pressable, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import AppText from './AppText';
import SuccessCheck from './ui/SuccessCheck';
import { INK_TEXT, MUTED, SURFACE } from './ui/rideUi';
import { fareBreakdown, rupees, splitAddress } from '../constants/booking';
import type { UpcomingBooking } from '../types/enums';
import { useEffect } from 'react';
import { useAppBarVisibility } from './AppBarVisibility';
import { useData } from '../hooks/useData';

export const RideCompleted = ({
    ride,
    onDone,
}: {
    ride: UpcomingBooking;
    onDone: () => void;
}) => {
    const { hidden: appBarHidden } = useAppBarVisibility();
    const setHidden = useData((state) => state.setHidden);

    useEffect(() => {
        appBarHidden.value = 1;
        setHidden(true);

        return () => {
            appBarHidden.value = 0;
            setHidden(false);
        };
    }, [appBarHidden, setHidden]);

    const fare = fareBreakdown(ride);
    const drop = splitAddress(ride.dropAddress);

    return (
        <View className="flex h-full justify-between w-full px-5 pt-18 pb-10">
            <Animated.View entering={FadeIn.duration(220)} className="items-center gap-3">
                <View className="w-20 h-20 items-center justify-center">
                    <SuccessCheck className="-mt-2" size={120} />
                </View>
                <View className='flex justify-center items-center gap-1'>
                    <AppText className={`text-2xl font-semibold ${INK_TEXT}`} style={{ letterSpacing: -0.6 }}>
                        Ride completed
                    </AppText>
                    <AppText numberOfLines={1} className={`text-sm ${MUTED}`}>
                        Dropped at {drop.main}
                    </AppText>
                </View>
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
                        className={`text-2xl font-semibold ${INK_TEXT}`}
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
