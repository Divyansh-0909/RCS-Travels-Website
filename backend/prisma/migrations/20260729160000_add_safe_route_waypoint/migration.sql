-- Records WHICH safer route a booking was quoted on, not merely that the rider
-- wanted one. `prefer_safe_route` alone could not answer that: the route is now
-- chosen per trip from Google's alternatives rather than forced through a single
-- hardcoded waypoint, so two bookings with the same flag can be on different roads.
--
-- The driver's navigation link is built from these columns. Recomputing the point
-- at pickup time instead would let a redrawn shady zone — or a change in Google's
-- own routing — send him down a road the rider was never quoted, silently.
--
-- Null on every existing row, which is correct: nothing booked before this
-- migration ever had a safer route applied. The old code path could not apply one
-- (its SAFE_WAYPOINT constant was never filled in), so there is nothing to backfill.

ALTER TABLE "bookings" ADD COLUMN "safe_waypoint_lat" DOUBLE PRECISION;
ALTER TABLE "bookings" ADD COLUMN "safe_waypoint_lng" DOUBLE PRECISION;
