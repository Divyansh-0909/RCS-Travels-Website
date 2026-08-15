import { useEffect, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { cssInterop } from 'nativewind';
import { NavigationArrowIcon, PhoneIcon } from 'phosphor-react-native';
import * as Location from 'expo-location';
import { splitAddress, activeLeg, initials, rupees } from '../constants/booking';
import { useNavigate } from 'react-router-native';
import AppText from '../components/AppText';
import { OtpEntry } from '../components/OtpEntry';
import { BottomSheet } from '../components/ui/BottomSheet';
import MapSlot from '../components/ui/MapSlot';
import { SlideAction } from '../components/ui/SlideAction';
import { INK_TEXT, MUTED, RouteLeg } from '../components/ui/rideUi';
import { useData } from '../hooks/useData';

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

// Enough to keep the slider clear of the gesture bar at the bottom edge. There is
// no tab bar on this screen to clear — the shell hides it for the ride.
const BOTTOM_SAFE = 24;

// What survives being pushed down: the leg label and BOTH route legs, which is
// the whole route rather than half of it. Raised from 124 when the single
// address became a proper two-ended route — at the old height the drop would
// have been cut through the middle, which is worse than not showing it.
const PEEK = 172;

const ActiveRide = ({ ride, onChanged }: { ride: UpcomingBooking; onChanged: () => void }) => {
    const navigate = useNavigate()
    const api = useApi();
    const { refresh: refreshDriver } = useDriver();
    const [error, setError] = useState<string | null>(null);

    // The code screen opens ITSELF the moment he marks himself arrived, because
    // that is the next thing that happens in the world — he pulls up, the rider
    // walks over, and the code is the only thing standing between them and
    // moving. Closeable, though: he may arrive before she does, and a screen he
    // cannot get out of while he waits is a screen he will come to resent. The
    // slider on the sheet brings it back.
    const [otpOpen, setOtpOpen] = useState(false);
    useEffect(() => {
        if (ride.status === 'reached') {
            setOtpOpen(true);
        }
    }, [ride.status]);

    const leg = activeLeg(ride.status);
    // Which end the navigation button aims at — the only place the active leg
    // still narrows the route down to one address.
    const address = leg.endpoint === 'drop' ? ride.dropAddress : ride.pickupAddress;
    const step = STEP[ride.status];

    // The rider hands over a code to start the ride, and only then. It is her
    // bookingCode; the server compares it and refuses with 403 rather than
    // telling the app what it should have been.
    const needsOtp = ride.status === 'reached';

    // Mirrors DRIVER_CANCELLABLE_STATUSES on the server. Both `assigned` and
    // `en_route` count, so a scheduled ride he has taken but not set off for can
    // be handed back the same way as one he is already driving to.
    const canCancel = ride.status === 'assigned' || ride.status === 'en_route';
    const [cancelling, setCancelling] = useState(false);

    const cancelRide = async () => {
        if (cancelling) return;
        setCancelling(true);
        setError(null);
        try {
            const result = await api.cancelRide(ride.id);
            if (result?.error) { setError(result.error); return; }
            // Both, for the same reason advance() moves both: the list drives this
            // screen and the profile drives the shell and the GPS cadence.
            await Promise.all([onChanged(), refreshDriver()]);
        } finally {
            setCancelling(false);
        }
    };

    const openMaps = () => {
        const destination = encodeURIComponent(address);
        // The same universal URL RideCard uses, and an address rather than
        // coordinates for the same reason: it is what /rides already returns.
        Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`);
    };

    const place = ride ? splitAddress(ride.pickupAddress) : null;

    const advance = async (otp?: string) => {
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
            ...(otp ? { otp } : {}),
        });

        if (result?.error) {
            setError(result.error);
            return;
        }

        // Only once the server has taken it. A wrong code comes back 403 and the
        // screen has to stay up with the message on it, not close as though it
        // had worked.
        setOtpOpen(false);
        // The ride list drives this screen; the profile drives whether the shell
        // is hidden and how often the GPS reports. Finishing a ride has to move
        // both, or he is left on a stripped-down screen with no ride on it.
        await Promise.all([onChanged(), refreshDriver()]);
    };

    const above = (
        <Pressable
            className='mb-4 flex items-center justify-center'
            role="button"
            onPress={openMaps}
            style={({ pressed }) => ({
                position: 'absolute',
                left: 16,
                right: 16,
                top: -64,
                opacity: pressed ? 0.85 : 1,
            })}
        >
            <View className="w-[90%] flex-row items-center justify-center gap-2 rounded-full py-3.5 bg-[var(--background-primary)]">
                <NavArrow
                    size={18}
                    weight="fill"
                    className="text-[var(--foreground)]"
                />
                <AppText className="text-base font-semibold text-[var(--foreground)]">
                    {leg.endpoint === 'drop' ? 'Go to drop' : 'Go to pickup'}
                </AppText>
            </View>
        </Pressable>
    )

    return (
        <View style={{ flex: 1, width: '100%' }}>
            <MapSlot />

            {/* No tab-bar clearance here — the shell hides the bar and the scrim
                for the length of a ride (useShellHidden), so the only thing under
                the sheet is the gesture area. */}
            <BottomSheet peek={PEEK} bottomInset={BOTTOM_SAFE} above={above}>
                <View className="px-5 pb-2 gap-1 mt-2">
                    <View className="flex-row items-center justify-between gap-3">
                        <AppText className={`text-xs font-semibold uppercase tracking-wide ${MUTED}`}>
                            {leg.label}
                        </AppText>
                    </View>

                    {/* BOTH ENDS, drawn by the same RouteLeg the ride detail and the
                    offer card use. This screen used to print only the leg being
                    driven, as a bare heading with no dot and no counterpart — the
                    one place in the app where a route did not look like a route,
                    and it read as broken next to every other screen. A captain
                    also wants the drop while he is still driving to the pickup:
                    it is how he knows what he has taken on.

                    Which leg he is ON is still said, by the label above and by
                    where the navigation button sends him. */}
                    <View className="gap-0.5">
                        <AppText numberOfLines={1} className={`text-xl font-semibold ${INK_TEXT}`} style={{ letterSpacing: -0.4 }}>
                            {place?.main}
                        </AppText>
                        {place?.rest ? (
                            <AppText numberOfLines={1} className={`text-sm ${MUTED}`}>{place.rest}</AppText>
                        ) : null}

                        <View className='flex flex-row w-full my-2.5 h-fit justify-between items-center'>
                            <Pressable
                                className='w-[49%]'
                                role="button"
                                onPress={() => navigate(`/rides/${ride.id}`)}
                                style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
                            >
                                <View className="flex-row items-center justify-center gap-2 rounded-xl p-3 bg-[var(--foreground-muted)]">
                                    <AppText className="text-base font-semibold text-[var(--background-primary)]">
                                        Ride details
                                    </AppText>
                                </View>
                            </Pressable>

                            <Pressable
                                className='w-[49%]'
                                role="button"
                                aria-label={`Call ${ride.user?.name ?? 'the rider'}`}
                                onPress={() => Linking.openURL(`tel:${ride.customerPhone}`)}
                                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                            >
                                <View className="rounded-xl w-full flex flex-row gap-2 p-3 items-center justify-center bg-[var(--foreground-muted)]">
                                    <Phone size={20} weight="fill" className="text-[var(--background-primary)]" />
                                    <AppText className='text-base font-semibold text-[var(--background-primary)]'>Call Rider</AppText>
                                </View>
                            </Pressable>
                        </View>
                    </View>

                    {error && !otpOpen ? (
                        <AppText className="text-sm font-medium text-red-600">{error}</AppText>
                    ) : null}

                    {step ? (
                        <SlideAction
                            label={step.label}
                            // At `reached` this opens the code screen rather than
                            // sending anything — the code is collected there and the
                            // slide that starts the ride lives on it.
                            onConfirm={needsOtp ? () => setOtpOpen(true) : () => advance()}
                        />
                    ) : null}

                </View>
            </BottomSheet>

            {otpOpen && needsOtp ? (
                <OtpEntry
                    riderName={ride.user?.name ?? null}
                    error={error}
                    onSubmit={(code) => {advance(code);}}
                    onClose={() => { setError(null); setOtpOpen(false);}}
                />
            ) : null}
        </View>
    );
};

export default ActiveRide;
