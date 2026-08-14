// Flat add-on for the safer route. The server adds it to the fares it returns,
// so screens only ever display it or back it out of a stored total — never add
// it on top.
//
// It is charged ONLY when a safer route was actually found for that trip and the
// rider took it, which is exactly what the stored `preferSafeRoute` now records.
// So backing it out of a booked fare on this flag stays correct. The booking
// screen doesn't use this constant at all — the estimate tells it the fee, along
// with whether there is anything to offer.
export const SAFE_ROUTE_SURCHARGE = 150;

// Roof carrier for luggage that won't fit in the boot. Same deal as above — the
// server adds it, screens only display it. It is dropped on routes the provider
// already prices high enough to throw the carrier in, so the estimate's own
// `carrier` amount is the truth for a given ride; this is the sticker price.
export const CARRIER_CHARGE = 200;

// What cancelling costs once the driver has REACHED the pickup — free at every
// earlier status, including en_route. Mirrors CANCELLATION_CHARGE_PCT in
// backend/routes/bookings.js, which is what actually charges it; this copy exists
// so the booking screen can warn with the real number rather than a rounded one.
// If the server's figure moves, move this with it.
export const CANCELLATION_CHARGE_PCT = 15;

// How /api/fare/estimate priced a ride. 'zone' is the provider's own all-in
// quote; the two distance sources pay for the drive alone and leave tolls with
// the driver — 'formula' is the curve fitted to the campus card, 'per_km' the
// app-style rate for trips that never touch campus. Screens that warn about tolls
// care about the distinction between all-in and by-distance and nothing finer, so
// they ask this rather than naming a source.
//
// Older bookings can still carry 'fixed_table', a fourth source retired in favour
// of zone → curve. It priced all-in like a zone, so it falls to `false` here,
// which is what it always did.
export const isDistancePriced = (source) => source === "formula" || source === "per_km";
