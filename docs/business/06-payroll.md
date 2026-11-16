# §6 Payroll

The client's regulations don't define how salaries are calculated. For the demo, payroll is the
**basic salary adjusted for work system, minus deductions, plus or minus one-off adjustments**
(owner's decision, 2026-11-17).

## The monthly run

- **DECIDED** — One payroll run per month. It is **draft** until approved.
- **DECIDED** — Creating a run adds a line for every employee who is **active** on the day it is
  created.
- **DECIDED** — **Recalculate** rebuilds every line of a draft run from the current employees,
  penalties, lateness, adjustments and settings. Employees deactivated since are removed; new active
  employees are added.
- **DECIDED** — **Approve** locks the run, its penalties, lateness and adjustments. An approved run
  is never edited or deleted; corrections go into the next month as adjustments.
- **DECIDED** — A month can't be approved while it still has **pending** penalties.

## Calculating a line

1. **Salary for the month** = basic salary × work-system percentage:
   full-time 100%, part-time 4 days 80%, 3 days 60%, 2 days 40%. (DECIDED: the client's part-time
   rule; the percentages are settings.)
2. **Day value** = salary for the month ÷ **30**. (GUESS: the divisor is a setting.)
3. **Penalty deductions** = total days from approved day-deduction penalties dated in the month ×
   day value.
4. **Lateness deductions** = days from the month's lateness minutes (§5) × day value.
5. **Adjustments** = sum of the month's one-off additions (e.g. overtime, exam bonus) minus one-off
   deductions, each with a required reason.
6. **Net** = salary for the month − penalty deductions − lateness deductions + adjustments.

- **DECIDED** — Money is in EGP, kept to the piastre. Each amount is rounded to the nearest piastre,
  half up, after multiplying.
- **GUESS** — Net never goes below 0. If deductions exceed the salary, net is 0 and the line is
  flagged for review.
- **GUESS** — No pro-rata for employees who join or leave mid-month in the demo (OPEN for later).
- **DECIDED** — A line is flagged **needs review** when it has a flag (net floored at 0) or the
  employee has pending penalties in the month.

## Outputs

- **DECIDED** — **Payslip** per employee for an approved run, printable, in Arabic or English: salary,
  each deduction with its days, adjustments, net.
- **DECIDED** — **Bank sheet** export of an approved run (Excel): employee code, name, national ID,
  net. Bank account fields are Planned.
- **Planned** — tax, social insurance, allowances, the annual raise, the exam bonus rules, loans.
