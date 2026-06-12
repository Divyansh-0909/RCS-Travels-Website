import { useAuth, useClerk } from "@clerk/clerk-react";
import * as api from "../api/api";

export function useApi() {
  const { getToken } = useAuth();
  const { signOut } = useClerk();
  
  return {
    getMe:            ()              => api.getMe(getToken),
    createMe:         (name)          => api.createMe(name, getToken),
    estimateFare:     (pickupAddress, dropAddress, vehicleType) => api.estimateFare(pickupAddress, dropAddress, vehicleType, getToken),
    createBooking:    (data)          => api.createBooking(data, getToken),
    getBookingStatus: (id)            => api.getBookingStatus(id, getToken),
    getMyBookings:    ()              => api.getMyBookings(getToken),
    sendOtp:          (phone)         => api.sendOtp(phone),
    verifyOtp:        (phone, otp)    => api.verifyOtp(phone, otp),
    logout:           ()              => signOut(),
  };
}