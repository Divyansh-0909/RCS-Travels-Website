-- The file-level check on an uploaded driver document, kept apart from the
-- admin's review verdict already on the row (`status`).
--
-- Supabase Storage does not sniff uploaded files: `allowedMimeTypes` on a bucket
-- is compared against the Content-Type header the UPLOADER sent, so a client can
-- PUT any bytes at all and label them image/jpeg. Everything these columns record
-- exists because that check is a label check, not a file check.
-- See services/documentScan.js.

-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('pending', 'clean', 'rejected', 'failed');

-- AlterTable
--
-- `pending` as the default, and no backfill to 'clean': every document uploaded
-- before this migration went in unexamined, and calling them clean would be
-- recording a check that never happened. They come out as pending, the sweep in
-- services/documentScan.js picks them up on the next boot, and they are scanned
-- for real. Fails closed either way — the admin screen refuses to serve anything
-- that is not `clean`.
ALTER TABLE "driver_documents"
  ADD COLUMN "scan_status" "ScanStatus" NOT NULL DEFAULT 'pending',
  ADD COLUMN "scan_reason" TEXT,
  ADD COLUMN "scanned_at"  TIMESTAMP(3);

-- CreateIndex
--
-- The sweep's only query: rows still pending, or left at failed by an outage.
-- Almost always empty, which is the shape an index pays for best — without it
-- that is a sequential scan of every document ever uploaded, every few minutes.
CREATE INDEX "driver_documents_scan_status_uploaded_at_idx"
  ON "driver_documents"("scan_status", "uploaded_at");
