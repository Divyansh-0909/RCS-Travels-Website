/*
  Warnings:

  - Changed the type of `vehicle_type` on the `bookings` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `vehicle_capacity` to the `drivers` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `vehicle_type` on the `drivers` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `vehicle_type` on the `fare_table` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "pickup_order" INTEGER,
ADD COLUMN     "share_group_id" TEXT,
ADD COLUMN     "sharing" BOOLEAN NOT NULL DEFAULT false,
DROP COLUMN "vehicle_type",
ADD COLUMN     "vehicle_type" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "drivers" ADD COLUMN     "vehicle_capacity" INTEGER NOT NULL,
DROP COLUMN "vehicle_type",
ADD COLUMN     "vehicle_type" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "fare_table" DROP COLUMN "vehicle_type",
ADD COLUMN     "vehicle_type" INTEGER NOT NULL;

-- DropEnum
DROP TYPE "VehicleType";

-- CreateIndex
CREATE UNIQUE INDEX "fare_table_destination_name_vehicle_type_key" ON "fare_table"("destination_name", "vehicle_type");
