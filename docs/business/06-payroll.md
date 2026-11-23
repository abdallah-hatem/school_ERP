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
- **DECIDED** — A month can't be approved while it still has **pending** penalties — waiting at
  either step, the stage review or HR (owner, 2026-11-21, §4).
- **DECIDED** (demo dry run, 2026-11-18) — A draft run says when the **HR rules** it is calculated
  from (the lateness rule and the payroll rule, §5, §7) changed after its last calculation, and
  offers **Recalculate**. The penalty repetition window doesn't count: it sets a penalty's level when
  the penalty is recorded, not the run.
- **DECIDED** (owner, 2026-11-20) — A draft run also says "Penalties changed since the last
  calculation" and offers **Recalculate** when approving a backdated penalty moved approved
  penalties dated in its month up a level after the run was last calculated (§4), so their new
  deductions are applied.
- **GUESS** (2026-11-18, §2) — Adding or removing an **adjustment** needs the "Adjust payroll"
  permission (System admin, HR manager, HR officer). Without it, a draft's adjustments can be
  opened and read but not changed, and the screen says why.
- **DECIDED** (owner, 2026-11-23) — **Separation of duties.** Nobody adds or removes an adjustment
  on **their own line** (the employee their account is linked to): "You can't add or remove an
  adjustment on your own payroll line. Ask someone else." Nobody **approves** a month in which they
  adjusted their own line (possible only for an adjustment made before their account was linked to
  that employee): "You adjusted your own line in this month's payroll, so someone else must approve
  it." That is the whole rule: whoever **created** the run may still approve it, as long as they made
  no adjustment on their own line. Each adjustment keeps who added it.
- **DECIDED** (2026-11-23) — The draft's **pending penalties** count shown to someone who sees only
  some lines (their stage or team) counts only those employees' penalties; the month's approval still
  waits for every pending penalty of the school.
- **DECIDED** (owner, 2026-11-18) — Anyone who may view a run also sees the HR rules behind it (day
  divisor, part-time percentages, the lateness rule, the penalty repetition window), so the
  Principal and the Accountant see them without the right to see HR settings. No salary comes with
  them. A run keeps no copy of the rules, so these are today's: on a draft they are what the next
  calculation uses; on an approved run they are shown as the current rules, which may differ from
  the ones it was approved with. "Edit in settings" shows only to those who may see HR settings.

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
  It also keeps the employee's **social insurance** (status and insured salary), retaken at
  approval: accounting works the month's taxes out from it (§10), not from today's record.
- **GUESS** — Net never goes below 0. If deductions exceed the salary, net is 0 and the line is
  flagged for review.
- **GUESS** — No pro-rata for employees who join or leave mid-month in the demo (OPEN for later).
- **DECIDED** — A line is flagged **needs review** when it has a flag (net floored at 0) or the
  employee has pending penalties in the month.

## Outputs

- **DECIDED** — **Payslip** per employee for an approved run, printable, in Arabic or English: salary,
  each penalty with its level, action and days, lateness, adjustments, net. Penalties that cost
  nothing (notice, warning, raise-related…) are listed with amount 0 so the employee sees them.
  Lateness shows the grace minutes taken off (§5): "130 minutes − 30 minutes grace = 100 minutes =
  0.75 day". Each line keeps the grace of its calculation; a line calculated before 2026-11-18
  shows the minutes alone until it is recalculated.
- **DECIDED** — A penalty's amount on the payslip is its share of the line's penalty deduction
  (its days ÷ the line's penalty days × the line's penalty amount). The shares can differ from the
  line total by a piastre; the line total is what is paid.
- **GUESS** — An adjustment for an employee who is no longer in the run (deactivated before the last
  recalculate) stays recorded but doesn't count, and is shown as "not applied".
- **DECIDED** — **Dashboard:** active headcount (by stage), the current month's payroll run (status
  and net, or none yet), and this month's penalties (pending and approved, by violation date).
- **DECIDED** (owner, 2026-11-21) — **Dashboard charts** (System admin only to start with, §2): the
  net of each approved month; headcount by stage with joiners (hire date) and leavers (the day they
  were deactivated) per month; approved penalties by violation month, stacked by kind (notice &
  warning, day deductions, other), with the minutes late per month; and the newest month accounting
  has worked out (§10) split into net, social insurance, income tax with the martyrs' fund, and
  penalty and lateness deductions, each as a share of their sum, with that share for the six newest
  such months. Over the last 6 or 12 months (phones open on 6). Under two approved months the trend
  charts say "Charts appear after two approved months"; the snapshots still show.
- **DECIDED** — Approving a run announces it (`payroll approved`, with the totals) once the
  approval is saved. Accounting works out the month's insurance share, income tax, martyrs' fund
  and gross from it (§10); HR payroll itself ends at the net.
- **DECIDED** — **Bank sheet** export of an approved run (Excel): employee code, name, national ID,
  bank, account number, IBAN, net, then a **Total** row (the sum of the nets = the run's net). Its
  export needs every salary (§2), which covers the bank details (§3).
- **GUESS** (demo dry run, 2026-11-18) — The bank details are the ones on the employee's record when
  the sheet is exported (the account the money goes to now), not a copy taken at approval; an
  employee with none on file has empty cells.
- **Planned** — allowances, the annual raise, the exam bonus rules, loans.
- **DECIDED** — Salaries are **net, grossed up** (owner, 2026-11-17): the employee's
  social-insurance share, income tax and the martyrs' fund are not deducted here — the school pays
  them on top, and accounting works them out when the month is approved (owner, 2026-11-18; §10).
- **Planned** (owner of payroll: Tamer) — **bank transfer** of net pay using the employee's bank
  account. The employee fields exist (§3, 2026-11-18).
