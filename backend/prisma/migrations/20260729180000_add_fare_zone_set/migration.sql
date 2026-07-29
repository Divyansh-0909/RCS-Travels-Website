-- CreateTable
CREATE TABLE "fare_zone_set" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "zones" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT NOT NULL,

    CONSTRAINT "fare_zone_set_pkey" PRIMARY KEY ("id")
);
