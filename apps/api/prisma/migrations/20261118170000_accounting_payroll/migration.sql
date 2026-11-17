-- §10 accounting: each approved HR payroll month's taxes, worked out once at approval and frozen.

-- CreateTable
CREATE TABLE "accounting_payroll_runs" (
    "id" UUID NOT NULL,
    "hr_run_id" UUID NOT NULL,
    "month" CHAR(7) NOT NULL,
    "tax_rule" JSONB NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounting_payroll_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_payroll_lines" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "employee_code" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "net" INTEGER NOT NULL,
    "insurance_status" "InsuranceStatus" NOT NULL,
    "insured_salary" INTEGER,
    "insurance_amount" INTEGER NOT NULL,
    "income_tax" INTEGER NOT NULL,
    "martyr_tax" INTEGER NOT NULL,
    "gross" INTEGER NOT NULL,

    CONSTRAINT "accounting_payroll_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "accounting_payroll_runs_hr_run_id_key" ON "accounting_payroll_runs"("hr_run_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_payroll_runs_month_key" ON "accounting_payroll_runs"("month");

-- CreateIndex
CREATE INDEX "accounting_payroll_lines_run_id_idx" ON "accounting_payroll_lines"("run_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_payroll_lines_run_id_employee_id_key" ON "accounting_payroll_lines"("run_id", "employee_id");

-- AddForeignKey
ALTER TABLE "accounting_payroll_lines" ADD CONSTRAINT "accounting_payroll_lines_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "accounting_payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The new accounting permissions on the starting roles that hold them (BUILT_IN_ROLES):
-- System admin holds every key; the Accountant views payroll taxes and owns their rule.
INSERT INTO "role_permissions" ("role_id", "permission_key", "scope")
SELECT r."id", g.permission_key, g.scope::"PermissionScope"
FROM (VALUES
    ('system_admin', 'accounting.settings.view', 'all'),
    ('system_admin', 'accounting.settings.edit', 'all'),
    ('system_admin', 'accounting.payroll.view', 'all'),
    ('accountant', 'accounting.settings.view', 'all'),
    ('accountant', 'accounting.settings.edit', 'all'),
    ('accountant', 'accounting.payroll.view', 'all')
) AS g(role_key, permission_key, scope)
JOIN "roles" r ON r."key" = g.role_key
ON CONFLICT ("role_id", "permission_key") DO NOTHING;
