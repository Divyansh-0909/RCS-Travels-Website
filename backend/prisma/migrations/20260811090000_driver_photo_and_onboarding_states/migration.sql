-- Two things the gated onboarding needs: a photo of the captain, and enough
-- driver-level states for the app to know which screen to open on.

-- ---------------------------------------------------------------------------
-- 1. The captain's own photograph.
--
-- The only file in this system a RIDER is ever shown, which makes it the only
-- one an attacker has an audience for — so it goes through exactly the same
-- pipeline as the paperwork: sniffed, re-encoded from decoded pixels, reviewed
-- by an admin. It stays in the private bucket and is served to riders as a
-- short-lived signed URL, never a public one.
--
-- Postgres appends new enum values at the end regardless of where they sit in
-- schema.prisma, so `profile_photo` sorts last here while reading first there.
-- That is harmless because nothing orders by this type: the checklist's order
-- comes from DRIVER_DOCUMENTS in constants/driverDocuments.js, which is the
-- provider's own order and the only one a captain ever sees.
ALTER TYPE "DriverDocumentType" ADD VALUE IF NOT EXISTS 'profile_photo';

-- ---------------------------------------------------------------------------
-- 2. Driver-level onboarding states.
--
-- VerificationStatus is shared by DriverDocument.status and
-- Driver.verificationStatus, and the two use different subsets of it. A
-- DOCUMENT is only ever pending, approved or rejected — an admin's verdict has
-- three outcomes and the review endpoint refuses the rest. A DRIVER now has
-- more, because "not approved" was one word covering four situations the app has
-- to tell apart:
--
--   notUploaded  nothing on file yet          -> open the checklist
--   uploading    some required documents in   -> open the checklist, show what's left
--   scanning     everything in, files being   -> "we're checking your documents"
--                checked
--   pending      files checked, waiting on    -> "the office is reviewing them"
--                the office
--   approved     -> the app
--   rejected     -> the checklist, with the reason
--
-- Without these the app could only ask "approved or not", and a captain who had
-- uploaded nothing and one waiting on a human would see the same screen.
ALTER TYPE "VerificationStatus" ADD VALUE IF NOT EXISTS 'notUploaded';
ALTER TYPE "VerificationStatus" ADD VALUE IF NOT EXISTS 'uploading';
ALTER TYPE "VerificationStatus" ADD VALUE IF NOT EXISTS 'scanning';

-- A driver row created before any document exists is `notUploaded`, which is
-- true of it and was not expressible before. Existing rows keep whatever they
-- have — no backfill, because the hourly sweep recomputes every driver anyway
-- and a guess here would be a state nothing derived.
ALTER TABLE "drivers" ALTER COLUMN "verification_status" SET DEFAULT 'notUploaded';
