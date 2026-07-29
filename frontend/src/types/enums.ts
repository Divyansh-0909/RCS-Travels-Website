// Frontend mirror of the Prisma enums in backend/prisma/schema.prisma. Union string
// literals give type-safety without bundling @prisma/client (backend-only) into the frontend.

export type BookingStatus =
  | "pending"
  | "confirmed"
  | "assigned"
  | "en_route"
  | "reached"
  | "started"
  | "completed"
  | "cancelled"
  | "no_driver";

export type BookingSource = "website" | "whatsapp" | "admin";

export type CancelledBy = "user" | "driver" | "admin";

export type VerificationStatus = "pending" | "approved" | "rejected";

// Keys must match constants/vehicles.js — that map carries the labels, seat
// counts and categories; this is only the type for them.
export type VehicleClass = "hatchback" | "sedan" | "suv" | "suv_premium";
