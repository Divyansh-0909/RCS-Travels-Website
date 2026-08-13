-- What a shared ride costs if nobody ever joins it.
--
-- Nullable and unbackfilled by design: it is set only on sharing bookings, from
-- the same signed quote the discounted fare came from, and every booking made
-- before this column existed was priced under the old rule where the discount
-- was honoured whether or not a co-rider appeared. A null therefore means "this
-- ride does not revert", which is the correct reading for all of them.
ALTER TABLE "bookings" ADD COLUMN     "solo_fare" DOUBLE PRECISION;
