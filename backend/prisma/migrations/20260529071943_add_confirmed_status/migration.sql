-- AlterEnum
ALTER TYPE "BookingStatus" ADD VALUE 'confirmed';

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "confirmed_at" TIMESTAMP(3);
