ALTER TABLE "responsibility_consequence_executions"
ADD COLUMN "financial_attempted_at" TIMESTAMP(3),
ADD COLUMN "financial_last_error" TEXT;

CREATE INDEX "responsibility_consequence_executions_financial_retry_idx"
ON "responsibility_consequence_executions" ("status", "financial_applied_at", "financial_attempted_at");
