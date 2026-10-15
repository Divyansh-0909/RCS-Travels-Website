ALTER TYPE "ScheduledAdvanceDisposition" ADD VALUE IF NOT EXISTS 'partial_refund_pending';
ALTER TYPE "ScheduledAdvanceDisposition" ADD VALUE IF NOT EXISTS 'partially_refunded';

ALTER TABLE "payments"
  ADD COLUMN "cancellation_refund_amount" INTEGER;

ALTER TABLE "bookings"
  ADD COLUMN "cancellation_reason" TEXT;
