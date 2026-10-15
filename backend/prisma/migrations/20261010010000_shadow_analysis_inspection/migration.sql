-- Retain the validated analyst envelope with its guarded result for protected
-- administration. Historical results remain NULL; do not reconstruct raw output.
ALTER TABLE "responsibility_shadow_results"
  ADD COLUMN "analysis_envelope" JSONB,
  ADD COLUMN "factual_validation" JSONB;
