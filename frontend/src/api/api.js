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
        // status lets callers react to specific codes (429 = OTP cooldown); code
        // is the server's own machine-readable tag where it sets one (FARE_QUOTE),
        // for the cases where reacting means more than showing the message.
        return { error: data.error || `Server error (${res.status})`, status: res.status, code: data.code };
    }

    return res.json();
}

export const getMe             = (getToken)              => request("/api/users/me", { getToken });
export const createMe          = (name, getToken)        => request("/api/users/me", { method: "POST", body: { name }, getToken });
export const estimateFare      = (pickupAddress, dropAddress, vehicleClass, pickupCoords, dropCoords, preferSafeRoute, needsCarrier, getToken) => request("/api/fare/estimate", { method: "POST", body: { pickupAddress, dropAddress, vehicleClass, pickupCoords, dropCoords, preferSafeRoute, needsCarrier }, getToken });
export const createBooking     = (data, getToken)        => request("/api/bookings", { method: "POST", body: data, getToken });
export const cancelBooking     = (bookingId, getToken)   => request("/api/bookings/cancel", { method: "POST", body: { bookingId }, getToken});
export const getBookingStatus  = (id, getToken)          => request(`/api/bookings/${id}/status`, { getToken });
export const shareBooking      = (id, getToken)          => request(`/api/bookings/${id}/share`, { method: "POST", getToken });
export const unshareBooking    = (id, getToken)          => request(`/api/bookings/${id}/share`, { method: "DELETE", getToken });
// No getToken, and that is the feature: the person following a shared ride has no
// account. The token in the path is the whole of the authorisation.
export const getSharedTrip     = (token)                 => request(`/api/share/${encodeURIComponent(token)}`);
export const getMyBookings     = (filters, getToken)     => request(`/api/bookings/my-bookings${toQuery(filters)}`, { getToken });
export const sendOtp           = (phone, intent)         => request("/api/auth/send-otp", { method: "POST", body: { phone, intent } });
export const verifyOtp         = (phone, otp, intent)    => request("/api/auth/verify-otp", { method: "POST", body: { phone, otp, intent } });
export const updateGender      = (gender, getToken)      => request("/api/users/me/updateGender", { method: "POST", body: { gender }, getToken });
export const updateEmergencyContact = (emergencyContact, getToken) => request("/api/users/me/updateEmergencyContact", { method: "POST", body: { emergencyContact }, getToken });
export const updateDOB         = (dob, getToken)         => request("/api/users/me/updateDOB", { method: "POST", body: { dob }, getToken });
export const deleteMe          = (getToken)              => request("/api/users/me", { method: "DELETE", getToken });
export const placesAutoComplete = (input)                => request(`/api/googleAPI/autocomplete?input=${encodeURIComponent(input)}`);
export const placeDetails      = (placeId)               => request(`/api/googleAPI/details/${encodeURIComponent(placeId)}`);
export const reverseGeocode    = (lat, lng)              => request(`/api/googleAPI/reverse-geocode?lat=${lat}&lng=${lng}`);
export const getRecentPlaces   = (getToken)              => request("/api/users/me/recent-places", { getToken });
export const getSavedPlaces    = (getToken)              => request("/api/users/me/saved-places", { getToken });
// Upserts: pass an id to update that row, omit it to create.
export const saveSavedPlace    = (place, getToken)       => request("/api/users/me/saved-places", { method: "PUT", body: place, getToken });
export const deleteSavedPlace  = (id, getToken)          => request(`/api/users/me/saved-places/${encodeURIComponent(id)}`, { method: "DELETE", getToken });
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
export const getFareZones      = (getToken)              => request("/api/admin/zones", { getToken });
export const saveFareZones     = (zones, getToken)       => request("/api/admin/zones", { method: "PUT", body: zones, getToken });

// A captain's paperwork, for review. Each document comes back with a `url` that
// is null for anything the file check has not cleared — the server fails closed
// and this client does not second-guess it, so "no link" means "not viewable",
// never "fetch it another way".
export const getDriverDocuments = (driverId, getToken)   => request(`/api/admin/drivers/${driverId}/documents`, { getToken });

// `status` is 'approved' or 'rejected'. A rejection needs a reason: the captain
// is shown it verbatim, and one without a reason is a document he re-uploads
// unchanged. The server refuses the review outright if the file check has not
// cleared, so the caller must not offer the buttons for those.
export const reviewDocument     = (documentId, body, getToken) =>
    request(`/api/admin/documents/${documentId}`, { method: "PATCH", body, getToken });

// `{ suspended: true, reason }` to stop a captain driving, `{ suspended: false }`
// to let him back on. Separate from verification, which is derived from his
// documents and is still "approved" while he is suspended — see routes/admin.ts.
export const setDriverSuspension = (driverId, body, getToken) =>
    request(`/api/admin/drivers/${driverId}/suspension`, { method: "PATCH", body, getToken });

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
