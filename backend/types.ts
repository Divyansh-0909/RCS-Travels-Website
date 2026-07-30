import {z} from 'zod';
import {BookingStatus, BookingSource, CancelledBy, VerificationStatus, VehicleClass } from '@prisma/client';
import type { Booking, Driver, User } from '@prisma/client';

const locationSchema = z.object({
  lat: z.number(),
  lng: z.number(),
});

const bookingListQuerySchema = z.object({
  id: z.string().optional(),
  search: z.string().trim().min(2).optional(),
  status: z.enum(BookingStatus).optional(),
  startDate: z.iso.date().optional(),
  endDate: z.iso.date().optional(),
  customerPhone: z.string().trim().optional(),
  customerName: z.string().trim().optional(),
  driverName: z.string().trim().optional(),
  vehicleClass: z.enum(VehicleClass).optional(),
  source: z.enum(BookingSource).optional(),
  isOutstation: z
    .enum(["true", "false"])
    .transform(value => value === "true")
    .optional(),
  cancelledBy: z.enum(CancelledBy).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

// A user's own ride history — the admin booking list minus the customer/source/cancelledBy filters.
const myBookingsQuerySchema = z.object({
  search: z.string().trim().min(2).optional(),
  status: z.enum(BookingStatus).optional(),
  vehicleClass: z.enum(VehicleClass).optional(),
  startDate: z.iso.date().optional(),
  endDate: z.iso.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
});

const driverListQuerySchema = z.object({
  search: z.string().trim().min(2).optional(),
  driverName: z.string().trim().optional(),
  driverPhone: z.string().trim().optional(),
  vehicleClass: z.enum(VehicleClass).optional(),
  vehicleNumber: z.string().trim().optional(),
  verificationStatus: z.enum(VerificationStatus).optional(),
  isOnline: z
    .enum(["true", "false"])
    .transform(value => value === "true")
    .optional(),
  startDate: z.iso.date().optional(),
  endDate: z.iso.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

// ─── Driver app requests ─────────────────────────────────────────────────────
// Bodies and params for the driver-facing routes. These are separate from the
// admin *ListQuery schemas above on purpose: those describe a dashboard filter
// (every field optional, paginated), which is the opposite of what a state-changing
// request from a phone should accept.

// Booking ids are uuid (@default(uuid()) on Booking.id). Validating the shape here
// means a junk :id is a 400 rather than a database round-trip.
const rideParamsSchema = z.object({
  id: z.uuid(),
});

const driverOnlineSchema = z.object({
  isOnline: z.boolean(),
});

const fcmTokenSchema = z.object({
  // FCM registration tokens have no documented fixed length and have grown over
  // time, so this bounds rather than pins it.
  fcmToken: z.string().trim().min(1).max(4096),
});

// PATCH /api/driver/rides/:id/status — `to` is the state the driver is moving the
// ride INTO. The legal predecessors of each are in RIDE_TRANSITIONS (routes/
// driver.ts); the server reads the current state off the row rather than trusting
// the app to report it.
//
// lat/lng are optional by design: they are evidence, not a precondition. An OEM
// battery killer taking out the location service must not leave a driver unable to
// complete a ride he is sitting in.
const rideStatusSchema = z.object({
  to: z.enum(['reached', 'started', 'completed']),
  otp: z.string().trim().optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

const userListQuerySchema = z.object({
  search: z.string().trim().min(2).optional(),
  userName: z.string().trim().optional(),
  userPhone: z.string().trim().optional(),
  gender: z.string().trim().optional(),
  startDate: z.iso.date().optional(),
  endDate: z.iso.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

// ─── Fare zones ──────────────────────────────────────────────────────────────
// What the Edit Fares tab is allowed to save. This is the only guard between a
// slip in the editor and every ride in a zone being mispriced, so it is strict:
// a fare that arrives as a string, a polygon that never closes, or a stray
// property all get a 400 rather than a best-effort coercion.

// Rupees. Integral because the provider quotes whole rupees and the editor steps
// in 50s; capped well above the dearest real fare (Manesar SUV, ₹3200) so a
// fat-fingered extra digit is caught rather than charged.
const fareAmount = z.number().int().positive().max(100000);

// Absent means "this class does not run here" — the website then falls back to
// distance pricing. That is a real, chosen state, so every class is optional.
// Unknown keys are stripped: suv_premium has no zone rates yet, and silently
// accepting one would imply a rate card that rideEstimate does not read.
const zoneFares = z.object({
  hatchback: fareAmount,
  sedan: fareAmount,
  suv: fareAmount,
}).partial();

// GeoJSON positions are [lng, lat], and this tuple is where that is asserted for
// anything arriving over HTTP.
//
// The bounds below CANNOT catch a swap in NCR: the region is lat 28, lng 77, and
// both are legal latitudes, so a reversed pair validates cleanly and then tests
// outside every polygon forever. Nothing downstream can catch it either — code
// that reads a position by index exists in exactly one place per app (pointInRing
// and friends in services/geo.js), so there is no second implementation to
// disagree with this one, but a file whose rings were reversed by hand still
// parses. The only real check is behavioural: probe a known point in the Edit
// Fares checker, or run scripts/check-shady-zones.js, and see a fare come back.
const position = z.tuple([
  z.number().min(-180).max(180),
  z.number().min(-90).max(90),
]);

// Four positions is the minimum closed triangle: three corners plus the repeat
// that closes the ring.
const linearRing = z.array(position).min(4).max(2000);

const fareZoneFeature = z.object({
  type: z.literal('Feature'),
  properties: z.object({
    name: z.string().trim().min(1).max(120),
    // Decides which zone wins where two overlap, so it is bounded rather than
    // free — see the border-blending rule in services/fareZones.js.
    priority: z.number().int().min(0).max(100).default(0),
    fares: zoneFares.default({}),
    toll: z.number().int().min(0).max(100000).optional(),
    notes: z.string().max(2000).optional(),
  }),
  geometry: z.object({
    type: z.literal('Polygon'),
    coordinates: z.array(linearRing).min(1),
  }),
});

const fareZoneCollectionSchema = z.object({
  type: z.literal('FeatureCollection'),
  // Empty would delete the rate card and put every ride on the distance curve,
  // which is never what a save means — the editor blocks it too.
  features: z.array(fareZoneFeature).min(1).max(500),
});

export {locationSchema, bookingListQuerySchema,driverListQuerySchema,myBookingsQuerySchema,userListQuerySchema,fareZoneCollectionSchema}
export {rideParamsSchema, driverOnlineSchema, fcmTokenSchema, rideStatusSchema}