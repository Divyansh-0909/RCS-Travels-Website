import { useEffect, useState } from 'react';
import { AppState, Pressable, View } from 'react-native';
import * as Location from 'expo-location';
import { openDriverNavigation } from '../lib/navigation';
import { cssInterop } from 'nativewind';
import { useNavigate } from 'react-router-native';
import { NavigationArrowIcon } from 'phosphor-react-native';
import AppText from '../components/AppText';
import { BottomSheet } from '../components/ui/BottomSheet';
import MapSlot from '../components/ui/MapSlot';
import { INK_TEXT, MUTED } from '../components/ui/rideUi';
import { clockParts, dayBucket, splitAddress } from '../constants/booking';
import { useApi } from '../hooks/useApi';
import { useDriver } from '../hooks/useDriver';
import type { UpcomingBooking } from '../types/enums';
import { getRememberedDriverLocation, rememberDriverLocation } from '../lib/driverLocationCache';

const NavArrow = cssInterop(NavigationArrowIcon, {
    className: { target: false, nativeStyleToProp: { color: true } },
});

/**
 * Online, with nothing to drive yet.
 *
 * THE PANEL IS NOT JUST A NOTICE. It carries the ride he holds but has not set
 * off for, and the button that starts it — which is what makes `en_route`
 * reachable at all. Tapping it opens navigation AND moves the ride, so the
 * status is set as a side effect of the thing he was going to do anyway rather
 * than as a piece of admin he has to remember. Once it lands, activeRide turns
 * up on the profile and HomeGate swaps this screen for ActiveRide.
 *
 * The bar stays here, unlike on the ride screen: he is between jobs and Rides,
 * Market and Account are all reasonable places to be going.
 */

// The tab bar sits at bottom 24 and runs ~68 tall (AppBar.tsx), so its top edge
// is at 92. This keeps the sheet's own content above that line — the bar floats
// over blank sheet instead of over the button he is reaching for.
const APPBAR_CLEARANCE = 104;

// What stays on screen once he pushes the sheet down: the eyebrow and the
// pickup, which is the answer to "what is next" and the reason to look at all.
const PEEK = 116;

const whenLabel = (scheduledAt: string | null) => {
    if (!scheduledAt) return 'NOW';
    const { clock, meridiem } = clockParts(scheduledAt);
    return `${dayBucket(new Date(scheduledAt))} • ${clock} ${meridiem}`;
};

const Standby = ({ next, onChanged }: { next: UpcomingBooking | null; onChanged: () => void }) => {
    const api = useApi();
    const { refresh: refreshDriver } = useDriver();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [liveFix, setLiveFix] = useState<Location.LocationObject | null>(getRememberedDriverLocation);
    const [mapBottomInset, setMapBottomInset] = useState(PEEK + APPBAR_CLEARANCE);
    const navigate = useNavigate();

    useEffect(() => {
        let subscription: Location.LocationSubscription | null = null;
        let stopped = false;

        const acceptFix = (fix: Location.LocationObject) => {
            if (stopped) return;
            rememberDriverLocation(fix);
            setLiveFix((current) => !current || fix.timestamp >= current.timestamp ? fix : current);
        };

        const readCachedFix = async () => {
            const cached = await Location.getLastKnownPositionAsync({
                maxAge: 60_000,
                requiredAccuracy: 200,
            }).catch(() => null);
            if (cached) acceptFix(cached);
        };

        const appStateSubscription = AppState.addEventListener('change', (state) => {
            if (state === 'active') void readCachedFix();
        });

        const locate = async () => {
            const permission = await Location.getForegroundPermissionsAsync().catch(() => null);
            if (!permission?.granted || stopped) return;

            // Returning from another tab remounts Home, but a foreground watcher
            // is not guaranteed to emit until Android produces its next fix. Use
            // the service's recent cached position to centre the map immediately,
            // then let the fresh fix and watcher replace it normally.
            await readCachedFix();
            if (stopped) return;

            subscription = await Location.watchPositionAsync({
                accuracy: Location.Accuracy.Balanced,
                timeInterval: 10_000,
                distanceInterval: 20,
            }, (fix) => {
                acceptFix(fix);
            }).catch(() => null);
            if (stopped) { subscription?.remove(); subscription = null; return; }

            const current = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced,
            }).catch(() => null);
            if (current) acceptFix(current);
        };
        void locate();
        return () => {
            stopped = true;
            appStateSubscription.remove();
            subscription?.remove();
        };
    }, []);

    const start = async () => {
        if (!next || busy) return;
        setBusy(true);
        setError(null);

        try {
            // Navigation opens either way. If the status write fails he is still
            // driving to a pickup, and holding the map hostage to a PATCH would
            // make a network blip look like a broken button.
            const opened = await openDriverNavigation({
                lat: next.pickupLat,
                lng: next.pickupLng,
            }).catch(() => false);
            if (!opened) return;

            const result = await api.setRideStatus(next.id, 'en_route', {});
            if (result?.error) {
                setError(result.error);
                return;
            }

            await Promise.all([onChanged(), refreshDriver()]);
        } finally {
            setBusy(false);
        }
    };

    const place = next ? splitAddress(next.pickupAddress) : null;

    return (
        <View style={{ flex: 1, width: '100%' }}>
            <MapSlot
                pickup={next ? { latitude: next.pickupLat, longitude: next.pickupLng } : null}
                drop={next ? { latitude: next.dropLat, longitude: next.dropLng } : null}
                driver={liveFix ? { latitude: liveFix.coords.latitude, longitude: liveFix.coords.longitude } : null}
                bottomSheetHeight={mapBottomInset}
                carType={next?.vehicleClass}
                routePolyline={next?.routePolyline}
            />

            <BottomSheet
                peek={PEEK}
                bottomInset={APPBAR_CLEARANCE}
                onHeightChange={setMapBottomInset}
            >
                <View className="px-5 pb-2 gap-3">
                    {next && place ? (
                        <>
                            <View className="flex-row items-center justify-between gap-3">
                                <AppText className={`text-base font-semibold uppercase tracking-wide ${MUTED}`}>
                                    Next pickup
                                </AppText>
                                <AppText className={`text-base font-semibold uppercase tracking-wide ${next.scheduledAt ? MUTED : 'text-primary'}`}>
                                    {whenLabel(next.scheduledAt)}
                                </AppText>
                            </View>

                            <View className="gap-0.5 p-3 bg-[var(--foreground-muted)] rounded-2xl">
                                <AppText numberOfLines={1} className={`text-xl font-semibold ${INK_TEXT}`} style={{ letterSpacing: -0.4 }}>
                                    {place.main}
                                </AppText>
                                {place.rest ? (
                                    <AppText numberOfLines={1} className={`text-sm ${MUTED}`}>{place.rest}</AppText>
                                ) : null}

                                <Pressable
                                    role="button"
                                    onPress={() => navigate(`/rides/${next.id}`)}
                                    style={({ pressed }) => ({ opacity: pressed || busy ? 0.85 : 1 })}
                                >
                                    <View className="w-25 flex-row items-center mt-2 justify-center gap-2 rounded-xl p-2 bg-[var(--background-primary)]">
                                        <AppText className="text-sm w-fit font-semibold text-[var(--text)]">
                                            Ride details
                                        </AppText>
                                    </View>
                                </Pressable>
                            </View>

                            {error ? (
                                <AppText className="text-sm font-medium text-red-600">{error}</AppText>
                            ) : null}

                            <Pressable
                                role="button"
                                onPress={start}
                                disabled={busy}
                                style={({ pressed }) => ({ opacity: pressed || busy ? 0.85 : 1 })}
                            >
                                <View className="w-full flex-row items-center justify-center gap-2 rounded-2xl py-3.5 bg-primary">
                                    <NavArrow size={18} weight="fill" className="text-[var(--foreground)]" />
                                    <AppText className="text-base font-semibold text-[var(--foreground)]">
                                        Go to pickup point
                                    </AppText>
                                </View>
                            </Pressable>
                        </>
                    ) : (
                        <View className="gap-0.5 py-2 flex flex-col justify-center items-center text-center">
                            <AppText className={`text-2xl font-semibold ${INK_TEXT}`}>
                                No ride scheduled
                            </AppText>
                            <AppText className={`text-sm text-center ${MUTED}`}>
                                Your next assigned ride shows up here.
                            </AppText>
                        </View>
                    )}
                </View>
            </BottomSheet>
        </View>
    );
};

export default Standby;
