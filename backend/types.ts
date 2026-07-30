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

const rideParamsSchema = z.object({
  id: z.uuid(),
});

const driverOnlineSchema = z.object({
  isOnline: z.boolean(),
});

const fcmTokenSchema = z.object({
  fcmToken: z.string().trim().min(1).max(4096),
});

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


const fareAmount = z.number().int().positive().max(100000);

const zoneFares = z.object({
  hatchback: fareAmount,
  sedan: fareAmount,
  suv: fareAmount,
}).partial();

const position = z.tuple([
  z.number().min(-180).max(180),
  z.number().min(-90).max(90),
]);

const linearRing = z.array(position).min(4).max(2000);

const fareZoneFeature = z.object({
  type: z.literal('Feature'),
  properties: z.object({
    name: z.string().trim().min(1).max(120),
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
  features: z.array(fareZoneFeature).min(1).max(500),
});

export {locationSchema, bookingListQuerySchema,driverListQuerySchema,myBookingsQuerySchema,userListQuerySchema,fareZoneCollectionSchema}
export {rideParamsSchema, driverOnlineSchema, fcmTokenSchema, rideStatusSchema}