CREATE TABLE "responsibility_cases" (
    "id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "case_type" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "evidence_version" TEXT NOT NULL,
    "evidence_hash" TEXT NOT NULL,
    "evidence_snapshot" JSONB NOT NULL,
    "scheduled_at" TIMESTAMP(3),
    "occurred_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "responsibility_cases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "responsibility_analyses" (
    "id" TEXT NOT NULL,
    "logical_key" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "evidence_hash" TEXT NOT NULL,
    "contract_version" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "envelope" JSONB NOT NULL,
    "validation" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "responsibility_analyses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "responsibility_provisional_decisions" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "evidence_version" TEXT NOT NULL,
    "evidence_hash" TEXT NOT NULL,
    "analysis_id" TEXT,
    "analysis_version" TEXT,
    "policy_version" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "reasons" JSONB NOT NULL,
    "passed_gates" JSONB NOT NULL,
    "failed_gates" JSONB NOT NULL,
    "human_review_required" BOOLEAN NOT NULL,
    "evaluated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "responsibility_provisional_decisions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "responsibility_cases_booking_id_case_type_idx"
ON "responsibility_cases"("booking_id", "case_type");

CREATE UNIQUE INDEX "responsibility_analyses_logical_key_key"
ON "responsibility_analyses"("logical_key");

CREATE INDEX "responsibility_analyses_case_id_created_at_idx"
ON "responsibility_analyses"("case_id", "created_at");

CREATE UNIQUE INDEX "responsibility_provisional_decisions_case_id_key"
ON "responsibility_provisional_decisions"("case_id");

CREATE INDEX "responsibility_provisional_decisions_route_evaluated_at_idx"
ON "responsibility_provisional_decisions"("route", "evaluated_at");
