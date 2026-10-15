ALTER TYPE "WalletEntryType" ADD VALUE IF NOT EXISTS 'liability_recovery';
ALTER TYPE "WalletEntryType" ADD VALUE IF NOT EXISTS 'responsibility_compensation_funding';

ALTER TABLE "responsibility_consequence_executions"
ADD COLUMN "financial_applied_at" TIMESTAMP(3);

CREATE INDEX "responsibility_consequence_executions_financial_applied_at_pending_idx"
ON "responsibility_consequence_executions" ("financial_applied_at")
WHERE "financial_applied_at" IS NULL;

CREATE TABLE "responsibility_liabilities" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "final_decision_id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "authoritative_fare_paise" INTEGER NOT NULL,
    "rate_bps" INTEGER NOT NULL,
    "cap_paise" INTEGER NOT NULL,
    "amount_paise" INTEGER NOT NULL,
    "policy_version" TEXT NOT NULL,
    "calculated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "responsibility_liabilities_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "responsibility_liabilities_authoritative_fare_paise_check" CHECK ("authoritative_fare_paise" > 0),
    CONSTRAINT "responsibility_liabilities_rate_bps_check" CHECK ("rate_bps" > 0),
    CONSTRAINT "responsibility_liabilities_cap_paise_check" CHECK ("cap_paise" > 0),
    CONSTRAINT "responsibility_liabilities_amount_paise_check" CHECK ("amount_paise" >= 0)
);

CREATE TABLE "responsibility_liability_entries" (
    "id" TEXT NOT NULL,
    "liability_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amount_paise" INTEGER NOT NULL,
    "source_key" TEXT NOT NULL,
    "earning_booking_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "responsibility_liability_entries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "responsibility_liability_entries_kind_check" CHECK ("kind" IN ('CREATED', 'RECOVERED', 'CORRECTION')),
    CONSTRAINT "responsibility_liability_entries_amount_paise_check" CHECK ("amount_paise" <> 0)
);

CREATE TABLE "responsibility_compensations" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "liability_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "amount_paise" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "responsibility_compensations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "responsibility_compensations_amount_paise_check" CHECK ("amount_paise" > 0)
);

CREATE TABLE "responsibility_compensation_allocations" (
    "id" TEXT NOT NULL,
    "compensation_id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "amount_paise" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "source_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consumed_at" TIMESTAMP(3),
    "released_at" TIMESTAMP(3),
    CONSTRAINT "responsibility_compensation_allocations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "responsibility_compensation_allocations_amount_paise_check" CHECK ("amount_paise" > 0),
    CONSTRAINT "responsibility_compensation_allocations_status_check" CHECK ("status" IN ('RESERVED', 'CONSUMED', 'RELEASED')),
    CONSTRAINT "responsibility_compensation_allocations_terminal_timestamp_check" CHECK (
        ("status" = 'RESERVED' AND "consumed_at" IS NULL AND "released_at" IS NULL)
        OR ("status" = 'CONSUMED' AND "consumed_at" IS NOT NULL AND "released_at" IS NULL)
        OR ("status" = 'RELEASED' AND "released_at" IS NOT NULL AND "consumed_at" IS NULL)
    )
);

CREATE UNIQUE INDEX "responsibility_liabilities_case_id_key" ON "responsibility_liabilities"("case_id");
CREATE UNIQUE INDEX "responsibility_liabilities_final_decision_id_key" ON "responsibility_liabilities"("final_decision_id");
CREATE INDEX "responsibility_liabilities_driver_id_created_at_idx" ON "responsibility_liabilities"("driver_id", "created_at");
CREATE INDEX "responsibility_liabilities_booking_id_idx" ON "responsibility_liabilities"("booking_id");
CREATE UNIQUE INDEX "responsibility_liability_entries_source_key_key" ON "responsibility_liability_entries"("source_key");
CREATE INDEX "responsibility_liability_entries_liability_id_created_at_idx" ON "responsibility_liability_entries"("liability_id", "created_at");
CREATE INDEX "responsibility_liability_entries_earning_booking_id_idx" ON "responsibility_liability_entries"("earning_booking_id");
CREATE UNIQUE INDEX "responsibility_compensations_case_id_key" ON "responsibility_compensations"("case_id");
CREATE UNIQUE INDEX "responsibility_compensations_liability_id_key" ON "responsibility_compensations"("liability_id");
CREATE INDEX "responsibility_compensations_user_id_created_at_idx" ON "responsibility_compensations"("user_id", "created_at");
CREATE UNIQUE INDEX "responsibility_compensation_allocations_source_key_key" ON "responsibility_compensation_allocations"("source_key");
CREATE INDEX "responsibility_compensation_allocations_compensation_id_status_idx" ON "responsibility_compensation_allocations"("compensation_id", "status");
CREATE INDEX "responsibility_compensation_allocations_booking_id_idx" ON "responsibility_compensation_allocations"("booking_id");

ALTER TABLE "responsibility_liabilities" ADD CONSTRAINT "responsibility_liabilities_case_id_fkey"
FOREIGN KEY ("case_id") REFERENCES "responsibility_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "responsibility_liabilities" ADD CONSTRAINT "responsibility_liabilities_final_decision_id_fkey"
FOREIGN KEY ("final_decision_id") REFERENCES "responsibility_final_decisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "responsibility_liabilities" ADD CONSTRAINT "responsibility_liabilities_driver_id_fkey"
FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "responsibility_liabilities" ADD CONSTRAINT "responsibility_liabilities_booking_id_fkey"
FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "responsibility_liability_entries" ADD CONSTRAINT "responsibility_liability_entries_liability_id_fkey"
FOREIGN KEY ("liability_id") REFERENCES "responsibility_liabilities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "responsibility_liability_entries" ADD CONSTRAINT "responsibility_liability_entries_earning_booking_id_fkey"
FOREIGN KEY ("earning_booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "responsibility_compensations" ADD CONSTRAINT "responsibility_compensations_case_id_fkey"
FOREIGN KEY ("case_id") REFERENCES "responsibility_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "responsibility_compensations" ADD CONSTRAINT "responsibility_compensations_liability_id_fkey"
FOREIGN KEY ("liability_id") REFERENCES "responsibility_liabilities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "responsibility_compensations" ADD CONSTRAINT "responsibility_compensations_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "responsibility_compensation_allocations" ADD CONSTRAINT "responsibility_compensation_allocations_compensation_id_fkey"
FOREIGN KEY ("compensation_id") REFERENCES "responsibility_compensations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "responsibility_compensation_allocations" ADD CONSTRAINT "responsibility_compensation_allocations_booking_id_fkey"
FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
