-- Every wallet entry now names the business event that caused it, and that event
-- is unique. A retried ride completion, a redelivered Razorpay webhook or a
-- re-run monthly job collides on this key instead of moving money a second time.
--
-- (booking_id, type) is deliberately NOT the key: one booking legitimately
-- produces a deposit hold, its refund and a commission debit, and a complaint
-- fine is not tied to a booking at all.
ALTER TABLE "wallet_entries" ADD COLUMN "event_key" TEXT;

-- Nothing has ever written this table in any environment, so this backfill is
-- defensive only — it exists so the NOT NULL below cannot fail on a stray row.
UPDATE "wallet_entries" SET "event_key" = 'legacy:' || "id" WHERE "event_key" IS NULL;

ALTER TABLE "wallet_entries" ALTER COLUMN "event_key" SET NOT NULL;

CREATE UNIQUE INDEX "wallet_entries_event_key_key" ON "wallet_entries"("event_key");
