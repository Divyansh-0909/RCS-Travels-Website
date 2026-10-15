ALTER TABLE "responsibility_final_decisions"
ADD COLUMN "classification" TEXT;

ALTER TABLE "responsibility_admin_reviews"
ADD COLUMN "classification" TEXT;

ALTER TABLE "responsibility_appeal_reviews"
ADD COLUMN "classification" TEXT;

ALTER TABLE "responsibility_final_decisions"
ADD CONSTRAINT "responsibility_final_decisions_classification_check"
CHECK ("classification" IS NULL OR "classification" IN (
  'DRIVER_CAUSED', 'PLATFORM_CAUSED', 'VALID_WAIVED', 'EXTERNAL_OR_UNCERTAIN', 'NEEDS_REVIEW'
));

ALTER TABLE "responsibility_admin_reviews"
ADD CONSTRAINT "responsibility_admin_reviews_classification_check"
CHECK ("classification" IS NULL OR "classification" IN (
  'DRIVER_CAUSED', 'PLATFORM_CAUSED', 'VALID_WAIVED', 'EXTERNAL_OR_UNCERTAIN', 'NEEDS_REVIEW'
));

ALTER TABLE "responsibility_appeal_reviews"
ADD CONSTRAINT "responsibility_appeal_reviews_classification_check"
CHECK ("classification" IS NULL OR "classification" IN (
  'DRIVER_CAUSED', 'PLATFORM_CAUSED', 'VALID_WAIVED', 'EXTERNAL_OR_UNCERTAIN', 'NEEDS_REVIEW'
));
