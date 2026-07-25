/*
  Warnings:

  - You are about to drop the column `base_fare` on the `bookings` table. All the data in the column will be lost.
  - You are about to drop the column `toll_charges` on the `bookings` table. All the data in the column will be lost.
  - You are about to drop the column `total_fare` on the `bookings` table. All the data in the column will be lost.
  - You are about to drop the column `toll_charges` on the `fare_table` table. All the data in the column will be lost.
  - Added the required column `fare` to the `bookings` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "bookings" DROP COLUMN "base_fare",
DROP COLUMN "toll_charges",
DROP COLUMN "total_fare",
ADD COLUMN     "fare" DOUBLE PRECISION NOT NULL;

-- AlterTable
ALTER TABLE "fare_table" DROP COLUMN "toll_charges";
