-- Phase 4.5: keep device observation metadata separate from the server's
-- receipt time. These columns are nullable so legacy rows and legacy clients
-- remain truthful: missing provenance stays unknown.
ALTER TABLE "driver_locations"
  ADD COLUMN "observed_at" TIMESTAMP(3),
  ADD COLUMN "received_at" TIMESTAMP(3),
  ADD COLUMN "accuracy_meters" DOUBLE PRECISION;
