-- DropForeignKey
ALTER TABLE "ride_offers" DROP CONSTRAINT "ride_offers_pool_host_booking_id_fkey";

-- AlterTable
ALTER TABLE "coupons" ALTER COLUMN "amount" DROP DEFAULT;
