-- §4 (owner 2026-11-20): when a backdated approval last moved an approved penalty up a level.
-- A draft payroll run calculated before it shows that a Recalculate is due (§6).
ALTER TABLE "penalty_records" ADD COLUMN "recounted_at" TIMESTAMP(3);
