import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// The ride form belongs to the trip in front of the rider, not to the browser,
// so it rides in sessionStorage: a reload or a back-out of /vehicle keeps the
// addresses, but a new tab — or reopening the site tomorrow — starts blank.
// Everything else in partialize (phone, language, places) stays in localStorage.
const SESSION_KEYS = [
    'pickupLocation', 'dropLocation', 'pickupCoords', 'dropCoords',
    'distanceKm', 'durationMin', 'routePolyline',
    'fareSource', 'fareToll', 'fareCarrier', 'fareAirport',
    'timing',
    // The active booking transaction must survive a reload in this tab.
    'fare', 'vehicleClass', 'sharing', 'safeRoute', 'needsCarrier',
    'bookingId', 'bookingCode', 'status', 'activeBooking', 'searchStartedAt',
]

const read = (store, name) => {
    try { return JSON.parse(store.getItem(name)) } catch { return null }
}

// Splits the one persisted blob across the two stores by key. Passed to persist
// raw rather than through createJSONStorage — that wrapper is for string-backed
// stores, and the serialising happens here.
const splitStorage = {
    getItem: (name) => {
        const local = read(localStorage, name)
        const session = read(sessionStorage, name)
        if (!local && !session) return null
        // Strip the ride form out of whatever localStorage still holds, so the
        // blob written before this split can't leak addresses into a new tab.
        const persistent = { ...(local?.state ?? {}) }
        for (const key of SESSION_KEYS) delete persistent[key]
        return {
            version: local?.version ?? session?.version,
            state: { ...persistent, ...(session?.state ?? {}) },
        }
    },
    setItem: (name, value) => {
        const persistent = {}, perTab = {}
        for (const [key, val] of Object.entries(value.state)) {
            (SESSION_KEYS.includes(key) ? perTab : persistent)[key] = val
        }
        localStorage.setItem(name, JSON.stringify({ ...value, state: persistent }))
        sessionStorage.setItem(name, JSON.stringify({ ...value, state: perTab }))
    },
    removeItem: (name) => {
        localStorage.removeItem(name)
        sessionStorage.removeItem(name)
    },
}

export const useData = create(persist(set => ({
    phone: "",
    setPhone: (number) => set(state => ({ phone: number })),

    username: null,
    setUsername: (name) => set(state => ({ username: name })),

    language: "English",
    setLanguage: (lang) => set(state => ({ language: lang })),

    gender: null,
    setGender: (sex) => set(state => ({ gender: sex })),

    emergencyContact: null,
    setEmergencyContact: (number) => set(state => ({ emergencyContact: number })),

    dob: null,
    setDOB: (date) => set(state => ({ dob: date })),

    pickupLocation: "",
    setPickup: (location) => set(state => ({ pickupLocation: location })),

    dropLocation: "",
    setDrop: (location) => set(state => ({ dropLocation: location })),

    // { lat, lng } of the picked place; null once the text is hand-edited.
    pickupCoords: null,
    setPickupCoords: (coords) => set(state => ({ pickupCoords: coords })),

    dropCoords: null,
    setDropCoords: (coords) => set(state => ({ dropCoords: coords })),

    // From the fare estimate, for display on /book and ride details.
    distanceKm: null,
    setDistanceKm: (km) => set(state => ({ distanceKm: km })),

    durationMin: null,
    setDurationMin: (min) => set(state => ({ durationMin: min })),

    // Encoded road path from the same Routes call, for drawing the route on maps.
    routePolyline: null,
    setRoutePolyline: (polyline) => set(state => ({ routePolyline: polyline })),

    // How the estimate priced the ride: 'zone' | 'formula' | 'per_km' (older
    // bookings may carry the retired 'fixed_table'). The two distance sources
    // exclude tolls, so isDistancePriced() in constants/fares is what the tolls
    // notice keys off. Tracking never calls the estimate, so it reads this.
    fareSource: null,
    setFareSource: (source) => set(state => ({ fareSource: source })),

    // The flat add-ons the server folded into the booked fare. Kept so the ride
    // details breakdown can subtract them back out of the total rather than
    // re-deriving them from a client-side copy of the rate card — the carrier in
    // particular is waived on some routes, so its sticker price is not the
    // amount charged. Persisted with fareSource: tracking never re-estimates.
    fareToll: 0,
    setFareToll: (amount) => set(state => ({ fareToll: amount ?? 0 })),

    fareCarrier: 0,
    setFareCarrier: (amount) => set(state => ({ fareCarrier: amount ?? 0 })),

    fareAirport: 0,
    setFareAirport: (amount) => set(state => ({ fareAirport: amount ?? 0 })),

    // Autocomplete picks for the on-focus recents panel. Persisted; capped at
    // 15 by evicting the lowest frecency score (count decayed by age).
    recentPlaces: [],
    addRecentPlace: (label, coords) => {
        // A place without displayable text cannot be selected again. Guard the
        // persisted list at its write boundary so a failed geocode (or malformed
        // API response) cannot make every address dropdown crash on its next open.
        if (typeof label !== 'string' || !label.trim()) return;
        set(state => {
        const now = Date.now();
        const existing = state.recentPlaces.find(p => p.label === label);
        let updated = existing
            ? state.recentPlaces.map(p => p.label === label
                ? {
                    ...p, count: p.count + 1, lastUsedAt: now,
                    lat: coords?.lat ?? p.lat ?? null, lng: coords?.lng ?? p.lng ?? null
                }
                : p)
            : [...state.recentPlaces, {
                label, count: 1, lastUsedAt: now,
                lat: coords?.lat ?? null, lng: coords?.lng ?? null
            }];
        if (updated.length > 15) {
            const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
            const score = (p) => p.count * Math.exp(-(now - p.lastUsedAt) / THIRTY_DAYS);
            const lowest = updated.reduce((a, b) => (score(a) <= score(b) ? a : b));
            updated = updated.filter(p => p !== lowest);
        }
        return { recentPlaces: updated };
        });
    },

    // Merge server-derived places (booking history) into the local list.
    // Same label → max count (sum would double-count) and latest lastUsedAt.
    mergeRecentPlaces: (serverPlaces) => set(state => {
        const now = Date.now();
        const merged = new Map(state.recentPlaces.map(p => [p.label, { ...p }]));
        for (const sp of serverPlaces) {
            const local = merged.get(sp.label);
            if (local) {
                local.count = Math.max(local.count, sp.count);
                local.lastUsedAt = Math.max(local.lastUsedAt, sp.lastUsedAt);
                local.lat = local.lat ?? sp.lat ?? null;
                local.lng = local.lng ?? sp.lng ?? null;
            } else {
                merged.set(sp.label, { ...sp });
            }
        }
        const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
        const score = (p) => p.count * Math.exp(-(now - p.lastUsedAt) / THIRTY_DAYS);
        let updated = [...merged.values()];
        while (updated.length > 15) {
            const lowest = updated.reduce((a, b) => (score(a) <= score(b) ? a : b));
            updated = updated.filter(p => p !== lowest);
        }
        return { recentPlaces: updated };
    }),

    // Saved places (Home / Work / custom) managed from Settings. The server is
    // the source of truth; this holds the last fetched copy — persisted so the
    // booking form's suggestions can show them before any refresh lands.
    savedPlaces: [],
    setSavedPlaces: (places) => set(() => ({ savedPlaces: places ?? [] })),

    // Deliberately not persisted, unlike the timing choice beside it. A Date
    // does not survive JSON, and a restored slot can have aged past the 30-min
    // lead the picker enforces — so a reload would hand back a time the rider
    // can no longer book. Re-picking from the calendar is the honest reset.
    scheduledTime: null,
    setScheduledTime: (time) => set(state => ({ scheduledTime: time })),

    timing: "Schedule",
    setTiming: (timing) => set(state => ({ timing: timing })),

    fare: null,
    setFare: (fare) => set(state => ({ fare: fare })),

    // One of the keys in constants/vehicles.js. Every new ride starts on the
    // fleet's economy option; the selected card and its fare are visible before
    // the rider compares the larger classes.
    vehicleClass: "hatchback",
    setVehicleClass: (vehicle) => set(state => ({ vehicleClass: vehicle })),

    bookingId: null,
    setBookingId: (id) => set(state => ({ bookingId: id })),

    bookingCode: null,
    setBookingCode: (code) => set(state => ({ bookingCode: code })),

    status: "",
    setStatus: (status) => set(state => ({ status: status })),

    // Shape: { id, code, status, pickupAddress, dropAddress, fare, scheduledAt }
    activeBooking: null,
    setActiveBooking: (booking) => set(state => ({ activeBooking: booking })),
    // End only the live ride transaction. Route/form fields stay in place so a
    // rider can rebook the same journey without entering both addresses again.
    clearActiveBooking: () => set(() => ({
        bookingId: null,
        bookingCode: null,
        status: "",
        activeBooking: null,
        cancelledBy: null,
        cancellationCharge: 0,
        searchStartedAt: null,
    })),

    cancelledBy: null,
    setCancelledBy: (by) => set(state => ({ cancelledBy: by })),

    // What cancelling right now would cost, computed server-side and refreshed by
    // the tracking poll. Kept off the client so the warning the rider reads and
    // the amount the cancel endpoint charges can never drift apart.
    cancellationCharge: 0,
    setCancellationCharge: (amount) => set(state => ({ cancellationCharge: amount ?? 0 })),

    // Off by default: a solo ride is the ride the rider asked for, and sharing
    // is the opt-in that trades privacy for a lower fare. Defaulting it on made
    // the headline price one the rider hadn't agreed to the terms of.
    sharing: false,
    setSharing: (share) => set(state => ({ sharing: share })),

    // Forces the route through the lit highway instead of the shorter unlit
    // stretch near campus. Per-ride opt-in, deliberately not persisted — the
    // choice belongs to the trip, not the account.
    safeRoute: false,
    setSafeRoute: (on) => set(state => ({ safeRoute: on })),

    // Roof carrier for oversized luggage. Same reasoning as safeRoute: it belongs
    // to this trip's luggage, not to the account, so it is not persisted.
    needsCarrier: false,
    setNeedsCarrier: (on) => set(state => ({ needsCarrier: on })),

    // Dev-only: lets /dev/* preview routes render auth-gated UI without Clerk.
    devAuthBypass: false,
    setDevAuthBypass: (on) => set(() => ({ devAuthBypass: on })),

    searchStartedAt: null,
    setSearchStartedAt: (value) => set(() => ({ searchStartedAt: value })),
}),
    {
        name: 'rcs-data',
        storage: splitStorage,
        // Persisted: phone (pre-fills login), language, recent places, and the
        // ride form (addresses + their coords — they must travel together or a
        // reload would rebook from the fallback anchors) plus its route metrics,
        // so tracking still draws the real road route after a reload. /book wipes
        // the metrics on mount, so a new booking can't inherit the old route.
        // `timing` rides along so backing out of /book returns the rider to the
        // Now/Schedule choice they made, not to the default. SESSION_KEYS above
        // decides which of these outlive the tab.
        partialize: (state) => ({
            phone: state.phone, language: state.language, recentPlaces: state.recentPlaces,
            savedPlaces: state.savedPlaces, timing: state.timing,
            pickupLocation: state.pickupLocation, dropLocation: state.dropLocation,
            pickupCoords: state.pickupCoords, dropCoords: state.dropCoords,
            distanceKm: state.distanceKm, durationMin: state.durationMin,
            routePolyline: state.routePolyline, fareSource: state.fareSource,
            fareToll: state.fareToll, fareCarrier: state.fareCarrier,
            fareAirport: state.fareAirport,
            fare: state.fare, vehicleClass: state.vehicleClass,
            sharing: state.sharing, safeRoute: state.safeRoute,
            needsCarrier: state.needsCarrier,
            bookingId: state.bookingId, bookingCode: state.bookingCode,
            status: state.status, activeBooking: state.activeBooking,
            searchStartedAt: state.searchStartedAt,
        }),
    }))
