-- CreateTable
CREATE TABLE "safe_route_verdicts" (
    "route_key" TEXT NOT NULL,
    "zones_version" TEXT NOT NULL,
    "clean" BOOLEAN NOT NULL,
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "safe_route_verdicts_pkey" PRIMARY KEY ("route_key")
);
