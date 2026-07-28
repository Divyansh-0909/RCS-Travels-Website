-- Roof-carrier request, stored per booking: the 200 charge is already folded
-- into `fare`, but the driver still has to be told to fit the carrier.
ALTER TABLE "bookings" ADD COLUMN "needs_carrier" BOOLEAN NOT NULL DEFAULT false;
