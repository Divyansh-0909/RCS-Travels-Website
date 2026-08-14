import { useState } from 'react';
import { Linking, Pressable, TextInput, View } from 'react-native';
import { cssInterop } from 'nativewind';
import { NavigationArrowIcon, PhoneIcon } from 'phosphor-react-native';
import * as Location from 'expo-location';
import AppText from '../components/AppText';
import { BottomSheet } from '../components/ui/BottomSheet';
import MapSlot from '../components/ui/MapSlot';
import { SlideAction } from '../components/ui/SlideAction';
import { INK_TEXT, MUTED } from '../components/ui/rideUi';
import { activeLeg, initials, rupees, splitAddress } from '../constants/booking';
import { useApi } from '../hooks/useApi';
import { useDriver } from '../hooks/useDriver';
import type { UpcomingBooking } from '../types/enums';

const asThemed = { className: { target: false, nativeStyleToProp: { color: true } } } as const;
const Phone = cssInterop(PhoneIcon, asThemed);
const NavArrow = cssInterop(NavigationArrowIcon, asThemed);

/**
 * The ride he is out on: the map, and the one thing to do next.
 *
 * The shell takes itself apart for this screen (see useShellHidden) — no tab
 * bar, no scrim, no online switch — so what is left is a map, the leg he is
 * driving, and a single slide. That is the whole design: a captain reads this at
 * a red light, and every control that is not the next step is a control that
 * costs him a glance.
 */

/**
 * What each status is waiting for him to do. `assigned` is absent on purpose —
 * a ride he has not set off for is Standby's business, and it is Standby's "Go
 * to pickup" that moves it to en_route and lands him here.
 */
const STEP: Record<string, { to: string; label: string }> = {
    en_route: { to: 'reached', label: 'Slide when you arrive' },
    reached: { to: 'started', label: 'Slide to start the ride' },
    started: { to: 'completed', label: 'Slide to finish the ride' },
};

const OTP_LENGTH = 4;

// Enough to keep the slider clear of the gesture bar at the bottom edge. There is
// no tab bar on this screen to clear — the shell hides it for the ride.
const BOTTOM_SAFE = 24;

// What survives being pushed down: the leg and the address, which is the one
// thing worth glancing at while the map has the rest of the screen.
const PEEK = 124;

const ActiveRide = ({ ride, onChanged }: { ride: UpcomingBooking; onChanged: () => void }) => {
    const api = useApi();
    const { refresh: refreshDriver } = useDriver();
    const [otp, setOtp] = useState('');
    const [error, setError] = useState<string | null>(null);

    const leg = activeLeg(ride.status);
    const address = leg.endpoint === 'drop' ? ride.dropAddress : ride.pickupAddress;
    const { main, rest } = splitAddress(address);
    const step = STEP[ride.status];

    // The rider hands over a code to start the ride, and only then. It is her
    // bookingCode; the server compares it and refuses with 403 rather than
    // telling the app what it should have been.
    const needsOtp = ride.status === 'reached';

    const openMaps = () => {
        const destination = encodeURIComponent(address);
        // The same universal URL RideCard uses, and an address rather than
        // coordinates for the same reason: it is what /rides already returns.
        Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`);
    };

    const advance = async () => {
        if (!step) return;
        setError(null);

        // Sent when there is one to send. The server measures it against the
        // pickup or the drop and stores the distance — the record of whether he
        // was actually there when he said so. A captain with no fix yet still
        // gets to move his ride along; this is evidence, not a gate.
        const fix = await Location.getLastKnownPositionAsync().catch(() => null);
        const where = fix
            ? { lat: fix.coords.latitude, lng: fix.coords.longitude }
            : {};

        const result = await api.setRideStatus(ride.id, step.to, {
            ...where,
            ...(needsOtp ? { otp } : {}),
        });

        if (result?.error) {
            setError(result.error);
            return;
        }

        setOtp('');
        // The ride list drives this screen; the profile drives whether the shell
        // is hidden and how often the GPS reports. Finishing a ride has to move
        // both, or he is left on a stripped-down screen with no ride on it.
        await Promise.all([onChanged(), refreshDriver()]);
    };

    return (
        <View style={{ flex: 1, width: '100%' }}>
            <MapSlot />

            {/* No tab-bar clearance here — the shell hides the bar and the scrim
                for the length of a ride (useShellHidden), so the only thing under
                the sheet is the gesture area. */}
            <BottomSheet peek={PEEK} bottomInset={BOTTOM_SAFE}>
              <View className="px-5 pb-2 gap-4">
                <View className="gap-0.5">
                    <View className="flex-row items-center justify-between gap-3">
                        <AppText className={`text-xs font-semibold uppercase tracking-wide ${MUTED}`}>
                            {leg.label}
                        </AppText>
                        <AppText className={`text-base font-semibold ${INK_TEXT}`}>
                            {rupees(ride.fare)}
                        </AppText>
                    </View>
                    <AppText numberOfLines={1} className={`text-2xl font-bold ${INK_TEXT}`} style={{ letterSpacing: -0.5 }}>
                        {main}
                    </AppText>
                    {rest ? (
                        <AppText numberOfLines={2} className={`text-sm ${MUTED}`}>{rest}</AppText>
                    ) : null}
                </View>

                <View className="flex-row items-center gap-3">
                    <View className="w-11 h-11 rounded-full items-center justify-center" style={{ backgroundColor: '#f3f3f3' }}>
                        <AppText className={`text-base font-semibold ${INK_TEXT}`}>
                            {initials(ride.user?.name ?? null)}
                        </AppText>
                    </View>
                    <AppText numberOfLines={1} className={`flex-1 text-base font-semibold ${INK_TEXT}`}>
                        {ride.user?.name ?? 'Rider'}
                    </AppText>
                    {/* The style function and className never share a Pressable —
                        NativeWind folds `style` into its own computation and drops
                        a function, so the press feedback would silently do nothing.
                        Same split RideCard uses: the function on the Pressable, the
                        looks on a View inside it. */}
                    <Pressable
                        role="button"
                        aria-label={`Call ${ride.user?.name ?? 'the rider'}`}
                        onPress={() => Linking.openURL(`tel:${ride.customerPhone}`)}
                        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                    >
                        <View className="w-11 h-11 rounded-xl items-center justify-center bg-primary">
                            <Phone size={20} weight="fill" className="text-[var(--foreground)]" />
                        </View>
                    </Pressable>
                </View>

                <Pressable
                    role="button"
                    onPress={openMaps}
                    style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
                >
                    <View
                        className="w-full flex-row items-center justify-center gap-2 rounded-2xl py-3.5"
                        style={{ backgroundColor: '#f3f3f3' }}
                    >
                        <NavArrow size={18} weight="fill" className={INK_TEXT} />
                        <AppText className={`text-base font-semibold ${INK_TEXT}`}>
                            {leg.endpoint === 'drop' ? 'Go to drop' : 'Go to pickup'}
                        </AppText>
                    </View>
                </Pressable>

                {needsOtp ? (
                    <View className="gap-1.5">
                        <AppText className={`text-xs font-semibold uppercase tracking-wide ${MUTED}`}>
                            Ask the rider for their code
                        </AppText>
                        <TextInput
                            value={otp}
                            onChangeText={(text) => setOtp(text.replace(/\D/g, '').slice(0, OTP_LENGTH))}
                            keyboardType="number-pad"
                            maxLength={OTP_LENGTH}
                            placeholder="0000"
                            placeholderTextColor="#9a9aa5"
                            className="w-full rounded-2xl px-4 py-3 text-2xl font-semibold text-center"
                            style={{ backgroundColor: '#f3f3f3', color: '#121220', letterSpacing: 8 }}
                        />
                    </View>
                ) : null}

                {error ? (
                    <AppText className="text-sm font-medium text-red-600">{error}</AppText>
                ) : null}

                {step ? (
                    <SlideAction
                        label={step.label}
                        onConfirm={advance}
                        // Grey with a reason on it rather than a dead control: the
                        // captain can see he is one thing short, and what.
                        disabled={needsOtp && otp.length < OTP_LENGTH}
                        disabledHint="Enter the rider's code"
                    />
                ) : null}
              </View>
            </BottomSheet>
        </View>
    );
};

export default ActiveRide;
