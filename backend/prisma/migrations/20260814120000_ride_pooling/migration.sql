-- Ride pooling: the stop sequence of a shared trip, and the two route facts the
-- matcher needs.
--
-- All four are nullable with no default and no backfill, which is correct rather
-- than lazy: every existing booking predates pooling, so it has no sequence, and
-- its route was never stored to recover. A null here means "unknown", and the
-- matcher treats a booking with no polyline as one that cannot host a pool.
ALTER TABLE "bookings" ADD COLUMN     "drop_order" INTEGER,
ADD COLUMN     "duration_min" INTEGER,
ADD COLUMN     "route_polyline" TEXT;
