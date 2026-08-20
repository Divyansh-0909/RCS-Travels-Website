ALTER TYPE "BookingStatus" ADD VALUE 'payment_pending' AFTER 'pending';
ALTER TYPE "WalletEntryType" ADD VALUE 'cancellation_compensation';
CREATE TYPE "ScheduledAdvanceDisposition" AS ENUM ('not_applicable', 'awaiting_payment', 'paid', 'refund_pending', 'refunded', 'forfeited_to_driver');

ALTER TABLE "payments"
ADD COLUMN "original_fare_amount" INTEGER,
ADD COLUMN "coupon_amount" INTEGER,
ADD COLUMN "final_fare_amount" INTEGER,
ADD COLUMN "advance_percentage" INTEGER,
ADD COLUMN "remaining_amount" INTEGER;

DROP INDEX "payments_booking_id_purpose_idx";
CREATE UNIQUE INDEX "payments_booking_id_purpose_key" ON "payments"("booking_id", "purpose");

ALTER TABLE "bookings"
ADD COLUMN "scheduled_advance_pct" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "scheduled_advance_amount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "scheduled_advance_paid_amount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "scheduled_remaining_amount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "scheduled_final_paid_amount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "scheduled_advance_disposition" "ScheduledAdvanceDisposition" NOT NULL DEFAULT 'not_applicable';
