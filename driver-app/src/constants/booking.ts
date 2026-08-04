// Mirrors backend/constants/vehicles.js and the website's constants/statusLabels.js,
// the way frontend/src/constants/vehicles.js does: the keys cross the wire, the
// words do not. The words here are the captain's — a rider reads "Driver on the
// way" about someone else.

const VEHICLE_LABELS: Record<string, string> = {
    hatchback: 'Hatchback',
    sedan: 'Sedan',
    suv: 'SUV',
    suv_premium: 'Premium SUV',
};

export const vehicleLabel = (vehicleClass: string) => VEHICLE_LABELS[vehicleClass] ?? '—';

const STATUS_LABELS: Record<string, string> = {
    assigned: 'Assigned',
    en_route: 'On the way',
    reached: 'At pickup',
    started: 'On trip',
    completed: 'Completed',
    cancelled: 'Cancelled',
};

export const rideStatusLabel = (status: string) => STATUS_LABELS[status] ?? status.replace('_', ' ');

// A ride being worked, as opposed to `assigned`, which is taken but not started.
// GET /driver/rides returns both, so the split happens here.
export const ACTIVE_RIDE_STATUSES = ['en_route', 'reached', 'started'];

// "5 Aug • 09:30 AM", matching the website's formatDateTime. Built by hand rather
// than with toLocaleString because Hermes ships a trimmed Intl, and a date that
// renders one way on the site and another on a captain's Android is worse than a
// format that is merely fixed.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const formatDateTime = (value: string) => {
    const date = new Date(value);
    const hours = date.getHours();
    const hour12 = String(hours % 12 || 12).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${date.getDate()} ${MONTHS[date.getMonth()]} • ${hour12}:${minutes} ${hours < 12 ? 'AM' : 'PM'}`;
};

export const splitAddress = (address: string) => {
    const [main, ...rest] = (address ?? '').split(',');
    return { main, rest: rest.join(',').trim() };
};
