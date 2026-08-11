-- Give every ride a human-readable name, "RCS4831902", alongside its uuid.
--
-- Three steps rather than one: a NOT NULL UNIQUE column cannot be added to a
-- table that already has rows, and `prisma migrate dev` emits exactly that and
-- fails on any non-empty bookings table. Add nullable, backfill, then constrain.
-- (Same shape as 20260703000000_move_booking_code_to_user, which had to do this
-- for users.booking_code.)

-- 1. Nullable first, so the existing rides can be filled in.
ALTER TABLE "bookings" ADD COLUMN "reference" TEXT;

-- 2. Backfill. New references are random (lib/bookingReference.js), but a
--    backfill cannot be: random values would collide inside this one statement
--    with no retry available, and re-rolling in SQL is far worse than picking a
--    scheme that is unique by construction.
--
--    So: multiply the row number by a constant coprime with 10^7. Multiplication
--    by a unit is injective modulo 10^7, so distinct rows always get distinct
--    values, while the output is scattered enough that the backfilled codes do
--    not read as a ride counter the way plain row numbers would. 4816549 is
--    divisible by neither 2 nor 5, which is all "coprime with 10^7" requires.
--
--    Ordered by created_at for determinism, so re-running this migration against
--    a restored dump produces the same references it did the first time.
WITH numbered AS (
  SELECT "id", row_number() OVER (ORDER BY "created_at", "id") AS rn
  FROM "bookings"
)
UPDATE "bookings" b
SET "reference" = 'RCS' || lpad(((numbered.rn * 4816549) % 10000000)::text, 7, '0')
FROM numbered
WHERE b."id" = numbered."id";

-- 3. Constrain, now that every row has a value.
ALTER TABLE "bookings" ALTER COLUMN "reference" SET NOT NULL;
CREATE UNIQUE INDEX "bookings_reference_key" ON "bookings"("reference");
