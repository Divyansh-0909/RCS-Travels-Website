-- Repair databases where the original user-preferences migration was recorded
-- as applied but the columns were never created. IF NOT EXISTS keeps this safe
-- for databases that already have the intended schema.
ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "notify_whatsapp" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS "notify_push" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS "notify_promotions" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "auto_share_live_location" BOOLEAN NOT NULL DEFAULT false;
