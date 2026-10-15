ALTER TABLE "responsibility_final_decisions"
ADD COLUMN "evidence_version" TEXT,
ADD COLUMN "source" TEXT NOT NULL DEFAULT 'PHASE6A_COMPAT',
ADD COLUMN "reason" TEXT NOT NULL DEFAULT 'Finalized before Phase 6B lifecycle',
ADD COLUMN "actor_id" TEXT,
ADD COLUMN "appeal_id" TEXT,
ADD COLUMN "previous_state" TEXT;

CREATE TABLE "responsibility_admin_reviews" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "admin_actor_id" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "decided_at" TIMESTAMP(3) NOT NULL,
    "evidence_version" TEXT NOT NULL,
    "evidence_hash" TEXT NOT NULL,
    "policy_version" TEXT NOT NULL,
    "previous_state" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "responsibility_admin_reviews_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "responsibility_appeal_windows" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "source_decision_id" TEXT NOT NULL,
    "source_decision_type" TEXT NOT NULL,
    "notice_retry_key" TEXT NOT NULL,
    "appeal_started_at" TIMESTAMP(3),
    "appeal_deadline" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "responsibility_appeal_windows_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "responsibility_appeals" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "appeal_window_id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "additional_evidence" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "responsibility_appeals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "responsibility_appeal_reviews" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "appeal_id" TEXT NOT NULL,
    "reviewer_id" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "reviewed_at" TIMESTAMP(3) NOT NULL,
    "evidence_version" TEXT NOT NULL,
    "evidence_hash" TEXT NOT NULL,
    "policy_version" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "responsibility_appeal_reviews_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "responsibility_finalization_handoffs" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "final_decision_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_attempt_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "responsibility_finalization_handoffs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "responsibility_admin_reviews_case_id_key" ON "responsibility_admin_reviews"("case_id");
CREATE INDEX "responsibility_admin_reviews_decision_decided_at_idx" ON "responsibility_admin_reviews"("decision", "decided_at");
CREATE UNIQUE INDEX "responsibility_appeal_windows_case_id_key" ON "responsibility_appeal_windows"("case_id");
CREATE UNIQUE INDEX "responsibility_appeal_windows_notice_retry_key_key" ON "responsibility_appeal_windows"("notice_retry_key");
CREATE INDEX "responsibility_appeal_windows_appeal_deadline_idx" ON "responsibility_appeal_windows"("appeal_deadline");
CREATE UNIQUE INDEX "responsibility_appeals_case_id_key" ON "responsibility_appeals"("case_id");
CREATE UNIQUE INDEX "responsibility_appeals_appeal_window_id_key" ON "responsibility_appeals"("appeal_window_id");
CREATE INDEX "responsibility_appeals_driver_id_submitted_at_idx" ON "responsibility_appeals"("driver_id", "submitted_at");
CREATE UNIQUE INDEX "responsibility_appeal_reviews_case_id_key" ON "responsibility_appeal_reviews"("case_id");
CREATE UNIQUE INDEX "responsibility_appeal_reviews_appeal_id_key" ON "responsibility_appeal_reviews"("appeal_id");
CREATE INDEX "responsibility_appeal_reviews_outcome_reviewed_at_idx" ON "responsibility_appeal_reviews"("outcome", "reviewed_at");
CREATE UNIQUE INDEX "responsibility_finalization_handoffs_case_id_key" ON "responsibility_finalization_handoffs"("case_id");
CREATE UNIQUE INDEX "responsibility_finalization_handoffs_final_decision_id_key" ON "responsibility_finalization_handoffs"("final_decision_id");
CREATE INDEX "responsibility_finalization_handoffs_status_created_at_idx" ON "responsibility_finalization_handoffs"("status", "created_at");

ALTER TABLE "responsibility_admin_reviews" ADD CONSTRAINT "responsibility_admin_reviews_case_id_fkey"
FOREIGN KEY ("case_id") REFERENCES "responsibility_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "responsibility_appeal_windows" ADD CONSTRAINT "responsibility_appeal_windows_case_id_fkey"
FOREIGN KEY ("case_id") REFERENCES "responsibility_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "responsibility_appeals" ADD CONSTRAINT "responsibility_appeals_case_id_fkey"
FOREIGN KEY ("case_id") REFERENCES "responsibility_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "responsibility_appeals" ADD CONSTRAINT "responsibility_appeals_appeal_window_id_fkey"
FOREIGN KEY ("appeal_window_id") REFERENCES "responsibility_appeal_windows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "responsibility_appeal_reviews" ADD CONSTRAINT "responsibility_appeal_reviews_case_id_fkey"
FOREIGN KEY ("case_id") REFERENCES "responsibility_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "responsibility_appeal_reviews" ADD CONSTRAINT "responsibility_appeal_reviews_appeal_id_fkey"
FOREIGN KEY ("appeal_id") REFERENCES "responsibility_appeals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "responsibility_finalization_handoffs" ADD CONSTRAINT "responsibility_finalization_handoffs_case_id_fkey"
FOREIGN KEY ("case_id") REFERENCES "responsibility_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "responsibility_finalization_handoffs" ADD CONSTRAINT "responsibility_finalization_handoffs_final_decision_id_fkey"
FOREIGN KEY ("final_decision_id") REFERENCES "responsibility_final_decisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
