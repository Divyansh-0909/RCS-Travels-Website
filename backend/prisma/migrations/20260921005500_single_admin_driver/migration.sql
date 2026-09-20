-- The dispatch `admin` group is reserved for the single owner-driver. Dashboard
-- admins are a Clerk role and do not belong in this constraint.
CREATE UNIQUE INDEX "drivers_single_admin_group_idx"
ON "drivers" ("group")
WHERE "group" = 'admin';
