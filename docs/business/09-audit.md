# §9 Audit log

Who did what, to which record, and when — for the whole system. Spec:
`docs/specs/2026-11-17-audit-log.md`.

- **DECIDED** — Every action that changes data or access is recorded: sign-in, sign-out and failed
  sign-ins; users (create, edit, deactivate, reactivate, temporary password, own password change)
  and roles (create, edit, delete); school settings, logo and stages; employees (create, edit, deactivate, reactivate);
  departments and job titles; HR rules and the penalty catalogue; penalties (record, approve,
  cancel); monthly lateness (per employee, minutes before and after); payroll runs (create,
  recalculate, approve) and adjustments (add, remove).
- **DECIDED** — Each entry keeps who did it (their name as it was then), when, from which IP and
  device, the record it touched, and only the fields that changed, each with the value before and
  after. Passwords and tokens are never recorded. A failed sign-in keeps the email that was typed.
- **DECIDED** — An entry is saved together with the change: if one fails, neither is kept.
  *Interim (until T28): changes to stages, departments, job titles and the penalty catalogue are
  still recorded right after they are saved, not together with them (§7). Sign-ins, employees and
  the HR lists are not recorded yet (T28). Penalties, monthly lateness and payroll are (T29,
  2026-11-18).*
- **DECIDED** — A month's lateness is one entry: one line per employee whose minutes changed,
  named, with the minutes before and after. Approving a payroll run is one entry with the run's
  totals, not one per employee.
- **DECIDED** — Entries can't be edited or deleted by anyone, and are kept forever (for now).
- **DECIDED** — Opening or reading something (a payslip, a profile) is not recorded.
- **DECIDED** (enforced, P4) — Whoever holds the "view activity log" permission (§2: System admin,
  HR manager, principal) sees the Activity page and the History tab — but only entries about
  records they may see (§2): an employee, their penalties, their lateness minutes and their payroll
  lines outside the viewer's stage or team are left out, and so are the people and counts on
  "Today at a glance" that come from them. The History of an employee they can't see shows "This
  page isn't here". Salary-type amounts (salaries, insured salary, bank details, payroll amounts)
  read "Changed (amount hidden)" for someone who can't see salaries; a payroll run's totals follow
  the Payroll screen (shown to whoever sees the whole school's payroll).
- **DECIDED** — Every entry reads in English and in Arabic, including entries made before a
  language switch. A record's name shows in the screen's language as it was at the time of the
  change — also for the settings and catalogue changes made before the log kept both names (those
  read the Arabic name from the change itself; the log is never rewritten).
