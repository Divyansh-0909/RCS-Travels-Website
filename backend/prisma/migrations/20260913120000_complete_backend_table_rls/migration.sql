-- These tables were added after the original Data API lockdown. All access is
-- through the trusted backend (Clerk + Prisma), so there are no client policies.
-- Keep existing grants revoked; RLS provides a second barrier if grants drift.
ALTER TABLE "coupons" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "driver_cancellations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "driver_document_archive" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "driver_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "driver_reviews" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fare_zone_set" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "overcharge_flags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "razorpay_webhook_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ride_complaints" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ride_offers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "safe_route_verdicts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "saved_places" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vehicles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wallet_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "whatsapp_inbound_messages" ENABLE ROW LEVEL SECURITY;
