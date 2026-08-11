-- Three things a driver document needed and did not have: a way to be renewed
-- without taking its owner off the road, a way to be scanned by more than one
-- process safely, and a fingerprint.

-- ---------------------------------------------------------------------------
-- 1. `scanning`, the claimed state.
--
-- This is what makes the scanner safe to run in several processes. Claiming is a
-- conditional UPDATE from `pending` to `scanning`; of two workers reaching the
-- same row at the same instant exactly one gets a row count of 1. An in-memory
-- lock cannot do that across Render instances, and Render restarts mean there is
-- routinely more than one instance alive at a time.
--
-- Added to the END of the enum on purpose. Postgres orders enum values by
-- definition order, so inserting `scanning` between `pending` and `clean` would
-- need ALTER TYPE ... BEFORE and would silently change the meaning of any
-- ORDER BY scan_status. Nothing orders by it, and nothing should start.
ALTER TYPE "ScanStatus" ADD VALUE IF NOT EXISTS 'scanning';

-- ---------------------------------------------------------------------------
-- 2. Renewal without downtime.
--
-- Until now a renewal overwrote the row it renewed, so a driver with approved
-- insurance who uploaded next year's copy a week early dropped straight back to
-- `pending` — off the road for being early, which is the opposite of what the
-- expiry reminder is for. Now there are two live rows per type: the one in
-- force, and a replacement that affects nothing until it is approved.
ALTER TABLE "driver_documents"
  ADD COLUMN "is_replacement"  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "file_hash"       TEXT,
  ADD COLUMN "scan_started_at" TIMESTAMP(3);

-- Every existing row is a current document, never a replacement — that is what
-- the DEFAULT above already gave them, and it is why this needs no backfill.
DROP INDEX IF EXISTS "driver_documents_driver_id_type_key";

CREATE UNIQUE INDEX "driver_documents_driver_id_type_is_replacement_key"
  ON "driver_documents"("driver_id", "type", "is_replacement");

-- "Has this exact file been seen before" — the duplicate check on upload, and
-- the question an admin asks when a rejected file reappears under a second
-- account. Nullable column, so this only indexes rows that were actually scanned.
CREATE INDEX "driver_documents_file_hash_idx" ON "driver_documents"("file_hash");

-- ---------------------------------------------------------------------------
-- 3. What a document looked like before it was replaced.
--
-- A separate table rather than an `archived_at` flag, because the live table's
-- correctness rests on "at most one current and one pending replacement per
-- type" — and that is a plain unique key only while retired rows live somewhere
-- else. As a flag it would need a partial unique index, which Prisma cannot
-- express and would drop on the next `migrate dev`.
--
-- The Storage object is deliberately NOT deleted when a row lands here. An
-- archive that points at nothing answers none of the questions it exists for.
CREATE TABLE "driver_document_archive" (
  "id"               TEXT NOT NULL,
  "document_id"      TEXT NOT NULL,
  "driver_id"        TEXT NOT NULL,
  "type"             "DriverDocumentType" NOT NULL,
  "file_url"         TEXT NOT NULL,
  "file_hash"        TEXT,
  "number"           TEXT,
  "expires_at"       TIMESTAMP(3),
  "status"           "VerificationStatus" NOT NULL,
  "rejection_reason" TEXT,
  "reviewed_at"      TIMESTAMP(3),
  "uploaded_at"      TIMESTAMP(3) NOT NULL,
  "archived_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "replaced_by_id"   TEXT,

  CONSTRAINT "driver_document_archive_pkey" PRIMARY KEY ("id")
);

-- The only read: one driver's history for one type, newest first.
CREATE INDEX "driver_document_archive_driver_id_type_archived_at_idx"
  ON "driver_document_archive"("driver_id", "type", "archived_at");

ALTER TABLE "driver_document_archive"
  ADD CONSTRAINT "driver_document_archive_driver_id_fkey"
  FOREIGN KEY ("driver_id") REFERENCES "drivers"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
