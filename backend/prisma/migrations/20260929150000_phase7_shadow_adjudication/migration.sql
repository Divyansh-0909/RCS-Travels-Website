ALTER TABLE "responsibility_cases"
ADD COLUMN "source_key" TEXT;

CREATE UNIQUE INDEX "responsibility_cases_source_key_key"
ON "responsibility_cases"("source_key");

CREATE TABLE "responsibility_evidence_versions" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "evidence_version" TEXT NOT NULL,
    "evidence_hash" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "responsibility_evidence_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "responsibility_adjudication_work" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "evidence_version_id" TEXT NOT NULL,
    "logical_key" TEXT NOT NULL,
    "contract_version" TEXT NOT NULL,
    "analyst_config_version" TEXT NOT NULL,
    "policy_version" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "manual_retry_count" INTEGER NOT NULL DEFAULT 0,
    "claimed_at" TIMESTAMP(3),
    "lease_until" TIMESTAMP(3),
    "last_attempted_at" TIMESTAMP(3),
    "next_retry_at" TIMESTAMP(3),
    "last_error_category" TEXT,
    "last_error_detail" TEXT,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "responsibility_adjudication_work_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "responsibility_adjudication_work_status_check"
      CHECK ("status" IN ('PENDING', 'PROCESSING', 'RETRYABLE', 'COMPLETED', 'MANUAL_REVIEW')),
    CONSTRAINT "responsibility_adjudication_work_attempt_count_check" CHECK ("attempt_count" >= 0),
    CONSTRAINT "responsibility_adjudication_work_manual_retry_count_check" CHECK ("manual_retry_count" >= 0)
);

CREATE TABLE "responsibility_shadow_results" (
    "id" TEXT NOT NULL,
    "work_id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "evidence_version_id" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'SHADOW',
    "evidence_version" TEXT NOT NULL,
    "evidence_hash" TEXT NOT NULL,
    "analysis_provider_id" TEXT,
    "analysis_version" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "analyst_config_version" TEXT NOT NULL,
    "policy_version" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "suggested_classification" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "severity" TEXT NOT NULL,
    "facts_supporting" JSONB NOT NULL,
    "facts_against" JSONB NOT NULL,
    "inferences" JSONB NOT NULL,
    "missing_evidence" JSONB NOT NULL,
    "contradictions" JSONB NOT NULL,
    "passed_gates" JSONB NOT NULL,
    "failed_gates" JSONB NOT NULL,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "request_count" INTEGER NOT NULL DEFAULT 1,
    "processing_latency_ms" INTEGER NOT NULL,
    "attempt_count" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "responsibility_shadow_results_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "responsibility_shadow_results_mode_check" CHECK ("mode" = 'SHADOW'),
    CONSTRAINT "responsibility_shadow_results_confidence_check" CHECK ("confidence" >= 0 AND "confidence" <= 1),
    CONSTRAINT "responsibility_shadow_results_input_tokens_check" CHECK ("input_tokens" IS NULL OR "input_tokens" >= 0),
    CONSTRAINT "responsibility_shadow_results_output_tokens_check" CHECK ("output_tokens" IS NULL OR "output_tokens" >= 0),
    CONSTRAINT "responsibility_shadow_results_request_count_check" CHECK ("request_count" > 0),
    CONSTRAINT "responsibility_shadow_results_latency_check" CHECK ("processing_latency_ms" >= 0),
    CONSTRAINT "responsibility_shadow_results_attempt_count_check" CHECK ("attempt_count" > 0)
);

CREATE UNIQUE INDEX "responsibility_evidence_versions_case_id_evidence_hash_key"
ON "responsibility_evidence_versions"("case_id", "evidence_hash");
CREATE INDEX "responsibility_evidence_versions_case_id_created_at_idx"
ON "responsibility_evidence_versions"("case_id", "created_at");

CREATE UNIQUE INDEX "responsibility_adjudication_work_logical_key_key"
ON "responsibility_adjudication_work"("logical_key");
CREATE INDEX "responsibility_adjudication_work_status_next_retry_at_created_at_idx"
ON "responsibility_adjudication_work"("status", "next_retry_at", "created_at");
CREATE INDEX "responsibility_adjudication_work_case_id_created_at_idx"
ON "responsibility_adjudication_work"("case_id", "created_at");

CREATE UNIQUE INDEX "responsibility_shadow_results_work_id_key"
ON "responsibility_shadow_results"("work_id");
CREATE INDEX "responsibility_shadow_results_case_id_created_at_idx"
ON "responsibility_shadow_results"("case_id", "created_at");
CREATE INDEX "responsibility_shadow_results_route_created_at_idx"
ON "responsibility_shadow_results"("route", "created_at");

ALTER TABLE "responsibility_evidence_versions" ADD CONSTRAINT "responsibility_evidence_versions_case_id_fkey"
FOREIGN KEY ("case_id") REFERENCES "responsibility_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "responsibility_adjudication_work" ADD CONSTRAINT "responsibility_adjudication_work_case_id_fkey"
FOREIGN KEY ("case_id") REFERENCES "responsibility_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "responsibility_adjudication_work" ADD CONSTRAINT "responsibility_adjudication_work_evidence_version_id_fkey"
FOREIGN KEY ("evidence_version_id") REFERENCES "responsibility_evidence_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "responsibility_shadow_results" ADD CONSTRAINT "responsibility_shadow_results_work_id_fkey"
FOREIGN KEY ("work_id") REFERENCES "responsibility_adjudication_work"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "responsibility_shadow_results" ADD CONSTRAINT "responsibility_shadow_results_case_id_fkey"
FOREIGN KEY ("case_id") REFERENCES "responsibility_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "responsibility_shadow_results" ADD CONSTRAINT "responsibility_shadow_results_evidence_version_id_fkey"
FOREIGN KEY ("evidence_version_id") REFERENCES "responsibility_evidence_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
