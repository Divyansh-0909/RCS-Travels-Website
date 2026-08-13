-- A real spatial index on driver locations.
--
-- WHAT WAS WRONG. Ride-now dispatch asks one question, once per ring per
-- booking: "which online drivers are within N km of this pickup?". Postgres has
-- no way to answer that from a btree, so the code asked a different question — a
-- lat/lng BOUNDING BOX — and then re-measured every row it got back in JS. Two
-- costs came out of that. The index could only range-scan `latitude`, its
-- leading column, and filtered `longitude` row by row afterwards. And the box is
-- a square around a circle, so ~21% of everything it returned was outside the
-- radius and had to be thrown away by the caller.
--
-- WHY A GENERATED COLUMN RATHER THAN A REPLACEMENT. `latitude` and `longitude`
-- stay exactly as they are, and stay the source of truth. Three writers touch
-- this table through Prisma — the 4-second upsert in routes/driver.ts and both
-- seeds — and the tracking read in routes/bookings.js reads the pair straight
-- back out. Deriving the point in the DATABASE means none of them changed, and,
-- more to the point, means there is no write path that CAN let the two
-- representations drift apart. A dual-written column would be one forgotten
-- `update` away from routing rides to where a driver used to be.
--
-- geography, not geometry: distances come out in metres on a sphere with no
-- projection to choose, get wrong, or re-check when this stops being one city.
-- At NCR scale a projected geometry would be marginally faster; that is not a
-- trade worth a UTM zone.

-- `extensions` is where Supabase keeps PostGIS. The CREATE SCHEMA is not
-- redundant: `prisma migrate dev` replays this file into a freshly-created
-- shadow database where that schema does not exist yet, and CREATE EXTENSION
-- fails rather than creating its target schema.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;

-- Every PostGIS name below is schema-qualified, in the DDL here and in the
-- dispatch query in services/driverAssignment.js. Supabase puts `extensions` on
-- the role's search_path so unqualified calls would resolve in production — and
-- would then fail on a plain local Postgres, where it is not on the path. The
-- qualification is what makes the two environments the same.
ALTER TABLE "driver_locations"
    ADD COLUMN "geog" extensions.geography(Point, 4326)
    GENERATED ALWAYS AS (
        extensions.ST_SetSRID(
            extensions.ST_MakePoint("longitude", "latitude"),
            4326
        )::extensions.geography
    ) STORED;

-- ST_MakePoint takes (x, y) — LONGITUDE FIRST. This is the same swap
-- services/geo.js has a header comment about, and it is silent when written
-- backwards: NCR is lat 28, lng 77, and both are legal latitudes, so a reversed
-- pair does not error. It just puts the entire fleet in the Arabian Sea, off the
-- coast of Somalia, where no ST_DWithin will ever find it and every booking
-- comes back `no_driver`.
--
-- So the argument order is asserted here rather than trusted, against real rows,
-- at the moment it is written.
DO $$
DECLARE wrong bigint;
BEGIN
    SELECT count(*) INTO wrong
    FROM "driver_locations"
    WHERE abs(extensions.ST_Y("geog"::extensions.geometry) - "latitude")  > 1e-9
       OR abs(extensions.ST_X("geog"::extensions.geometry) - "longitude") > 1e-9;

    IF wrong > 0 THEN
        RAISE EXCEPTION
            'driver_locations.geog disagrees with latitude/longitude on % row(s): ST_MakePoint takes (lng, lat)', wrong;
    END IF;
END $$;

CREATE INDEX "driver_locations_geog_idx" ON "driver_locations" USING GIST ("geog");

-- The box scan's index, and nothing else read it. The only other access to this
-- table is by `driver_id`, which is the primary key.
DROP INDEX IF EXISTS "driver_locations_latitude_longitude_idx";

-- THE COST OF INDEXING THIS TABLE AT ALL, and the reason for the two settings.
--
-- Every online driver upserts his row every 4 seconds. An update that changes an
-- INDEXED column cannot be a HOT update, so from here on each of those writes
-- also writes the GiST index and leaves a dead tuple behind — where before, with
-- the btree, it did the same for latitude/longitude, so this is a wash rather
-- than a regression. It is still a table whose entire contents turn over every
-- few seconds, and it wants to be vacuumed like one.
--
-- fillfactor leaves room on each page for the new row version to land beside the
-- old one; the threshold makes autovacuum reclaim at 2% dead rather than the
-- default 20%, which on a table this small is a handful of rows. Neither
-- rewrites existing pages — fillfactor applies as pages are rewritten, which on
-- this table means within seconds.
ALTER TABLE "driver_locations" SET (fillfactor = 70, autovacuum_vacuum_scale_factor = 0.02);
