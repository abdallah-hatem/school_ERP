-- §3, §4 (owner 2026-11-21): an employee can belong to several stages, each penalty records the
-- stage where the violation happened, and every penalty goes through two steps — the stage head
-- of that stage, then HR.

-- 1. Statuses. PENDING becomes WAITING_HR (a rename: every penalty pending today waits for HR and
--    needs no new stage review); APPROVED and CANCELLED are untouched. Then the two new statuses.
ALTER TYPE "PenaltyStatus" RENAME VALUE 'PENDING' TO 'WAITING_HR';
ALTER TYPE "PenaltyStatus" ADD VALUE IF NOT EXISTS 'PENDING_REVIEW';
ALTER TYPE "PenaltyStatus" ADD VALUE IF NOT EXISTS 'REJECTED';

CREATE TYPE "PenaltyStep" AS ENUM ('REVIEW', 'HR');
CREATE TYPE "PenaltyReviewSkip" AS ENUM ('EMPLOYEE_IS_HEAD', 'RECORDER_IS_HEAD', 'NO_STAGE_HEAD');

-- 2. "Also teaches in": an employee's stages besides the main one.
CREATE TABLE "employee_stages" (
    "employee_id" UUID NOT NULL,
    "stage_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_stages_pkey" PRIMARY KEY ("employee_id","stage_id")
);
CREATE INDEX "employee_stages_stage_id_idx" ON "employee_stages"("stage_id");
ALTER TABLE "employee_stages" ADD CONSTRAINT "employee_stages_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employee_stages" ADD CONSTRAINT "employee_stages_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3. The penalty's stage: existing penalties get their employee's (main) stage, the only one any
--    employee had until now. Then the two steps' columns.
ALTER TABLE "penalty_records" ADD COLUMN "stage_id" UUID;
UPDATE "penalty_records" p SET "stage_id" = e."stage_id" FROM "employees" e WHERE e."id" = p."employee_id";
ALTER TABLE "penalty_records" ALTER COLUMN "stage_id" SET NOT NULL;
ALTER TABLE "penalty_records"
    ADD COLUMN "reviewed_by_id" UUID,
    ADD COLUMN "reviewed_at" TIMESTAMP(3),
    ADD COLUMN "review_note" TEXT,
    ADD COLUMN "review_skip" "PenaltyReviewSkip",
    ADD COLUMN "approval_note" TEXT,
    ADD COLUMN "rejected_by_id" UUID,
    ADD COLUMN "rejected_at" TIMESTAMP(3),
    ADD COLUMN "rejected_step" "PenaltyStep",
    ADD COLUMN "rejection_reason" TEXT;
CREATE INDEX "penalty_records_stage_id_idx" ON "penalty_records"("stage_id");
CREATE INDEX "penalty_records_reviewed_by_id_idx" ON "penalty_records"("reviewed_by_id");
CREATE INDEX "penalty_records_rejected_by_id_idx" ON "penalty_records"("rejected_by_id");
ALTER TABLE "penalty_records" ADD CONSTRAINT "penalty_records_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "penalty_records" ADD CONSTRAINT "penalty_records_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "penalty_records" ADD CONSTRAINT "penalty_records_rejected_by_id_fkey" FOREIGN KEY ("rejected_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. The stage review permission, on the starting role that holds it (BUILT_IN_ROLES): the Stage
--    head, for their own stages. The System admin holds every key. Joined on the role's key, so a
--    deleted starting role is skipped; idempotent.
INSERT INTO "role_permissions" ("role_id", "permission_key", "scope")
SELECT r."id", g.permission_key, g.scope::"PermissionScope"
FROM (VALUES
    ('stage_head', 'hr.penalties.review', 'own_stage')
) AS g(role_key, permission_key, scope)
JOIN "roles" r ON r."key" = g.role_key
ON CONFLICT ("role_id", "permission_key") DO NOTHING;
