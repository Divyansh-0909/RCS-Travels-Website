ALTER TABLE "bookings"
  ADD COLUMN "reached_accuracy_m" DOUBLE PRECISION,
  ADD COLUMN "reached_location_at" TIMESTAMP(3),
  ADD COLUMN "completed_accuracy_m" DOUBLE PRECISION,
  ADD COLUMN "completed_location_at" TIMESTAMP(3),
  ADD COLUMN "completion_override_reason" TEXT,
  ADD COLUMN "completion_customer_confirmed" BOOLEAN NOT NULL DEFAULT false;
