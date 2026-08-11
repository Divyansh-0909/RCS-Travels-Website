-- CreateEnum
CREATE TYPE "DriverGroup" AS ENUM ('admin', 'rcs', 'partner');

-- CreateEnum
CREATE TYPE "WalletEntryType" AS ENUM ('deposit_hold', 'deposit_refund', 'coupon_reimbursement', 'fine', 'commission', 'payout', 'adjustment');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('wallet', 'cash', 'upi');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('pending', 'accepted', 'rejected', 'withdrawn');

-- DropIndex
DROP INDEX "drivers_is_online_is_active_verification_status_vehicle_cla_idx";

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "admin_alerted_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "drivers" ADD COLUMN     "group" "DriverGroup" NOT NULL DEFAULT 'partner',
ADD COLUMN     "suspended_at" TIMESTAMP(3),
ADD COLUMN     "suspension_reason" TEXT,
ADD COLUMN     "wallet_balance" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "driver_reviews" (
    "id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "overcharge_flags" (
    "id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "fare_at_flag" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "overcharge_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_entries" (
    "id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "type" "WalletEntryType" NOT NULL,
    "method" "PaymentMethod",
    "booking_id" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ride_offers" (
    "id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "status" "OfferStatus" NOT NULL DEFAULT 'pending',
    "group" "DriverGroup" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMP(3),

    CONSTRAINT "ride_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupons" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "earned_for" TEXT NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "redeemed_at" TIMESTAMP(3),
    "booking_id" TEXT,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "driver_reviews_booking_id_key" ON "driver_reviews"("booking_id");

-- CreateIndex
CREATE INDEX "driver_reviews_driver_id_created_at_idx" ON "driver_reviews"("driver_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "overcharge_flags_booking_id_key" ON "overcharge_flags"("booking_id");

-- CreateIndex
CREATE INDEX "overcharge_flags_driver_id_created_at_idx" ON "overcharge_flags"("driver_id", "created_at");

-- CreateIndex
CREATE INDEX "wallet_entries_driver_id_created_at_idx" ON "wallet_entries"("driver_id", "created_at");

-- CreateIndex
CREATE INDEX "wallet_entries_booking_id_idx" ON "wallet_entries"("booking_id");

-- CreateIndex
CREATE INDEX "ride_offers_driver_id_status_created_at_idx" ON "ride_offers"("driver_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "ride_offers_booking_id_status_idx" ON "ride_offers"("booking_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ride_offers_booking_id_driver_id_key" ON "ride_offers"("booking_id", "driver_id");

-- CreateIndex
CREATE UNIQUE INDEX "coupons_booking_id_key" ON "coupons"("booking_id");

-- CreateIndex
CREATE INDEX "coupons_user_id_redeemed_at_idx" ON "coupons"("user_id", "redeemed_at");

-- CreateIndex
CREATE UNIQUE INDEX "coupons_user_id_earned_for_key" ON "coupons"("user_id", "earned_for");

-- CreateIndex
CREATE INDEX "drivers_is_online_is_active_verification_status_vehicle_cla_idx" ON "drivers"("is_online", "is_active", "verification_status", "vehicle_class", "group");

-- AddForeignKey
ALTER TABLE "driver_reviews" ADD CONSTRAINT "driver_reviews_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_reviews" ADD CONSTRAINT "driver_reviews_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_reviews" ADD CONSTRAINT "driver_reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overcharge_flags" ADD CONSTRAINT "overcharge_flags_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overcharge_flags" ADD CONSTRAINT "overcharge_flags_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overcharge_flags" ADD CONSTRAINT "overcharge_flags_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_entries" ADD CONSTRAINT "wallet_entries_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_entries" ADD CONSTRAINT "wallet_entries_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_offers" ADD CONSTRAINT "ride_offers_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_offers" ADD CONSTRAINT "ride_offers_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
