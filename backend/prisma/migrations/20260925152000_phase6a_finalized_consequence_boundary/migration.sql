ALTER TABLE "drivers"
ADD COLUMN "suspension_scope" TEXT;

CREATE TABLE "responsibility_final_decisions" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "evidence_hash" TEXT NOT NULL,
    "policy_version" TEXT NOT NULL,
    "finalized_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "responsibility_final_decisions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "responsibility_consequence_executions" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "final_decision_id" TEXT NOT NULL,
    "policy_version" TEXT NOT NULL,
    "finalized_at" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 1,
    "authorized_at" TIMESTAMP(3) NOT NULL,
    "applied_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "responsibility_consequence_executions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "responsibility_final_decisions_case_id_key"
ON "responsibility_final_decisions"("case_id");

CREATE INDEX "responsibility_final_decisions_outcome_finalized_at_idx"
ON "responsibility_final_decisions"("outcome", "finalized_at");

CREATE UNIQUE INDEX "responsibility_consequence_executions_case_id_key"
ON "responsibility_consequence_executions"("case_id");

CREATE UNIQUE INDEX "responsibility_consequence_executions_final_decision_id_key"
ON "responsibility_consequence_executions"("final_decision_id");

CREATE INDEX "responsibility_consequence_executions_status_authorized_at_idx"
ON "responsibility_consequence_executions"("status", "authorized_at");

ALTER TABLE "responsibility_final_decisions"
ADD CONSTRAINT "responsibility_final_decisions_case_id_fkey"
FOREIGN KEY ("case_id") REFERENCES "responsibility_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "responsibility_consequence_executions"
ADD CONSTRAINT "responsibility_consequence_executions_case_id_fkey"
FOREIGN KEY ("case_id") REFERENCES "responsibility_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "responsibility_consequence_executions"
ADD CONSTRAINT "responsibility_consequence_executions_final_decision_id_fkey"
FOREIGN KEY ("final_decision_id") REFERENCES "responsibility_final_decisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
