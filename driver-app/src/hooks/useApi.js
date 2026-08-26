import { useAuth, useClerk } from "@clerk/clerk-expo";
import { useCallback, useMemo, useRef } from "react";
import * as api from "../api/api";

// Memoised so the object identity survives re-renders: callers put it in effect
// dependency arrays, and a fresh literal every render would loop them.
//
// AND THE MEMO HAS TO BE KEYED ON SOMETHING STABLE, which is the whole reason for
// the refs below. `useMemo(..., [getToken])` looks like it does that and does
// not: clerk-expo's useAuth builds a NEW getToken closure on every render — it
// wraps the base one to mirror the session JWT into its cache, and the wrapper
// is a bare arrow function with no useCallback around it
// (@clerk/clerk-expo/dist/hooks/useAuth.js). So the dependency changed every
// render, the memo rebuilt every render, and every hook that lists `api` as a
// dependency rebuilt with it.
//
// WHAT THAT ACTUALLY CAUSED, because it is worth recognising next time: any
// `useEffect(() => { refresh() }, [refresh])` where refresh is
// `useCallback(..., [api])` re-ran on every single render, set state, and
// re-rendered — an infinite fetch loop. It was survivable while useDriver was
// the only one doing it, since each turn of the loop waited on a network round
// trip; three more hooks in the same shape turned it into "Maximum update depth
// exceeded".
//
// A ref read through a stable callback keeps the latest function without letting
// its identity leak into the dependency array.
export function useApi() {
  const { getToken } = useAuth();
  const { signOut } = useClerk();

  const tokenRef = useRef(getToken);
  tokenRef.current = getToken;
  const stableGetToken = useCallback((options) => tokenRef.current(options), []);

  const signOutRef = useRef(signOut);
  signOutRef.current = signOut;
  const stableSignOut = useCallback((...args) => signOutRef.current(...args), []);

  return useMemo(() => ({
    getMe:         ()                   => api.getMe(stableGetToken),
    getFeedback:   ()                   => api.getFeedback(stableGetToken),
    createMe:      (details)            => api.createMe(details, stableGetToken),
    sendOtp:       (phone, intent)      => api.sendOtp(phone, intent),
    verifyOtp:     (phone, otp, intent) => api.verifyOtp(phone, otp, intent),
    logout:        ()                   => stableSignOut(),

    getVehicles:       ()               => api.getVehicles(stableGetToken),
    addVehicle:        (vehicle)        => api.addVehicle(vehicle, stableGetToken),
    removeVehicle:     (id)             => api.removeVehicle(id, stableGetToken),
    setActiveVehicle:  (vehicleId)      => api.setActiveVehicle(vehicleId, stableGetToken),

    setOnline:     (isOnline)           => api.setOnline(isOnline, stableGetToken),
    sendLocation:  (coords)             => api.sendLocation(coords, stableGetToken),
    saveFcmToken:  (fcmToken)           => api.saveFcmToken(fcmToken, stableGetToken),

    // getToken itself, not just wrappers over it: the document upload PUTs
    // straight at Supabase Storage and needs to call the backend twice around
    // that, so it takes the token getter rather than a pre-baked call.
    getToken: stableGetToken,
    // `vehicleId` throughout: which car the checklist is showing and which car
    // the batch is filed against. Omitted means the one he is driving.
    getMyDocuments:        (vehicleId)             => api.getMyDocuments(vehicleId, stableGetToken),
    getDocumentUploadUrls: (documents, vehicleId)  => api.getDocumentUploadUrls(documents, vehicleId, stableGetToken),
    confirmDocuments:      (documents, vehicleId)  => api.confirmDocuments(documents, vehicleId, stableGetToken),

    getOffers:     ()                   => api.getOffers(stableGetToken),
    acceptOffer:   (id)                 => api.acceptOffer(id, stableGetToken),
    rejectOffer:   (id)                 => api.rejectOffer(id, stableGetToken),

    getRides:      (filters)            => api.getRides(filters, stableGetToken),
    getUpcomingRide:      ()            => api.getUpcomingRide(stableGetToken),
    getRide:       (id)                 => api.getRide(id, stableGetToken),
    // `extra` carries the otp when moving to `started`, and the captain's current
    // lat/lng whenever there is one to send.
    setRideStatus: (id, to, extra)      => api.setRideStatus(id, to, extra, stableGetToken),
    cancelRide:    (id)                 => api.cancelRide(id, stableGetToken),
    acceptRide:    (id)                 => api.acceptRide(id, stableGetToken),
    declineRide:   (id)                 => api.declineRide(id, stableGetToken),
  }), [stableGetToken, stableSignOut]);
}
