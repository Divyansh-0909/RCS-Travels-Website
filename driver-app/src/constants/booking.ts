import { driverCopy as dc } from "../lib/copy";
import type { UpcomingBooking } from '../types/enums';
import { driverLabel, driverMonths } from '../lib/localizedLabels';

// Mirrors backend/constants/vehicles.js and the website's constants/statusLabels.js,
// the way frontend/src/constants/vehicles.js does: the keys cross the wire, the
// words do not. The words here are the captain's — a rider reads "Driver on the
// way" about someone else.

export const vehicleLabel = (vehicleClass: string, locale?: string) => driverLabel(locale, `vehicle.${vehicleClass}`) || '—';

const STATUS_LABELS: Record<string, string> = {
    assigned: 'Assigned',
    get "en_route"() { return dc("On the way"); },
    get "reached"() { return dc("At pickup"); },
    get "started"() { return dc("On trip"); },
    completed: 'Completed',
    cancelled: 'Cancelled',
};

export const rideStatusLabel = (status: string, locale?: string) => driverLabel(locale, `status.${status}`) || (STATUS_LABELS[status] ?? status.replace('_', ' '));

// A ride already under way, as opposed to the accepted `assigned` state. Home's
// Active Ride screen handles both, while callers asking whether the car has
// actually departed keep using this narrower list.
export const ACTIVE_RIDE_STATUSES = ['en_route', 'reached', 'started'];

// A ride in progress has two ends, but only ever one that the captain is driving
// to. The active panel names that leg rather than the ride, so the three working
// statuses each pick their own words and their own end of the trip. The statuses
// The terminal states never reach the panel, so the fallback is only a guard.
const ACTIVE_LEGS: Record<string, { label: string; endpoint: 'pickup' | 'drop' }> = {
    assigned: { get "label"() { return dc("Pickup at"); }, endpoint: 'pickup' },
    en_route: { get "label"() { return dc("Pickup at"); }, endpoint: 'pickup' },
    reached: { get "label"() { return dc("Arrived at"); }, endpoint: 'pickup' },
    started: { get "label"() { return dc("Dropping at"); }, endpoint: 'drop' },
};

export const activeLeg = (status: string, locale?: string) => ACTIVE_LEGS[status] ? { ...ACTIVE_LEGS[status], label: driverLabel(locale, status === 'reached' ? 'leg.arrived' : status === 'started' ? 'leg.drop' : 'leg.pickup') } : { label: rideStatusLabel(status, locale), endpoint: 'pickup' as const };

// "5 Aug • 09:30 AM", matching the website's formatDateTime. Built by hand rather
// than with toLocaleString because Hermes ships a trimmed Intl, and a date that
// renders one way on the site and another on a captain's Android is worse than a
// format that is merely fixed.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const formatDateTime = (value: string, locale?: string) => {
    const date = new Date(value);
    const hours = date.getHours();
    const hour12 = String(hours % 12 || 12).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${date.getDate()} ${driverMonths(locale)[date.getMonth()]} • ${hour12}:${minutes} ${driverLabel(locale, hours < 12 ? 'time.am' : 'time.pm')}`;
};

export const splitAddress = (address: string) => {
    const [main, ...rest] = (address ?? '').split(',');
    return { main, rest: rest.join(',').trim() };
};

// The scheduled row sets the clock and the day at two different sizes, so it needs
// the pieces rather than the joined string formatDateTime returns. Same hand-rolled
// arithmetic, and for the same reason: Hermes ships a trimmed Intl.
export const clockParts = (value: string, locale?: string) => {
    const date = new Date(value);
    const hours = date.getHours();

    return {
        clock: `${String(hours % 12 || 12).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`,
        meridiem: driverLabel(locale, hours < 12 ? 'time.am' : 'time.pm'),
        day: `${date.getDate()} ${driverMonths(locale)[date.getMonth()]}`,
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
export const dayBucket = (date: Date, now = new Date(), locale?: string) => {
    const offset = Math.round((startOfDay(date) - startOfDay(now)) / DAY_MS);
    if (offset === 0) return driverLabel(locale, 'time.today');
    if (offset === 1) return driverLabel(locale, 'time.tomorrow');
    if (offset === -1) return driverLabel(locale, 'time.yesterday');

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
    km == null ? '—' : dc("{{value0}} km", { value0: km >= 100 ? Math.round(km) : km.toFixed(1) });

export const formatDuration = (minutes: number | null) => {
    if (minutes == null) return '—';
    if (minutes < 60) return dc("{{value0}} min", { value0: minutes });

    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest
        ? dc("{{value0}}h {{value1}}m", { value0: hours, value1: rest })
        : dc("{{value0}}h", { value0: hours });
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
export const fareBreakdown = (booking: UpcomingBooking, locale?: string): FareBreakdown => {
    if (booking.status === 'cancelled') {
        const charge = booking.cancellationCharge ?? 0;
        return {
            lines: [{ label: driverLabel(locale, 'money.cancelled'), amount: 0, note: driverLabel(locale, 'money.notCharged') }],
            total: charge,
            totalLabel: charge ? driverLabel(locale, 'money.cancellationCharge') : driverLabel(locale, 'money.nothingOwed'),
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
            { get "label"() { return dc("Ride fare"); }, amount: rideFare },
            {
                get "label"() { return dc("Tolls & extras"); },
                amount: addOns,
                note: booking.needsCarrier ? dc("Includes roof carrier") : dc("Passed through to you"),
            },
            { get "label"() { return dc("Collected from rider"); }, amount: booking.fare },
        ]
        : [{ get "label"() { return dc("Collected from rider"); }, amount: booking.fare }];

    if (commission > 0) {
        lines.push({
            get "label"() { return dc("Provider commission"); },
            amount: -commission,
            note: dc("{{value0}}% of the ride fare", { value0: booking.commissionPct }),
        });
    }

    return { lines, total: booking.fare - commission, get "totalLabel"() { return dc("You keep"); } };
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

export type CustomerPaymentNotice = {
    label: string;
    detail: string;
    tone: 'primary' | 'warning' | 'danger' | 'success' | 'neutral';
};

const scheduledRupees = (amount: number | undefined) =>
    amount == null ? null : amount / 100;

// During a rolling deploy an older API may not send the derived mode yet. A
// scheduled timestamp is still an authoritative safety signal: this ride must
// never fall back to the captain's direct cash-collection path.
const isOnlineCollection = (booking: UpcomingBooking) =>
    booking.collectionMode === 'online' || booking.scheduledAt != null;

/**
 * Payment collection belongs to the customer booking, not this app. The API tells
 * the captain which mode applies; this function only turns that fact into short,
 * one-handed guidance. In particular, never infer a scheduled final payment from
 * a completed ride — it may still be pending on the customer side.
 */
export const customerPaymentNotice = (booking: UpcomingBooking): CustomerPaymentNotice => {
    const scheduled = booking.scheduledPayment;

    if (isOnlineCollection(booking)) {
        if (booking.status === 'cancelled') {
            if (scheduled?.advanceDisposition === 'forfeited_to_driver') {
                const retained = scheduledRupees(scheduled.advancePaidAmount);
                return {
                    label: retained != null
                        ? dc("Advance retained · {{value0}}", { value0: rupees(retained) })
                        : dc("Advance retained"),
                    detail: dc("The customer advance was credited after cancellation. Do not collect again."),
                    tone: 'success',
                };
            }
            if (scheduled?.advanceDisposition === 'refund_pending') {
                return {
                    label: dc("Advance refund pending"),
                    detail: dc("The customer refund is being processed. Do not collect."),
                    tone: 'warning',
                };
            }
            if (scheduled?.advanceDisposition === 'refunded') {
                return {
                    label: dc("Advance refunded"),
                    detail: dc("The customer is not charged. Do not collect."),
                    tone: 'neutral',
                };
            }
            return {
                label: dc("No customer collection"),
                detail: dc("This cancelled scheduled ride has no payment to collect."),
                tone: 'neutral',
            };
        }

        const advance = scheduledRupees(scheduled?.advancePaidAmount);
        const remaining = scheduledRupees(scheduled?.remainingAmount);
        const finalPaid = scheduledRupees(scheduled?.finalPaidAmount);

        if (booking.status !== 'completed') {
            return advance && advance > 0
                ? {
                    label: dc("Advance paid · {{value0}}", { value0: rupees(advance) }),
                    detail: dc("The customer completes the remaining payment after the ride."),
                    tone: 'success',
                }
                : {
                    label: dc("Customer payment"),
                    detail: dc("Payment is handled in the customer booking. Do not collect in this app."),
                    tone: 'primary',
                };
        }

        if (remaining != null && finalPaid != null && finalPaid >= remaining) {
            return {
                label: dc("Payment complete"),
                detail: dc("The customer’s remaining payment has been received."),
                tone: 'success',
            };
        }

        return {
            label: remaining != null
                ? dc("Remaining payment pending · {{value0}}", { value0: rupees(remaining) })
                : dc("Remaining payment pending"),
            detail: dc("The customer completes payment from their booking. Do not collect in this app."),
            tone: 'warning',
        };
    }

    if (booking.status === 'cancelled') {
        return booking.paymentState === 'void'
            ? { label: dc("No charge"), detail: dc("No customer payment is required."), tone: 'neutral' }
            : { label: dc("Cancellation charge"), detail: dc("Contact support to settle this cancellation charge."), tone: 'danger' };
    }

    const amount = booking.customerPayment ?? booking.fare;
    if (booking.paymentState === 'paid') {
        return {
            label: dc("Payment complete"),
            detail: dc("Customer payment has been recorded."),
            tone: 'success',
        };
    }

    return {
        label: dc("Collect {{value0}}", { value0: rupees(amount) }),
        detail: dc("Collect directly from the customer after the ride."),
        tone: 'danger',
    };
};

/**
 * The chip on the collapsed row. `paymentState` is decided server-side
 * (backend/routes/driver.ts) — all that happens here is choosing the captain's
 * words for it, which differ by where the ride is: money still to collect reads as
 * an instruction on a ride ahead of him and as a problem on one behind him.
 */
export const paymentChip = (booking: UpcomingBooking): PaymentChip => {
    const notice = customerPaymentNotice(booking);
    if (isOnlineCollection(booking)) {
        return {
            get "label"() { return notice.label; },
            tone: notice.tone === 'success' ? 'paid' : notice.tone === 'neutral' ? 'void' : 'due',
        };
    }
    if (booking.paymentState === 'paid') return { get "label"() { return dc("Paid"); }, tone: 'paid' };
    if (booking.paymentState === 'retained') return { get "label"() { return dc("Advance retained"); }, tone: 'paid' };
    if (booking.paymentState === 'void') return { get "label"() { return dc("No charge"); }, tone: 'void' };

    if (booking.status === 'cancelled') {
        return { get "label"() { return dc("Charge {{value0}}", {value0: (rupees(booking.cancellationCharge ?? 0))}); }, tone: 'due' };
    }

    return { get "label"() { return dc("Collect {{value0}}", {value0: (rupees(booking.customerPayment ?? booking.fare))}); }, tone: 'due' };
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
    !isOnlineCollection(booking) && booking.paymentState === 'due' && booking.status !== 'cancelled';
