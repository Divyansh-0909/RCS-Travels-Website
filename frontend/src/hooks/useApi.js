import { useAuth, useClerk } from "@clerk/clerk-react";
import * as api from "../api/api";

export function useApi() {
  const { getToken } = useAuth();
  const { signOut } = useClerk();
  
  return {
    getMe:            ()              => api.getMe(getToken),
    createMe:         (name)          => api.createMe(name, getToken),
    estimateFare:     (pickupAddress, dropAddress, vehicleType, pickupCoords, dropCoords, preferSafeRoute, needsCarrier) => api.estimateFare(pickupAddress, dropAddress, vehicleType, pickupCoords, dropCoords, preferSafeRoute, needsCarrier, getToken),
    createBooking:    (data)          => api.createBooking(data, getToken),
    cancelBooking:    (bookingId)     => api.cancelBooking(bookingId, getToken),
    getBookingStatus: (id)            => api.getBookingStatus(id, getToken),
    getMyBookings:    (filters)       => api.getMyBookings(filters, getToken),
    sendOtp:          (phone, intent)      => api.sendOtp(phone, intent),
    verifyOtp:        (phone, otp, intent) => api.verifyOtp(phone, otp, intent),
    logout:           ()              => signOut(),
    updateGender:     (gender)        => api.updateGender(gender, getToken),
    updateEmergencyContact: (contact) => api.updateEmergencyContact(contact, getToken),
    updateDOB:        (dob)           => api.updateDOB(dob, getToken),
    deleteMe:         ()              => api.deleteMe(getToken),
    downloadMyData:   ()              => api.downloadMyData(getToken),
    getBookings:      (filters)       => api.getBookings(filters, getToken),
    getDrivers:       (filters)       => api.getDrivers(filters, getToken),
    getUsers:         (filters)       => api.getUsers(filters, getToken),
    placesAutoComplete: (input)       => api.placesAutoComplete(input),
    placeDetails:     (placeId)       => api.placeDetails(placeId),
    reverseGeocode:   (lat, lng)      => api.reverseGeocode(lat, lng),
    getRecentPlaces:  ()              => api.getRecentPlaces(getToken),
    getSavedPlaces:   ()              => api.getSavedPlaces(getToken),
    saveSavedPlace:   (place)         => api.saveSavedPlace(place, getToken),
    deleteSavedPlace: (id)            => api.deleteSavedPlace(id, getToken),
  };
}