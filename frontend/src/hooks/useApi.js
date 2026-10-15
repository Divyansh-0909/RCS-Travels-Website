import { useAuth, useClerk } from "@clerk/clerk-react";
import { useCallback, useMemo, useRef } from "react";
import * as api from "../api/api";
import { signOutCurrentSession } from '../../../shared/auth/signOutCurrentSession.mjs';

export function useApi() {
  const { getToken: clerkGetToken, sessionId } = useAuth();
  const { signOut: clerkSignOut } = useClerk();
  const auth = useRef({ clerkGetToken, clerkSignOut, sessionId });
  auth.current = { clerkGetToken, clerkSignOut, sessionId };
  // SDK callback changes must not restart effects that depend on the API object.
  // Read the current callbacks so stable methods never capture an old session.
  const getToken = useCallback((...args) => auth.current.clerkGetToken(...args), []);
  const signOut = useCallback(() => signOutCurrentSession(auth.current.clerkSignOut, auth.current.sessionId), []);

  return useMemo(() => ({
    reviewResponsibility: (caseId, action, body) => api.reviewResponsibility(caseId, action, body, getToken),
    getMe:            ()              => api.getMe(getToken),
    getResponsibilityCase: (caseId, signal) => api.getResponsibilityCase(caseId, getToken, signal),
    createMe:         (name)          => api.createMe(name, getToken),
    getPreferences:   ()              => api.getPreferences(getToken),
    updatePreferences:(body)          => api.updatePreferences(body, getToken),
    estimateFare:     (pickupAddress, dropAddress, vehicleClass, pickupCoords, dropCoords, preferSafeRoute, needsCarrier, couponId) => api.estimateFare(pickupAddress, dropAddress, vehicleClass, pickupCoords, dropCoords, preferSafeRoute, needsCarrier, getToken, couponId),
    getOffers:        () => api.getOffers(getToken),
    createBooking:    (data)          => api.createBooking(data, getToken),
    getNearbyDrivers: (pickupCoords, vehicleClass) => api.getNearbyDrivers(pickupCoords, vehicleClass, getToken),
    cancelBooking:    (bookingId, expectedCancellationCharge, cancellationReason = null) => api.cancelBooking(bookingId, expectedCancellationCharge, cancellationReason, getToken),
    submitRideComplaint: (bookingId, reasons) => api.submitRideComplaint(bookingId, reasons, getToken),
    createScheduledAdvanceOrder: (bookingId) => api.createScheduledAdvanceOrder(bookingId, getToken),
    createScheduledFinalOrder: (bookingId) => api.createScheduledFinalOrder(bookingId, getToken),
    recordScheduledFinalCashPayment: (bookingId) => api.recordScheduledFinalCashPayment(bookingId, getToken),
    createRideNowFinalOrder: (bookingId) => api.createRideNowFinalOrder(bookingId, getToken),
    recordRideNowCashPayment: (bookingId) => api.recordRideNowCashPayment(bookingId, getToken),
    verifyPayment: (paymentId, response) => api.verifyPayment(paymentId, response, getToken),
    getBookingStatus: (id, signal)    => api.getBookingStatus(id, getToken, signal),
    requestReassignment: (id)         => api.requestReassignment(id, getToken),
    shareBooking:     (id)            => api.shareBooking(id, getToken),
    unshareBooking:   (id)            => api.unshareBooking(id, getToken),
    getMyRideSummary: ()              => api.getMyRideSummary(getToken),
    getMyBookings:    (filters)       => api.getMyBookings(filters, getToken),
    sendOtp:          (phone, intent)      => api.sendOtp(phone, intent),
    verifyOtp:        (phone, otp, intent) => api.verifyOtp(phone, otp, intent),
    checkName:        (name)               => api.checkName(name),
    logout:           ()              => signOut(),
    updateGender:     (gender)        => api.updateGender(gender, getToken),
    updateEmergencyContact: (contact) => api.updateEmergencyContact(contact, getToken),
    updateDOB:        (dob)           => api.updateDOB(dob, getToken),
    deleteMe:         ()              => api.deleteMe(getToken),
    downloadMyData:   ()              => api.downloadMyData(getToken),
    getBookings:      (filters)       => api.getBookings(filters, getToken),
    getDrivers:       (filters)       => api.getDrivers(filters, getToken),
    getUsers:         (filters)       => api.getUsers(filters, getToken),
    getFareZones:     ()              => api.getFareZones(getToken),
    saveFareZones:    (zones)         => api.saveFareZones(zones, getToken),
    getDriverFinance: (driverId)      => api.getDriverFinance(driverId, getToken),
    setPayoutVerification: (driverId, verified) => api.setPayoutVerification(driverId, verified, getToken),
    postDriverFinanceAdjustment: (driverId, body) => api.postDriverFinanceAdjustment(driverId, body, getToken),
    getFinanceReconciliation: ()      => api.getFinanceReconciliation(getToken),
    repairDriverFinance: (driverId, body) => api.repairDriverFinance(driverId, body, getToken),
    getPayoutBatches: ()              => api.getPayoutBatches(getToken),
    createPayoutBatch: (body)         => api.createPayoutBatch(body, getToken),
    executePayoutBatch: (batchId)     => api.executePayoutBatch(batchId, getToken),
    refreshPayout: (payoutId)         => api.refreshPayout(payoutId, getToken),
    placesAutoComplete: (input)       => api.placesAutoComplete(input),
    placeDetails:     (placeId)       => api.placeDetails(placeId),
    reverseGeocode:   (lat, lng)      => api.reverseGeocode(lat, lng),
    getRecentPlaces:  ()              => api.getRecentPlaces(getToken),
    getSavedPlaces:   ()              => api.getSavedPlaces(getToken),
    saveSavedPlace:   (place)         => api.saveSavedPlace(place, getToken),
    deleteSavedPlace: (id)            => api.deleteSavedPlace(id, getToken),
  }), [getToken, signOut]);
}
