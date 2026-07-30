-- When the driver marked arrival at the pickup and when the ride actually began.
-- `status` only ever holds the CURRENT state, so once a ride is cancelled or
-- completed nothing records that it passed through `reached` — and `reached` is
-- what decides the 35% cancellation charge (CHARGEABLE_STATUSES in
-- routes/bookings.js). Without these, the evidence for that charge is destroyed by
-- the very transition that acts on it. Nullable for every ride taken before this
-- migration; timestamps cannot be backfilled.
ALTER TABLE "bookings" ADD COLUMN     "started_at" TIMESTAMP(3);
ALTER TABLE "bookings" ADD COLUMN     "reached_at" TIMESTAMP(3);

-- How far the driver was from the pickup / drop when he marked each transition, in
-- km, measured server-side against the position his app reported. "The driver says
-- he arrived" and "the driver was there" are different claims, and only the second
-- should be able to bill a rider 35%.
--
-- Nullable, like distance_km: a booking row is created long before either distance
-- exists, so a NOT NULL column here would break every booking create. Null also
-- covers a transition sent with no position, which is the normal case when an OEM
-- battery killer has taken out the location service mid-ride.
ALTER TABLE "bookings" ADD COLUMN     "reached_distance_km" DOUBLE PRECISION;
ALTER TABLE "bookings" ADD COLUMN     "completed_distance_km" DOUBLE PRECISION;
