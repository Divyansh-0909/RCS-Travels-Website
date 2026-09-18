CREATE TYPE "RideNowCollectionState" AS ENUM ('awaiting_confirmation', 'confirmed', 'disputed');
CREATE TYPE "RideNowCollectionMethod" AS ENUM ('cash', 'upi');

ALTER TABLE "bookings"
ADD COLUMN "ride_now_collection_state" "RideNowCollectionState",
ADD COLUMN "ride_now_captain_collection_method" "RideNowCollectionMethod",
ADD COLUMN "ride_now_captain_confirmed_at" TIMESTAMP(3),
ADD COLUMN "ride_now_customer_collection_method" "RideNowCollectionMethod",
ADD COLUMN "ride_now_customer_confirmed_at" TIMESTAMP(3),
ADD COLUMN "ride_now_customer_disputed_at" TIMESTAMP(3);
