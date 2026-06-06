import { useAuth } from "@clerk/clerk-react";
import * as api from "../api";

export function useApi() {
  const { getToken } = useAuth();
  
  return {
    getMe:            ()              => api.getMe(getToken),
    createMe:         (name)          => api.createMe(name, getToken),
    estimateFare:     (p, d, v)       => api.estimateFare(p, d, v, getToken),
    createBooking:    (data)          => api.createBooking(data, getToken),
    getBookingStatus: (id)            => api.getBookingStatus(id, getToken),
    getMyBookings:    ()              => api.getMyBookings(getToken),
  };
}