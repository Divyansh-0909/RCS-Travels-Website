ALTER TABLE "responsibility_final_decisions"
ADD COLUMN "consequence_level" TEXT;

ALTER TABLE "responsibility_admin_reviews"
ADD COLUMN "consequence_level" TEXT;

ALTER TABLE "responsibility_appeal_reviews"
ADD COLUMN "consequence_level" TEXT;

-- Legacy adverse records have no level source. Preserve them at the minimum
-- adverse level instead of deriving LEVEL_2 from case type.
UPDATE "responsibility_final_decisions"
SET "consequence_level" = CASE WHEN "outcome" = 'FINAL_WAIVED' THEN 'LEVEL_0' ELSE 'LEVEL_1' END;

UPDATE "responsibility_admin_reviews"
SET "consequence_level" = CASE WHEN "decision" = 'WAIVE' THEN 'LEVEL_0' ELSE 'LEVEL_1' END;

UPDATE "responsibility_appeal_reviews"
SET "consequence_level" = CASE WHEN "outcome" = 'WAIVE' THEN 'LEVEL_0' ELSE 'LEVEL_1' END;

ALTER TABLE "responsibility_final_decisions"
ALTER COLUMN "consequence_level" SET NOT NULL;

ALTER TABLE "responsibility_admin_reviews"
ALTER COLUMN "consequence_level" SET NOT NULL;

ALTER TABLE "responsibility_appeal_reviews"
ALTER COLUMN "consequence_level" SET NOT NULL;

ALTER TABLE "responsibility_final_decisions"
ADD CONSTRAINT "responsibility_final_decisions_consequence_level_check"
CHECK (("outcome" = 'FINAL_WAIVED' AND "consequence_level" = 'LEVEL_0')
  OR ("outcome" = 'FINAL_UPHELD' AND "consequence_level" IN ('LEVEL_1', 'LEVEL_2')));

ALTER TABLE "responsibility_admin_reviews"
ADD CONSTRAINT "responsibility_admin_reviews_consequence_level_check"
CHECK (("decision" = 'WAIVE' AND "consequence_level" = 'LEVEL_0')
  OR ("decision" = 'UPHOLD' AND "consequence_level" IN ('LEVEL_1', 'LEVEL_2')));

ALTER TABLE "responsibility_appeal_reviews"
ADD CONSTRAINT "responsibility_appeal_reviews_consequence_level_check"
CHECK (("outcome" = 'WAIVE' AND "consequence_level" = 'LEVEL_0')
  OR ("outcome" = 'UPHOLD' AND "consequence_level" IN ('LEVEL_1', 'LEVEL_2')));
