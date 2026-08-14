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
  
export type VehicleClass = "hatchback" | "sedan" | "suv" | "suv_premium";

// A captain's place in the dispatch queue. `admin` is the owner's own row and the
// dashboard can read it but never write it — see the group route in
// backend/routes/admin.ts, which refuses it.
export type DriverGroup = "admin" | "rcs" | "partner";

export type RideStatusTransition = "reached" | "started" | "completed";
