-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_deliveries" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "listener" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3) NOT NULL,
    "last_error" TEXT,
    "delivered_at" TIMESTAMP(3),

    CONSTRAINT "outbox_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "outbox_events_seq_key" ON "outbox_events"("seq");

-- CreateIndex
CREATE INDEX "outbox_events_status_created_at_idx" ON "outbox_events"("status", "created_at");

-- CreateIndex
CREATE INDEX "outbox_deliveries_status_next_attempt_at_idx" ON "outbox_deliveries"("status", "next_attempt_at");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_deliveries_event_id_listener_key" ON "outbox_deliveries"("event_id", "listener");

-- AddForeignKey
ALTER TABLE "outbox_deliveries" ADD CONSTRAINT "outbox_deliveries_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "outbox_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
