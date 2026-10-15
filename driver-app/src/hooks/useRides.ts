import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useApi } from './useApi';
import { useDriver } from './useDriver';
import { ACTIVE_RIDE_STATUSES } from '../constants/booking';
import type { UpcomingBooking } from '../types/enums';

const POLL_INTERVAL_MS = 5000;

/**
 * The captain's open rides, and the two the screens actually ask about.
 *
 * THREE SCREENS NEEDED THE SAME LIST. Home has it for the board, Standby for the
 * ride it offers to start, ActiveRide for the ride it is driving — and each
 * fetching its own would mean three answers to "what am I doing right now",
 * arriving at different times. Home's own copy of this logic moved in here.
 */

type Result = {
    rides: UpcomingBooking[];
    /** The accepted ride shown on Home — assigned through started. */
    active: UpcomingBooking | null;
    /** The soonest `assigned` ride, retained for list and transition callers. */
    next: UpcomingBooking | null;
    /** Every `assigned` ride, soonest first, for the board's "Next rides". */
    scheduled: UpcomingBooking[];
    loading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
};

export function useRides(): Result {
    const api = useApi();
    const { profile, refresh: refreshProfile } = useDriver();
    const [rides, setRides] = useState<UpcomingBooking[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const activeRideIdRef = useRef(profile?.activeRide?.id);
    activeRideIdRef.current = profile?.activeRide?.id;
    const inFlightRefresh = useRef<Promise<void> | null>(null);
    const cooldownUntil = useRef(0);

    const refresh = useCallback(() => {
        if (inFlightRefresh.current) return inFlightRefresh.current;
        if (Date.now() < cooldownUntil.current) return Promise.resolve();

        const run = async () => {
            setError(null);

            const data = await api.getRides();

            if (data?.error) {
                setError(data.error);
                if (data.status === 429) {
                    cooldownUntil.current = Date.now() + (data.retryAfterMs ?? POLL_INTERVAL_MS);
                }
            } else {
                const bookings: UpcomingBooking[] = data.bookings ?? [];
                setRides(bookings);

                // /me is what HomeGate routes from. If the rider cancels while this
                // app stays open, its activeRide snapshot otherwise keeps pointing
                // at a booking the fresh list has just proved is gone. Reconcile it
                // now so the active screen and shell both return online together.
                const profileRideId = activeRideIdRef.current;
                if (profileRideId && !bookings.some((booking) => booking.id === profileRideId)) {
                    await refreshProfile();
                }
            }

            setLoading(false);
        };

        let refreshPromise: Promise<void>;
        refreshPromise = run().finally(() => {
            if (inFlightRefresh.current === refreshPromise) inFlightRefresh.current = null;
        });
        inFlightRefresh.current = refreshPromise;
        return refreshPromise;
    }, [api, refreshProfile]);

    /**
     * Re-read whenever the SERVER's count of his rides changes.
     *
     * This is what makes accepting a ride land on the screen straight away.
     * Accepting refreshes the profile — it has to, because the location cadence
     * reads assignedRides — but this list is what the screens are actually built
     * from, and nothing was telling it to look again. So the ride existed, the
     * profile knew about it, and Home carried on showing the state before it
     * until something else happened to trigger a fetch.
     *
     * Keyed on the profile's own numbers rather than wired through the offer
     * hook: anything that changes what he is holding moves one of these — an
     * accept, a completion, a cancellation by the rider, an admin reassigning —
     * and each one is a reason to re-read regardless of which end caused it.
     */
    const assignedRides = profile?.onboarding?.assignedRides ?? 0;
    const activeRideId = profile?.activeRide?.id ?? null;
    useEffect(() => {
        void refresh();
    }, [assignedRides, activeRideId, refresh]);

    // The statuses move while he is out of the app — a ride he completed, a ride
    // an admin cancelled — so coming back is the moment to re-read them.
    useEffect(() => {
        const sub = AppState.addEventListener('change', (s) => {
            if (s === 'active') refresh();
        });
        return () => sub.remove();
    }, [refresh]);

    // Rider cancellation is an external event: no local button or navigation
    // exists to trigger a fetch. Poll only while the captain holds work, when a
    // five-second cancellation delay matters; idle screens remain event-driven.
    // Self-scheduling after each response prevents slow requests from stacking.
    const hasAssignedWork = (profile?.onboarding?.assignedRides ?? 0) > 0;
    useEffect(() => {
        if (!hasAssignedWork) return;

        let stopped = false;
        let timer: ReturnType<typeof setTimeout> | null = null;

        const tick = async () => {
            await refresh();
            if (!stopped) {
                const cooldownRemaining = cooldownUntil.current - Date.now();
                timer = setTimeout(tick, Math.max(POLL_INTERVAL_MS, cooldownRemaining));
            }
        };

        timer = setTimeout(tick, POLL_INTERVAL_MS);
        return () => {
            stopped = true;
            if (timer) clearTimeout(timer);
        };
    }, [hasAssignedWork, refresh]);

    // A progressed ride wins if the captain holds multiple bookings. Otherwise
    // the soonest accepted (`assigned`) ride becomes Active Ride's first step.
    const scheduled = rides.filter((r) => r.status === 'assigned');
    const active = rides.find((r) => ACTIVE_RIDE_STATUSES.includes(r.status))
        ?? scheduled[0]
        ?? null;

    return { rides, active, next: scheduled[0] ?? null, scheduled, loading, error, refresh };
}
