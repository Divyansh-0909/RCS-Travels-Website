import {z} from 'zod';
import {BookingStatus, BookingSource, CancelledBy, VerificationStatus } from '@prisma/client';
import type { Booking, Driver, User } from '@prisma/client';

const bookingListQuerySchema = z.object({
  status: z.enum(BookingStatus).optional(),
  date: z.iso.date().optional(),
  phone: z.string().trim().optional(),
  customerName: z.string().trim().optional(),
  driverName: z.string().trim().optional(),
  vehicleType: z.coerce
    .number()
    .pipe(z.union([z.literal(4), z.literal(6)]))
    .optional(),
  source: z.enum(BookingSource).optional(),
  isOutstation: z
    .enum(["true", "false"])
    .transform(value => value === "true")
    .optional(),
  cancelledBy: z.enum(CancelledBy).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

const driverListQuerySchema = z.object({
  name: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  vehicleType: z.coerce
    .number()
    .pipe(z.union([z.literal(4), z.literal(6)]))
    .optional(),
  vehicleNumber: z.string().trim().optional(),
  verificationStatus: z.enum(VerificationStatus).optional(),
  isOnline: z
    .enum(["true", "false"])
    .transform(value => value === "true")
    .optional(),
  date: z.iso.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export {bookingListQuerySchema,driverListQuerySchema}