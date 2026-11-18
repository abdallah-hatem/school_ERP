-- §10: an approved month's taxes are frozen at approval, even when worked out later.
-- 1) HR's payroll lines keep each employee's insurance, retaken at approval.
-- 2) Every version of the tax rule is kept from the moment it took effect.

-- AlterTable: added nullable, filled from today's employee record (the best value for lines
-- written before this), then required.
ALTER TABLE "payroll_lines" ADD COLUMN "insurance_status" "InsuranceStatus",
ADD COLUMN "insured_salary" INTEGER;

UPDATE "payroll_lines" AS pl
SET "insurance_status" = e."insurance_status",
    "insured_salary" = e."insured_salary"
FROM "employees" AS e
WHERE e."id" = pl."employee_id";

ALTER TABLE "payroll_lines" ALTER COLUMN "insurance_status" SET NOT NULL;

-- CreateTable
CREATE TABLE "accounting_tax_rule_versions" (
    "id" UUID NOT NULL,
    "rule" JSONB NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changed_by_id" UUID,

    CONSTRAINT "accounting_tax_rule_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "accounting_tax_rule_versions_effective_from_idx" ON "accounting_tax_rule_versions"("effective_from");
