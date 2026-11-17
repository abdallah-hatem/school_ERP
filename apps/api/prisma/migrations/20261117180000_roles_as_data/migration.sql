-- P2 — roles as data (docs/specs/2026-11-17-roles-permissions.md, R2 / R5 / R8 / R9).
--   1. roles, role_permissions (with a scope per permission), user_roles
--   2. users: must_change_password, and employee_id — the core-owned link to an employee
--      (copied from HR's employees.user_id, which is deprecated from here on)
--   3. the starting roles and their permissions (packages/shared/src/roles.ts, BUILT_IN_ROLES;
--      test/roles-migration.e2e-spec.ts checks the rows equal it)
--   4. every existing HR admin becomes System admin + HR manager
-- users.role (the UserRole enum) stays, deprecated: nothing decides access with it any more.

-- 1 ── tables ───────────────────────────────────────────────────────────────────────────────
CREATE TYPE "PermissionScope" AS ENUM ('all', 'own_stage', 'own_team', 'self');

CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "built_in" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_key" TEXT NOT NULL,
    "scope" "PermissionScope" NOT NULL DEFAULT 'all',

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_key")
);

CREATE TABLE "user_roles" (
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

CREATE UNIQUE INDEX "roles_key_key" ON "roles"("key");
CREATE INDEX "role_permissions_permission_key_idx" ON "role_permissions"("permission_key");
CREATE INDEX "user_roles_role_id_idx" ON "user_roles"("role_id");

ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 2 ── users ────────────────────────────────────────────────────────────────────────────────
ALTER TABLE "users" ADD COLUMN "employee_id" UUID,
ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "users_employee_id_key" ON "users"("employee_id");
ALTER TABLE "users" ADD CONSTRAINT "users_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- employees.user_id is unique, so each user gets at most one employee.
UPDATE "users" u SET "employee_id" = e."id"
FROM "employees" e
WHERE e."user_id" = u."id";

-- 3 ── the starting roles ───────────────────────────────────────────────────────────────────
INSERT INTO "roles" ("id", "key", "name_en", "name_ar", "built_in", "sort_order", "updated_at") VALUES
    (gen_random_uuid(), 'system_admin', 'System admin', 'مدير النظام', true, 1, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'hr_manager', 'HR manager', 'مدير شؤون الموظفين', true, 2, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'hr_officer', 'HR officer', 'موظف شؤون الموظفين', true, 3, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'accountant', 'Accountant', 'المحاسب', true, 4, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'principal', 'Principal / administrative director', 'المدير / المدير الإداري', true, 5, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'stage_head', 'Stage head', 'رئيس المرحلة', true, 6, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'direct_manager', 'Direct manager', 'المدير المباشر', true, 7, CURRENT_TIMESTAMP);

INSERT INTO "role_permissions" ("role_id", "permission_key", "scope")
SELECT r."id", g.permission_key, g.scope::"PermissionScope"
FROM (VALUES
    ('system_admin', 'core.settings.view', 'all'),
    ('system_admin', 'core.settings.edit', 'all'),
    ('system_admin', 'core.stages.view', 'all'),
    ('system_admin', 'core.stages.manage', 'all'),
    ('system_admin', 'core.audit.view', 'all'),
    ('system_admin', 'core.users.view', 'all'),
    ('system_admin', 'core.users.manage', 'all'),
    ('system_admin', 'core.roles.view', 'all'),
    ('system_admin', 'core.roles.manage', 'all'),
    ('system_admin', 'hr.dashboard.view', 'all'),
    ('system_admin', 'hr.employees.view', 'all'),
    ('system_admin', 'hr.employees.view_salary', 'all'),
    ('system_admin', 'hr.employees.create', 'all'),
    ('system_admin', 'hr.employees.edit', 'all'),
    ('system_admin', 'hr.employees.change_status', 'all'),
    ('system_admin', 'hr.lists.view', 'all'),
    ('system_admin', 'hr.lists.manage', 'all'),
    ('system_admin', 'hr.settings.view', 'all'),
    ('system_admin', 'hr.settings.edit', 'all'),
    ('system_admin', 'hr.penalty_catalogue.view', 'all'),
    ('system_admin', 'hr.penalty_catalogue.manage', 'all'),
    ('system_admin', 'hr.penalties.view', 'all'),
    ('system_admin', 'hr.penalties.record', 'all'),
    ('system_admin', 'hr.penalties.approve', 'all'),
    ('system_admin', 'hr.penalties.cancel', 'all'),
    ('system_admin', 'hr.lateness.view', 'all'),
    ('system_admin', 'hr.lateness.edit', 'all'),
    ('system_admin', 'hr.payroll.view', 'all'),
    ('system_admin', 'hr.payroll.create', 'all'),
    ('system_admin', 'hr.payroll.recalculate', 'all'),
    ('system_admin', 'hr.payroll.adjust', 'all'),
    ('system_admin', 'hr.payroll.approve', 'all'),
    ('system_admin', 'hr.payroll.export_bank_sheet', 'all'),
    ('hr_manager', 'hr.dashboard.view', 'all'),
    ('hr_manager', 'hr.employees.view', 'all'),
    ('hr_manager', 'hr.employees.view_salary', 'all'),
    ('hr_manager', 'hr.employees.create', 'all'),
    ('hr_manager', 'hr.employees.edit', 'all'),
    ('hr_manager', 'hr.employees.change_status', 'all'),
    ('hr_manager', 'hr.lists.view', 'all'),
    ('hr_manager', 'hr.lists.manage', 'all'),
    ('hr_manager', 'hr.settings.view', 'all'),
    ('hr_manager', 'hr.settings.edit', 'all'),
    ('hr_manager', 'hr.penalty_catalogue.view', 'all'),
    ('hr_manager', 'hr.penalty_catalogue.manage', 'all'),
    ('hr_manager', 'hr.penalties.view', 'all'),
    ('hr_manager', 'hr.penalties.record', 'all'),
    ('hr_manager', 'hr.penalties.approve', 'all'),
    ('hr_manager', 'hr.penalties.cancel', 'all'),
    ('hr_manager', 'hr.lateness.view', 'all'),
    ('hr_manager', 'hr.lateness.edit', 'all'),
    ('hr_manager', 'hr.payroll.view', 'all'),
    ('hr_manager', 'hr.payroll.create', 'all'),
    ('hr_manager', 'hr.payroll.recalculate', 'all'),
    ('hr_manager', 'hr.payroll.adjust', 'all'),
    ('hr_manager', 'hr.payroll.approve', 'all'),
    ('hr_manager', 'hr.payroll.export_bank_sheet', 'all'),
    ('hr_manager', 'core.stages.view', 'all'),
    ('hr_manager', 'core.audit.view', 'all'),
    ('hr_officer', 'core.stages.view', 'all'),
    ('hr_officer', 'hr.dashboard.view', 'all'),
    ('hr_officer', 'hr.employees.view', 'all'),
    ('hr_officer', 'hr.employees.view_salary', 'all'),
    ('hr_officer', 'hr.employees.create', 'all'),
    ('hr_officer', 'hr.employees.edit', 'all'),
    ('hr_officer', 'hr.employees.change_status', 'all'),
    ('hr_officer', 'hr.lists.view', 'all'),
    ('hr_officer', 'hr.settings.view', 'all'),
    ('hr_officer', 'hr.penalty_catalogue.view', 'all'),
    ('hr_officer', 'hr.penalties.view', 'all'),
    ('hr_officer', 'hr.penalties.record', 'all'),
    ('hr_officer', 'hr.lateness.view', 'all'),
    ('hr_officer', 'hr.lateness.edit', 'all'),
    ('hr_officer', 'hr.payroll.view', 'all'),
    ('hr_officer', 'hr.payroll.create', 'all'),
    ('hr_officer', 'hr.payroll.recalculate', 'all'),
    ('hr_officer', 'hr.payroll.adjust', 'all'),
    ('accountant', 'hr.employees.view', 'all'),
    ('accountant', 'hr.employees.view_salary', 'all'),
    ('accountant', 'hr.payroll.view', 'all'),
    ('accountant', 'hr.payroll.export_bank_sheet', 'all'),
    ('principal', 'core.stages.view', 'all'),
    ('principal', 'core.audit.view', 'all'),
    ('principal', 'hr.dashboard.view', 'all'),
    ('principal', 'hr.employees.view', 'all'),
    ('principal', 'hr.lists.view', 'all'),
    ('principal', 'hr.penalty_catalogue.view', 'all'),
    ('principal', 'hr.penalties.view', 'all'),
    ('principal', 'hr.penalties.approve', 'all'),
    ('principal', 'hr.penalties.cancel', 'all'),
    ('principal', 'hr.lateness.view', 'all'),
    ('principal', 'hr.payroll.view', 'all'),
    ('stage_head', 'hr.employees.view', 'own_stage'),
    ('stage_head', 'hr.penalties.view', 'own_stage'),
    ('stage_head', 'hr.penalties.record', 'own_stage'),
    ('stage_head', 'core.stages.view', 'all'),
    ('stage_head', 'hr.penalty_catalogue.view', 'all'),
    ('direct_manager', 'hr.employees.view', 'own_team'),
    ('direct_manager', 'hr.penalties.view', 'own_team'),
    ('direct_manager', 'hr.penalties.record', 'own_team'),
    ('direct_manager', 'core.stages.view', 'all'),
    ('direct_manager', 'hr.penalty_catalogue.view', 'all')
) AS g(role_key, permission_key, scope)
JOIN "roles" r ON r."key" = g.role_key;

-- 4 ── HR admins → System admin + HR manager (SEED_ADMIN_ROLES) ─────────────────────────────
INSERT INTO "user_roles" ("user_id", "role_id")
SELECT u."id", r."id"
FROM "users" u
JOIN "roles" r ON r."key" IN ('system_admin', 'hr_manager')
WHERE u."role" = 'HR_ADMIN';
