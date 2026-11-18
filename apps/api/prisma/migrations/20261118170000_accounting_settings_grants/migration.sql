-- §10 accounting: the payroll tax rule's permissions on the starting roles that hold them
-- (BUILT_IN_ROLES): System admin holds every key; the Accountant sees and changes the rule.
INSERT INTO "role_permissions" ("role_id", "permission_key", "scope")
SELECT r."id", g.permission_key, g.scope::"PermissionScope"
FROM (VALUES
    ('system_admin', 'accounting.settings.view', 'all'),
    ('system_admin', 'accounting.settings.edit', 'all'),
    ('accountant', 'accounting.settings.view', 'all'),
    ('accountant', 'accounting.settings.edit', 'all')
) AS g(role_key, permission_key, scope)
JOIN "roles" r ON r."key" = g.role_key
ON CONFLICT ("role_id", "permission_key") DO NOTHING;
