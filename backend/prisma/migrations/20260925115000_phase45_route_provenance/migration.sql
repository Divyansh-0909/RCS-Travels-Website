CREATE TABLE "route_observations" (
  "id" TEXT NOT NULL,
  "booking_id" TEXT NOT NULL,
  "event" TEXT NOT NULL,
  "origin_lat" DOUBLE PRECISION,
  "origin_lng" DOUBLE PRECISION,
  "destination_lat" DOUBLE PRECISION,
  "destination_lng" DOUBLE PRECISION,
  "provider" TEXT NOT NULL,
  "traffic_mode" TEXT NOT NULL,
  "duration_seconds" DOUBLE PRECISION,
  "traffic_duration_seconds" DOUBLE PRECISION,
  "distance_meters" DOUBLE PRECISION,
  "calculated_at" TIMESTAMP(3) NOT NULL,
  "received_at" TIMESTAMP(3) NOT NULL,
  "cache_identity" TEXT,
  "cache_hit" BOOLEAN NOT NULL DEFAULT false,
  "cache_age_ms" DOUBLE PRECISION,
  "provider_route_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "route_observations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "route_observations_booking_id_event_calculated_at_idx"
  ON "route_observations"("booking_id", "event", "calculated_at");

ALTER TABLE "route_observations"
  ADD CONSTRAINT "route_observations_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
