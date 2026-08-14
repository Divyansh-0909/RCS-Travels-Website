import { useEffect, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { cssInterop } from 'nativewind';
import { PhoneIcon, XIcon } from 'phosphor-react-native';
import Animated, { FadeIn, SlideInUp } from 'react-native-reanimated';
import AppText from './AppText';
import { useNoticeTop } from './AppBarVisibility';
import { INK_TEXT, MUTED, SURFACE } from './ui/rideUi';
import { ACTIVE_RIDE_STATUSES } from '../constants/booking';
import { useApi } from '../hooks/useApi';
import { useOffers } from '../hooks/useOffers';
import type { UpcomingBooking } from '../types/enums';

const asThemed = { className: { target: false, nativeStyleToProp: { color: true } } } as const;
const Phone = cssInterop(PhoneIcon, asThemed);
const Cross = cssInterop(XIcon, asThemed);

/**
 * The nudge to ring the rider, the moment a ride is taken.
 *
 * WHY IT EXISTS AT ALL. The gap between a captain accepting and a rider knowing
 * anything has happened is where cancellations come from — she is standing
 * somewhere with a phone, watching a screen that has not changed, deciding
 * whether to book something else. Thirty seconds of "I'm on my way" costs the
 * captain a tap and saves the ride. This is the one moment he is guaranteed to
 * be looking at the app, so it is the only moment worth asking.
 *
 * The number is the whole reason this waits for the accept response rather than
 * reading the offer: customerPhone is released by the accept endpoint and by
 * nothing before it.
 */

/**
 * NOT WHILE HE IS DRIVING SOMEBODY. A captain who takes a scheduled ride for
 * Tuesday while he has a rider in the car should not be told to phone a stranger
 * about it — the ride he is on is the one that needs his attention, and the call
 * can wait until he is free. `assigned` does not count as busy: a ride he holds
 * but has not set off for is exactly the case this sheet is for.
 */
const isBusyWith = (bookings: UpcomingBooking[], exceptId: string) =>
    bookings.some((b) => b.id !== exceptId && ACTIVE_RIDE_STATUSES.includes(b.status));

const RideAcceptedSheet = () => {
    const { accepted, clearAccepted } = useOffers();
    const api = useApi();
    const top = useNoticeTop();
    const [show, setShow] = useState(false);

    useEffect(() => {
        if (!accepted) {
            setShow(false);
            return;
        }

        let cancelled = false;

        (async () => {
            // Asked once, here, rather than polled: whether he is mid-trip only
            // matters at the instant a ride lands, and the answer is one request.
            const data = await api.getRides();
            if (cancelled) return;

            const bookings: UpcomingBooking[] = data?.bookings ?? [];
            // A failed read shows the sheet. Getting this wrong in that direction
            // costs him a sheet he can close; the other way loses the call the
            // whole thing exists for.
            setShow(data?.error ? true : !isBusyWith(bookings, accepted.bookingId));
        })();

        return () => { cancelled = true; };
    }, [accepted, api]);

    if (!accepted || !show) return null;

    return (
        <Animated.View
            entering={FadeIn.duration(180)}
            style={{ position: 'absolute', inset: 0, zIndex: 90 }}
        >
            {/* Tapping off it closes it, the way every sheet on a phone does. Its
                own view so the card never inherits the dim. */}
            <Pressable
                onPress={clearAccepted}
                accessibilityLabel="Close"
                style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(11,11,20,0.45)' }}
            />

            {/* At the top with every other thing the app raises on its own, and
                sliding in from the edge it is anchored to. It used to be a bottom
                sheet, which put a prompt he did not ask for directly over the
                controls he reaches for — and over the ride sheet, on the one
                screen where the next thing to press really matters. */}
            <Animated.View
                entering={SlideInUp.duration(280)}
                className="absolute left-3 right-3 rounded-3xl px-6 pt-5 pb-6 gap-1"
                style={{ top, backgroundColor: SURFACE }}
            >
                <View className="flex-row items-start justify-between">
                    <View className="w-14 h-14 rounded-full items-center justify-center bg-primary">
                        <Phone size={26} weight="fill" className="text-[var(--foreground)]" />
                    </View>
                    <Pressable
                        role="button"
                        accessibilityLabel="Close"
                        onPress={clearAccepted}
                        hitSlop={12}
                        style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
                        className="w-9 h-9 items-center justify-center rounded-full"
                    >
                        <Cross size={22} weight="bold" className={INK_TEXT} />
                    </Pressable>
                </View>

                <AppText
                    className={`text-2xl font-bold mt-4 ${INK_TEXT}`}
                    style={{ letterSpacing: -0.6 }}
                >
                    Call the rider
                </AppText>
                <AppText className={`text-base ${MUTED}`}>
                    Tell them you are on the way. A rider who has heard from you is far
                    less likely to cancel.
                </AppText>

                <View className="mt-5 flex-row items-center gap-3">
                    <View
                        className="flex-1 rounded-2xl px-4 py-3.5"
                        style={{ backgroundColor: '#f3f3f3' }}
                    >
                        <AppText className={`text-xs font-semibold uppercase ${MUTED}`}>
                            Picking up from
                        </AppText>
                        <AppText numberOfLines={1} className={`text-base font-semibold ${INK_TEXT}`}>
                            {accepted.pickup.address}
                        </AppText>
                    </View>

                    <Pressable
                        role="button"
                        accessibilityLabel={`Call ${accepted.customerPhone}`}
                        onPress={() => {
                            Linking.openURL(`tel:${accepted.customerPhone}`);
                            // Closed on the way out. He is leaving for the dialler,
                            // and coming back to the sheet that sent him there would
                            // read as the call not having happened.
                            clearAccepted();
                        }}
                        style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
                        className="w-16 h-16 rounded-full items-center justify-center bg-primary"
                    >
                        <Phone size={26} weight="fill" className="text-[var(--foreground)]" />
                    </Pressable>
                </View>

                <Pressable
                    role="button"
                    onPress={clearAccepted}
                    hitSlop={8}
                    style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                    className="self-center mt-5"
                >
                    <AppText className={`text-sm font-semibold ${MUTED}`}>
                        I&apos;ll call later
                    </AppText>
                </Pressable>
            </Animated.View>
        </Animated.View>
    );
};

export default RideAcceptedSheet;
