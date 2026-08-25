import { useEffect, useState } from 'react';
import { AppState, Linking, Pressable, View } from 'react-native';
import { cssInterop } from 'nativewind';
import { NavigationArrowIcon, PhoneIcon } from 'phosphor-react-native';
import * as Location from 'expo-location';
import { openDriverNavigation } from '../lib/navigation';
import { splitAddress, activeLeg, initials, rupees } from '../constants/booking';
import { useNavigate } from 'react-router-native';
import AppText from '../components/AppText';
import { OtpEntry } from '../components/OtpEntry';
import { BottomSheet } from '../components/ui/BottomSheet';
import MapSlot from '../components/ui/MapSlot';
import { SlideAction } from '../components/ui/SlideAction';
import { INK_TEXT, MUTED, RouteLeg, SURFACE } from '../components/ui/rideUi';
import { useData } from '../hooks/useData';

import { useApi } from '../hooks/useApi';
import { useDriver } from '../hooks/useDriver';
import type { UpcomingBooking } from '../types/enums';
import { getRememberedDriverLocation, rememberDriverLocation } from '../lib/driverLocationCache';

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

const DROP_OVERRIDE_REASONS = [
    { value: 'customer_requested_early_drop', label: 'Customer requested an earlier drop' },
    { value: 'drop_inaccessible', label: 'Booked drop is inaccessible' },
    { value: 'road_or_security_restriction', label: 'Road or security restriction' },
    { value: 'incorrect_drop_pin', label: 'Drop pin is incorrect' },
] as const;

const PICKUP_RADIUS_KM = 0.5;
const DROP_SUPPORT_RADIUS_KM = 2;
const MAX_FIX_ACCURACY_M = 100;
const MAX_FIX_AGE_MS = 30_000;

const distanceKmBetween = (from: { latitude: number; longitude: number }, to: { lat: number; lng: number }) => {
    const rad = (degrees: number) => degrees * Math.PI / 180;
    const dLat = rad(to.lat - from.latitude);
    const dLng = rad(to.lng - from.longitude);
    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(rad(from.latitude)) * Math.cos(rad(to.lat)) * Math.sin(dLng / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(a));
};

const distanceLabel = (km: number) => km < 1 ? `${Math.round(km * 1000)} m away` : `${km.toFixed(1)} km away`;

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
    const [dropOverrideOpen, setDropOverrideOpen] = useState(false);
    const [dropOverrideReason, setDropOverrideReason] = useState<string | null>(null);
    const [dropOtpOpen, setDropOtpOpen] = useState(false);
    const [liveFix, setLiveFix] = useState<Location.LocationObject | null>(getRememberedDriverLocation);
    const [mapBottomInset, setMapBottomInset] = useState(PEEK + BOTTOM_SAFE);
    const [locationIssue, setLocationIssue] = useState<string | null>(null);
    const [locationClock, setLocationClock] = useState(() => Date.now());

    useEffect(() => {
        const timer = setInterval(() => setLocationClock(Date.now()), 5_000);
        return () => clearInterval(timer);
    }, []);

    // Keep the action state in step with the car rather than waiting for a
    // rejected swipe. The server repeats every check, so this is guidance and
    // immediate feedback—not the authority for changing ride state.
    useEffect(() => {
        let subscription: Location.LocationSubscription | null = null;
        let stopped = false;

        const acceptFix = (fix: Location.LocationObject) => {
            if (stopped) return;
            rememberDriverLocation(fix);
            setLiveFix((current) => !current || fix.timestamp >= current.timestamp ? fix : current);
            setLocationIssue(null);
        };

        const readCachedFix = async () => {
            const cached = await Location.getLastKnownPositionAsync({
                maxAge: 60_000,
                requiredAccuracy: 200,
            }).catch(() => null);
            if (cached) acceptFix(cached);
        };

        const appStateSubscription = AppState.addEventListener('change', (state) => {
            // Foreground watchers pause behind Google Maps. Android's native
            // last-known fix is updated by our background service, so read that
            // immediately instead of waiting for the watcher to wake itself.
            if (state === 'active') void readCachedFix();
        });

        const watch = async () => {
            const permission = await Location.getForegroundPermissionsAsync().catch(() => null);
            if (!permission?.granted) {
                if (!stopped) setLocationIssue('Enable location to continue');
                return;
            }
            if (stopped) return;

            // `getCurrentPositionAsync` can take several seconds after Android
            // resumes us. Paint the service's recent native fix first so the
            // map never waits at a default camera while a fresher fix resolves.
            await readCachedFix();
            if (stopped) return;

            const initial = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).catch(() => null);
            if (initial) acceptFix(initial);
            else if (!stopped) setLocationIssue('Waiting for an accurate GPS fix…');
            if (stopped) return;
            subscription = await Location.watchPositionAsync({
                accuracy: Location.Accuracy.High,
                timeInterval: 5_000,
                distanceInterval: 10,
            }, (fix) => {
                acceptFix(fix);
            }).catch(() => null);
        };
        watch();
        return () => {
            stopped = true;
            appStateSubscription.remove();
            subscription?.remove();
        };
    }, []);
    useEffect(() => {
        if (ride.status === 'reached') {
            setOtpOpen(true);
        }
    }, [ride.status]);

    const leg = activeLeg(ride.status);
    // Which end the navigation button aims at. Exact booked coordinates avoid
    // asking Google Maps to geocode the customer's address a second time.
    const navigationDestination = leg.endpoint === 'drop'
        ? { lat: ride.dropLat, lng: ride.dropLng }
        : { lat: ride.pickupLat, lng: ride.pickupLng };
    const navigationWaypoint = leg.endpoint === 'drop'
        && ride.preferSafeRoute
        && ride.safeWaypointLat != null
        && ride.safeWaypointLng != null
        ? { lat: ride.safeWaypointLat, lng: ride.safeWaypointLng }
        : null;
    const step = STEP[ride.status];

    // The rider hands over a code to start the ride, and only then. It is her
    // bookingCode; the server compares it and refuses with 403 rather than
    // telling the app what it should have been.
    const needsOtp = ride.status === 'reached';

    const geofenceAction = (() => {
        if (!step || !['reached', 'started', 'completed'].includes(step.to)) return { disabled: false, hint: undefined };
        if (!liveFix) return {
            disabled: true,
            hint: `Geofence unavailable · ${locationIssue ?? 'Waiting for GPS…'}`,
        };
        if ((liveFix.coords.accuracy ?? Infinity) > MAX_FIX_ACCURACY_M)
            return { disabled: true, hint: 'Geofence unavailable · Improve GPS accuracy' };
        if (locationClock - liveFix.timestamp > MAX_FIX_AGE_MS)
            return { disabled: true, hint: 'Geofence unavailable · Refreshing location…' };

        const target = step.to === 'completed'
            ? { lat: ride.dropLat, lng: ride.dropLng }
            : { lat: ride.pickupLat, lng: ride.pickupLng };
        const distance = distanceKmBetween(liveFix.coords, target);
        if (step.to !== 'completed' && distance > PICKUP_RADIUS_KM)
            return { disabled: true, hint: `Outside pickup geofence · ${distanceLabel(distance)}` };
        if (step.to === 'completed' && distance > DROP_SUPPORT_RADIUS_KM)
            return { disabled: true, hint: `Outside drop geofence · ${distanceLabel(distance)}` };
        return { disabled: false, hint: undefined };
    })();

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
        openDriverNavigation(navigationDestination, navigationWaypoint)
            .catch(() => setError('Google Maps could not be opened.'));
    };

    const place = ride ? splitAddress(ride.pickupAddress) : null;

    const advance = async (otp?: string, overrideReason?: string) => {
        if (!step) return;
        setError(null);

        // Sent when there is one to send. The server measures it against the
        // pickup or the drop and stores the distance — the record of whether he
        // was actually there when he said so. The server requires this evidence
        // for arrival, start and completion and rejects missing or mocked fixes.
        const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).catch(() => null);
        const where = fix
            ? {
                lat: fix.coords.latitude,
                lng: fix.coords.longitude,
                accuracy: fix.coords.accuracy ?? 10_000,
                capturedAt: Math.round(fix.timestamp),
                mocked: Boolean((fix as Location.LocationObject & { mocked?: boolean }).mocked),
            }
            : {};

        const result = await api.setRideStatus(ride.id, step.to, {
            ...where,
            ...(otp ? { otp } : {}),
            ...(overrideReason ? { completionOverrideReason: overrideReason } : {}),
        });

        if (result?.error) {
            setError(result.error);
            if (result.code === 'DROP_CONFIRMATION_REQUIRED') setDropOverrideOpen(true);
            return;
        }

        // Only once the server has taken it. A wrong code comes back 403 and the
        // screen has to stay up with the message on it, not close as though it
        // had worked.
        setOtpOpen(false);
        setDropOtpOpen(false);
        setDropOverrideOpen(false);
        setDropOverrideReason(null);
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
            <MapSlot
                pickup={{ latitude: ride.pickupLat, longitude: ride.pickupLng }}
                drop={{ latitude: ride.dropLat, longitude: ride.dropLng }}
                driver={liveFix ? { latitude: liveFix.coords.latitude, longitude: liveFix.coords.longitude } : null}
                bottomSheetHeight={mapBottomInset}
                carType={ride.vehicleClass}
                routePolyline={ride.routePolyline}
                cameraMode="fit-route"
            />

            {/* No tab-bar clearance here — the shell hides the bar and the scrim
                for the length of a ride (useShellHidden), so the only thing under
                the sheet is the gesture area. */}
            <BottomSheet
                peek={PEEK}
                bottomInset={BOTTOM_SAFE}
                above={above}
                onHeightChange={setMapBottomInset}
            >
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
                            disabled={geofenceAction.disabled}
                            disabledHint={geofenceAction.hint}
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

            {dropOverrideOpen ? (
                <View
                    style={{ position: 'absolute', inset: 0, zIndex: 94, backgroundColor: 'rgba(0,0,0,0.45)' }}
                    className="justify-end"
                >
                    <View className="rounded-t-3xl px-5 pt-5 pb-8 gap-3" style={{ backgroundColor: SURFACE }}>
                        <AppText className={`text-xl font-bold ${INK_TEXT}`}>Confirm a different drop</AppText>
                        <AppText className={`text-sm ${MUTED}`}>
                            You are outside the normal drop area. Choose the reason, then ask the rider for their OTP.
                        </AppText>
                        {DROP_OVERRIDE_REASONS.map((reason) => (
                            <Pressable
                                key={reason.value}
                                role="button"
                                onPress={() => {
                                    setError(null);
                                    setDropOverrideReason(reason.value);
                                    setDropOverrideOpen(false);
                                    setDropOtpOpen(true);
                                }}
                                style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}
                            >
                                <View className="rounded-2xl bg-[var(--foreground-muted)] px-4 py-3">
                                    <AppText className={`text-base font-semibold ${INK_TEXT}`}>{reason.label}</AppText>
                                </View>
                            </Pressable>
                        ))}
                        <Pressable
                            role="button"
                            onPress={() => { setDropOverrideOpen(false); setError(null); }}
                            className="items-center py-3"
                        >
                            <AppText className={`text-base font-semibold ${INK_TEXT}`}>Back</AppText>
                        </Pressable>
                    </View>
                </View>
            ) : null}

            {dropOtpOpen && dropOverrideReason ? (
                <OtpEntry
                    riderName={ride.user?.name ?? null}
                    error={error}
                    title="Confirm this drop"
                    description="Ask the rider for their 4-digit code to confirm finishing away from the booked drop."
                    submitLabel="Confirm and finish ride"
                    onSubmit={(code) => advance(code, dropOverrideReason)}
                    onClose={() => { setError(null); setDropOtpOpen(false); setDropOverrideReason(null); }}
                />
            ) : null}
        </View>
    );
};

export default ActiveRide;
