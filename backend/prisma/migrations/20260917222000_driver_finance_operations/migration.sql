ALTER TYPE "WalletEntryType" ADD VALUE IF NOT EXISTS 'debt_payment';
ALTER TYPE "WalletEntryType" ADD VALUE IF NOT EXISTS 'payout_reversal';
ALTER TYPE "PaymentPurpose" ADD VALUE IF NOT EXISTS 'driver_debt_settlement';

CREATE TYPE "DriverPayoutBatchStatus" AS ENUM ('draft', 'processing', 'completed', 'partial');
CREATE TYPE "DriverPayoutStatus" AS ENUM ('pending', 'processing', 'paid', 'failed', 'reversed');

ALTER TABLE "drivers"
  ADD COLUMN "payout_upi_id" TEXT,
  ADD COLUMN "payout_upi_verified_at" TIMESTAMP(3);

ALTER TABLE "payments"
  ALTER COLUMN "user_id" DROP NOT NULL,
  ADD COLUMN "driver_id" TEXT,
  ADD COLUMN "driver_debt_applied_amount" INTEGER,
  ADD COLUMN "driver_debt_refund_amount" INTEGER;

CREATE INDEX "payments_driver_id_created_at_idx" ON "payments"("driver_id", "created_at");

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_driver_id_fkey"
  FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_owner_purpose_check"
  CHECK (
    ("purpose"::text = 'driver_debt_settlement' AND "driver_id" IS NOT NULL AND "user_id" IS NULL AND "booking_id" IS NULL)
    OR
    ("purpose"::text <> 'driver_debt_settlement' AND "user_id" IS NOT NULL AND "driver_id" IS NULL)
  );

CREATE TABLE "driver_payout_batches" (
  "id" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "status" "DriverPayoutBatchStatus" NOT NULL DEFAULT 'draft',
  "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "executed_at" TIMESTAMP(3),
  CONSTRAINT "driver_payout_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "driver_payouts" (
  "id" TEXT NOT NULL,
  "batch_id" TEXT NOT NULL,
  "driver_id" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "status" "DriverPayoutStatus" NOT NULL DEFAULT 'pending',
  "idempotency_key" TEXT NOT NULL,
  "external_payout_id" TEXT,
  "payout_upi_id" TEXT NOT NULL,
  "failure_code" TEXT,
  "failure_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "paid_at" TIMESTAMP(3),
  CONSTRAINT "driver_payouts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "driver_payout_batches_created_at_idx" ON "driver_payout_batches"("created_at");
CREATE UNIQUE INDEX "driver_payout_batches_reference_key" ON "driver_payout_batches"("reference");
CREATE UNIQUE INDEX "driver_payouts_idempotency_key_key" ON "driver_payouts"("idempotency_key");
CREATE UNIQUE INDEX "driver_payouts_external_payout_id_key" ON "driver_payouts"("external_payout_id");
CREATE INDEX "driver_payouts_batch_id_status_idx" ON "driver_payouts"("batch_id", "status");
CREATE INDEX "driver_payouts_driver_id_created_at_idx" ON "driver_payouts"("driver_id", "created_at");

ALTER TABLE "driver_payouts"
  ADD CONSTRAINT "driver_payouts_batch_id_fkey"
  FOREIGN KEY ("batch_id") REFERENCES "driver_payout_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "driver_payouts"
  ADD CONSTRAINT "driver_payouts_driver_id_fkey"
  FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "driver_payouts"
  ADD CONSTRAINT "driver_payouts_positive_amount_check" CHECK ("amount" > 0);

CREATE TABLE "wallet_cache_repair_audits" (
  "id" TEXT NOT NULL,
  "driver_id" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "note" TEXT NOT NULL,
  "actor_id" TEXT NOT NULL,
  "before_balance" DOUBLE PRECISION NOT NULL,
  "ledger_balance" DOUBLE PRECISION NOT NULL,
  "repaired" BOOLEAN NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "wallet_cache_repair_audits_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "wallet_cache_repair_audits_reference_key" ON "wallet_cache_repair_audits"("reference");
CREATE INDEX "wallet_cache_repair_audits_driver_id_created_at_idx" ON "wallet_cache_repair_audits"("driver_id", "created_at");

ALTER TABLE "wallet_cache_repair_audits"
  ADD CONSTRAINT "wallet_cache_repair_audits_driver_id_fkey"
  FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "driver_payout_batches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "driver_payouts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wallet_cache_repair_audits" ENABLE ROW LEVEL SECURITY;
