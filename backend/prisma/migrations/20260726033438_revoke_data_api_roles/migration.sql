-- Lock the public schema away from Supabase's Data API roles.
--
-- Supabase grants the `public` schema to `anon` and `authenticated` by default,
-- and sets ALTER DEFAULT PRIVILEGES so anything created later inherits it. Our
-- tables are created by Prisma as `postgres`, so they picked those grants up
-- automatically: every table -- users, bookings, drivers, otp_verifications --
-- was readable AND writable by anyone holding the project's anon key, which is
-- public by design.
--
-- This app never uses the Data API. The browser talks only to the Express API
-- behind Clerk, and Prisma connects over Postgres as the table owner. So the
-- correct posture is to revoke, not to write RLS policies.
--
-- Safe for the app: `postgres` owns these tables and none of the statements
-- below touch the owner.

REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON SCHEMA public FROM anon, authenticated;

-- Without these, the NEXT table a migration creates silently inherits the same
-- open grants and we are back where we started. Applies to objects created by
-- the role running migrations (`postgres`), which is how Prisma creates them.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

-- Second layer. RLS with no policies denies every non-owner role, so a future
-- GRANT -- or turning the Data API back on -- cannot expose rows on its own.
-- The owner bypasses RLS (we do not FORCE it), so the app is unaffected.
--
-- `_prisma_migrations` is deliberately excluded: the revokes above already
-- cover it, and leaving RLS off there keeps the migration engine's own table
-- free of any policy interaction.
ALTER TABLE "users"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "drivers"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "driver_locations"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bookings"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fare_table"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "api_usage"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "otp_verifications"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "whatsapp_sessions"  ENABLE ROW LEVEL SECURITY;
