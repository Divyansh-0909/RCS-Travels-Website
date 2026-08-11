-- The human name of the car ("Toyota Innova Crysta"), for the captain app's Account
-- screen. Nullable with no default and no backfill on purpose: the vehicle CLASS is
-- what the fare, the dispatcher and every booking are built on, and this column is
-- only ever the label a person would say out loud. Existing rows keep NULL and every
-- reader falls back to the class label, so nothing depends on it being filled.
ALTER TABLE "drivers" ADD COLUMN "vehicle_model" TEXT;
