CREATE TYPE "RefundOperationStatus" AS ENUM (
  'requested',
  'outcome_unknown',
  'provider_identified',
  'succeeded',
  'failed'
);

ALTER TABLE "payments"
  ADD COLUMN "order_creation_started_at" TIMESTAMP(3),
  ADD COLUMN "refund_operation_status" "RefundOperationStatus",
  ADD COLUMN "refund_request_key" TEXT,
  ADD COLUMN "refund_requested_amount" INTEGER,
  ADD COLUMN "refund_last_attempt_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "payments_refund_request_key_key"
  ON "payments"("refund_request_key");

ALTER TABLE "razorpay_webhook_events"
  ADD COLUMN "driver_payout_id" TEXT;

CREATE INDEX "razorpay_webhook_events_driver_payout_id_received_at_idx"
  ON "razorpay_webhook_events"("driver_payout_id", "received_at");

ALTER TABLE "razorpay_webhook_events"
  ADD CONSTRAINT "razorpay_webhook_events_driver_payout_id_fkey"
  FOREIGN KEY ("driver_payout_id") REFERENCES "driver_payouts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
