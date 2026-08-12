-- Telling a captain his paperwork is about to lapse, BEFORE it does.
--
-- Until now the only thing that spoke about expiry spoke after the fact: the
-- hourly sweep found documents already past their date, took the driver off the
-- road, and told him so. Which inverts the point of the replacement slot — that
-- whole two-row design exists so he can upload a renewal while the current
-- certificate is still valid and never lose a day's work. Nothing was telling
-- him to.

-- The smallest reminder threshold already sent for this document, in days.
--
-- Not a boolean and not a bare timestamp, because neither answers the question
-- the sweep asks. The rule is one comparison — send threshold T only when this
-- is null or greater than T — which makes 30, then 7, then 1 fire exactly once
-- each and in order, and makes the whole sweep idempotent. It can run hourly,
-- twice over, or catch up after an outage without ever repeating a message.
--
-- A boolean could not tell "warned at 30" from "warned at 7". A timestamp would
-- need the thresholds recomputed from it on every pass, against an expiry date
-- that is itself the thing being measured.
ALTER TABLE "driver_documents"
  ADD COLUMN "expiry_warned_days" INTEGER,
  ADD COLUMN "expiry_warned_at"   TIMESTAMP(3);

-- No backfill, and specifically no backfilling to "already warned".
--
-- Every existing document comes out as never-warned, so the first sweep after
-- this lands will send a reminder for anything already inside its window. That
-- is the correct outcome rather than a side effect: those are captains whose
-- documents are genuinely about to lapse and who have never been told, and the
-- alternative — marking them warned to keep the first run quiet — buys silence
-- by lying about a message nobody sent.
--
-- It is bounded. Only documents expiring within the next 30 days qualify, so
-- this is one notification each to a handful of drivers, not a broadcast.

-- The sweep reads `expires_at` over a range and filters the rest in memory, so
-- the existing driver_documents_expires_at_idx already serves it. No new index:
-- one on a column this selective, for a query that runs hourly and returns a
-- handful of rows, would cost more on every write than it saves on the read.
