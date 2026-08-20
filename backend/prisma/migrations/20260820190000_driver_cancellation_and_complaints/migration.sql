ALTER TABLE "drivers"
  ADD COLUMN "cancellation_benefit_restricted_until" TIMESTAMP(3);

CREATE TABLE "driver_cancellations" (
  "id" TEXT NOT NULL,
  "driver_id" TEXT NOT NULL,
  "booking_id" TEXT NOT NULL,
  "from_status" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "driver_cancellations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "driver_cancellations_driver_id_created_at_idx" ON "driver_cancellations"("driver_id", "created_at");
ALTER TABLE "driver_cancellations"
  ADD CONSTRAINT "driver_cancellations_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "driver_cancellations_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ride_complaints" (
  "id" TEXT NOT NULL,
  "booking_id" TEXT NOT NULL,
  "driver_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "reasons" TEXT[] NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ride_complaints_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ride_complaints_booking_id_key" ON "ride_complaints"("booking_id");
CREATE INDEX "ride_complaints_driver_id_created_at_idx" ON "ride_complaints"("driver_id", "created_at");
ALTER TABLE "ride_complaints"
  ADD CONSTRAINT "ride_complaints_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ride_complaints_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ride_complaints_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
