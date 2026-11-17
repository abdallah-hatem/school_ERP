-- §6 tax, martyrs' fund and social insurance on payroll lines (salaries are net — grossed up).
ALTER TABLE "payroll_lines"
  ADD COLUMN "insurance_status" "InsuranceStatus" NOT NULL DEFAULT 'NOT_INSURED',
  ADD COLUMN "insured_salary" INTEGER,
  ADD COLUMN "insurance_amount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "income_tax" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "martyr_tax" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "gross" INTEGER NOT NULL DEFAULT 0;

-- Lines calculated before tax existed: nothing was paid on top, so their gross is their net.
-- Approved runs are never recalculated; drafts get real values on their next recalculate.
UPDATE "payroll_lines" SET "gross" = "net";
