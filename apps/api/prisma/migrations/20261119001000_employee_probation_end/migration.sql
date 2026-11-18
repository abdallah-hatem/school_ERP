-- §3 (N0, owner 2026-11-18): each employee's probation end date; null = no probation.
ALTER TABLE "employees" ADD COLUMN "probation_end" DATE;

-- Backfill every existing employee with hire date + the default probation length (3 months), the
-- day before (hired 1 Sep → 30 Nov). Postgres clamps a day the month lacks to its last day
-- (30 Nov + 3 months → 28 Feb, so 27 Feb), as the shared `defaultProbationEnd` does. Past dates
-- are harmless: reminders only look ahead.
UPDATE "employees"
SET "probation_end" = ("hire_date" + INTERVAL '3 months')::date - 1
WHERE "probation_end" IS NULL;
