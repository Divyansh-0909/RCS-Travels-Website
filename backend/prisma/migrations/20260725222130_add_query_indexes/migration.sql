-- CreateIndex
CREATE INDEX "bookings_user_id_created_at_idx" ON "bookings"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "bookings_user_id_status_idx" ON "bookings"("user_id", "status");

-- CreateIndex
CREATE INDEX "bookings_driver_id_status_idx" ON "bookings"("driver_id", "status");

-- CreateIndex
CREATE INDEX "bookings_status_scheduled_at_idx" ON "bookings"("status", "scheduled_at");

-- CreateIndex
CREATE INDEX "bookings_created_at_idx" ON "bookings"("created_at");

-- CreateIndex
CREATE INDEX "bookings_share_group_id_idx" ON "bookings"("share_group_id");

-- CreateIndex
CREATE INDEX "driver_locations_latitude_longitude_idx" ON "driver_locations"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "drivers_is_online_is_active_verification_status_vehicle_typ_idx" ON "drivers"("is_online", "is_active", "verification_status", "vehicle_type");

-- CreateIndex
CREATE INDEX "drivers_created_at_idx" ON "drivers"("created_at");

-- CreateIndex
CREATE INDEX "users_created_at_idx" ON "users"("created_at");
