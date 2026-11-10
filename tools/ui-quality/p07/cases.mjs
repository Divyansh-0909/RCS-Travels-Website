const financials = { fare: 100000, coupon: 10000, finalFare: 90000, advance: 9000, advancePaid: 9000, remaining: 81000, finalPaid: 0, advancePercentage: 10, advanceDisposition: null };
const driver = { name: 'Synthetic Captain', phone: '9990000101', vehicleNumber: 'SYNTHETIC', vehicleModel: 'Synthetic Sedan', photoUrl: null, latitude: 28.61, longitude: 77.21 };
export const base = { bookingId: 'p07-synthetic', bookingCode: 'SYNTHETIC', reference: 'P07-SYNTHETIC', status: 'assigned', pickupAddress: 'Synthetic Pickup, Fixture City', dropAddress: 'Synthetic Destination, Fixture City', pickupLat: 28.61, pickupLng: 77.21, dropLat: 28.65, dropLng: 77.25, distanceKm: 12, durationMin: 32, fare: 1000, vehicleClass: 'sedan', sharing: false, preferSafeRoute: false, scheduledAt: null, driver, navigationEtaMinutes: 8, financials: null, ridePayment: null, cancellationCharge: 0 };
const scheduled = { scheduledAt: '2026-11-02T09:00:00.000Z', financials };
const terminal = { status: 'completed', driver, ridePayment: { amount: 90000, state: 'pending', upiAvailable: true, method: null } };
const cancelled = disposition => ({ ...base, ...scheduled, status: 'cancelled', driver: null, financials: { ...financials, advanceDisposition: disposition } });
export const cases = {
  assigned: { data: base }, en_route: { data: { ...base, status: 'en_route' } }, reached: { data: { ...base, status: 'reached' } }, started: { data: { ...base, status: 'started' } },
  searching: { data: { ...base, status: 'pending', driver: null } },
  confirmed: { data: { ...base, ...scheduled, status: 'confirmed', driver: null } },
  advance: { data: { ...base, ...scheduled, status: 'payment_pending', driver: null, financials: { ...financials, advancePaid: 0 } } },
  'payment-missing': { data: { ...base, ...scheduled, status: 'payment_pending', driver: null, financials: null } },
  completed: { data: { ...base, ...terminal } },
  'completed-scheduled': { data: { ...base, ...scheduled, ...terminal, ridePayment: { ...terminal.ridePayment, amount: 81000 } } },
  'cash-paid': { data: { ...base, ...terminal, ridePayment: { ...terminal.ridePayment, state: 'paid', method: 'cash' } } },
  'upi-paid': { data: { ...base, ...terminal, ridePayment: { ...terminal.ridePayment, state: 'paid', method: 'upi' } } },
  'cash-only': { data: { ...base, ...terminal, ridePayment: { ...terminal.ridePayment, upiAvailable: false } } },
  'cancel-no-advance': { data: { ...base, status: 'cancelled', driver: null } },
  'refund-pending': { data: cancelled('refund_pending'), next: cancelled('refunded') },
  'partial-refund-pending': { data: cancelled('partial_refund_pending'), next: cancelled('partially_refunded') },
  refunded: { data: cancelled('refunded') }, 'partial-refunded': { data: cancelled('partially_refunded') }, retained: { data: cancelled('retained') },
  'no-driver': { data: { ...base, status: 'no_driver', driver: null } },
  failure: { data: { error: 'Synthetic read unavailable', status: 503 }, http: 503 },
  denied: { data: { error: 'Synthetic booking unavailable', status: 404 }, http: 404 },
  stale: { data: { ...base, status: 'en_route' }, next: { error: 'Synthetic read unavailable', status: 503 }, nextHttp: 503 },
  recovery: { data: { error: 'Synthetic read unavailable', status: 503 }, http: 503, next: base, nextHttp: 200 },
  loading: { data: base, delay: 6000 },
  'hidden-notice': { series: [{ body: { ...base, status: 'en_route' } }, { body: { error: 'Synthetic stale update', status: 503 }, http: 503 }, { body: { ...base, status: 'started' } }] },
};
export const caseIds = Object.keys(cases);
export function responseFor(id, sequence) { const c = cases[id]; if (c.series) return { ...c.series[Math.min(sequence - 1, c.series.length - 1)], delay: 0, http: c.series[Math.min(sequence - 1, c.series.length - 1)].http || 200 }; return { body: sequence > 1 && c.next ? c.next : c.data, http: sequence > 1 && c.next ? c.nextHttp || 200 : c.http || 200, delay: c.delay || 0 }; }
