-- A captain may own several cars and drive one at a time.
--
-- Everything before this migration assumed one car per driver, and encoded that
-- assumption in two places: the four vehicle columns on `drivers`, and the
-- one-row-per-type unique key on `driver_documents`. Nine of the eleven document
-- types are about the CAR, so a second car is a second RC, a second insurance
-- policy and a second fitness certificate — which the old key cannot hold.
--
-- The four columns on `drivers` STAY. They become a cache of the active car,
-- because `vehicle_class` is the fourth column of the eligibility index every
-- assignment scan hits and moving it out turns each scan into a join.

-- ---------------------------------------------------------------------------
-- 1. The cars.

CREATE TABLE "vehicles" (
    "id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "class" "VehicleClass" NOT NULL,
    "number" TEXT NOT NULL,
    "model" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verification_status" "VerificationStatus" NOT NULL DEFAULT 'notUploaded',

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- The same plate twice under one captain is always a mistake — he is re-adding a
-- car he already has, and the second row would split its documents across two
-- identities. Scoped to the driver rather than global, because a plate
-- legitimately moves between owners when a car is sold.
CREATE UNIQUE INDEX "vehicles_driver_id_number_key" ON "vehicles"("driver_id", "number");
CREATE INDEX "vehicles_driver_id_idx" ON "vehicles"("driver_id");

ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_driver_id_fkey"
    FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 2. Which car he is driving.
--
-- SET NULL rather than CASCADE: deleting a car must not delete its owner. The
-- captain is simply left with no active car, which every route already treats as
-- not dispatchable — the same state he is in between signing up and adding one.

ALTER TABLE "drivers" ADD COLUMN "active_vehicle_id" TEXT;

CREATE UNIQUE INDEX "drivers_active_vehicle_id_key" ON "drivers"("active_vehicle_id");

ALTER TABLE "drivers" ADD CONSTRAINT "drivers_active_vehicle_id_fkey"
    FOREIGN KEY ("active_vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 3. Backfill: every existing driver becomes a driver with exactly one car.
--
-- The car is built from the four columns he already carries, so nothing about
-- his dispatch behaviour changes — the cache and its source agree by
-- construction on the day this runs.
--
-- verification_status is deliberately left at the default here and put right in
-- step 7, once the documents have been attached and can actually be counted.

INSERT INTO "vehicles" ("id", "driver_id", "class", "number", "model", "created_at")
SELECT
    gen_random_uuid()::text,
    d."id",
    d."vehicle_class",
    d."vehicle_number",
    d."vehicle_model",
    d."created_at"
FROM "drivers" d;

UPDATE "drivers" d
SET "active_vehicle_id" = v."id"
FROM "vehicles" v
WHERE v."driver_id" = d."id";

-- ---------------------------------------------------------------------------
-- 4. Documents gain an owner.
--
-- `owner_id` is `vehicle_id` when the type is about a car and `driver_id` when
-- it is about the man. It exists because the natural key —
-- (driver_id, vehicle_id, type, is_replacement) — cannot be used from Prisma:
-- every member of a compound-unique `where` input is typed non-nullable, since
-- SQL unique constraints do not match on NULL, so the upsert that writes every
-- document would have no way to address a row whose vehicle_id is null. A
-- partial unique index is the other option and Prisma drops those on the next
-- `migrate dev`.

ALTER TABLE "driver_documents" ADD COLUMN "vehicle_id" TEXT;
ALTER TABLE "driver_documents" ADD COLUMN "owner_id" TEXT;

-- The nine car documents attach to the one car their driver now has. The two
-- person-owned types — his licence and his photograph — keep vehicle_id NULL and
-- own themselves.
UPDATE "driver_documents" doc
SET "vehicle_id" = v."id"
FROM "vehicles" v
WHERE v."driver_id" = doc."driver_id"
  AND doc."type" NOT IN ('dl', 'profile_photo');

UPDATE "driver_documents"
SET "owner_id" = COALESCE("vehicle_id", "driver_id");

ALTER TABLE "driver_documents" ALTER COLUMN "owner_id" SET NOT NULL;

ALTER TABLE "driver_documents" ADD CONSTRAINT "driver_documents_vehicle_id_fkey"
    FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The key moves off the driver and onto the owner. Same guarantee as before —
-- at most one current row and one pending replacement per type — but now per
-- CAR for the nine, so the Dzire's insurance and the Innova's can coexist.
DROP INDEX IF EXISTS "driver_documents_driver_id_type_is_replacement_key";

CREATE UNIQUE INDEX "driver_documents_owner_id_type_is_replacement_key"
    ON "driver_documents"("owner_id", "type", "is_replacement");

-- The dropped unique key was also covering the driver FK for parent deletes and
-- serving "everything this captain holds". Both need an index of their own now.
CREATE INDEX "driver_documents_driver_id_idx" ON "driver_documents"("driver_id");
CREATE INDEX "driver_documents_vehicle_id_idx" ON "driver_documents"("vehicle_id");

-- ---------------------------------------------------------------------------
-- 5. The archive remembers which car, without a foreign key.
--
-- Deliberately not an FK: the archive answers "what insurance was in force on
-- the day of that ride" long after the car has been sold and its row deleted,
-- and a foreign key would either take the history with it or refuse the delete.

ALTER TABLE "driver_document_archive" ADD COLUMN "vehicle_id" TEXT;

UPDATE "driver_document_archive" a
SET "vehicle_id" = v."id"
FROM "vehicles" v
WHERE v."driver_id" = a."driver_id"
  AND a."type" NOT IN ('dl', 'profile_photo');

-- ---------------------------------------------------------------------------
-- 6. The plate a ride was actually done in.
--
-- Snapshotted at assignment from here on. Backfilled from the driver's current
-- car, which is correct for every existing row precisely because nobody has had
-- a second car until now — this is the last moment at which that backfill is
-- true, which is the reason to do it in the same migration that makes it false.

ALTER TABLE "bookings" ADD COLUMN "vehicle_number" TEXT;

UPDATE "bookings" b
SET "vehicle_number" = d."vehicle_number"
FROM "drivers" d
WHERE b."driver_id" = d."id";

-- ---------------------------------------------------------------------------
-- 7. Each car's own verdict.
--
-- A car is approved when every REQUIRED vehicle-owned type has a current row
-- that is approved and has not lapsed. The seven are rc, insurance, tax,
-- fitness, permit_all_india and the two car photos — permit_one_year and
-- cng_test are optional (they only exist for some cars) and cannot hold up an
-- approval by their absence.
--
-- Only `approved` is computed here. Everything else is left at `notUploaded` and
-- corrected within the hour by the expiry sweep and by the next document write,
-- both of which run the real six-state ladder in
-- services/driverDocuments.js — which is the only place that ladder should ever
-- live, and duplicating it in SQL is how the two would eventually disagree.

UPDATE "vehicles" v
SET "verification_status" = 'approved'
WHERE NOT EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
        'rc', 'insurance', 'tax', 'fitness',
        'permit_all_india', 'car_photo_front', 'car_photo_back'
    ]::"DriverDocumentType"[]) AS required(type)
    WHERE NOT EXISTS (
        SELECT 1
        FROM "driver_documents" doc
        WHERE doc."vehicle_id" = v."id"
          AND doc."type" = required.type
          AND doc."is_replacement" = false
          AND doc."status" = 'approved'
          AND (doc."expires_at" IS NULL OR doc."expires_at" > NOW())
    )
);
