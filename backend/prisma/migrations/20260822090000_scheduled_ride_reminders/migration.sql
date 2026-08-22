ALTER TABLE "bookings"
ADD COLUMN "customer_reminder_sent_at" TIMESTAMP(3),
ADD COLUMN "driver_reminder_sent_at" TIMESTAMP(3);
