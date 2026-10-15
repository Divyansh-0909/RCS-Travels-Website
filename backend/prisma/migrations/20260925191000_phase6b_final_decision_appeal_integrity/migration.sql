-- A Phase 6A final decision has no appeal, so its nullable appeal_id remains
-- valid. When an appeal is recorded, require it to exist and belong to the
-- same responsibility case as the final decision.
CREATE UNIQUE INDEX "responsibility_appeals_case_id_id_key"
ON "responsibility_appeals"("case_id", "id");

ALTER TABLE "responsibility_final_decisions"
ADD CONSTRAINT "responsibility_final_decisions_case_id_appeal_id_fkey"
FOREIGN KEY ("case_id", "appeal_id") REFERENCES "responsibility_appeals"("case_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;
