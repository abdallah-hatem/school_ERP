-- §10 accounting: an approved payroll month can be sent back to HR (with a reason) until it is
-- finalized — the salaries transferred — after which it is final.

-- AlterTable
ALTER TABLE "payroll_runs" ADD COLUMN "transferred_at" TIMESTAMP(3),
ADD COLUMN "returned_at" TIMESTAMP(3),
ADD COLUMN "return_reason" TEXT;

-- AlterTable
ALTER TABLE "accounting_payroll_runs" ADD COLUMN "finalized_at" TIMESTAMP(3),
ADD COLUMN "finalized_by_id" UUID;

-- Returning a month to HR and finalizing it, on the starting roles that hold them (BUILT_IN_ROLES).
INSERT INTO "role_permissions" ("role_id", "permission_key", "scope")
SELECT r."id", g.permission_key, g.scope::"PermissionScope"
FROM (VALUES
    ('system_admin', 'accounting.payroll.return', 'all'),
    ('system_admin', 'accounting.payroll.finalize', 'all'),
    ('accountant', 'accounting.payroll.return', 'all'),
    ('accountant', 'accounting.payroll.finalize', 'all')
) AS g(role_key, permission_key, scope)
JOIN "roles" r ON r."key" = g.role_key
ON CONFLICT ("role_id", "permission_key") DO NOTHING;
