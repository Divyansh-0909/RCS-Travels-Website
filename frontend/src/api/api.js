const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

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
export const estimateFare      = (pickupAddress, dropAddress, vehicleType, getToken) => request("/api/fare/estimate", { method: "POST", body: { pickupAddress, dropAddress, vehicleType }, getToken });
export const createBooking     = (data, getToken)        => request("/api/bookings", { method: "POST", body: data, getToken });
export const getBookingStatus  = (id, getToken)          => request(`/api/bookings/${id}/status`, { getToken });
export const getMyBookings     = (getToken)              => request("/api/my-bookings", { getToken });
export const sendOtp           = (phone)                 => request("/api/auth/send-otp", { method: "POST", body: { phone } });
export const verifyOtp         = (phone, otp)            => request("/api/auth/verify-otp", { method: "POST", body: { phone, otp } });
