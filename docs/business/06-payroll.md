# §6 Payroll

The client's regulations don't define how salaries are calculated. For the demo, payroll is the
**basic salary adjusted for work system, minus deductions, plus or minus one-off adjustments**
(owner's decision, 2026-11-17).

Who sees payroll amounts (each line's money, payslips, the bank sheet) and the run totals, and whose
lines each role sees: §2 Roles (enforced, P4).

## The monthly run

- **DECIDED** — One payroll run per month. It is **draft** until approved.
- **DECIDED** — Creating a run adds a line for every employee who is **active** on the day it is
  created.
- **DECIDED** — **Recalculate** rebuilds every line of a draft run from the current employees,
  penalties, lateness, adjustments and settings. Employees deactivated since are removed; new active
  employees are added.
- **DECIDED** — **Approve** first recalculates every line one last time (so a penalty approved or
  cancelled, or a setting changed, since the last recalculate is included), then locks the run, its
  penalties, lateness and adjustments. An approved run
  is never edited or deleted; corrections go into the next month as adjustments.
- **DECIDED** — A month can't be approved while it still has **pending** penalties.

## Calculating a line

1. **Salary for the month** = basic salary × work-system percentage:
   full-time 100%, part-time 4 days 80%, 3 days 60%, 2 days 40%. (DECIDED: the client's part-time
   rule; the percentages are settings.)
2. **Day value** = salary for the month ÷ **30**. (GUESS: the divisor is a setting.)
3. **Penalty deductions** = total days from approved day-deduction penalties (and investigations
   with days) dated in the month × day value.
4. **Lateness deductions** = days from the month's lateness minutes (§5) × day value.
5. **Adjustments** = sum of the month's one-off additions (e.g. overtime, exam bonus) minus one-off
   deductions, each with a required reason.
6. **Net** = salary for the month − penalty deductions − lateness deductions + adjustments.

- **DECIDED** — Money is in EGP, kept to the piastre. Each amount is rounded to the nearest piastre,
  half up, after multiplying.
- **GUESS** — The day value is **not** rounded on its own: a deduction is `round(days × salary for
  the month ÷ divisor)`. The salary for the month is rounded first. The payslip shows the day value
  rounded for display only.
- **DECIDED** — Each line keeps a **snapshot** of the employee's code, names, national ID,
  department, basic salary and work system at calculation. Editing an employee later never changes an approved run.
- **GUESS** — Net never goes below 0. If deductions exceed the salary, net is 0 and the line is
  flagged for review.
- **GUESS** — No pro-rata for employees who join or leave mid-month in the demo (OPEN for later).
- **DECIDED** — A line is flagged **needs review** when it has a flag (net floored at 0) or the
  employee has pending penalties in the month.

## Outputs

- **DECIDED** — **Payslip** per employee for an approved run, printable, in Arabic or English: salary,
  each penalty with its level, action and days, lateness, adjustments, net. Penalties that cost
  nothing (notice, warning, raise-related…) are listed with amount 0 so the employee sees them.
- **DECIDED** — A penalty's amount on the payslip is its share of the line's penalty deduction
  (its days ÷ the line's penalty days × the line's penalty amount). The shares can differ from the
  line total by a piastre; the line total is what is paid.
- **GUESS** — An adjustment for an employee who is no longer in the run (deactivated before the last
  recalculate) stays recorded but doesn't count, and is shown as "not applied".
- **DECIDED** — **Dashboard:** active headcount (by stage), the current month's payroll run (status
  and net, or none yet), and this month's penalties (pending and approved, by violation date).
- **DECIDED** — Approving a run announces it (`payroll approved`, with the totals) once the
  approval is saved. Accounting works out the month's insurance share, income tax, martyrs' fund
  and gross from it (§10); HR payroll itself ends at the net.
- **DECIDED** — **Bank sheet** export of an approved run (Excel): employee code, name, national ID,
  net. The employee's bank details are recorded (§3); adding them to the sheet is Planned.
- **Planned** — allowances, the annual raise, the exam bonus rules, loans.
- **DECIDED** — Salaries are **net, grossed up** (owner, 2026-11-17): the employee's
  social-insurance share, income tax and the martyrs' fund are not deducted here — the school pays
  them on top, and accounting works them out when the month is approved (owner, 2026-11-18; §10).
- **Planned** (owner of payroll: Tamer) — **bank transfer** of net pay using the employee's bank
  account. The employee fields exist (§3, 2026-11-18).
