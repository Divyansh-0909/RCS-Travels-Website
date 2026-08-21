CREATE TABLE "whatsapp_inbound_messages" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "error" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    CONSTRAINT "whatsapp_inbound_messages_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "whatsapp_inbound_messages_received_at_idx" ON "whatsapp_inbound_messages"("received_at");
