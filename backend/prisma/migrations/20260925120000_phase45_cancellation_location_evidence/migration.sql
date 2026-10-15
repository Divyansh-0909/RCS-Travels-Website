CREATE TABLE "cancellation_location_evidence" (
  "id" TEXT NOT NULL,
  "booking_id" TEXT NOT NULL,
  "driver_id" TEXT,
  "booking_status" TEXT NOT NULL,
  "decision_at" TIMESTAMP(3) NOT NULL,
  "pickup_lat" DOUBLE PRECISION,
  "pickup_lng" DOUBLE PRECISION,
  "location_lat" DOUBLE PRECISION,
  "location_lng" DOUBLE PRECISION,
  "location_observed_at" TIMESTAMP(3),
  "location_received_at" TIMESTAMP(3),
  "location_updated_at" TIMESTAMP(3),
  "accuracy_meters" DOUBLE PRECISION,
  "distance_km" DOUBLE PRECISION,
  "location_fresh" BOOLEAN NOT NULL,
  "pickup_radius_km" DOUBLE PRECISION NOT NULL,
  "driver_at_pickup" BOOLEAN NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cancellation_location_evidence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cancellation_location_evidence_booking_id_key"
  ON "cancellation_location_evidence"("booking_id");

ALTER TABLE "cancellation_location_evidence"
  ADD CONSTRAINT "cancellation_location_evidence_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
