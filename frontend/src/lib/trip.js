/* The arithmetic behind "how far away is the car", shared by the rider's own
   tracking screen and the public one a share link opens. Both answer the same
   question off the same poll, and a copy in each would drift the moment one of
   them was tuned. */

// Statuses where a driver exists and may be moving — the only ones worth polling.
export const LIVE_STATUSES = ["assigned", "en_route", "reached", "started"];

// ETAs are derived from the driver's last known position rather than a Routes
// call: at one request per 5-second poll that would be both expensive and
// pointless, since the answer changes by seconds. Straight-line distance over a
// city average is honest enough for "how far away is my cab" and costs nothing.
// Swap in a real duration if the driver app ever reports one.
const AVG_SPEED_KMH = 25;

export function haversineKm(from, to) {
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(to.lat - from.lat);
    const dLng = toRad(to.lng - from.lng);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(a));
}

// null whenever either end is unknown, so callers render a dash instead of a
// confident lie. Never rounds below 1 — "0 mins away" reads as broken.
export const etaMinutes = (from, to) =>
    from && to ? Math.max(1, Math.round((haversineKm(from, to) / AVG_SPEED_KMH) * 60)) : null;

export const minsLabel = (n) => (n == null ? "—" : `${n} min${n === 1 ? "" : "s"}`);

// Plates are stored exactly as the captain typed them, upper-cased — "UP16AB1234"
// as often as "UP 16 AB 1234". A rider matching a plate against a car reads it in
// groups, so an unspaced one gets grouped; anything that isn't the standard
// state-district-series-number shape is printed untouched rather than guessed at,
// because a mangled plate is worse than a dense one.
const PLATE = /^([A-Z]{2})(\d{1,2})([A-Z]{1,3})(\d{4})$/;
export const formatPlate = (n) => {
    const m = n && PLATE.exec(n.replace(/\s+/g, ""));
    return m ? `${m[1]} ${m[2]} ${m[3]} ${m[4]}` : n;
};

// First segment of an address — "Connaught Place, Block A, New Delhi" → "Connaught
// Place". What a person says out loud about where they are being picked up.
export const placeName = (addr) => addr?.split(",")[0] ?? "";
