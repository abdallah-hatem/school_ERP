-- Penalty actions (spec 2026-11-25-penalty-actions, owner approved 2026-11-26): a catalogue level's
-- action stops being a code enum and becomes a row of the school's Penalty actions list, each with
-- one effect fixed in code; the level holds its number (days, percent or amount). A penalty keeps a
-- snapshot of its action (names, effect, base) and its number. Payroll lines keep the day-priced
-- part of their penalty deduction apart.
--
-- Written to run on a database with data, in one transaction (Prisma's): the ten seeded actions are
-- inserted with today's names, every level and penalty is pointed at the row whose code is its old
-- enum value (same names, so everything reads as before), and old payroll lines get
-- penalty_days_amount = penalty_amount (only day deductions existed). Nothing else moves.

-- CreateEnum
CREATE TYPE "PenaltyEffect" AS ENUM ('RECORD_ONLY', 'DEDUCT_DAYS', 'DEDUCT_PERCENT', 'DEDUCT_AMOUNT', 'INVESTIGATION');

-- CreateEnum
CREATE TYPE "PenaltySalaryBase" AS ENUM ('MONTH_SALARY', 'BASIC_SALARY');

-- CreateTable
CREATE TABLE "penalty_actions" (
    "id" UUID NOT NULL,
    "code" TEXT,
    "name_en" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "effect" "PenaltyEffect" NOT NULL,
    "percent_base" "PenaltySalaryBase",
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "search_text" TEXT GENERATED ALWAYS AS (search_fold(coalesce("name_en", '') || ' ' || coalesce("name_ar", ''))) STORED,
    "search_compact" TEXT GENERATED ALWAYS AS (replace(search_fold(coalesce("name_en", '') || ' ' || coalesce("name_ar", '')), ' ', '')) STORED,

    CONSTRAINT "penalty_actions_pkey" PRIMARY KEY ("id"),
    -- A % action says which salary it is a % of; no other effect has a base.
    CONSTRAINT "penalty_actions_percent_base_check" CHECK (("effect" = 'DEDUCT_PERCENT') = ("percent_base" IS NOT NULL))
);

-- CreateIndex
CREATE UNIQUE INDEX "penalty_actions_code_key" ON "penalty_actions"("code");

-- Names are unique in each language, any case, hidden actions included (SQL only: Prisma can't
-- declare an index on lower(...)). Two people adding the same name at once: one wins.
CREATE UNIQUE INDEX "penalty_actions_name_en_lower_key" ON "penalty_actions"(lower("name_en"));
CREATE UNIQUE INDEX "penalty_actions_name_ar_lower_key" ON "penalty_actions"(lower("name_ar"));

-- CreateIndex
CREATE INDEX "penalty_actions_is_active_idx" ON "penalty_actions"("is_active");

-- CreateIndex
CREATE INDEX "penalty_actions_sort_order_idx" ON "penalty_actions"("sort_order");

-- CreateIndex
CREATE INDEX "penalty_actions_search_text_idx" ON "penalty_actions" USING GIN ("search_text" public.gin_trgm_ops);

-- CreateIndex
CREATE INDEX "penalty_actions_search_compact_idx" ON "penalty_actions" USING GIN ("search_compact" public.gin_trgm_ops);

-- 1. The ten seeded actions: today's names and order (packages/shared SEEDED_PENALTY_ACTIONS).
-- Fixed ids (5eed…01 – …10, in this order), so every school's database names them alike and test
-- fixtures can point at them; rules still go by the effect, never by an id or a code.
INSERT INTO "penalty_actions" ("id", "code", "name_en", "name_ar", "effect", "sort_order", "created_at", "updated_at") VALUES
    ('5eed0000-0000-4000-8000-000000000001', 'NOTICE', 'Notice', 'لفت نظر', 'RECORD_ONLY', 1, now(), now()),
    ('5eed0000-0000-4000-8000-000000000002', 'WARNING', 'Warning', 'إنذار', 'RECORD_ONLY', 2, now(), now()),
    ('5eed0000-0000-4000-8000-000000000003', 'DEDUCT_DAYS', 'Deduct days', 'خصم أيام', 'DEDUCT_DAYS', 3, now(), now()),
    ('5eed0000-0000-4000-8000-000000000004', 'INVESTIGATION', 'Referral to investigation', 'إحالة للتحقيق', 'INVESTIGATION', 4, now(), now()),
    ('5eed0000-0000-4000-8000-000000000005', 'RAISE_HALF_LOSS', 'Loss of half the annual raise', 'الحرمان من نصف العلاوة السنوية', 'RECORD_ONLY', 5, now(), now()),
    ('5eed0000-0000-4000-8000-000000000006', 'RAISE_LOSS', 'Loss of the annual raise', 'الحرمان من العلاوة السنوية', 'RECORD_ONLY', 6, now(), now()),
    ('5eed0000-0000-4000-8000-000000000007', 'RAISE_DEFER_3M', 'Annual raise deferred 3 months', 'تأجيل العلاوة السنوية 3 أشهر', 'RECORD_ONLY', 7, now(), now()),
    ('5eed0000-0000-4000-8000-000000000008', 'PAY_CUT', 'Pay cut by one annual raise', 'خفض الأجر بمقدار علاوة', 'RECORD_ONLY', 8, now(), now()),
    ('5eed0000-0000-4000-8000-000000000009', 'DEMOTION', 'Demotion', 'خفض الدرجة', 'RECORD_ONLY', 9, now(), now()),
    ('5eed0000-0000-4000-8000-000000000010', 'DISMISSAL', 'Dismissal', 'الفصل', 'RECORD_ONLY', 10, now(), now());

-- 2. Levels: point at the seeded row of their old action; days stay where they are.
ALTER TABLE "violation_levels"
ADD COLUMN "action_id" UUID,
ADD COLUMN "percent" DECIMAL(5,2),
ADD COLUMN "amount" INTEGER;

UPDATE "violation_levels" AS l
SET "action_id" = a."id"
FROM "penalty_actions" AS a
WHERE a."code" = l."action"::text;

ALTER TABLE "violation_levels" ALTER COLUMN "action_id" SET NOT NULL;
ALTER TABLE "violation_levels" DROP COLUMN "action";

-- CreateIndex
CREATE INDEX "violation_levels_action_id_idx" ON "violation_levels"("action_id");

-- AddForeignKey
ALTER TABLE "violation_levels" ADD CONSTRAINT "violation_levels_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "penalty_actions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3. Penalties: the action and its snapshot from the matching seeded row (no percent, amount or
-- base existed). Every penalty keeps its level and days; its action reads by the same name.
ALTER TABLE "penalty_records"
ADD COLUMN "action_id" UUID,
ADD COLUMN "action_name_en" TEXT,
ADD COLUMN "action_name_ar" TEXT,
ADD COLUMN "effect" "PenaltyEffect",
ADD COLUMN "percent_base" "PenaltySalaryBase",
ADD COLUMN "percent" DECIMAL(5,2),
ADD COLUMN "amount" INTEGER;

UPDATE "penalty_records" AS r
SET "action_id" = a."id",
    "action_name_en" = a."name_en",
    "action_name_ar" = a."name_ar",
    "effect" = a."effect"
FROM "penalty_actions" AS a
WHERE a."code" = r."action"::text;

ALTER TABLE "penalty_records"
ALTER COLUMN "action_id" SET NOT NULL,
ALTER COLUMN "action_name_en" SET NOT NULL,
ALTER COLUMN "action_name_ar" SET NOT NULL,
ALTER COLUMN "effect" SET NOT NULL;
ALTER TABLE "penalty_records" DROP COLUMN "action";

-- CreateIndex
CREATE INDEX "penalty_records_action_id_idx" ON "penalty_records"("action_id");

-- AddForeignKey
ALTER TABLE "penalty_records" ADD CONSTRAINT "penalty_records_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "penalty_actions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 4. Payroll lines: the day-priced part of the penalty deduction. Before this, days were the only
-- penalty that cost pay, so it is the whole of it — old payslips read exactly as before.
ALTER TABLE "payroll_lines" ADD COLUMN "penalty_days_amount" INTEGER NOT NULL DEFAULT 0;
UPDATE "payroll_lines" SET "penalty_days_amount" = "penalty_amount";

-- 5. The code enum is gone (the seeded rows keep the codes as text).
DROP TYPE "PenaltyAction";
