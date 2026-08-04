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
    sendOtp:       (phone, intent)      => api.sendOtp(phone, intent),
    verifyOtp:     (phone, otp, intent) => api.verifyOtp(phone, otp, intent),
    logout:        ()                   => signOut(),

    setOnline:     (isOnline)           => api.setOnline(isOnline, getToken),
    sendLocation:  (coords)             => api.sendLocation(coords, getToken),
    saveFcmToken:  (fcmToken)           => api.saveFcmToken(fcmToken, getToken),

    getRides:      (filters)            => api.getRides(filters, getToken),
    getUpcomingRide:      ()            => api.getUpcomingRide(getToken),
    getRide:       (id)                 => api.getRide(id, getToken),
    setRideStatus: (id, status)         => api.setRideStatus(id, status, getToken),
    acceptRide:    (id)                 => api.acceptRide(id, getToken),
    declineRide:   (id)                 => api.declineRide(id, getToken),
  }), [getToken, signOut]);
}
