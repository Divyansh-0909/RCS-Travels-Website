// What GET /driver/rides returns for every ride, on both scopes. Home reads the
// top half; the Rides page's expanded row reads all of it.
export type UpcomingBooking = {
  id: string;
  // The ride's readable name, "RCS4831902". `id` is still the uuid every request
  // is keyed on; this is the one a captain can say out loud on a support call.
  reference: string;
  status: string;
  pickupAddress: string;
  dropAddress: string;
  // Null on a ride booked for right now, which is why every caller has an
  // "Immediate pickup" branch rather than a formatted date.
  scheduledAt: string | null;
  fare: number;
  vehicleClass: string;
  sharing: boolean;
  isOutstation: boolean;
  // Both read only by the active panel: who is in the car, and the number to call.
  customerPhone: string;
  user: { name: string | null };

  // Everything below is on the row so expanding it costs no request. All of it is
  // nullable for a reason the server cannot fix: a booking is created long before
  // its distance, its earnings or its end time are known.
  needsCarrier: boolean;
  distanceKm: number | null;
  // The driving fare with the pass-through charges (toll, parking, airport access,
  // carrier) stripped out — `fare - rideFare` is what recovers them. Commission is
  // a percentage of this, not of the total.
  rideFare: number | null;
  commissionPct: number;
  commissionAmt: number;
  cancelledBy: string | null;
  cancellationCharge: number | null;
  completedAt: string | null;
  createdAt: string;
  // Measured, never estimated: startedAt -> completedAt, so it is null on every
  // ride that has not finished. The app labels its own estimate as one.
  durationMin: number | null;
  // Derived server-side (routes/driver.ts). 'void' is a cancelled ride that owes
  // nothing. The app renders this and decides nothing about money itself.
  paymentState: 'paid' | 'due' | 'void';
};

export type RidesScope = 'upcoming' | 'history';

// The dispatch group, straight off the driver row. It is a priority tier to the
// assignment engine and an affiliation to the captain — `rcs` is the fleet the
// provider vouches for, `partner` is everyone else, and `admin` is the one row that
// belongs to the owner. The app only ever names it; it decides nothing from it
// except which of those three words to print.
export type DriverGroup = 'admin' | 'rcs' | 'partner';

export type VerificationStatus = 'pending' | 'approved' | 'rejected';

// What GET /driver/me returns. Everything below the vehicle is aggregated per
// request rather than stored, so none of it is on the driver row and all of it can
// be absent: a captain with no reviews has no rating at all.
export type DriverProfile = {
  id: string;
  name: string;
  phone: string;
  pfpUrl: string | null;
  verificationStatus: VerificationStatus;
  rejectionReason: string | null;
  isOnline: boolean;

  // THE CAR HE IS DRIVING RIGHT NOW, not the only one he owns. A captain may
  // keep a hatchback and an Innova and switch between them on /account/vehicles;
  // these four describe whichever is active, and change when he switches.
  vehicleClass: string;
  vehicleNumber: string;
  // "Toyota Innova Crysta", or null on a row created before the column existed.
  // Every reader falls back to the class label — nothing may branch on this.
  vehicleModel: string | null;
  // The SIZE of the car, derived server-side from its class. Deliberately not the
  // driver row's vehicleCapacity, which is a live remaining-seat counter that drops
  // as riders board a shared ride. Null if the class has no seat count on file.
  vehicleSeats: number | null;
  // Which Vehicle row the four above are a copy of. Null only between signing up
  // and adding a first car, and after the last one is removed.
  activeVehicleId: string | null;
  // How many cars he keeps. The app shows a switcher only when there is something
  // to switch between — a picker with one entry is a control that does nothing.
  vehicleCount: number;

  // THE RIDE HE IS DRIVING RIGHT NOW — en_route, reached or started — and null
  // whenever he is not on one. Deliberately not derivable from
  // onboarding.assignedRides, which counts `assigned` as well: a captain who
  // accepted Tuesday's airport run on Sunday holds a ride for days without being
  // on one. The shell reads this to take itself apart while he drives.
  activeRide: { id: string; status: string } | null;

  group: DriverGroup;
  // Signed. Negative is not a bug — an unpaid fine bigger than the credit on hand
  // is exactly the state that stops him going online, so the screen has to say so.
  walletBalance: number;
  // Null until somebody has rated him. An average of nothing is not 0.0.
  rating: { average: number; count: number } | null;
  // The calendar month so far, in the same shape the Rides board's week uses. The
  // period differs on purpose: History answers "how did this week go" beside a list
  // of recent rides, and Account answers "how am I doing" against monthly costs.
  month: RidesSummary;
  // Documents inside 30 days of lapsing, or already lapsed.
  expiringDocuments: number;
};

// The History board's header panel. Aggregated over the whole account server-side, not
// over the page the app is holding, so it stays right once a captain out-earns the
// page size. Null on the upcoming board, which has nothing finished to total.
export type RidesSummary = {
  /** Fare minus commission — the same figure the expanded row calls "You keep". */
  earned: number;
  /** Completed rides only. A cancellation is not a ride done. */
  rides: number;
  /** Start of the period, 00:00 IST — Monday for the week, the 1st for the month —
      so the app can say what it was totalling. */
  since: string;
};
