import { useAuth, useClerk } from "@clerk/clerk-expo";
import { useMemo } from "react";
import * as api from "../api/api";

// Memoised so the object identity survives re-renders: callers put it in effect
// dependency arrays, and a fresh literal every render would loop them.
export function useApi() {
  const { getToken } = useAuth();
  const { signOut } = useClerk();

  return useMemo(() => ({
    getMe:         ()                   => api.getMe(getToken),
    createMe:      (details)            => api.createMe(details, getToken),
    sendOtp:       (phone, intent)      => api.sendOtp(phone, intent),
    verifyOtp:     (phone, otp, intent) => api.verifyOtp(phone, otp, intent),
    logout:        ()                   => signOut(),

    getVehicles:       ()               => api.getVehicles(getToken),
    addVehicle:        (vehicle)        => api.addVehicle(vehicle, getToken),
    removeVehicle:     (id)             => api.removeVehicle(id, getToken),
    setActiveVehicle:  (vehicleId)      => api.setActiveVehicle(vehicleId, getToken),

    setOnline:     (isOnline)           => api.setOnline(isOnline, getToken),
    sendLocation:  (coords)             => api.sendLocation(coords, getToken),
    saveFcmToken:  (fcmToken)           => api.saveFcmToken(fcmToken, getToken),

    // getToken itself, not just wrappers over it: the document upload PUTs
    // straight at Supabase Storage and needs to call the backend twice around
    // that, so it takes the token getter rather than a pre-baked call.
    getToken,
    // `vehicleId` throughout: which car the checklist is showing and which car
    // the batch is filed against. Omitted means the one he is driving.
    getMyDocuments:        (vehicleId)             => api.getMyDocuments(vehicleId, getToken),
    getDocumentUploadUrls: (documents, vehicleId)  => api.getDocumentUploadUrls(documents, vehicleId, getToken),
    confirmDocuments:      (documents, vehicleId)  => api.confirmDocuments(documents, vehicleId, getToken),

    getRides:      (filters)            => api.getRides(filters, getToken),
    getUpcomingRide:      ()            => api.getUpcomingRide(getToken),
    getRide:       (id)                 => api.getRide(id, getToken),
    setRideStatus: (id, status)         => api.setRideStatus(id, status, getToken),
    acceptRide:    (id)                 => api.acceptRide(id, getToken),
    declineRide:   (id)                 => api.declineRide(id, getToken),
  }), [getToken, signOut]);
}
