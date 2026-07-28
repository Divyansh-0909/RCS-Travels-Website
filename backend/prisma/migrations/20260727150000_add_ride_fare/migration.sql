-- The commissionable part of a fare: the total minus pass-through charges
-- (toll, parking, airport access, roof carrier). Nullable because rows written
-- before this column existed have no breakdown to recover — for those,
-- commission_amt / commission_pct is still the record of what was taken.
ALTER TABLE "bookings" ADD COLUMN "ride_fare" DOUBLE PRECISION;
