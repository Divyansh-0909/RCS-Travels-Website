-- Move the ride-verification code from bookings to users: one stable 4-digit
-- code per user, shown to the driver on every ride.

-- 1. Drop the per-booking code.
DROP INDEX "bookings_booking_code_key";
ALTER TABLE "bookings" DROP COLUMN "booking_code";

-- 2. Add the per-user code, nullable first so existing rows can be backfilled.
ALTER TABLE "users" ADD COLUMN "booking_code" TEXT;

-- 3. Backfill each existing user with a unique 4-digit code (0000, 0001, ...).
--    Ordered for determinism; unique as long as there are fewer than 10000 users.
WITH numbered AS (
  SELECT "id", row_number() OVER (ORDER BY "created_at", "id") AS rn
  FROM "users"
)
UPDATE "users" u
SET "booking_code" = lpad(((numbered.rn - 1) % 10000)::text, 4, '0')
FROM numbered
WHERE u."id" = numbered."id";

-- 4. Enforce NOT NULL + uniqueness now that every row has a value.
ALTER TABLE "users" ALTER COLUMN "booking_code" SET NOT NULL;
CREATE UNIQUE INDEX "users_booking_code_key" ON "users"("booking_code");
