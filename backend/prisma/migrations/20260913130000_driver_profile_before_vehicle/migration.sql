-- Registration now creates the captain profile before the first vehicle so the
-- captain can upload driver-owned documents first. These columns remain a cache
-- of active_vehicle_id and are filled atomically when the first vehicle is added.
ALTER TABLE "drivers"
  ALTER COLUMN "vehicle_class" DROP NOT NULL,
  ALTER COLUMN "vehicle_capacity" DROP NOT NULL,
  ALTER COLUMN "vehicle_number" DROP NOT NULL;
