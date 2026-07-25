-- CreateTable
CREATE TABLE "otp_verifications" (
    "phone" TEXT NOT NULL,
    "otp_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "otp_verifications_pkey" PRIMARY KEY ("phone")
);
