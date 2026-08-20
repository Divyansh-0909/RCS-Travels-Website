ALTER TABLE "ride_offers" ADD COLUMN "pool_host_booking_id" TEXT;

ALTER TABLE "ride_offers"
  ADD CONSTRAINT "ride_offers_pool_host_booking_id_fkey"
  FOREIGN KEY ("pool_host_booking_id") REFERENCES "bookings"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "ride_offers_pool_host_booking_id_idx"
  ON "ride_offers"("pool_host_booking_id");
