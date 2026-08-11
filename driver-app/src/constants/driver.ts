import type { DriverGroup, VerificationStatus } from '../types/enums';

// The captain's words for the columns on his own driver row. Same job
// constants/booking.ts does for a ride: the keys cross the wire, the words do not.

// The dispatch group, named from his side of it. The engine reads these three as a
// priority order; he reads them as who he drives for, which is why the words here
// say nothing about being offered rides first or last — that belongs on the join
// card, where it is an argument rather than a label.
//
// `admin` is exactly one row (the owner, who also drives), so its word is an office
// rather than a tier. Never print the raw key: "partner" alone reads as a status the
// captain has been demoted to.
const GROUP_LABELS: Record<DriverGroup, string> = {
  admin: 'Owner',
  rcs: 'RCS fleet',
  partner: 'Partner captain',
};

export const groupLabel = (group: DriverGroup) => GROUP_LABELS[group] ?? 'Partner captain';

// Only a partner has anywhere to go: `rcs` is already there and `admin` owns the
// place. This is the whole condition behind the join card, kept here so the page
// does not spell out an enum comparison it would then have to keep in step.
export const canJoinFleet = (group: DriverGroup) => group === 'partner';

// Does this captain drive under RCS Travels? The schema's own answer to that
// question is the rcs-vs-partner split (see the DriverGroup comment in
// schema.prisma), with `admin` on the inside of it — the owner drives for himself,
// which is as far inside the fleet as it gets.
//
// Written as its own predicate rather than as !canJoinFleet(): the two happen to be
// complements today, but one asks whether to show a recruitment card and the other
// asks what colour a badge is, and a third group would very likely split them.
export const isFleet = (group: DriverGroup) => group === 'rcs' || group === 'admin';

// The verification chip. `pending` and `rejected` are not decorations — a captain
// whose papers were turned down has to be able to find that out somewhere, and this
// screen is the only place that holds his own status.
const VERIFICATION_LABELS: Record<VerificationStatus, string> = {
  approved: 'Verified',
  pending: 'In review',
  rejected: 'Not approved',
};

export const verificationLabel = (status: VerificationStatus) =>
  VERIFICATION_LABELS[status] ?? 'In review';

// The captain's own number, grouped the way support's is on the website:
// "+91 98765 43210". The prefix is added here and only here, and it is safe to add
// unconditionally because lib/phone.js normalises every row to a bare ten digits on
// write — no country code, no +, no spaces — precisely so that display is the one
// place that decides how a number looks.
//
// Anything that is not ten digits keeps its own shape rather than being forced into
// the 5-5 split: a row that somehow escaped normalisation should look wrong here, not
// be quietly rearranged into something that reads as a valid number.
export const formatPhone = (phone: string) => {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 10
    ? `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`
    : `+91 ${phone}`;
};

// Two decimals, always. Padded rather than trimmed because a rating that renders
// "4.92" one week and "5" the next reads as having lost a digit rather than as
// having gone up — and at two places a captain can see a bad ride move it, which
// one place hides for weeks.
export const formatRating = (average: number) => average.toFixed(2);
