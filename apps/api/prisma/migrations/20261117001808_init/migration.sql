-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('HR_ADMIN');

-- CreateEnum
CREATE TYPE "SettingScope" AS ENUM ('SCHOOL', 'HR');

-- CreateEnum
CREATE TYPE "WorkSystem" AS ENUM ('FULL_TIME', 'PART_TIME_4', 'PART_TIME_3', 'PART_TIME_2');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "PenaltyAction" AS ENUM ('NOTICE', 'WARNING', 'DEDUCT_DAYS', 'INVESTIGATION', 'RAISE_HALF_LOSS', 'RAISE_LOSS', 'RAISE_DEFER_3M', 'PAY_CUT', 'DEMOTION', 'DISMISSAL');

-- CreateEnum
CREATE TYPE "PenaltyStatus" AS ENUM ('PENDING', 'APPROVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PayrollStatus" AS ENUM ('DRAFT', 'APPROVED');

-- CreateEnum
CREATE TYPE "AdjustmentType" AS ENUM ('ADDITION', 'DEDUCTION');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'HR_ADMIN',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "replaced_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "counters" (
    "name" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "counters_pkey" PRIMARY KEY ("name")
);

-- CreateTable
CREATE TABLE "school_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "school_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "setting_changes" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "scope" "SettingScope" NOT NULL,
    "old_value" JSONB,
    "new_value" JSONB,
    "changed_by_id" UUID,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "setting_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stages" (
    "id" UUID NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_titles" (
    "id" UUID NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_titles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "national_id" TEXT,
    "gender" "Gender" NOT NULL,
    "date_of_birth" DATE NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "address" TEXT,
    "hire_date" DATE NOT NULL,
    "stage_id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "job_title_id" UUID NOT NULL,
    "manager_id" UUID,
    "grade" TEXT,
    "work_system" "WorkSystem" NOT NULL,
    "basic_salary" INTEGER NOT NULL,
    "fingerprint_id" TEXT,
    "contract_start" DATE NOT NULL,
    "contract_end" DATE NOT NULL,
    "uses_bus" BOOLEAN NOT NULL DEFAULT false,
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "penalty_groups" (
    "id" UUID NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "penalty_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "violations" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "note" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "violations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "violation_levels" (
    "id" UUID NOT NULL,
    "violation_id" UUID NOT NULL,
    "level" INTEGER NOT NULL,
    "action" "PenaltyAction" NOT NULL,
    "days" DECIMAL(5,2),

    CONSTRAINT "violation_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "penalty_records" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "violation_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "status" "PenaltyStatus" NOT NULL DEFAULT 'PENDING',
    "level" INTEGER NOT NULL,
    "action" "PenaltyAction" NOT NULL,
    "days" DECIMAL(5,2),
    "note" TEXT,
    "cancel_reason" TEXT,
    "created_by_id" UUID,
    "approved_by_id" UUID,
    "approved_at" TIMESTAMP(3),
    "cancelled_by_id" UUID,
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "penalty_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lateness_entries" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "month" CHAR(7) NOT NULL,
    "minutes" INTEGER NOT NULL,
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lateness_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_runs" (
    "id" UUID NOT NULL,
    "month" CHAR(7) NOT NULL,
    "status" "PayrollStatus" NOT NULL DEFAULT 'DRAFT',
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" UUID,
    "approved_by_id" UUID,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_lines" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "employee_code" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "national_id" TEXT,
    "department_id" UUID NOT NULL,
    "department_name_en" TEXT NOT NULL,
    "department_name_ar" TEXT NOT NULL,
    "basic_salary" INTEGER NOT NULL,
    "work_system" "WorkSystem" NOT NULL,
    "month_salary" INTEGER NOT NULL,
    "day_value" INTEGER NOT NULL,
    "penalty_days" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "penalty_amount" INTEGER NOT NULL DEFAULT 0,
    "lateness_minutes" INTEGER NOT NULL DEFAULT 0,
    "lateness_days" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "lateness_amount" INTEGER NOT NULL DEFAULT 0,
    "adjustment_additions" INTEGER NOT NULL DEFAULT 0,
    "adjustment_deductions" INTEGER NOT NULL DEFAULT 0,
    "net" INTEGER NOT NULL,
    "flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_adjustments" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "type" "AdjustmentType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_is_active_idx" ON "users"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens"("family_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "school_settings_updated_by_id_idx" ON "school_settings"("updated_by_id");

-- CreateIndex
CREATE INDEX "setting_changes_key_idx" ON "setting_changes"("key");

-- CreateIndex
CREATE INDEX "setting_changes_scope_idx" ON "setting_changes"("scope");

-- CreateIndex
CREATE INDEX "setting_changes_changed_by_id_idx" ON "setting_changes"("changed_by_id");

-- CreateIndex
CREATE INDEX "setting_changes_changed_at_idx" ON "setting_changes"("changed_at");

-- CreateIndex
CREATE INDEX "stages_is_active_idx" ON "stages"("is_active");

-- CreateIndex
CREATE INDEX "stages_sort_order_idx" ON "stages"("sort_order");

-- CreateIndex
CREATE INDEX "departments_is_active_idx" ON "departments"("is_active");

-- CreateIndex
CREATE INDEX "departments_sort_order_idx" ON "departments"("sort_order");

-- CreateIndex
CREATE INDEX "job_titles_is_active_idx" ON "job_titles"("is_active");

-- CreateIndex
CREATE INDEX "job_titles_sort_order_idx" ON "job_titles"("sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "employees_code_key" ON "employees"("code");

-- CreateIndex
CREATE UNIQUE INDEX "employees_national_id_key" ON "employees"("national_id");

-- CreateIndex
CREATE UNIQUE INDEX "employees_fingerprint_id_key" ON "employees"("fingerprint_id");

-- CreateIndex
CREATE UNIQUE INDEX "employees_user_id_key" ON "employees"("user_id");

-- CreateIndex
CREATE INDEX "employees_stage_id_idx" ON "employees"("stage_id");

-- CreateIndex
CREATE INDEX "employees_department_id_idx" ON "employees"("department_id");

-- CreateIndex
CREATE INDEX "employees_job_title_id_idx" ON "employees"("job_title_id");

-- CreateIndex
CREATE INDEX "employees_manager_id_idx" ON "employees"("manager_id");

-- CreateIndex
CREATE INDEX "employees_status_idx" ON "employees"("status");

-- CreateIndex
CREATE INDEX "employees_work_system_idx" ON "employees"("work_system");

-- CreateIndex
CREATE INDEX "penalty_groups_is_active_idx" ON "penalty_groups"("is_active");

-- CreateIndex
CREATE INDEX "penalty_groups_sort_order_idx" ON "penalty_groups"("sort_order");

-- CreateIndex
CREATE INDEX "violations_group_id_idx" ON "violations"("group_id");

-- CreateIndex
CREATE INDEX "violations_is_active_idx" ON "violations"("is_active");

-- CreateIndex
CREATE INDEX "violation_levels_violation_id_idx" ON "violation_levels"("violation_id");

-- CreateIndex
CREATE UNIQUE INDEX "violation_levels_violation_id_level_key" ON "violation_levels"("violation_id", "level");

-- CreateIndex
CREATE INDEX "penalty_records_employee_id_idx" ON "penalty_records"("employee_id");

-- CreateIndex
CREATE INDEX "penalty_records_violation_id_idx" ON "penalty_records"("violation_id");

-- CreateIndex
CREATE INDEX "penalty_records_date_idx" ON "penalty_records"("date");

-- CreateIndex
CREATE INDEX "penalty_records_status_idx" ON "penalty_records"("status");

-- CreateIndex
CREATE INDEX "penalty_records_created_by_id_idx" ON "penalty_records"("created_by_id");

-- CreateIndex
CREATE INDEX "penalty_records_approved_by_id_idx" ON "penalty_records"("approved_by_id");

-- CreateIndex
CREATE INDEX "penalty_records_cancelled_by_id_idx" ON "penalty_records"("cancelled_by_id");

-- CreateIndex
CREATE INDEX "penalty_records_employee_id_violation_id_status_date_idx" ON "penalty_records"("employee_id", "violation_id", "status", "date");

-- CreateIndex
CREATE INDEX "lateness_entries_employee_id_idx" ON "lateness_entries"("employee_id");

-- CreateIndex
CREATE INDEX "lateness_entries_month_idx" ON "lateness_entries"("month");

-- CreateIndex
CREATE INDEX "lateness_entries_updated_by_id_idx" ON "lateness_entries"("updated_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "lateness_entries_employee_id_month_key" ON "lateness_entries"("employee_id", "month");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_runs_month_key" ON "payroll_runs"("month");

-- CreateIndex
CREATE INDEX "payroll_runs_status_idx" ON "payroll_runs"("status");

-- CreateIndex
CREATE INDEX "payroll_runs_created_by_id_idx" ON "payroll_runs"("created_by_id");

-- CreateIndex
CREATE INDEX "payroll_runs_approved_by_id_idx" ON "payroll_runs"("approved_by_id");

-- CreateIndex
CREATE INDEX "payroll_lines_run_id_idx" ON "payroll_lines"("run_id");

-- CreateIndex
CREATE INDEX "payroll_lines_employee_id_idx" ON "payroll_lines"("employee_id");

-- CreateIndex
CREATE INDEX "payroll_lines_department_id_idx" ON "payroll_lines"("department_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_lines_run_id_employee_id_key" ON "payroll_lines"("run_id", "employee_id");

-- CreateIndex
CREATE INDEX "payroll_adjustments_run_id_idx" ON "payroll_adjustments"("run_id");

-- CreateIndex
CREATE INDEX "payroll_adjustments_employee_id_idx" ON "payroll_adjustments"("employee_id");

-- CreateIndex
CREATE INDEX "payroll_adjustments_created_by_id_idx" ON "payroll_adjustments"("created_by_id");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_settings" ADD CONSTRAINT "school_settings_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "setting_changes" ADD CONSTRAINT "setting_changes_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_job_title_id_fkey" FOREIGN KEY ("job_title_id") REFERENCES "job_titles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "violations" ADD CONSTRAINT "violations_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "penalty_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "violation_levels" ADD CONSTRAINT "violation_levels_violation_id_fkey" FOREIGN KEY ("violation_id") REFERENCES "violations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "penalty_records" ADD CONSTRAINT "penalty_records_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "penalty_records" ADD CONSTRAINT "penalty_records_violation_id_fkey" FOREIGN KEY ("violation_id") REFERENCES "violations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "penalty_records" ADD CONSTRAINT "penalty_records_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "penalty_records" ADD CONSTRAINT "penalty_records_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "penalty_records" ADD CONSTRAINT "penalty_records_cancelled_by_id_fkey" FOREIGN KEY ("cancelled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lateness_entries" ADD CONSTRAINT "lateness_entries_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lateness_entries" ADD CONSTRAINT "lateness_entries_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_lines" ADD CONSTRAINT "payroll_lines_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_lines" ADD CONSTRAINT "payroll_lines_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Data-integrity checks (defence in depth behind the DTOs; Prisma doesn't model CHECKs).
ALTER TABLE "violation_levels" ADD CONSTRAINT "violation_levels_level_check" CHECK ("level" BETWEEN 1 AND 5);
ALTER TABLE "violation_levels" ADD CONSTRAINT "violation_levels_days_check" CHECK ("days" IS NULL OR "days" > 0);
ALTER TABLE "penalty_records" ADD CONSTRAINT "penalty_records_level_check" CHECK ("level" >= 1);
ALTER TABLE "employees" ADD CONSTRAINT "employees_basic_salary_check" CHECK ("basic_salary" > 0);
ALTER TABLE "lateness_entries" ADD CONSTRAINT "lateness_entries_minutes_check" CHECK ("minutes" BETWEEN 0 AND 6000);
ALTER TABLE "lateness_entries" ADD CONSTRAINT "lateness_entries_month_check" CHECK ("month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_month_check" CHECK ("month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_amount_check" CHECK ("amount" > 0);
