ALTER TABLE "responsibility_consequence_executions"
ADD COLUMN "reliability_applied_at" TIMESTAMP(3),
ADD COLUMN "reliability_attempted_at" TIMESTAMP(3),
ADD COLUMN "reliability_last_error" TEXT;

CREATE TABLE "reliability_strikes" (
    "id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "responsibility_case_id" TEXT NOT NULL,
    "final_decision_id" TEXT NOT NULL,
    "consequence_execution_id" TEXT NOT NULL,
    "consequence_level" TEXT NOT NULL,
    "incident_type" TEXT NOT NULL,
    "policy_version" TEXT NOT NULL,
    "source_key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UPHELD',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reliability_strikes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reliability_blocks" (
    "id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "source_strike_id" TEXT NOT NULL,
    "threshold" INTEGER NOT NULL,
    "source_key" TEXT NOT NULL,
    "blocked_at" TIMESTAMP(3) NOT NULL,
    "blocked_until" TIMESTAMP(3),
    "removed_at" TIMESTAMP(3),
    "removed_by" TEXT,
    "removal_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reliability_blocks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reliability_strikes_responsibility_case_id_key"
ON "reliability_strikes"("responsibility_case_id");
CREATE UNIQUE INDEX "reliability_strikes_final_decision_id_key"
ON "reliability_strikes"("final_decision_id");
CREATE UNIQUE INDEX "reliability_strikes_consequence_execution_id_key"
ON "reliability_strikes"("consequence_execution_id");
CREATE UNIQUE INDEX "reliability_strikes_source_key_key"
ON "reliability_strikes"("source_key");
CREATE INDEX "reliability_strikes_driver_id_created_at_idx"
ON "reliability_strikes"("driver_id", "created_at");

CREATE UNIQUE INDEX "reliability_blocks_source_strike_id_key"
ON "reliability_blocks"("source_strike_id");
CREATE UNIQUE INDEX "reliability_blocks_source_key_key"
ON "reliability_blocks"("source_key");
CREATE INDEX "reliability_blocks_driver_id_type_removed_at_idx"
ON "reliability_blocks"("driver_id", "type", "removed_at");
CREATE INDEX "reliability_blocks_driver_id_blocked_until_idx"
ON "reliability_blocks"("driver_id", "blocked_until");

CREATE UNIQUE INDEX "reliability_blocks_one_active_indefinite_per_driver"
ON "reliability_blocks"("driver_id")
WHERE "type" = 'INDEFINITE' AND "removed_at" IS NULL;

ALTER TABLE "reliability_strikes"
ADD CONSTRAINT "reliability_strikes_level_check"
CHECK ("consequence_level" = 'LEVEL_2');

ALTER TABLE "reliability_strikes"
ADD CONSTRAINT "reliability_strikes_status_check"
CHECK ("status" = 'UPHELD');

ALTER TABLE "reliability_blocks"
ADD CONSTRAINT "reliability_blocks_type_threshold_check"
CHECK (("type" = 'TEMPORARY' AND "threshold" = 5 AND "blocked_until" IS NOT NULL)
    OR ("type" = 'INDEFINITE' AND "threshold" = 7 AND "blocked_until" IS NULL));

ALTER TABLE "reliability_blocks"
ADD CONSTRAINT "reliability_blocks_removal_audit_check"
CHECK (("removed_at" IS NULL AND "removed_by" IS NULL AND "removal_reason" IS NULL)
    OR ("removed_at" IS NOT NULL AND "removed_by" IS NOT NULL AND length(btrim("removal_reason")) >= 3));

ALTER TABLE "reliability_strikes"
ADD CONSTRAINT "reliability_strikes_driver_id_fkey"
FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reliability_strikes"
ADD CONSTRAINT "reliability_strikes_responsibility_case_id_fkey"
FOREIGN KEY ("responsibility_case_id") REFERENCES "responsibility_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reliability_strikes"
ADD CONSTRAINT "reliability_strikes_final_decision_id_fkey"
FOREIGN KEY ("final_decision_id") REFERENCES "responsibility_final_decisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reliability_strikes"
ADD CONSTRAINT "reliability_strikes_consequence_execution_id_fkey"
FOREIGN KEY ("consequence_execution_id") REFERENCES "responsibility_consequence_executions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "reliability_blocks"
ADD CONSTRAINT "reliability_blocks_driver_id_fkey"
FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reliability_blocks"
ADD CONSTRAINT "reliability_blocks_source_strike_id_fkey"
FOREIGN KEY ("source_strike_id") REFERENCES "reliability_strikes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION prevent_reliability_strike_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'reliability_strikes records are append-only';
END;
$$;

CREATE TRIGGER reliability_strikes_append_only
BEFORE UPDATE OR DELETE ON "reliability_strikes"
FOR EACH ROW EXECUTE FUNCTION prevent_reliability_strike_mutation();

CREATE TRIGGER reliability_strikes_prevent_truncate
BEFORE TRUNCATE ON "reliability_strikes"
FOR EACH STATEMENT EXECUTE FUNCTION prevent_reliability_strike_mutation();

CREATE FUNCTION prevent_reliability_block_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'reliability_blocks history cannot be deleted';
END;
$$;

CREATE TRIGGER reliability_blocks_prevent_delete
BEFORE DELETE ON "reliability_blocks"
FOR EACH ROW EXECUTE FUNCTION prevent_reliability_block_delete();

CREATE TRIGGER reliability_blocks_prevent_truncate
BEFORE TRUNCATE ON "reliability_blocks"
FOR EACH STATEMENT EXECUTE FUNCTION prevent_reliability_block_delete();
