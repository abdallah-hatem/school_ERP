-- core/events: seeing and retrying dead outbox deliveries, on the starting role that holds it
-- (BUILT_IN_ROLES): System admin holds every key. Existing databases get it here; idempotent.
INSERT INTO "role_permissions" ("role_id", "permission_key", "scope")
SELECT r."id", g.permission_key, g.scope::"PermissionScope"
FROM (VALUES
    ('system_admin', 'core.outbox.manage', 'all')
) AS g(role_key, permission_key, scope)
JOIN "roles" r ON r."key" = g.role_key
ON CONFLICT ("role_id", "permission_key") DO NOTHING;
