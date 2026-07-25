/*
  Warnings:

  - You are about to drop the column `is_verified` on the `drivers` table. All the data in the column will be lost.
  - You are about to drop the column `rc_doc_url` on the `drivers` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('pending', 'approved', 'rejected');

-- AlterTable
ALTER TABLE "driver_locations" ADD COLUMN     "bearing" DOUBLE PRECISION,
ADD COLUMN     "speedKmh" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "drivers" DROP COLUMN "is_verified",
DROP COLUMN "rc_doc_url",
ADD COLUMN     "aadhar_doc_url" TEXT,
ADD COLUMN     "verification_status" "VerificationStatus" NOT NULL DEFAULT 'pending';
