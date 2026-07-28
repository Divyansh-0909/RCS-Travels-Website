// Flat add-on for the lit-highway route. The server adds it to the fares it
// returns, so screens only ever display it or back it out of a stored total —
// never add it on top.
export const SAFE_ROUTE_SURCHARGE = 150;

// Roof carrier for luggage that won't fit in the boot. Same deal as above — the
// server adds it, screens only display it. It is dropped on routes the provider
// already prices high enough to throw the carrier in, so the estimate's own
// `carrier` amount is the truth for a given ride; this is the sticker price.
export const CARRIER_CHARGE = 200;

// How /api/fare/estimate priced a ride. 'zone' and 'fixed_table' are the
// provider's own all-in quotes; the two distance sources pay for the drive alone
// and leave tolls with the driver — 'formula' is the curve fitted to the campus
// card, 'per_km' the app-style rate for trips that never touch campus. Screens
// that warn about tolls care about the distinction between all-in and by-distance
// and nothing finer, so they ask this rather than naming a source.
export const isDistancePriced = (source) => source === "formula" || source === "per_km";
