import {create} from 'zustand'
import {persist, createJSONStorage} from 'zustand/middleware'

export const useData = create (persist (set =>({
    phone: "",
    setPhone: (number)=> set (state => ({phone: number})),

    username: null,
    setUsername: (name)=> set(state=> ({username: name})),

    language: "English",
    setLanguage: (lang)=> set(state=> ({language: lang})),

    gender: null,
    setGender: (sex)=>set(state=>({gender: sex})),

    emergencyContact: null,
    setEmergencyContact: (number)=>set(state=>({emergencyContact: number})),

    dob: null,
    setDOB: (date)=>set(state=>({dob: date})),

    pickupLocation: "",
    setPickup: (location)=> set (state => ({pickupLocation: location})),

    dropLocation: "",
    setDrop: (location)=> set (state => ({dropLocation: location})),

    // { lat, lng } of the picked place; null once the text is hand-edited.
    pickupCoords: null,
    setPickupCoords: (coords)=> set (state => ({pickupCoords: coords})),

    dropCoords: null,
    setDropCoords: (coords)=> set (state => ({dropCoords: coords})),

    // From the fare estimate, for display on /book and ride details.
    distanceKm: null,
    setDistanceKm: (km)=> set (state => ({distanceKm: km})),

    durationMin: null,
    setDurationMin: (min)=> set (state => ({durationMin: min})),

    // Encoded road path from the same Routes call, for drawing the route on maps.
    routePolyline: null,
    setRoutePolyline: (polyline)=> set (state => ({routePolyline: polyline})),

    // How the estimate priced the ride: 'zone' | 'fixed_table' | 'formula'.
    // Only 'formula' (per-km) excludes tolls, so it's what the tolls notice
    // keys off. Tracking never calls the estimate, so it reads this.
    fareSource: null,
    setFareSource: (source)=> set (state => ({fareSource: source})),

    // Autocomplete picks for the on-focus recents panel. Persisted; capped at
    // 15 by evicting the lowest frecency score (count decayed by age).
    recentPlaces: [],
    addRecentPlace: (label, coords)=> set (state => {
        const now = Date.now();
        const existing = state.recentPlaces.find(p => p.label === label);
        let updated = existing
            ? state.recentPlaces.map(p => p.label === label
                ? { ...p, count: p.count + 1, lastUsedAt: now,
                    lat: coords?.lat ?? p.lat ?? null, lng: coords?.lng ?? p.lng ?? null }
                : p)
            : [...state.recentPlaces, { label, count: 1, lastUsedAt: now,
                lat: coords?.lat ?? null, lng: coords?.lng ?? null }];
        if (updated.length > 15) {
            const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
            const score = (p) => p.count * Math.exp(-(now - p.lastUsedAt) / THIRTY_DAYS);
            const lowest = updated.reduce((a, b) => (score(a) <= score(b) ? a : b));
            updated = updated.filter(p => p !== lowest);
        }
        return { recentPlaces: updated };
    }),

    // Merge server-derived places (booking history) into the local list.
    // Same label → max count (sum would double-count) and latest lastUsedAt.
    mergeRecentPlaces: (serverPlaces)=> set (state => {
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

    scheduledTime: null,
    setScheduledTime: (time)=> set(state=> ({scheduledTime: time})),

    timing: "Schedule",
    setTiming: (timing)=> set(state=> ({timing: timing})),

    fare: null,
    setFare: (fare)=> set(state=> ({fare: fare})),

    vehicleType: null,
    setvehicleType: (vehicle)=> set(state=> ({vehicleType: vehicle})),

    bookingId: null,
    setBookingId: (id)=> set(state=> ({bookingId: id})),

    bookingCode: null,
    setBookingCode: (code)=> set(state=> ({bookingCode: code})),

    status: "",
    setStatus: (status)=> set(state=> ({status: status})),

    // Shape: { id, code, status, pickupAddress, dropAddress, fare, scheduledAt }
    activeBooking: null,
    setActiveBooking: (booking)=> set(state=> ({activeBooking: booking})),

    cancelledBy: null,
    setCancelledBy: (by)=> set(state=> ({cancelledBy: by})),

    // What cancelling right now would cost, computed server-side and refreshed by
    // the tracking poll. Kept off the client so the warning the rider reads and
    // the amount the cancel endpoint charges can never drift apart.
    cancellationCharge: 0,
    setCancellationCharge: (amount)=> set(state=> ({cancellationCharge: amount ?? 0})),

    sharing: true,
    setSharing: (share) => set(state=>({sharing: share})),

    // Forces the route through the lit highway instead of the shorter unlit
    // stretch near campus. Per-ride opt-in, deliberately not persisted — the
    // choice belongs to the trip, not the account.
    safeRoute: false,
    setSafeRoute: (on) => set(state=>({safeRoute: on})),

    // Dev-only: lets /dev/* preview routes render auth-gated UI without Clerk.
    devAuthBypass: false,
    setDevAuthBypass: (on) => set(() => ({devAuthBypass: on})),
}),
{
    name: 'rcs-data',
    storage: createJSONStorage(() => localStorage),
    // Persisted: phone (pre-fills login), language, recent places, and the
    // ride form (addresses + their coords — they must travel together or a
    // reload would rebook from the fallback anchors) plus its route metrics,
    // so tracking still draws the real road route after a reload. /book wipes
    // the metrics on mount, so a new booking can't inherit the old route.
    partialize: (state) => ({
        phone: state.phone, language: state.language, recentPlaces: state.recentPlaces,
        pickupLocation: state.pickupLocation, dropLocation: state.dropLocation,
        pickupCoords: state.pickupCoords, dropCoords: state.dropCoords,
        distanceKm: state.distanceKm, durationMin: state.durationMin,
        routePolyline: state.routePolyline, fareSource: state.fareSource,
    }),
}))