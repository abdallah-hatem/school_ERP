-- The home dashboard's analytics charts (§2, owner 2026-11-21).

-- 1. When an employee left: the school day of their last deactivation (leavers per month). Null
--    while active; reactivating clears it.
ALTER TABLE "employees" ADD COLUMN "deactivated_on" DATE;

-- Employees already inactive: the day of their last deactivation in the activity log, on the
-- school's clock (Cairo); without one, the day their record last changed.
UPDATE "employees" e
SET "deactivated_on" = COALESCE(
  (
    SELECT (a."at" AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Cairo')::date
    FROM "audit_entries" a
    WHERE a."entity_type" = 'employee'
      AND a."entity_id" = e."id"::text
      AND a."action" = 'hr.employee.deactivate'
    ORDER BY a."at" DESC
    LIMIT 1
  ),
  (e."updated_at" AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Cairo')::date
)
WHERE e."status" = 'INACTIVE';

CREATE INDEX "employees_hire_date_idx" ON "employees"("hire_date");
CREATE INDEX "employees_deactivated_on_idx" ON "employees"("deactivated_on");

-- 2. Seeing the charts, on the starting role that holds it (BUILT_IN_ROLES): only the System admin,
--    who holds every key ("for now make it only visible to the system admin"). An admin can grant
--    it to other roles. Existing databases get it here; idempotent.
INSERT INTO "role_permissions" ("role_id", "permission_key", "scope")
SELECT r."id", g.permission_key, g.scope::"PermissionScope"
FROM (VALUES
    ('system_admin', 'hr.dashboard.view_analytics', 'all')
) AS g(role_key, permission_key, scope)
JOIN "roles" r ON r."key" = g.role_key
ON CONFLICT ("role_id", "permission_key") DO NOTHING;
