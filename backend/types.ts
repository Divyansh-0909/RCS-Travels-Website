import {z} from 'zod';
import {BookingStatus, BookingSource, CancelledBy, VerificationStatus, VehicleClass } from '@prisma/client';
import type { Booking, Driver, User } from '@prisma/client';

const bookingListQuerySchema = z.object({
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

// GeoJSON positions are [lng, lat] — the order is a standing trap, and swapping
// them puts an NCR zone in the Indian Ocean. The bounds below only catch a
// nonsense pair; matchZone's ray casting is what gives them meaning.
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

export {bookingListQuerySchema,driverListQuerySchema,myBookingsQuerySchema,userListQuerySchema,fareZoneCollectionSchema}