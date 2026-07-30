-- Replaces the two `*_doc_url` columns on `drivers` with a `driver_documents`
-- table, and swaps the document set itself for the provider's list: RC,
-- insurance, road tax, fitness certificate and an All India permit are compulsory,
-- a one-year permit and a CNG cylinder test apply only to the cars that have them,
-- and both faces of the car are photographed. Police verification was on an
-- earlier draft and the provider removed it — there is no member for it.
--
-- The table exists because these documents EXPIRE. Insurance, tax, fitness and the
-- permits all run out on a date of their own, and a lapsed one has to be able to
-- pull the driver offline on its own; a URL column can hold the file but not the
-- date, the number, or an admin's reason for rejecting it.
--
-- NOTHING IS BACKFILLED. The old columns held a driving licence and an Aadhar
-- card, and no upload path was ever built, so in practice they are empty. A
-- licence file could have been carried across as a `dl` row, but it would arrive
-- with no expiry date — and an expiry-driven table is exactly what must not be
-- seeded with rows that can never lapse. Existing drivers re-upload; they are
-- `approved` already and keep taking rides while they do.

-- CreateEnum
CREATE TYPE "DriverDocumentType" AS ENUM (
    'dl',
    'rc',
    'insurance',
    'tax',
    'fitness',
    'permit_all_india',
    'permit_one_year',
    'cng_test',
    'car_photo_front',
    'car_photo_back'
);

-- CreateTable
CREATE TABLE "driver_documents" (
    "id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "type" "DriverDocumentType" NOT NULL,
    "file_url" TEXT NOT NULL,
    "number" TEXT,
    "expires_at" TIMESTAMP(3),
    "status" "VerificationStatus" NOT NULL DEFAULT 'pending',
    "rejection_reason" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_documents_pkey" PRIMARY KEY ("id")
);

-- One live row per document per driver: a renewal replaces the file rather than
-- accumulating a history nobody reads.
CREATE UNIQUE INDEX "driver_documents_driver_id_type_key" ON "driver_documents"("driver_id", "type");

-- The nightly lapse sweep reads only this.
CREATE INDEX "driver_documents_expires_at_idx" ON "driver_documents"("expires_at");

ALTER TABLE "driver_documents" ADD CONSTRAINT "driver_documents_driver_id_fkey"
    FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── drivers ────────────────────────────────────────────────────────────────
-- The licence expiry goes with them: expiry now lives on the document that
-- expires, so one licence date on the driver row would be the odd one out of ten.
ALTER TABLE "drivers" DROP COLUMN "dl_doc_url";
ALTER TABLE "drivers" DROP COLUMN "aadhar_doc_url";

-- Repairs drift, and a live 500 with it. These four are declared in
-- schema.prisma but no migration ever created them, so the table never had them:
-- GET /api/driver/me selects `pfpUrl` and `rejectionReason` by name and fails on
-- a column that does not exist. Adding them here is what makes the schema and the
-- database agree — nullable throughout, so no backfill and nothing to lose.
--
-- `rejectionReason`, `reviewedAt` and `dlExpiresAt` carry no @map, so their column
-- names really are camelCase and have to stay quoted. IF NOT EXISTS because a
-- database seeded by `prisma db push` instead of this folder will already have
-- them.
ALTER TABLE "drivers" ADD COLUMN IF NOT EXISTS "profile_picture_url" TEXT;
ALTER TABLE "drivers" ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT;
ALTER TABLE "drivers" ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3);
-- Dropped in the same breath it is added, for the databases that do have it:
-- expiry belongs on the licence document now, not on the driver.
ALTER TABLE "drivers" DROP COLUMN IF EXISTS "dlExpiresAt";
