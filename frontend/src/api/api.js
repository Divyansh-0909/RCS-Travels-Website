const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

async function request(path, { method = "GET", body, getToken } = {}) {
    const headers = { "Content-Type": "application/json" };

    if (getToken) {
        const token = await getToken();
        headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(`${BASE_URL}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return { error: data.error || `Server error (${res.status})` };
    }

    return res.json();
}

export const getMe             = (getToken)              => request("/api/users/me", { getToken });
export const createMe          = (name, getToken)        => request("/api/users/me", { method: "POST", body: { name }, getToken });
export const estimateFare      = (pickupAddress, dropAddress, vehicleType, pickupCoords, dropCoords, preferSafeRoute, getToken) => request("/api/fare/estimate", { method: "POST", body: { pickupAddress, dropAddress, vehicleType, pickupCoords, dropCoords, preferSafeRoute }, getToken });
export const createBooking     = (data, getToken)        => request("/api/bookings", { method: "POST", body: data, getToken });
export const cancelBooking     = (bookingId, getToken)   => request("/api/bookings/cancel", { method: "POST", body: { bookingId }, getToken});
export const getBookingStatus  = (id, getToken)          => request(`/api/bookings/${id}/status`, { getToken });
export const getMyBookings     = (filters, getToken)     => request(`/api/bookings/my-bookings${toQuery(filters)}`, { getToken });
export const sendOtp           = (phone)                 => request("/api/auth/send-otp", { method: "POST", body: { phone } });
export const verifyOtp         = (phone, otp)            => request("/api/auth/verify-otp", { method: "POST", body: { phone, otp } });
export const updateGender      = (gender, getToken)      => request("/api/users/me/updateGender", { method: "POST", body: { gender }, getToken });
export const updateEmergencyContact = (emergencyContact, getToken) => request("/api/users/me/updateEmergencyContact", { method: "POST", body: { emergencyContact }, getToken });
export const updateDOB         = (dob, getToken)         => request("/api/users/me/updateDOB", { method: "POST", body: { dob }, getToken });
export const deleteMe          = (getToken)              => request("/api/users/me", { method: "DELETE", getToken });
export const placesAutoComplete = (input)                => request(`/api/googleAPI/autocomplete?input=${encodeURIComponent(input)}`);
export const placeDetails      = (placeId)               => request(`/api/googleAPI/details/${encodeURIComponent(placeId)}`);
export const reverseGeocode    = (lat, lng)              => request(`/api/googleAPI/reverse-geocode?lat=${lat}&lng=${lng}`);
export const getRecentPlaces   = (getToken)              => request("/api/users/me/recent-places", { getToken });
// filters: query-param object; empty values are dropped before serializing.
const toQuery = (filters = {}) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== null && value !== "") params.set(key, value);
    }
    const qs = params.toString();
    return qs ? `?${qs}` : "";
};
export const getBookings       = (filters, getToken)     => request(`/api/admin/booking${toQuery(filters)}`, { getToken });
export const getDrivers        = (filters, getToken)     => request(`/api/admin/driver${toQuery(filters)}`, { getToken });
export const getUsers          = (filters, getToken)     => request(`/api/admin/user${toQuery(filters)}`, { getToken });

// Streams a PDF, so it can't use request() (which parses JSON); fetch a Blob.
export const downloadMyData = async (getToken) => {
    const token = await getToken();
    const res = await fetch(`${BASE_URL}/api/users/me/download`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return { error: data.error || `Server error (${res.status})` };
    }
    return { blob: await res.blob() };
};
