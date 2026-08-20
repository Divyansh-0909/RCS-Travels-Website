ALTER TABLE "bookings"
ADD COLUMN "coupon_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "customer_payment" DOUBLE PRECISION NOT NULL DEFAULT 0;
UPDATE "bookings" SET "customer_payment" = "fare";
