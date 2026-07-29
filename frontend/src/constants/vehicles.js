// Mirrors backend/constants/vehicles.js — the keys are what crosses the wire, so
// the two files must agree. Everything here is display: the seat counts and the
// prices themselves are the server's answer, never re-derived on the client.

export const VEHICLE_CLASSES = {
    hatchback:   { label: "Hatchback",   category: "Cab Economy", seats: 4 },
    sedan:       { label: "Sedan",       category: "Cab Economy", seats: 4 },
    suv:         { label: "SUV",         category: "Cab XL",      seats: 6 },
    suv_premium: { label: "Premium SUV", category: "Cab XL",      seats: 6 },
};

// Every class, in display order. A rider always picks a specific car, so this is
// both the full picker and the full set of values the API will accept.
export const VEHICLE_CLASS_NAMES = Object.keys(VEHICLE_CLASSES);

// The picker's shape: each category in display order with the classes under it.
// Derived from VEHICLE_CLASSES rather than written out again, so adding a class
// to the map above is the only edit needed to put it on the booking screen.
export const VEHICLE_CATEGORIES = VEHICLE_CLASS_NAMES.reduce((groups, cls) => {
    const { category } = VEHICLE_CLASSES[cls];
    const existing = groups.find(g => g.category === category);
    if (existing) existing.classes.push(cls);
    else groups.push({ category, classes: [cls] });
    return groups;
}, []);

export const seatsOf = (cls) => VEHICLE_CLASSES[cls]?.seats ?? null;
export const labelOf = (cls) => VEHICLE_CLASSES[cls]?.label ?? "—";
export const categoryOf = (cls) => VEHICLE_CLASSES[cls]?.category ?? null;
