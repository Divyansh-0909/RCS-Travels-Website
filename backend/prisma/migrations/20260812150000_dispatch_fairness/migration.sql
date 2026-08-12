-- Whose turn it is.
--
-- Ride-now dispatch ranked candidates on distance alone, which at low volume is
-- not a tiebreak: the fleet parks in a handful of fixed spots and nearly every
-- ride starts from the same gate, so the driver waiting closest to it was first
-- in line on every single booking. The one mechanism that spreads load — a
-- claimed vehicle dropping to zero free seats and falling out of contention —
-- only fires when two rides overlap in time, which at low volume never happens.
--
-- These two columns are the memory that fixes that. `last_offered_at` is the
-- fairness key (see the Driver model for why the key is OFFERED and not
-- ASSIGNED); `last_assigned_at` is what separates "offered ten, took none" from
-- "offered ten, took ten", which the offer column alone cannot say.
--
-- Neither is indexed. The ride-now sort runs in JS over candidates the geo scan
-- has already loaded, and no query orders by them.

ALTER TABLE "drivers" ADD COLUMN "last_offered_at" TIMESTAMP(3);
ALTER TABLE "drivers" ADD COLUMN "last_assigned_at" TIMESTAMP(3);

-- ---------------------------------------------------------------------------
-- Backfill, so the first ride after this migration is dealt against real
-- history rather than a fleet-wide NULL.
--
-- Leaving everyone NULL would not be neutral: NULL sorts first for everybody, so
-- the whole fleet ties on the fairness key and the sort falls straight through
-- to distance — exactly the behaviour being replaced, until each driver happens
-- to earn a timestamp. The rows to reconstruct it from already exist.

-- Assignments: the moment the ride became his. `confirmed_at` is stamped in the
-- same statement that sets `driver_id` (see claimBookingForDriver), so it is the
-- assignment time for every row that has one; `created_at` covers the older rows
-- written before that stamp existed.
UPDATE "drivers" d
SET "last_assigned_at" = latest.at
FROM (
    SELECT "driver_id", MAX(COALESCE("confirmed_at", "created_at")) AS at
    FROM "bookings"
    WHERE "driver_id" IS NOT NULL
    GROUP BY "driver_id"
) AS latest
WHERE latest."driver_id" = d."id";

-- Offers: scheduled rides already record every one of them. Ride-now offers were
-- never persisted and are unrecoverable, so an assignment stands in for the
-- offer that produced it — a ride he was given is a chance he has had.
UPDATE "drivers" d
SET "last_offered_at" = GREATEST(
    d."last_assigned_at",
    (SELECT MAX(o."created_at") FROM "ride_offers" o WHERE o."driver_id" = d."id")
);
