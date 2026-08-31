import type { UpcomingBooking } from '../types/enums';

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

// A ride already under way, as opposed to the accepted `assigned` state. Home's
// Active Ride screen handles both, while callers asking whether the car has
// actually departed keep using this narrower list.
export const ACTIVE_RIDE_STATUSES = ['en_route', 'reached', 'started'];

// A ride in progress has two ends, but only ever one that the captain is driving
// to. The active panel names that leg rather than the ride, so the three working
// statuses each pick their own words and their own end of the trip. The statuses
// The terminal states never reach the panel, so the fallback is only a guard.
const ACTIVE_LEGS: Record<string, { label: string; endpoint: 'pickup' | 'drop' }> = {
    assigned: { label: 'Pickup at', endpoint: 'pickup' },
    en_route: { label: 'Pickup at', endpoint: 'pickup' },
    reached: { label: 'Arrived at', endpoint: 'pickup' },
    started: { label: 'Dropping at', endpoint: 'drop' },
};

export const activeLeg = (status: string) =>
    ACTIVE_LEGS[status] ?? { label: rideStatusLabel(status), endpoint: 'pickup' as const };

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

// The scheduled row sets the clock and the day at two different sizes, so it needs
// the pieces rather than the joined string formatDateTime returns. Same hand-rolled
// arithmetic, and for the same reason: Hermes ships a trimmed Intl.
export const clockParts = (value: string) => {
    const date = new Date(value);
    const hours = date.getHours();

    return {
        clock: `${String(hours % 12 || 12).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`,
        meridiem: hours < 12 ? 'AM' : 'PM',
        day: `${date.getDate()} ${MONTHS[date.getMonth()]}`,
    };
};

// Two letters for the avatar. A one-word name gives one letter rather than one
// letter and a gap, and a missing name gives a dash — the circle is drawn either
// way, so it cannot be allowed to come out empty.
export const initials = (name: string | null) => {
    const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return '—';

    return `${words[0][0]}${words.length > 1 ? words[words.length - 1][0] : ''}`.toUpperCase();
};

// ---------------------------------------------------------------------------
// The Rides page
// ---------------------------------------------------------------------------

// The moment a ride belongs to. A finished ride is filed under when it finished, an
// upcoming one under when it is due, and a ride booked for right now under now —
// which is what lets one grouping function serve both tabs.
export const rideMoment = (booking: UpcomingBooking) =>
    new Date(booking.completedAt ?? booking.scheduledAt ?? booking.createdAt);

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
const DAY_MS = 86_400_000;

// "TODAY" / "TOMORROW" / "YESTERDAY" / "9 AUG". Named days only reach one day out in
// either direction on purpose: "in 2 days" is a phrase a captain has to do
// arithmetic on, and a date is not.
export const dayBucket = (date: Date, now = new Date()) => {
    const offset = Math.round((startOfDay(date) - startOfDay(now)) / DAY_MS);
    if (offset === 0) return 'TODAY';
    if (offset === 1) return 'TOMORROW';
    if (offset === -1) return 'YESTERDAY';

    // The year only earns its place once it stops being obvious, which for a ride
    // list is the moment the ride is not in the year you are standing in.
    const sameYear = date.getFullYear() === now.getFullYear();
    return `${date.getDate()} ${MONTHS[date.getMonth()]}${sameYear ? '' : ` ${date.getFullYear()}`}`.toUpperCase();
};

export type RideSection = { title: string; data: UpcomingBooking[] };

/**
 * Runs of consecutive same-day rides. Sorting first is not belt-and-braces: sections
 * are runs, so the same day appearing twice in the input renders its header twice,
 * and the server cannot hand back a list already in this order — a cancelled ride has
 * no completion stamp to sort by, so its moment is only known once `rideMoment` has
 * picked between three columns, which is here.
 */
export const groupByDay = (
    bookings: UpcomingBooking[],
    now = new Date(),
    direction: 'asc' | 'desc' = 'asc',
): RideSection[] => {
    const sections: RideSection[] = [];
    const sign = direction === 'asc' ? 1 : -1;
    const ordered = [...bookings].sort(
        (a, b) => sign * (rideMoment(a).getTime() - rideMoment(b).getTime()),
    );

    for (const booking of ordered) {
        const title = dayBucket(rideMoment(booking), now);
        const last = sections[sections.length - 1];

        if (last && last.title === title) last.data.push(booking);
        else sections.push({ title, data: [booking] });
    }

    return sections;
};

// Everything a captain would plausibly type looking for one ride he remembers: where
// it went, where it started, who was in it, and the reference off a support chat.
export const matchesQuery = (booking: UpcomingBooking, query: string) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;

    return [
        booking.dropAddress,
        booking.pickupAddress,
        booking.user?.name ?? '',
        // Both identifiers. `reference` is what the detail screen shows and what a
        // captain pastes back out of a support chat; `id` stays searchable because it
        // is what a backend log or an admin hands him, and a substring test costs
        // nothing to keep both working.
        booking.reference,
        booking.id,
        vehicleLabel(booking.vehicleClass),
    ].some((field) => field.toLowerCase().includes(q));
};

// No shortRideId here any more. The app briefly wrote its own six-character tail, then
// the website's first-eight-and-an-ellipsis, and now shows booking.reference — which is
// short enough that there is nothing left to abbreviate. Anything tempted to truncate an
// identifier should show the reference instead.

export const formatDistance = (km: number | null) =>
    km == null ? '—' : `${km >= 100 ? Math.round(km) : km.toFixed(1)} km`;

export const formatDuration = (minutes: number | null) => {
    if (minutes == null) return '—';
    if (minutes < 60) return `${minutes} min`;

    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours}h ${rest}m` : `${hours}h`;
};

// Average door-to-door speed across the routes this fleet actually runs — campus to
// Delhi NCR, a mix of expressway and city. Only ever used to label an estimate AS an
// estimate: the quote's real durationMin (backend/services/rideEstimate.js) is
// computed at booking time and never stored, so an unfinished ride has no measured
// number to show. Persist that column and this constant goes away.
const AVG_KMH = 38;

/**
 * Measured elapsed time where the ride has one, a labelled estimate where it does
 * not, and nothing at all when even the distance is unknown. The `estimated` flag is
 * the point: the UI must never present the second as the first.
 */
export const rideDuration = (booking: UpcomingBooking): { minutes: number | null; estimated: boolean } => {
    if (booking.durationMin != null) return { minutes: booking.durationMin, estimated: false };
    if (booking.distanceKm == null) return { minutes: null, estimated: false };

    return { minutes: Math.max(5, Math.round((booking.distanceKm / AVG_KMH) * 60)), estimated: true };
};

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

// Rupees the way the rest of the app writes them — whole, grouped Indian-style
// (1,20,000 not 120,000). Hand-rolled for the reason formatDateTime is: Hermes ships
// a trimmed Intl, so toLocaleString('en-IN') cannot be relied on to group at all.
export const rupees = (amount: number) => {
    const whole = Math.round(Math.abs(amount));
    const digits = String(whole);
    const head = digits.slice(0, -3);
    const tail = digits.slice(-3);
    const grouped = head ? `${head.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${tail}` : tail;

    return `${amount < 0 ? '-' : ''}₹${grouped}`;
};

export type FareLine = { label: string; amount: number; note?: string };
export type FareBreakdown = { lines: FareLine[]; total: number; totalLabel: string };

/**
 * What the total is made of, from the captain's side of it. The rider's breakdown
 * ends at the fare; his carries on through the provider's cut to the figure that
 * actually reaches him, because that is the only number on this screen he can act on.
 *
 * Add-ons are shown as one line rather than itemised. Their split (toll / parking /
 * airport / carrier) is priced at quote time and never stored per-component — only
 * `fare` and `rideFare` survive on the booking — so listing them separately would
 * mean inventing the division.
 */
export const fareBreakdown = (booking: UpcomingBooking): FareBreakdown => {
    if (booking.status === 'cancelled') {
        const charge = booking.cancellationCharge ?? 0;
        return {
            lines: [{ label: 'Ride cancelled', amount: 0, note: 'Fare not charged' }],
            total: charge,
            totalLabel: charge ? 'Cancellation charge' : 'Nothing owed',
        };
    }

    const rideFare = booking.rideFare ?? booking.fare;
    const addOns = Math.max(0, booking.fare - rideFare);
    const commission = booking.commissionAmt ?? 0;

    // A subtotal is only worth a row when something was added to reach it. With no
    // add-ons the ride fare IS the money collected, and printing the same number
    // twice under two labels invites the captain to check whether he misread one.
    const lines: FareLine[] = addOns > 0
        ? [
            { label: 'Ride fare', amount: rideFare },
            {
                label: 'Tolls & extras',
                amount: addOns,
                note: booking.needsCarrier ? 'Includes roof carrier' : 'Passed through to you',
            },
            { label: 'Collected from rider', amount: booking.fare },
        ]
        : [{ label: 'Collected from rider', amount: booking.fare }];

    if (commission > 0) {
        lines.push({
            label: 'Provider commission',
            amount: -commission,
            note: `${booking.commissionPct}% of the ride fare`,
        });
    }

    return { lines, total: booking.fare - commission, totalLabel: 'You keep' };
};

// ---------------------------------------------------------------------------
// Payment
// ---------------------------------------------------------------------------

/**
 * Has this ride actually happened — completed or cancelled, as opposed to booked,
 * accepted or being driven right now.
 *
 * It gates what the screens are willing to say about money. A ride that has not
 * finished has a fare in the sense that a price is agreed, but nothing about it is
 * owed yet: telling a captain "payment due" on a job he is on his way to is stating
 * the obvious as though it were a problem, and it makes the same words mean nothing
 * on the one screen where they matter — the ride he has already driven and not been
 * paid for.
 */
export const isFinished = (booking: UpcomingBooking) =>
    booking.status === 'completed' || booking.status === 'cancelled';

export type PaymentChip = { label: string; tone: 'paid' | 'due' | 'void' };

/**
 * The chip on the collapsed row. `paymentState` is decided server-side
 * (backend/routes/driver.ts) — all that happens here is choosing the captain's
 * words for it, which differ by where the ride is: money still to collect reads as
 * an instruction on a ride ahead of him and as a problem on one behind him.
 */
export const paymentChip = (booking: UpcomingBooking): PaymentChip => {
    if (booking.paymentState === 'paid') return { label: 'Paid', tone: 'paid' };
    if (booking.paymentState === 'void') return { label: 'No charge', tone: 'void' };

    if (booking.status === 'cancelled') {
        return { label: `Charge ${rupees(booking.cancellationCharge ?? 0)}`, tone: 'due' };
    }

    return { label: `Collect ${rupees(booking.fare)}`, tone: 'due' };
};

/**
 * Is the FARE still to be collected — which is narrower than "does this ride owe
 * money". A cancelled ride can owe a cancellation charge and still answer false here:
 * that charge is the provider's to settle, and the ride it belongs to never happened
 * as far as the rider is concerned, so a captain phoning about it is starting an
 * argument rather than collecting a fare.
 *
 * The one caller is the Call rider button, and the distinction is exactly what decides
 * whether it is offered.
 */
export const fareUnpaid = (booking: UpcomingBooking) =>
    booking.paymentState === 'due' && booking.status !== 'cancelled';
