ALTER TABLE "bookings"
  ADD COLUMN "driver_assigned_at" TIMESTAMP(3),
  ADD COLUMN "expected_pickup_at" TIMESTAMP(3);
