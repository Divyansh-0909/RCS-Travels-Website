import Constants from 'expo-constants';

const TIMEOUT_MS = 15000;

const CONFIGURED_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

if (!CONFIGURED_URL) {
    throw new Error('Missing EXPO_PUBLIC_API_BASE_URL');
}

// In development the API and the Metro bundler run on the same machine, so the
// host this app already reached to load its own JS is the host the API is on.
// Reading it back at runtime means a new DHCP lease cannot leave the app calling
// an address nobody answers on — the env value's IP goes stale, this never does.
// Scheme and port still come from the env, which stays the only place they live.
//
// hostUri is set by @expo/cli and by nothing else, so a release build takes the
// env value untouched. A tunnel would resolve to the tunnel's host, which is not
// where the API is listening; on a tunnel, drop the override.
const BASE_URL = (() => {
    if (!__DEV__) return CONFIGURED_URL;
    const host = Constants.expoConfig?.hostUri?.split(':')[0];
    return host ? CONFIGURED_URL.replace(/\/\/[^/:]+/, `//${host}`) : CONFIGURED_URL;
})();

async function request(path, { method = "GET", body, getToken } = {}) {
    const headers = { "Content-Type": "application/json" };

    if (getToken) {
        const token = await getToken();
        headers["Authorization"] = `Bearer ${token}`;
    }

    // AbortSignal.timeout() does not exist here — React Native polyfills
    // AbortSignal from the abort-controller package, which ships no statics.
    //
    // Without a deadline an unreachable host never becomes an error: the SYN is
    // simply never answered, so the socket sits in TCP retry for a minute or more
    // and every screen awaiting it holds its spinner with nothing to show.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let res;
    try {
        res = await fetch(`${BASE_URL}${path}`, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
            signal: controller.signal,
        });
    } catch (err) {
        // Returned, not rethrown: every caller already handles the { error }
        // shape because that is what a 4xx returns, and a dead network is the
        // one they most need to render. status 0 means "never reached the server".
        return {
            error: err.name === 'AbortError'
                ? 'The server took too long to respond. Please try again.'
                : 'Could not reach the server. Check your connection.',
            status: 0,
        };
    } finally {
        clearTimeout(timer);
    }

    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return { error: data.error || `Server error (${res.status})`, status: res.status, code: data.code };
    }

    return res.json();
}

export const sendOtp           = (phone, intent)         => request("/api/auth/send-otp", { method: "POST", body: { phone, intent, audience: "driver" } });
export const verifyOtp         = (phone, otp, intent)    => request("/api/auth/verify-otp", { method: "POST", body: { phone, otp, intent, audience: "driver" } });

export const getMe             = (getToken)              => request("/api/driver/me", { getToken });
// Creates the driver row. Needs a Clerk session, so it can only run after the
// OTP has been verified — which is why the details it takes are collected on
// their own screen after sign-in rather than alongside the phone number.
export const createMe          = (details, getToken)     => request("/api/driver/me", { method: "POST", body: details, getToken });

// The two ends of the document upload. Nothing between them goes through this
// API: the file itself is PUT straight at Supabase Storage (see lib/uploadDocuments.ts),
// because pushing a multi-megabyte scan through the backend would hold one of
// Render's few workers for the length of a captain's 4G upload and then upload
// it a second time. What crosses here is a few hundred bytes of JSON either way.
//
// `vehicleId` says which of his cars the batch is about. Omitted, the server
// uses the one he is driving; sent explicitly, it lets him photograph the papers
// of a car parked at home. It is ignored for his licence and his photograph,
// which belong to the man and follow him from car to car.
export const getDocumentUploadUrls = (documents, vehicleId, getToken) => request("/api/driver/me/documents/upload-url", { method: "POST", body: { documents, vehicleId }, getToken });
export const confirmDocuments      = (documents, vehicleId, getToken) => request("/api/driver/me/documents", { method: "POST", body: { documents, vehicleId }, getToken });

// The checklist, and what to poll after an upload. The file check runs on the
// server AFTER the confirm returns — re-encoding each photo, reading each PDF
// for active content — so a document comes back `scanStatus: "pending"` and
// settles to "clean" or "rejected" a moment later. `scanReason` is written to
// be shown to the captain as-is.
//
// One car at a time: the response carries his two personal documents plus the
// nine belonging to `vehicleId` (his active car when omitted). A single list
// across every car would show three RCs with nothing to tell them apart.
export const getMyDocuments        = (vehicleId, getToken)  => request(`/api/driver/me/documents${vehicleId ? `?vehicleId=${encodeURIComponent(vehicleId)}` : ""}`, { getToken });

// His fleet. Almost every captain has one car; the owner-drivers who keep a
// hatchback and an Innova switch between them here, and each car carries its own
// paperwork and its own verdict.
export const getVehicles       = (getToken)              => request("/api/driver/me/vehicles", { getToken });
export const addVehicle        = (vehicle, getToken)     => request("/api/driver/me/vehicles", { method: "POST", body: vehicle, getToken });
export const removeVehicle     = (id, getToken)          => request(`/api/driver/me/vehicles/${encodeURIComponent(id)}`, { method: "DELETE", getToken });
// Changes which car he is driving, and with it his dispatch class, his seat
// count and his verification status — the new car's papers are not the old
// car's. Refused while he is online or holds a ride the new car cannot serve.
export const setActiveVehicle  = (vehicleId, getToken)   => request("/api/driver/me/active-vehicle", { method: "PATCH", body: { vehicleId }, getToken });
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
