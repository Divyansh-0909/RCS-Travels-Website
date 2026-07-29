// The vehicles a rider picks from, and the one thing every other module needs to
// agree on. Seats used to BE the identity — `vehicleType Int` was 4, 6 or 1 —
// which worked right up until the fleet needed a sedan: a sedan and a hatchback
// both carry four, so a seat count cannot tell them apart. The class is now the
// identity and the seat count is a property of it.
//
// Order matters: this is the order the booking screen lists them in, grouped by
// `category`. Mirrored in frontend/src/constants/vehicles.js — the two files
// must agree on the keys, because they are what crosses the wire.
export const VEHICLE_CLASSES = {
  hatchback:   { label: 'Hatchback',   category: 'Cab Economy', seats: 4 },
  sedan:       { label: 'Sedan',       category: 'Cab Economy', seats: 4 },
  suv:         { label: 'SUV',         category: 'Cab XL',      seats: 6 },
  suv_premium: { label: 'Premium SUV', category: 'Cab XL',      seats: 6 },
}

// Every class, and the wire contract with it: the fare estimate returns a price
// per key, the booking endpoint accepts one, and a driver's vehicle is one of
// these. Every rider picks a specific car — there is no "whichever is nearest".
export const VEHICLE_CLASS_NAMES = Object.keys(VEHICLE_CLASSES)

export const seatsOf = (cls) => VEHICLE_CLASSES[cls]?.seats ?? null
export const labelOf = (cls) => VEHICLE_CLASSES[cls]?.label ?? '—'
export const categoryOf = (cls) => VEHICLE_CLASSES[cls]?.category ?? null

export const isVehicleClass = (cls) => Object.hasOwn(VEHICLE_CLASSES, cls)
