ALTER TYPE "PaymentPurpose" ADD VALUE IF NOT EXISTS 'ride_now_final';

ALTER TABLE "bookings"
ADD COLUMN "scheduled_final_payment_method" "PaymentMethod",
ADD COLUMN "scheduled_final_paid_at" TIMESTAMP(3),
ADD COLUMN "ride_now_paid_amount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "ride_now_payment_method" "PaymentMethod",
ADD COLUMN "ride_now_paid_at" TIMESTAMP(3);

UPDATE "bookings" AS b
SET
  "scheduled_final_payment_method" = 'upi'::"PaymentMethod",
  "scheduled_final_paid_at" = COALESCE(
    (
      SELECT MAX(p."captured_at")
      FROM "payments" AS p
      WHERE p."booking_id" = b."id"
        AND p."purpose" = 'scheduled_ride_final'::"PaymentPurpose"
        AND p."status" IN ('captured'::"ExternalPaymentStatus", 'refund_pending'::"ExternalPaymentStatus", 'refunded'::"ExternalPaymentStatus")
    ),
    b."completed_at"
  )
WHERE b."scheduled_final_paid_amount" > 0;

UPDATE "bookings"
SET
  "ride_now_paid_amount" = GREATEST(0, ROUND("customer_payment" * 100)::INTEGER),
  "ride_now_payment_method" = CASE
    WHEN "ride_now_customer_collection_method" = 'cash'::"RideNowCollectionMethod" THEN 'cash'::"PaymentMethod"
    WHEN "ride_now_customer_collection_method" = 'upi'::"RideNowCollectionMethod" THEN 'upi'::"PaymentMethod"
    ELSE NULL
  END,
  "ride_now_paid_at" = COALESCE("ride_now_customer_confirmed_at", "ride_now_captain_confirmed_at", "completed_at")
WHERE "ride_now_collection_state" = 'confirmed'::"RideNowCollectionState";

ALTER TABLE "bookings"
DROP COLUMN "ride_now_collection_state",
DROP COLUMN "ride_now_captain_collection_method",
DROP COLUMN "ride_now_captain_confirmed_at",
DROP COLUMN "ride_now_customer_collection_method",
DROP COLUMN "ride_now_customer_confirmed_at",
DROP COLUMN "ride_now_customer_disputed_at";

DROP TYPE "RideNowCollectionMethod";
DROP TYPE "RideNowCollectionState";
