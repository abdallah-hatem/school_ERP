-- §5, §6: each payroll line keeps the lateness grace taken off its minutes at calculation, so the
-- payslip can show "130 min − 30 grace = 100 min". Null on lines calculated before this (the
-- payslip then shows the minutes alone); the next Recalculate fills a draft's lines.

-- AlterTable
ALTER TABLE "payroll_lines" ADD COLUMN "lateness_grace_minutes" INTEGER;
