CREATE TYPE "PaymentPurpose" AS ENUM ('scheduled_ride_advance', 'scheduled_ride_final', 'marketplace_deposit', 'cancellation_charge', 'other_customer_payment');
CREATE TYPE "ExternalPaymentStatus" AS ENUM ('created', 'order_creating', 'order_created', 'authorized', 'captured', 'failed', 'refund_pending', 'refunded');
CREATE TYPE "WebhookProcessingStatus" AS ENUM ('received', 'processed', 'ignored', 'failed');

CREATE TABLE "payments" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "booking_id" TEXT,
  "purpose" "PaymentPurpose" NOT NULL,
  "status" "ExternalPaymentStatus" NOT NULL DEFAULT 'created',
  "amount" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "idempotency_key" TEXT NOT NULL,
  "razorpay_order_id" TEXT,
  "razorpay_payment_id" TEXT,
  "razorpay_signature" TEXT,
  "razorpay_refund_id" TEXT,
  "failure_code" TEXT,
  "failure_description" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "captured_at" TIMESTAMP(3),
  "refunded_at" TIMESTAMP(3),
  CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "razorpay_webhook_events" (
  "id" TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "status" "WebhookProcessingStatus" NOT NULL DEFAULT 'received',
  "payment_id" TEXT,
  "result" TEXT,
  "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMP(3),
  CONSTRAINT "razorpay_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payments_idempotency_key_key" ON "payments"("idempotency_key");
CREATE UNIQUE INDEX "payments_razorpay_order_id_key" ON "payments"("razorpay_order_id");
CREATE UNIQUE INDEX "payments_razorpay_payment_id_key" ON "payments"("razorpay_payment_id");
CREATE UNIQUE INDEX "payments_razorpay_refund_id_key" ON "payments"("razorpay_refund_id");
CREATE INDEX "payments_user_id_created_at_idx" ON "payments"("user_id", "created_at");
CREATE INDEX "payments_booking_id_purpose_idx" ON "payments"("booking_id", "purpose");
CREATE UNIQUE INDEX "razorpay_webhook_events_event_id_key" ON "razorpay_webhook_events"("event_id");
CREATE INDEX "razorpay_webhook_events_payment_id_received_at_idx" ON "razorpay_webhook_events"("payment_id", "received_at");
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "razorpay_webhook_events" ADD CONSTRAINT "razorpay_webhook_events_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
