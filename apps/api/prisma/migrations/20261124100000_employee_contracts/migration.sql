-- §3 Contracts (spec docs/specs/2026-11-24-contracts.md): each employee's contracts, one row per
-- contract year, kept forever; the school calendar per contract year (Settings → HR rules); the
-- two permissions on the starting roles.

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('ACTIVE', 'RENEWED', 'NOT_RENEWED', 'ENDED_EARLY');

-- CreateEnum
CREATE TYPE "NonRenewalBy" AS ENUM ('SCHOOL', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "CalendarTiming" AS ENUM ('ON_TIME', 'EARLY', 'LATE', 'CALENDAR_NOT_SET');

-- CreateEnum
CREATE TYPE "EarlyTerminationStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ContractEndReason" AS ENUM ('ARTICLE_148', 'RESIGNATION_BY_AGREEMENT', 'DEATH', 'OTHER', 'EARLY_TERMINATION');

-- CreateTable
CREATE TABLE "employee_contracts" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "status" "ContractStatus" NOT NULL DEFAULT 'ACTIVE',
    "non_renewal_by" "NonRenewalBy",
    "notice_received_on" DATE,
    "notice_timing" "CalendarTiming",
    "notice_file_url" TEXT,
    "note" TEXT,
    "early_termination_status" "EarlyTerminationStatus",
    "early_termination_requested_on" DATE,
    "early_termination_timing" "CalendarTiming",
    "early_termination_note" TEXT,
    "early_termination_file_url" TEXT,
    "early_termination_decided_by_id" UUID,
    "early_termination_decided_at" TIMESTAMP(3),
    "early_termination_reject_reason" TEXT,
    "ended_on" DATE,
    "end_reason" "ContractEndReason",
    "end_note" TEXT,
    "end_file_url" TEXT,
    "decided_by_id" UUID,
    "decided_at" TIMESTAMP(3),
    "next_contract_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_calendars" (
    "year" INTEGER NOT NULL,
    "term1_start" DATE NOT NULL,
    "term1_end" DATE NOT NULL,
    "term2_start" DATE NOT NULL,
    "non_renewal_deadline" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "school_calendars_pkey" PRIMARY KEY ("year")
);

-- CreateIndex
CREATE UNIQUE INDEX "employee_contracts_next_contract_id_key" ON "employee_contracts"("next_contract_id");

-- CreateIndex
CREATE INDEX "employee_contracts_employee_id_idx" ON "employee_contracts"("employee_id");

-- CreateIndex
CREATE INDEX "employee_contracts_ends_on_idx" ON "employee_contracts"("ends_on");

-- CreateIndex
CREATE INDEX "employee_contracts_status_idx" ON "employee_contracts"("status");

-- CreateIndex
CREATE INDEX "employee_contracts_decided_by_id_idx" ON "employee_contracts"("decided_by_id");

-- CreateIndex
CREATE INDEX "employee_contracts_early_termination_decided_by_id_idx" ON "employee_contracts"("early_termination_decided_by_id");

-- CreateIndex
CREATE INDEX "employee_contracts_notice_file_url_idx" ON "employee_contracts"("notice_file_url");

-- CreateIndex
CREATE INDEX "employee_contracts_early_termination_file_url_idx" ON "employee_contracts"("early_termination_file_url");

-- CreateIndex
CREATE INDEX "employee_contracts_end_file_url_idx" ON "employee_contracts"("end_file_url");

-- AddForeignKey
ALTER TABLE "employee_contracts" ADD CONSTRAINT "employee_contracts_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_contracts" ADD CONSTRAINT "employee_contracts_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_contracts" ADD CONSTRAINT "employee_contracts_early_termination_decided_by_id_fkey" FOREIGN KEY ("early_termination_decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_contracts" ADD CONSTRAINT "employee_contracts_next_contract_id_fkey" FOREIGN KEY ("next_contract_id") REFERENCES "employee_contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- One active contract per employee at a time (spec → Rules): the database refuses a second.
CREATE UNIQUE INDEX "employee_contracts_one_active_per_employee" ON "employee_contracts"("employee_id") WHERE "status" = 'ACTIVE';

-- Every existing employee gets one contract from their current dates (spec → Data), with no
-- decision yet. An inactive employee's undecided contract doesn't appear on the renewal screen.
INSERT INTO "employee_contracts" ("id", "employee_id", "starts_on", "ends_on", "status", "created_at", "updated_at")
SELECT gen_random_uuid(), e."id", e."contract_start", e."contract_end", 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "employees" e
WHERE NOT EXISTS (SELECT 1 FROM "employee_contracts" c WHERE c."employee_id" = e."id");

-- The permissions on the starting roles that hold them (BUILT_IN_ROLES, GUESS): view — HR manager,
-- HR officer, principal (all), stage head (own stage); manage — HR manager. The System admin's
-- stored list too (it holds every key). Joined on the role's key, so a deleted starting role is
-- skipped; idempotent.
INSERT INTO "role_permissions" ("role_id", "permission_key", "scope")
SELECT r."id", g.permission_key, g.scope::"PermissionScope"
FROM (VALUES
    ('system_admin', 'hr.contracts.view', 'all'),
    ('system_admin', 'hr.contracts.manage', 'all'),
    ('hr_manager', 'hr.contracts.view', 'all'),
    ('hr_manager', 'hr.contracts.manage', 'all'),
    ('hr_officer', 'hr.contracts.view', 'all'),
    ('principal', 'hr.contracts.view', 'all'),
    ('stage_head', 'hr.contracts.view', 'own_stage')
) AS g(role_key, permission_key, scope)
JOIN "roles" r ON r."key" = g.role_key
ON CONFLICT ("role_id", "permission_key") DO NOTHING;
