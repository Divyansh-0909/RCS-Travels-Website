const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

async function request(path, { method = "GET", body, getToken } = {}) {
    const token = await getToken();

    const res = await fetch(`${BASE_URL}${path}`, {
        method: "POST",
        headers: 
        { 
            "Content-Type": "application/json",
            "Authorization": "Bearer ${token}"

        },
        body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return { error: data.error || `Server error (${res.status})` };
    }

    return res.json();
}

export const getMe             = (getToken)              => request("/api/users/me", { getToken  });
export const createMe          = (name, getToken)        => request("/api/users/me", { method: "POST", body: { name }, getToken });
export const estimateFare      = (pickup, drop, vehicleType, getToken) => request("/api/fare/estimate", { method: "POST", body: { pickup, drop, vehicleType }, getToken });
export const createBooking     = (data, getToken)        => request("/api/bookings", { method: "POST", body: data, getToken });
export const getBookingStatus  = (id, getToken)          => request(`/api/bookings/${id}/status`, { getToken });
export const getMyBookings     = (getToken)              => request("/api/my-bookings", { getToken });


// How to use in components
// import { useApi } from "../hooks/useApi";

// const MyComponent = () => {
//   const api = useApi();

//   useEffect(() => {
//     api.getMe().then(data => {
//       if (data.error) // redirect to /onboarding
//       else // redirect to /book
//     });
//   }, []);
// };