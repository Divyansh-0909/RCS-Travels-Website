import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { useApi } from './useApi';
import { useDriver } from './useDriver';

/**
 * Every ride currently offered to this captain, in one place.
 *
 * ONE LIST, TWO CONSUMERS, and that is the whole reason this is a provider. The
 * floating panel and the Notifications page show the same offers; if each
 * fetched its own, they would disagree the moment one refreshed and the other
 * did not — a captain would dismiss a card on one screen and find it still
 * waiting on the other, with no way to tell which was true.
 */

export type Offer = {
    offerId: string;
    offeredAt: string;
    bookingId: string;
    reference: string;
    pickup: { address: string; lat: number; lng: number };
    drop: { address: string; lat: number; lng: number };
    fare: number;
    vehicleClass: string;
    /** The server's prose label — "IMMEDIATE PICKUP" or a formatted stamp. */
    pickupTime: string;
    /** Null means ride-now. This, not the label above, is what the UI branches on. */
    scheduledAt: string | null;
    distanceKm: number | null;
    isOutstation: boolean;
    safeRoute: boolean;
    sharing: boolean;
    needsCarrier: boolean;
    /** True when accepting adds this rider to the trip already in progress. */
    additionalPickup: boolean;
    expiresAt: string;
};

/**
 * What the accept endpoint hands back, which is more than the offer carried.
 * customerPhone in particular is released ONLY here — an offer is not an
 * assignment, so the rider's number is deliberately absent until a captain
 * actually holds the ride.
 */
export type AcceptedRide = {
    bookingId: string;
    customerPhone: string;
    pickup: { address: string; lat: number; lng: number };
    pickupTime: string;
    scheduledAt?: string | null;
};

type OfferContextValue = {
    /** Everything still pending, newest first. What Notifications lists. */
    offers: Offer[];
    /** The newest offer he has not swiped away — what the panel floats. */
    panelOffer: Offer | null;
    /** The SERVER's answer to "can he take one right now" (today: isOnline). */
    canAccept: boolean;
    /** His last known position, for measuring how far the pickup is. Null early on. */
    here: { lat: number; lng: number } | null;
    loading: boolean;
    refresh: () => Promise<void>;
    accept: (offerId: string) => Promise<{ error?: string; code?: string } | null>;
    reject: (offerId: string) => Promise<{ error?: string; code?: string } | null>;
    /** Local only — takes the card off the panel, never off the server. */
    dismiss: (offerId: string) => void;
    /** The ride he has just taken, until the sheet about it is dismissed. */
    accepted: AcceptedRide | null;
    clearAccepted: () => void;
};

const OfferContext = createContext<OfferContextValue | null>(null);

/**
 * The backstop, not the delivery mechanism. A push is what makes an offer
 * appear promptly; this is what makes it appear AT ALL when the push was never
 * delivered — a dead FCM token, a captain who declined notifications, a
 * Firebase outage. Thirty seconds is chosen against that job rather than
 * against how urgent an offer is.
 */
const POLL_MS = 30_000;

/**
 * Which offers he has already waved off the panel.
 *
 * PERSISTED, because a dismissal is about the ride and not about this run of the
 * app. Kept in state alone, a swiped card came back the next time the process
 * started — and a captain who has decided he is not interested in a ride should
 * not have to decide again because Android reclaimed some memory.
 *
 * It stays small on its own: pruned on every response against the offers still
 * pending, so an id is forgotten the moment the ride it names is no longer
 * being offered. Nothing accumulates, and a ride he is offered AGAIN arrives as
 * a new RideOffer row with a new id, so it is not silently suppressed by an
 * answer he gave to a different offer of the same booking.
 */
const DISMISSED_KEY = 'rcs.dismissedOffers';

export const OfferProvider = ({ children }: { children: ReactNode }) => {
    const api = useApi();
    const { profile, refresh: refreshDriver } = useDriver();

    const [offers, setOffers] = useState<Offer[]>([]);
    const [canAccept, setCanAccept] = useState(false);
    const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);
    const [loading, setLoading] = useState(true);
    // Swiped away, or timed out of the panel. Never sent anywhere — the row
    // stays pending on the server and the ride stays on the Notifications page;
    // this only decides what floats over the app.
    const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
    // Guards the write-back below from saving an empty set over the stored one
    // before the read has finished.
    const [hydrated, setHydrated] = useState(false);
    const [accepted, setAccepted] = useState<AcceptedRide | null>(null);

    // GET /offers is behind requireApprovedDriver, so asking before he is cleared
    // is a guaranteed 403 on every poll of every unapproved captain's session.
    const canDrive = profile?.onboarding?.canDrive ?? false;

    // Read once, at startup. MERGED rather than assigned: a captain can swipe a
    // card away before a cold read comes back, and overwriting would resurrect
    // the one offer he has just this second said no to.
    useEffect(() => {
        (async () => {
            try {
                const raw = await AsyncStorage.getItem(DISMISSED_KEY);
                if (raw) {
                    const stored: string[] = JSON.parse(raw);
                    setDismissed((prev) => new Set([...stored, ...prev]));
                }
            } catch {
                // Unreadable or malformed. Losing the list costs him one extra
                // swipe; failing to start the app over it costs him a shift.
            }
            setHydrated(true);
        })();
    }, []);

    useEffect(() => {
        if (!hydrated) return;
        AsyncStorage.setItem(DISMISSED_KEY, JSON.stringify([...dismissed])).catch(() => {});
    }, [dismissed, hydrated]);

    const refresh = useCallback(async () => {
        if (!canDrive) {
            setOffers([]);
            setCanAccept(false);
            setLoading(false);
            return;
        }

        const result = await api.getOffers();

        if (!result?.error) {
            const list: Offer[] = result.offers ?? [];
            setOffers(list);
            setCanAccept(Boolean(result.canAccept));

            // Forget dismissals for rides no longer on the board — answered,
            // withdrawn, or given to somebody else. Done here, against a real
            // response, rather than in an effect on `offers`: an effect would
            // also fire on the empty list this holds before the first fetch and
            // would clear the very ids that were just read from storage.
            const live = new Set(list.map((o) => o.offerId));
            setDismissed((prev) => {
                if (prev.size === 0) return prev;
                const next = new Set([...prev].filter((id) => live.has(id)));
                return next.size === prev.size ? prev : next;
            });
        }

        // Cheap and cached by the OS — this is the fix the location service
        // already collected, not a new GPS read, so it costs no battery and can
        // ride along with every poll.
        const last = await Location.getLastKnownPositionAsync().catch(() => null);
        if (last) setHere({ lat: last.coords.latitude, lng: last.coords.longitude });

        setLoading(false);
    }, [api, canDrive]);

    useEffect(() => { refresh(); }, [refresh]);

    // Scheduled from the response rather than on an interval, so a slow request
    // can never stack up overlapping polls — the same shape the rider's tracking
    // page and the document checklist use.
    useEffect(() => {
        if (!canDrive) return;

        let timer: ReturnType<typeof setTimeout>;
        let cancelled = false;

        const tick = async () => {
            await refresh();
            if (!cancelled) timer = setTimeout(tick, POLL_MS);
        };

        timer = setTimeout(tick, POLL_MS);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [canDrive, refresh]);

    // The push is a NUDGE TO REFETCH, never the offer itself. Building a card
    // from the notification payload would put a second version of the ride on
    // screen — one that cannot know it has since been withdrawn, and that would
    // disagree with the list the moment anything changed.
    useEffect(() => {
        const sub = Notifications.addNotificationReceivedListener((n) => {
            if (n.request.content.data?.screen === 'notifications') refresh();
        });
        return () => sub.remove();
    }, [refresh]);

    // Coming back to the app is the other moment an offer may have arrived
    // unseen — the poll above does not run while the process is asleep.
    useEffect(() => {
        const sub = AppState.addEventListener('change', (s) => {
            if (s === 'active') refresh();
        });
        return () => sub.remove();
    }, [refresh]);

    const answer = useCallback(
        async (offerId: string, call: (id: string) => Promise<{ error?: string; code?: string }>) => {
            const result = await call(offerId);

            // Refetch either way. On success the offer is gone; on a 409 the list
            // is exactly what tells him why — the ride was taken, or he is offline
            // — so the screen must not keep showing the state he acted against.
            await refresh();

            return result?.error ? result : null;
        },
        [refresh],
    );

    const accept = useCallback(
        async (offerId: string) => {
            // Not routed through `answer`, because unlike a rejection the SUCCESS
            // body matters here: it is the only place the rider's phone number is
            // ever sent, and the sheet that offers to call her is built from it.
            const result = await api.acceptOffer(offerId);
            await refresh();

            if (result?.error) return result;

            // THE CADENCE SWITCH. assignedRides is what useDriverLocation reads to
            // decide between the 20-second idle rate and the 4-second ride rate,
            // and it only re-reads when the profile does. Without this the whole
            // drive to pickup reports at idle rate while a rider watches the map.
            await refreshDriver();

            setAccepted({
                bookingId: result.bookingId,
                customerPhone: result.customerPhone,
                pickup: result.pickup,
                pickupTime: result.pickupTime,
            });

            return null;
        },
        [api, refresh, refreshDriver],
    );

    const reject = useCallback(
        (offerId: string) => answer(offerId, api.rejectOffer),
        [answer, api.rejectOffer],
    );

    const dismiss = useCallback((offerId: string) => {
        setDismissed((prev) => new Set(prev).add(offerId));
    }, []);

    // Newest first is the server's order already; the panel takes the head of
    // whatever survives dismissal so a second offer arriving behind a swiped one
    // still gets its turn on screen.
    const panelOffer = useMemo(
        () => offers.find((o) => !dismissed.has(o.offerId)) ?? null,
        [offers, dismissed],
    );

    const clearAccepted = useCallback(() => setAccepted(null), []);

    const value = useMemo(
        () => ({ offers, panelOffer, canAccept, here, loading, refresh, accept, reject, dismiss, accepted, clearAccepted }),
        [offers, panelOffer, canAccept, here, loading, refresh, accept, reject, dismiss, accepted, clearAccepted],
    );

    return <OfferContext.Provider value={value}>{children}</OfferContext.Provider>;
};

export function useOffers() {
    const value = useContext(OfferContext);
    if (!value) throw new Error('useOffers must be used inside an OfferProvider');
    return value;
}
