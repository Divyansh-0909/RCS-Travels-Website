CREATE TABLE "notification_deliveries" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "recipient" TEXT NOT NULL,
  "provider_message_id" TEXT,
  "status" TEXT NOT NULL,
  "booking_id" TEXT,
  "purpose" TEXT,
  "retry_key" TEXT,
  "retry_count" INTEGER NOT NULL DEFAULT 0,
  "attempted_at" TIMESTAMP(3) NOT NULL,
  "provider_accepted_at" TIMESTAMP(3),
  "provider_status_at" TIMESTAMP(3),
  "provider_status_received_at" TIMESTAMP(3),
  "sent_at" TIMESTAMP(3),
  "delivered_at" TIMESTAMP(3),
  "read_at" TIMESTAMP(3),
  "failed_at" TIMESTAMP(3),
  "provider_failure_code" TEXT,
  "provider_failure_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_deliveries_provider_message_id_key"
  ON "notification_deliveries"("provider_message_id");
CREATE INDEX "notification_deliveries_booking_id_purpose_attempted_at_idx"
  ON "notification_deliveries"("booking_id", "purpose", "attempted_at");
CREATE INDEX "notification_deliveries_provider_status_attempted_at_idx"
  ON "notification_deliveries"("provider", "status", "attempted_at");
CREATE INDEX "notification_deliveries_retry_key_attempted_at_idx"
  ON "notification_deliveries"("retry_key", "attempted_at");
