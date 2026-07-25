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
