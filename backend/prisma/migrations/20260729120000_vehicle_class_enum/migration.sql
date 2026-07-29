-- Replaces `vehicle_type` (the integer seat count: 4, 6 or 1) with a vehicle
-- CLASS on every table that carried it. A seat count cannot distinguish a sedan
-- from a hatchback — both carry four — so the fleet could not gain a sedan or a
-- premium SUV without this. Seats are now derived from the class in application
-- code (backend/constants/vehicles.js).
--
-- Backfill is deliberately lossy in the safe direction: every existing 4-seater
-- row becomes `hatchback` and every 6-seater `suv`, which are exactly the two
-- classes the old two-option UI could produce. Nothing existing was ever a sedan
-- or a premium SUV, so no row is mislabelled.
--
-- The old `1` ("book any") has no successor — that option is gone from the
-- product. Those bookings were quoted and billed at the cheapest class, so they
-- land on `hatchback`: the price they actually paid.

-- CreateEnum
CREATE TYPE "VehicleClass" AS ENUM ('hatchback', 'sedan', 'suv', 'suv_premium');

-- ─── bookings ───────────────────────────────────────────────────────────────
ALTER TABLE "bookings" ADD COLUMN "vehicle_class" "VehicleClass";

UPDATE "bookings" SET "vehicle_class" = CASE "vehicle_type"
    WHEN 6 THEN 'suv'::"VehicleClass"
    ELSE        'hatchback'::"VehicleClass"
END;

ALTER TABLE "bookings" ALTER COLUMN "vehicle_class" SET NOT NULL;
ALTER TABLE "bookings" DROP COLUMN "vehicle_type";

-- ─── drivers ────────────────────────────────────────────────────────────────
-- The eligibility index leads on the other three columns but ends on the vehicle,
-- so it has to be rebuilt around the new one.
DROP INDEX "drivers_is_online_is_active_verification_status_vehicle_typ_idx";

ALTER TABLE "drivers" ADD COLUMN "vehicle_class" "VehicleClass";

-- A driver is a real car, so it can never be ANY; anything that isn't a 6-seater
-- falls back to the cheapest class rather than inventing a premium vehicle.
UPDATE "drivers" SET "vehicle_class" = CASE "vehicle_type"
    WHEN 6 THEN 'suv'::"VehicleClass"
    ELSE        'hatchback'::"VehicleClass"
END;

ALTER TABLE "drivers" ALTER COLUMN "vehicle_class" SET NOT NULL;
ALTER TABLE "drivers" DROP COLUMN "vehicle_type";

CREATE INDEX "drivers_is_online_is_active_verification_status_vehicle_cla_idx" ON "drivers"("is_online", "is_active", "verification_status", "vehicle_class");

-- ─── fare_table ─────────────────────────────────────────────────────────────
DROP INDEX "fare_table_destination_name_vehicle_type_key";

ALTER TABLE "fare_table" ADD COLUMN "vehicle_class" "VehicleClass";

UPDATE "fare_table" SET "vehicle_class" = CASE "vehicle_type"
    WHEN 6 THEN 'suv'::"VehicleClass"
    ELSE        'hatchback'::"VehicleClass"
END;

ALTER TABLE "fare_table" ALTER COLUMN "vehicle_class" SET NOT NULL;
ALTER TABLE "fare_table" DROP COLUMN "vehicle_type";

CREATE UNIQUE INDEX "fare_table_destination_name_vehicle_class_key" ON "fare_table"("destination_name", "vehicle_class");
