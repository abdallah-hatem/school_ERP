# 2026-11-21 — Charts on the home dashboard, for the System admin

The home dashboard gains a grid of four charts between the tiles and the quick links (§2, §6),
over the last **6 or 12 months** — a switch at the top right; phones open on 6, wider screens on 12:

- **Payroll cost** — the net of each approved month as a column, the newest approved month in full
  teal and the earlier ones pale. A month without an approved run is a gap.
- **Headcount** — today's active employees by stage, and joiners (by hire date) above zero and
  leavers (the day they were deactivated) below it, per month.
- **Penalties and lateness** — approved penalties by the month of the violation (not of the
  approval), stacked: notice & warning, day deductions, other; and the minutes late entered per
  month as a line.
- **Deductions vs net** — the newest approved month that accounting has worked out, as one bar:
  net, social insurance, income tax (with the martyrs' fund) and penalties & lateness, each as a
  share of their sum; then deductions as a % of that gross for the six newest such months.

Every chart has a **Table** button that shows the same numbers as a table. With fewer than **two
approved months** the trend charts give way to "Charts appear after two approved months"; the
headcount by stage and the month's deductions still show.

**Who sees them (DECIDED, owner 2026-11-21: "for now make it only visible to the system admin").**
A new permission, **View the dashboard charts**, held by no starting role but the System admin
(who holds every permission). An admin can give it to any role on the Roles screen. Each chart also
follows the rules of the screen its figures come from: the rows a role's scope covers (a stage head
counts their stage), money only for those who see the payroll totals, and the deductions only with
every salary (§10). Anyone without the permission sees the dashboard exactly as before.

An employee's record now keeps the day they were deactivated (cleared when reactivated); employees
already inactive got the day of their last deactivation in the activity log.
