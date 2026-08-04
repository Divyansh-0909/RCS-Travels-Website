const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

if (!BASE_URL) {
    throw new Error('Missing EXPO_PUBLIC_API_BASE_URL');
}

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
        return { error: data.error || `Server error (${res.status})`, status: res.status, code: data.code };
    }

    return res.json();
}

export const sendOtp           = (phone, intent)         => request("/api/auth/send-otp", { method: "POST", body: { phone, intent, audience: "driver" } });
export const verifyOtp         = (phone, otp, intent)    => request("/api/auth/verify-otp", { method: "POST", body: { phone, otp, intent, audience: "driver" } });

export const getMe             = (getToken)              => request("/api/driver/me", { getToken });
export const setOnline         = (isOnline, getToken)    => request("/api/driver/online", { method: "PATCH", body: { isOnline }, getToken });
export const sendLocation      = (coords, getToken)      => request("/api/driver/location", { method: "POST", body: coords, getToken });
export const saveFcmToken      = (fcmToken, getToken)    => request("/api/driver/fcm-token", { method: "POST", body: { fcmToken }, getToken });

const toQuery = (filters = {}) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== null && value !== "") params.set(key, value);
    }
    const qs = params.toString();
    return qs ? `?${qs}` : "";
};

export const getRides          = (filters, getToken)     => request(`/api/driver/rides${toQuery(filters)}`, { getToken });
export const getUpcomingRide   = (getToken)              => request(`/api/driver/upcoming-ride`, { getToken });
export const getRide           = (id, getToken)          => request(`/api/driver/rides/${encodeURIComponent(id)}`, { getToken });
export const setRideStatus     = (id, status, getToken)  => request(`/api/driver/rides/${encodeURIComponent(id)}/status`, { method: "PATCH", body: { status }, getToken });
export const acceptRide        = (id, getToken)          => request(`/api/driver/rides/${encodeURIComponent(id)}/accept`, { method: "PATCH", getToken });
export const declineRide       = (id, getToken)          => request(`/api/driver/rides/${encodeURIComponent(id)}/decline`, { method: "PATCH", getToken });
