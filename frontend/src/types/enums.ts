// Frontend mirror of the Prisma enums in backend/prisma/schema.prisma.
// These are values that arrive over the API as plain strings, so union
// string literals give type-safety without pulling in @prisma/client
// (a backend-only package that must never be bundled into the frontend).

export type BookingStatus =
  | "pending"
  | "confirmed"
  | "assigned"
  | "en_route"
  | "reached"
  | "started"
  | "completed"
  | "cancelled";

export type BookingSource = "website" | "whatsapp" | "admin";

export type CancelledBy = "user" | "driver" | "admin";

export type VerificationStatus = "pending" | "approved" | "rejected";
