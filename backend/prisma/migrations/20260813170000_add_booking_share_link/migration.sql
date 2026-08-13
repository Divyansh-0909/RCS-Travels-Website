-- "Follow my ride": an opaque handle that lets someone without an account watch a
-- trip, and the clock that kills it.
--
-- Deliberately two columns rather than a token alone. A token with no expiry is a
-- link the rider sent to one person in one moment that still answers a year later,
-- forwarded into a group chat he has left — and the only way to stop it would be
-- for him to remember it exists.
--
-- The UNIQUE index is what the public route looks the token up by, and it is the
-- only supported lookup on this column. Plain rather than partial because that is
-- what Prisma's @unique emits, and a hand-written partial index here would read as
-- schema drift on every migrate status. Postgres treats NULLs as distinct, so the
-- many unshared rides — most of them — sit under it without colliding.
ALTER TABLE "bookings" ADD COLUMN "share_token" TEXT;
ALTER TABLE "bookings" ADD COLUMN "share_expires_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "bookings_share_token_key" ON "bookings"("share_token");
