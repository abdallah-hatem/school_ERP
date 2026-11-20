# 2026-11-20 — Accounting sees HR's approved payroll, returns a month or finalizes it

Accounting has a second page beside Payroll taxes, **Approved payroll**: every month HR approved,
laid out like HR's payroll (salary, penalties, lateness, adjustments, net), followed by the
insurance share, income tax, martyrs' fund and gross. An approved month is **Pending transfer**
until Accounting **finalizes** it — the salaries were transferred. A finalized month is
**Finalized · transferred** here and on HR's run and runs list, and can never go back to HR.

While pending, Accounting can **return the month to HR** with a reason (required, up to 500
characters). HR's run becomes a draft again and the month unlocks, so penalties, lateness and
adjustments can be fixed. The month's taxes leave accounting until HR approves it again, and are
then worked out afresh. HR's run page shows "Returned by Accounting on …" with the reason, the runs
list marks the draft **Returned**, and HR's payroll approvers get a notification that can't be
turned off; it closes when the month is approved again. Both actions are recorded in the activity
log, on the accounting month and on HR's run. Two permissions, on the Accountant and the System
admin by default: return to HR, and finalize.

Every payroll table (HR's runs, a run, an employee's Payroll tab, Approved payroll and its months,
Payroll taxes) has a **Rows per page** picker — 10, 25, 50, 100, 250 or 500 — and keeps its column
names in view while the rows scroll. Other tables are unchanged. Decided by the owner (2026-11-19).
