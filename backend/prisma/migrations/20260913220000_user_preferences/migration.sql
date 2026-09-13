ALTER TABLE "users"
ADD COLUMN "notify_whatsapp" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "notify_push" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "notify_promotions" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "auto_share_live_location" BOOLEAN NOT NULL DEFAULT false;
