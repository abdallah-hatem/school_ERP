-- core/notifications (§11, spec docs/specs/2026-11-18-notifications.md): the bell's notifications,
-- their items (dedupe: one per recipient, type and dedupe key), one delivery per channel, the
-- school's defaults and each person's preferences.

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "recipient_kind" TEXT NOT NULL,
    "recipient_id" UUID NOT NULL,
    "group_key" TEXT NOT NULL,
    "actor_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "read_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_items" (
    "id" UUID NOT NULL,
    "notification_id" UUID NOT NULL,
    "recipient_kind" TEXT NOT NULL,
    "recipient_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "employee_id" UUID,
    "params" JSONB NOT NULL DEFAULT '{}',
    "dedupe_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "resolved_by_name" JSONB,
    "resolution" TEXT,

    CONSTRAINT "notification_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_deliveries" (
    "id" UUID NOT NULL,
    "notification_id" UUID NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_defaults" (
    "type" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_defaults_pkey" PRIMARY KEY ("type","channel")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("user_id","type","channel")
);

-- CreateIndex
CREATE INDEX "notifications_recipient_kind_recipient_id_updated_at_idx" ON "notifications"("recipient_kind", "recipient_id", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "notifications_recipient_kind_recipient_id_read_at_resolved__idx" ON "notifications"("recipient_kind", "recipient_id", "read_at", "resolved_at");

-- CreateIndex
CREATE INDEX "notifications_recipient_kind_recipient_id_type_group_key_idx" ON "notifications"("recipient_kind", "recipient_id", "type", "group_key");

-- CreateIndex
CREATE INDEX "notifications_read_at_idx" ON "notifications"("read_at");

-- CreateIndex
CREATE INDEX "notifications_resolved_at_idx" ON "notifications"("resolved_at");

-- CreateIndex
CREATE INDEX "notifications_created_at_idx" ON "notifications"("created_at");

-- CreateIndex
CREATE INDEX "notification_items_type_entity_type_entity_id_resolved_at_idx" ON "notification_items"("type", "entity_type", "entity_id", "resolved_at");

-- CreateIndex
CREATE INDEX "notification_items_notification_id_idx" ON "notification_items"("notification_id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_items_recipient_kind_recipient_id_type_dedupe__key" ON "notification_items"("recipient_kind", "recipient_id", "type", "dedupe_key");

-- CreateIndex
CREATE INDEX "notification_deliveries_channel_status_idx" ON "notification_deliveries"("channel", "status");

-- CreateIndex
CREATE UNIQUE INDEX "notification_deliveries_notification_id_channel_key" ON "notification_deliveries"("notification_id", "channel");

-- AddForeignKey
ALTER TABLE "notification_items" ADD CONSTRAINT "notification_items_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Settings → Notifications on the starting roles that hold it (BUILT_IN_ROLES, owner 2026-11-18):
-- the System admin changes it (it holds every key anyway), the HR manager views it read-only.
-- Existing databases get the grants here; idempotent.
INSERT INTO "role_permissions" ("role_id", "permission_key", "scope")
SELECT r."id", g.permission_key, g.scope::"PermissionScope"
FROM (VALUES
    ('system_admin', 'core.notifications.view', 'all'),
    ('system_admin', 'core.notifications.manage', 'all'),
    ('hr_manager', 'core.notifications.view', 'all')
) AS g(role_key, permission_key, scope)
JOIN "roles" r ON r."key" = g.role_key
ON CONFLICT ("role_id", "permission_key") DO NOTHING;

